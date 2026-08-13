/**
 * Running the review agent over a checkout. Nothing here knows about the
 * database or the windows: it is handed a folder and a pull request to read,
 * and answers with the review that came back.
 */

import { spawn } from "node:child_process";
import { searchPath } from "./cliPath";

/**
 * Long enough for an agent to read a sizeable pull request, short enough that a
 * run which has stopped making progress is reported while the user still cares
 * rather than sitting there for good.
 */
const TIMEOUT_MS = 10 * 60_000;

/** Kept from stderr to explain a failure, when nothing better is available. */
const STDERR_LIMIT = 4_000;

/** What a run that was stopped on purpose is left with, having written nothing. */
export const CANCELLED = "This review was cancelled";

/**
 * Runs `opencode run --agent <name> --format json <url>` in `cwd` and
 * answers with the review it wrote. Rejects with a message meant for the user
 * when there is no review to answer with.
 *
 * `--format json` prints one event per line — `text` for a finished message,
 * `error` for a session that gave up, and tool calls and reasoning in between
 * — which is read as it arrives rather than buffered: a long review's events
 * run to megabytes, and only the last message is worth keeping.
 *
 * Aborting `signal` kills the agent. Like the timeout, that answers with
 * whatever it had already written rather than throwing it away.
 */
export function runReviewAgent(
  cwd: string,
  url: string,
  agentName: string,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error(CANCELLED));
      return;
    }

    const child = spawn("opencode", ["run", "--agent", agentName, "--format", "json", url], {
      cwd,
      windowsHide: true,
      env: { ...process.env, PATH: searchPath() },
      // The agent is handed everything it needs on the command line. Left as
      // a pipe, stdin never reaches end of file, and `opencode run` — which
      // takes a piped message when it is not talking to a terminal — waits on
      // it for good instead of starting.
      stdio: ["ignore", "pipe", "pipe"],
    });

    let written = "";
    let reported = "";
    let stderr = "";
    let pending = "";
    let timedOut = false;

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
      const event = readEvent(line);
      if (event?.text) written = event.text;
      if (event?.error) reported = event.error;
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

/** What one line of `--format json` output has to say, if anything. */
interface ReviewEvent {
  /** A message the agent finished writing. */
  text?: string;
  /** Why the session stopped. */
  error?: string;
}

/**
 * Reads one event. A line that is not JSON is skipped rather than failing the
 * review: whatever else ends up on stdout is not the agent talking.
 */
export function readEvent(line: string): ReviewEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const event = JSON.parse(trimmed) as {
      type?: unknown;
      part?: { text?: unknown };
      error?: unknown;
    };

    if (event.type === "text" && typeof event.part?.text === "string") {
      return { text: event.part.text.trim() };
    }
    if (event.type === "error") {
      return { error: describeError(event.error) };
    }
    return null;
  } catch {
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

function firstLine(value: string): string {
  return value.trim().split("\n")[0] ?? "";
}
