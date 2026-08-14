/**
 * Running the review agent over a checkout. Nothing here knows about the
 * database or the windows: it is handed a folder and a pull request to read,
 * and answers with the review that came back.
 */

import { spawn } from "node:child_process";
import { searchPath } from "./cliPath";
import type { AgentEvent } from "../../shared/agentEvent";

/**
 * Long enough for an agent to read a sizeable pull request, short enough that a
 * run which has stopped making progress is reported while the user still cares
 * rather than sitting there for good.
 */
const TIMEOUT_MS = 10 * 60_000;

/** Kept from stderr to explain a failure, when nothing better is available. */
const STDERR_LIMIT = 4_000;

/**
 * How much of a tool call's arguments and answer are carried to the panel. A
 * single `read` can answer with a whole file, and a review makes hundreds of
 * calls: kept whole, the timeline would weigh more than everything else the
 * window holds, to show text that is scrolled past. Enough is kept to see what
 * the call did.
 */
const TOOL_TEXT_LIMIT = 2_000;

/** What a run that was stopped on purpose is left with, having written nothing. */
export const CANCELLED = "This review was cancelled";

/**
 * Runs `opencode run --agent <name> --format json --thinking <url>` in `cwd`
 * and answers with the review it wrote. Rejects with a message meant for the
 * user when there is no review to answer with.
 *
 * `--format json` prints one event per line — `text` for a finished message,
 * `error` for a session that gave up, and tool calls and reasoning in between
 * — which is read as it arrives rather than buffered: a long review's events
 * run to megabytes, and only the last message is worth keeping. `--thinking`
 * is what puts the reasoning among them; without it opencode keeps the
 * thinking blocks to itself.
 *
 * Every event is handed to `onEvent` as it is read, which is how the panel
 * shows a review being written rather than a spinner until it is over. Nothing
 * is replayed: a window that starts listening late has missed what came first.
 *
 * Aborting `signal` kills the agent. Like the timeout, that answers with
 * whatever it had already written rather than throwing it away.
 */
export function runReviewAgent(
  cwd: string,
  url: string,
  agentName: string,
  signal: AbortSignal,
  onEvent?: (event: AgentEvent) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error(CANCELLED));
      return;
    }

    const child = spawn(
      "opencode",
      ["run", "--agent", agentName, "--format", "json", "--thinking", url],
      {
        cwd,
        windowsHide: true,
        env: { ...process.env, PATH: searchPath() },
        // The agent is handed everything it needs on the command line. Left as
        // a pipe, stdin never reaches end of file, and `opencode run` — which
        // takes a piped message when it is not talking to a terminal — waits on
        // it for good instead of starting.
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let written = "";
    let reported = "";
    let stderr = "";
    let pending = "";
    let timedOut = false;
    /** How many lines have been read, which is what a part-less event is filed under. */
    let read = 0;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);

    const stop = () => child.kill("SIGKILL");
    signal.addEventListener("abort", stop, { once: true });
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
    };

    const take = (line: string) => {
      const event = parseAgentEvent(line, read++);
      if (!event) return;
      onEvent?.(event);
      // Last message wins: the review is whatever the agent said last, and
      // everything before it was the agent working up to saying it.
      if (event.kind === "text") written = event.text;
      if (event.kind === "error") reported = event.message;
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      const lines = (pending + chunk).split("\n");
      // The last piece is whatever came before the next newline arrives.
      pending = lines.pop() ?? "";
      lines.forEach(take);
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < STDERR_LIMIT) stderr += chunk;
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      done();
      reject(
        error.code === "ENOENT"
          ? new Error("Reviewing needs the opencode CLI — install it from opencode.ai")
          : error,
      );
    });

    child.on("close", (code) => {
      done();
      take(pending);

      // Whoever asked for the review has stopped waiting for it, so how the
      // agent took being killed is beside the point.
      if (signal.aborted) {
        if (written) resolve(written);
        else reject(new Error(CANCELLED));
        return;
      }
      if (timedOut) {
        // A review that was still being written is worth more than the reason
        // it was cut short.
        if (written) {
          resolve(written);
          return;
        }
        const said = firstLine(stderr);
        reject(
          new Error(
            said
              ? `The review took too long and was stopped — ${said}`
              : "The review took too long and was stopped",
          ),
        );
        return;
      }
      if (code !== 0) {
        reject(new Error(reported || firstLine(stderr) || `opencode exited with code ${code}`));
        return;
      }
      if (!written) {
        reject(new Error("opencode finished without writing a review"));
        return;
      }

      resolve(written);
    });
  });
}

/** One line of `--format json`, as far as anything here reads it. */
interface RawEvent {
  type?: unknown;
  part?: RawPart;
  error?: unknown;
}

/** The part an event was cut from, which is a different shape per event type. */
interface RawPart {
  id?: unknown;
  text?: unknown;
  tool?: unknown;
  state?: {
    status?: unknown;
    input?: unknown;
    output?: unknown;
    title?: unknown;
    error?: unknown;
  };
  tokens?: {
    input?: unknown;
    output?: unknown;
    reasoning?: unknown;
  };
}

/**
 * Reads one event, as the timeline wants it. `sequence` is how many lines have
 * come before, and only names an event that carries no part of its own to be
 * named after — which is the errors, since those are the session speaking
 * rather than a message being written.
 *
 * A line that is not JSON is skipped rather than failing the review: whatever
 * else ends up on stdout is not the agent talking. So is an event of a type
 * this does not know, since opencode is free to grow new ones.
 */
export function parseAgentEvent(line: string, sequence: number): AgentEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let event: RawEvent;
  try {
    event = JSON.parse(trimmed) as RawEvent;
  } catch {
    return null;
  }

  const part = event.part;
  const id = typeof part?.id === "string" ? part.id : `${String(event.type)}-${sequence}`;

  switch (event.type) {
    case "step_start":
      return { kind: "step_start", id };

    case "step_finish":
      return {
        kind: "step_finish",
        id,
        tokens: {
          input: count(part?.tokens?.input),
          output: count(part?.tokens?.output),
          reasoning: count(part?.tokens?.reasoning),
        },
      };

    case "reasoning":
    case "text": {
      if (typeof part?.text !== "string") return null;
      const text = part.text.trim();
      // A message that is all whitespace is one the model started and thought
      // better of, and an empty block in the timeline says nothing.
      if (!text) return null;
      return { kind: event.type === "text" ? "text" : "reasoning", id, text };
    }

    case "tool_use": {
      const state = part?.state;
      // Only calls that are over are ever printed, but the status is what says
      // whether the tool answered or failed, so an unfamiliar one is dropped
      // rather than guessed at.
      if (state?.status !== "completed" && state?.status !== "error") return null;

      return {
        kind: "tool",
        id,
        name: typeof part?.tool === "string" ? part.tool : "tool",
        title: typeof state.title === "string" ? state.title : "",
        input: clip(describeInput(state.input)),
        output: clip(text(state.status === "completed" ? state.output : state.error)),
        status: state.status,
      };
    }

    case "error":
      return { kind: "error", id, message: describeError(event.error) };

    default:
      return null;
  }
}

/** An error event carries whatever the session failed with, in its own shape. */
function describeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error !== "object" || error === null) return "The review failed";

  const { name, data } = error as { name?: unknown; data?: unknown };
  const message = (data as { message?: unknown } | undefined)?.message;

  if (typeof message === "string" && message) return message;
  if (typeof name === "string" && name) return name;
  return "The review failed";
}

/**
 * A call's arguments, laid out to be read. They are carried as text rather
 * than as themselves so that clipping a call that was handed a whole file is
 * one rule, applied in the one place, instead of something the panel has to
 * think about.
 */
function describeInput(input: unknown): string {
  if (input === undefined || input === null) return "";
  try {
    return JSON.stringify(input, null, 2) ?? "";
  } catch {
    return "";
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clip(value: string): string {
  return value.length > TOOL_TEXT_LIMIT ? `${value.slice(0, TOOL_TEXT_LIMIT)}…` : value;
}

function firstLine(value: string): string {
  return value.trim().split("\n")[0] ?? "";
}
