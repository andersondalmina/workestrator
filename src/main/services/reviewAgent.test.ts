import { describe, expect, it } from "vitest";
import { parseAgentEvent } from "./reviewAgent";

/** Lines as `opencode run --format json --thinking` actually prints them. */
const line = (event: unknown) => JSON.stringify(event);

describe("parseAgentEvent", () => {
  it("reads a finished message", () => {
    const event = parseAgentEvent(
      line({
        type: "text",
        timestamp: 1,
        sessionID: "ses_1",
        part: {
          id: "prt_text",
          messageID: "msg_1",
          sessionID: "ses_1",
          type: "text",
          text: "  The pull request looks fine.  ",
          time: { start: 1, end: 2 },
        },
      }),
      0,
    );

    expect(event).toEqual({
      kind: "text",
      id: "prt_text",
      text: "The pull request looks fine.",
    });
  });

  it("reads a thinking block", () => {
    const event = parseAgentEvent(
      line({
        type: "reasoning",
        part: { id: "prt_think", type: "reasoning", text: "Checking the tests" },
      }),
      0,
    );

    expect(event).toEqual({ kind: "reasoning", id: "prt_think", text: "Checking the tests" });
  });

  it("skips a message that is all whitespace", () => {
    expect(parseAgentEvent(line({ type: "text", part: { id: "p", text: "  \n " } }), 0)).toBeNull();
  });

  it("reads a tool call that answered", () => {
    const event = parseAgentEvent(
      line({
        type: "tool_use",
        part: {
          id: "prt_tool",
          type: "tool",
          tool: "read",
          callID: "call_1",
          state: {
            status: "completed",
            input: { filePath: "package.json", limit: 80 },
            output: "1: {",
            title: "package.json",
            metadata: { preview: "1: {" },
            time: { start: 1, end: 2 },
          },
        },
      }),
      0,
    );

    expect(event).toEqual({
      kind: "tool",
      id: "prt_tool",
      name: "read",
      title: "package.json",
      input: '{\n  "filePath": "package.json",\n  "limit": 80\n}',
      output: "1: {",
      status: "completed",
    });
  });

  it("reads a tool call that failed, keeping what it failed with", () => {
    const event = parseAgentEvent(
      line({
        type: "tool_use",
        part: {
          id: "prt_tool",
          type: "tool",
          tool: "bash",
          state: {
            status: "error",
            input: { command: "exit 1" },
            error: "exited with code 1",
            time: { start: 1, end: 2 },
          },
        },
      }),
      0,
    );

    expect(event).toMatchObject({
      kind: "tool",
      name: "bash",
      title: "",
      output: "exited with code 1",
      status: "error",
    });
  });

  it("clips a tool call that read something enormous", () => {
    const event = parseAgentEvent(
      line({
        type: "tool_use",
        part: {
          id: "prt_tool",
          type: "tool",
          tool: "read",
          state: { status: "completed", input: {}, output: "x".repeat(5_000), title: "big.txt" },
        },
      }),
      0,
    );

    expect(event).toMatchObject({ kind: "tool" });
    // 2000 characters, plus the ellipsis that says there were more.
    expect(event && "output" in event && event.output.length).toBe(2_001);
  });

  it("skips a tool call that has not finished", () => {
    const running = line({
      type: "tool_use",
      part: { id: "p", type: "tool", tool: "read", state: { status: "running", input: {} } },
    });

    expect(parseAgentEvent(running, 0)).toBeNull();
  });

  it("counts the tokens a turn spent", () => {
    const event = parseAgentEvent(
      line({
        type: "step_finish",
        part: {
          id: "prt_step",
          type: "step-finish",
          reason: "stop",
          cost: 0,
          tokens: {
            total: 7652,
            input: 2005,
            output: 15,
            reasoning: 4,
            cache: { read: 0, write: 0 },
          },
        },
      }),
      0,
    );

    expect(event).toEqual({
      kind: "step_finish",
      id: "prt_step",
      tokens: { input: 2005, output: 15, reasoning: 4 },
    });
  });

  it("reads a turn beginning", () => {
    expect(parseAgentEvent(line({ type: "step_start", part: { id: "prt_step" } }), 0)).toEqual({
      kind: "step_start",
      id: "prt_step",
    });
  });

  it("reads why a session gave up, and names it after its line", () => {
    const event = parseAgentEvent(
      line({ type: "error", error: { name: "ProviderAuthError", data: { message: "no key" } } }),
      7,
    );

    expect(event).toEqual({ kind: "error", id: "error-7", message: "no key" });
  });

  it("falls back to the error's name when it carries no message", () => {
    const event = parseAgentEvent(
      line({ type: "error", error: { name: "MessageAbortedError" } }),
      0,
    );

    expect(event).toMatchObject({ message: "MessageAbortedError" });
  });

  it("skips anything that is not the agent talking", () => {
    expect(parseAgentEvent("", 0)).toBeNull();
    expect(parseAgentEvent("   ", 0)).toBeNull();
    expect(parseAgentEvent("not json at all", 0)).toBeNull();
    expect(parseAgentEvent(line({ type: "session_idle" }), 0)).toBeNull();
  });
});
