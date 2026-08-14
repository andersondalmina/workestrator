import { useState } from "react";
import { TONE } from "../../data/board";
import type { AgentEvent, AgentTokens } from "../../../shared/agentEvent";

/** A block's own line: a dot in a rail, then whatever it has to say. */
const RAIL = "flex w-[9px] flex-none flex-col items-center";

const DETAIL =
  "max-h-[280px] overflow-auto rounded-[8px] border border-lines bg-card px-[10px] py-2 font-mono text-[12.5px] leading-[1.5] font-normal wrap-break-word whitespace-pre-wrap text-fg3";

interface AgentTimelineProps {
  events: AgentEvent[];
  /** Whether the agent is still going, which is what the last line says. */
  running: boolean;
}

/**
 * The agent at work, in the order it worked: what it thought, what it read and
 * what it made of it. The feed is flat on purpose — a review is a sequence of
 * things happening, and nesting it into turns buys nothing to read.
 *
 * A running review fills this in as it goes; one that ended in an earlier
 * launch has nothing here, since none of it is written down.
 */
export function AgentTimeline({ events, running }: AgentTimelineProps) {
  const blocks = blocksOf(events);

  return (
    <div className="flex flex-col gap-[10px]">
      {blocks.map((event) => (
        <Block key={event.id} event={event} />
      ))}

      {running && (
        <div className="flex items-center gap-2 font-mono text-[13px] leading-none font-normal text-fg4">
          <span className="size-[7px] animate-wk-pulse rounded-full bg-blue" />
          <span className="animate-wk-pulse">
            {blocks.length === 0 ? "Reading this pull request…" : "Working…"}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * What the review has cost so far. It sits under the feed rather than in it,
 * because it is a total that keeps changing rather than something that
 * happened — a number that is only readable when the feed happens to be
 * scrolled to the end is no number at all.
 *
 * Nothing is shown until a turn has ended, since that is when opencode says
 * what one cost.
 */
export function AgentTokenTotals({ events }: { events: AgentEvent[] }) {
  const tokens = totalTokens(events);
  if (!tokens) return null;

  return (
    <div className="flex-none font-mono text-[11.5px] leading-none font-normal text-fg4">
      {round(tokens.input)} in · {round(tokens.output)} out
      {tokens.reasoning > 0 ? ` · ${round(tokens.reasoning)} thinking` : ""}
    </div>
  );
}

function Block({ event }: { event: AgentEvent }) {
  switch (event.kind) {
    case "step_start":
      return <div className="my-[2px] h-px flex-none bg-lines" />;

    case "reasoning":
      return <ReasoningBlock text={event.text} />;

    case "text":
      return <TextBlock text={event.text} />;

    case "tool":
      return <ToolBlock event={event} />;

    case "error":
      return (
        <div
          className="rounded-[10px] border bg-card p-3 font-mono text-[13px] leading-[1.55] font-normal wrap-break-word whitespace-pre-wrap"
          style={{ color: TONE.red, borderColor: TONE.red }}
        >
          {event.message}
        </div>
      );

    // Turns are counted at the foot of the timeline rather than shown one by
    // one: a token total per turn is arithmetic, not history.
    case "step_finish":
      return null;
  }
}

/**
 * A thinking block, kept out of the way. It is how the agent got to what it
 * says, not what it says, so it opens closed and reads dimmed.
 */
function ReasoningBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className={RAIL}>
          <span className="mt-[5px] size-[7px] flex-none rounded-full border border-line" />
        </span>
        <span className="flex-1 font-mono text-[12.5px] leading-[1.5] font-normal text-fg4 italic">
          {open ? "Thinking" : `Thinking · ${firstLine(text)}`}
        </span>
      </button>
      {open && (
        <div className="mt-[6px] ml-[17px] font-mono text-[12.5px] leading-[1.55] font-normal wrap-break-word whitespace-pre-wrap text-fg4 italic">
          {text}
        </div>
      )}
    </div>
  );
}

/**
 * One tool call, as one line: what was run and what it was run on. The whole
 * of it — arguments and answer — is a press away, because most calls are only
 * worth knowing happened.
 */
function ToolBlock({ event }: { event: Extract<AgentEvent, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const failed = event.status === "error";

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className={RAIL}>
          <span
            className="mt-[5px] size-[7px] flex-none rounded-full"
            style={{ background: failed ? TONE.red : TONE.green }}
          />
        </span>
        <span className="font-mono text-[13px] leading-[1.5] font-normal text-fg2">
          {event.name}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] leading-[1.5] font-normal text-fg4">
          {event.title}
        </span>
        <span className="font-mono text-[12.5px] leading-[1.5] font-normal text-fg4">
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="mt-[6px] ml-[17px] flex flex-col gap-[6px]">
          {event.input && <div className={DETAIL}>{event.input}</div>}
          {event.output && (
            <div className={DETAIL} style={failed ? { color: TONE.red } : undefined}>
              {event.output}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A message the agent finished. The last one is the review itself. */
function TextBlock({ text }: { text: string }) {
  return (
    <div className="rounded-[10px] border border-lines bg-card p-3 font-mono text-[13px] leading-[1.55] font-normal wrap-break-word whitespace-pre-wrap text-fg2">
      {text}
    </div>
  );
}

/**
 * The events worth a line of their own. Turn boundaries are kept only where
 * they divide something from something: one before the first block, or two in
 * a row, would be a rule drawn under nothing.
 */
function blocksOf(events: AgentEvent[]): AgentEvent[] {
  const blocks: AgentEvent[] = [];

  for (const event of events) {
    if (event.kind === "step_finish") continue;
    if (
      event.kind === "step_start" &&
      (blocks.length === 0 || blocks[blocks.length - 1].kind === "step_start")
    ) {
      continue;
    }
    blocks.push(event);
  }

  while (blocks[blocks.length - 1]?.kind === "step_start") blocks.pop();

  return blocks;
}

/** What the review has cost so far, or `null` before any turn has ended. */
function totalTokens(events: AgentEvent[]): AgentTokens | null {
  let seen = false;
  const total: AgentTokens = { input: 0, output: 0, reasoning: 0 };

  for (const event of events) {
    if (event.kind !== "step_finish") continue;
    seen = true;
    total.input += event.tokens.input;
    total.output += event.tokens.output;
    total.reasoning += event.tokens.reasoning;
  }

  return seen ? total : null;
}

function firstLine(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

function round(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}
