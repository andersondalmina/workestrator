import { describe, expect, it } from "vitest";
import { parseAgentList } from "./opencodeAgentService";

describe("parseAgentList", () => {
  it("reads primary agents and skips subagents", () => {
    const stdout = `
build (primary)
  [{"permission": "*"}]
explore (subagent)
code-reviewer (primary)
CoderAgent (subagent)
`.trim();

    expect(parseAgentList(stdout)).toEqual([
      { name: "build", type: "primary" },
      { name: "code-reviewer", type: "primary" },
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(parseAgentList("not an agent header\nstill nothing")).toEqual([]);
    expect(parseAgentList("")).toEqual([]);
  });

  it("ignores permission blocks and blank lines", () => {
    const stdout = `
plan (primary)

  {
    "permission": "*",
    "action": "allow"
  }

title (primary)
`.trim();

    expect(parseAgentList(stdout)).toEqual([
      { name: "plan", type: "primary" },
      { name: "title", type: "primary" },
    ]);
  });
});
