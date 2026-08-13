/**
 * The agent settings use cases: listing OpenCode agents and reading or writing
 * which one each board action runs.
 */

import type { AgentAction, AgentConfiguration, AgentSettings, OpencodeAgent } from "../../shared/ipc";
import { getAgentSettings, setAgentSetting } from "../db";
import { listOpencodeAgents } from "./opencodeAgentService";

export { listOpencodeAgents };

const AGENT_ACTIONS: AgentAction[] = ["reviewer", "fixer"];

/**
 * Drops assignments that no longer name a primary agent OpenCode knows about.
 * The database is only touched when something is cleared.
 */
export function reconcileAgentSettings(
  settings: AgentSettings,
  agents: OpencodeAgent[],
): AgentSettings {
  const names = new Set(agents.map((agent) => agent.name));

  return {
    reviewer: settings.reviewer && names.has(settings.reviewer) ? settings.reviewer : null,
    fixer: settings.fixer && names.has(settings.fixer) ? settings.fixer : null,
  };
}

function clearStaleAssignments(before: AgentSettings, after: AgentSettings): void {
  for (const action of AGENT_ACTIONS) {
    if (before[action] && !after[action]) {
      setAgentSetting(action, null);
    }
  }
}

/**
 * Reads saved assignments from the database and, when OpenCode answers, lists
 * agents and drops anything stale. A list failure still returns what was saved.
 */
export async function loadAgentConfiguration(): Promise<AgentConfiguration> {
  const stored = getAgentSettings();

  try {
    const agents = await listOpencodeAgents();
    const settings = reconcileAgentSettings(stored, agents);
    clearStaleAssignments(stored, settings);
    return { agents, settings, agentsError: null };
  } catch (error) {
    return {
      agents: [],
      settings: stored,
      agentsError: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Which OpenCode agent each board action runs. */
export function getSettings(): AgentSettings {
  return getAgentSettings();
}

/** Puts an OpenCode agent behind a board action, or clears it with `null`. */
export async function assignAgent(action: AgentAction, agentName: string | null): Promise<void> {
  if (agentName === null) {
    setAgentSetting(action, null);
    return;
  }

  const trimmed = agentName.trim();
  if (!trimmed) throw new Error("An agent name cannot be empty");

  const agents = await listOpencodeAgents();
  if (!agents.some((agent) => agent.name === trimmed)) {
    throw new Error(`No OpenCode agent named ${trimmed}`);
  }

  setAgentSetting(action, trimmed);
}
