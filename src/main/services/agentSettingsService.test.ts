import { describe, expect, it } from "vitest";
import { reconcileAgentSettings } from "./agentSettingsService";

describe("reconcileAgentSettings", () => {
  const agents = [
    { name: "code-reviewer", type: "primary" as const },
    { name: "build", type: "primary" as const },
  ];

  it("keeps assignments that still name a known agent", () => {
    expect(
      reconcileAgentSettings({ reviewer: "code-reviewer", fixer: "build" }, agents),
    ).toEqual({ reviewer: "code-reviewer", fixer: "build" });
  });

  it("clears assignments for agents that are no longer listed", () => {
    expect(
      reconcileAgentSettings({ reviewer: "deleted-agent", fixer: null }, agents),
    ).toEqual({ reviewer: null, fixer: null });
  });
});
