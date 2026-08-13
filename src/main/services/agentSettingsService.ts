/**
 * The agent settings use cases: listing OpenCode agents and reading or writing
 * which one each board action runs.
 */

import type { AgentAction, AgentSettings } from "../../shared/ipc";
import { getAgentSettings, setAgentSetting } from "../db";
import { listOpencodeAgents } from "./opencodeAgentService";

export { listOpencodeAgents };

/** Which OpenCode agent each board action runs. */
export function getSettings(): AgentSettings {
  return getAgentSettings();
}

/** Puts an OpenCode agent behind a board action, or clears it with `null`. */
export function assignAgent(action: AgentAction, agentName: string | null): void {
  setAgentSetting(action, agentName);
}
