/**
 * What the review agent did on its way to a review, as the panel shows it.
 *
 * `opencode run --format json` prints one event per line, and these are those
 * events with everything the timeline has no use for taken back off: session
 * ids, snapshots, provider metadata. The names are opencode's own, so a line
 * of its output and the block it turns into can be read side by side.
 *
 * Every event carries the id of the part it was cut from, which is what makes
 * a second sighting of one — a tool call opencode revisits, a message the
 * model kept adding to — replace the block it already has rather than leaving
 * the same call in the timeline twice.
 */
export type AgentEvent =
  AgentStepStart | AgentReasoning | AgentText | AgentToolCall | AgentStepFinish | AgentError;

/** A model turn beginning, which is only ever a divider between what follows. */
export interface AgentStepStart {
  kind: "step_start";
  id: string;
}

/** A thinking block. Only ever sent when the agent is run with `--thinking`. */
export interface AgentReasoning {
  kind: "reasoning";
  id: string;
  text: string;
}

/** A message the model finished writing. The last one is the review itself. */
export interface AgentText {
  kind: "text";
  id: string;
  text: string;
}

/**
 * A tool call that has finished, one way or the other. Calls still running are
 * not reported by `--format json` at all, so a tool arrives once, already over.
 */
export interface AgentToolCall {
  kind: "tool";
  id: string;
  /** The tool's own name, e.g. `read`, `bash`, `grep`. */
  name: string;
  /** opencode's one-line summary of the call, e.g. the file that was read. */
  title: string;
  /** The arguments it was called with, as JSON. Clipped. */
  input: string;
  /** What it answered with, or what it failed with. Clipped. */
  output: string;
  status: "completed" | "error";
}

/** A model turn ending, which is where the tokens it spent are counted. */
export interface AgentStepFinish {
  kind: "step_finish";
  id: string;
  tokens: AgentTokens;
}

/** Why the session gave up. A run can report more than one before it stops. */
export interface AgentError {
  kind: "error";
  id: string;
  message: string;
}

/** What one turn cost, as opencode counted it. */
export interface AgentTokens {
  input: number;
  output: number;
  reasoning: number;
}
