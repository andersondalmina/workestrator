import { useWorkspace } from "../../store/WorkspaceProvider";
import type { AgentAction } from "../../../shared/ipc";
import { SettingsSection } from "./SettingsSection";

const ROW = "flex items-center gap-[14px] border-b border-lines px-4 py-[13px] last:border-b-0";
const ROW_DESC = "font-sans text-[11.5px] leading-[1.5] font-normal text-fg3";

const ACTIONS: { id: AgentAction; label: string; desc: string }[] = [
  {
    id: "reviewer",
    label: "Reviewer",
    desc: "Runs on the button shown on cards in Needs you.",
  },
  {
    id: "fixer",
    label: "Fixer",
    desc: "Runs on the button shown on cards in In review.",
  },
];

/** Which OpenCode agent each board action dispatches. */
export function AgentSettingsSection() {
  const {
    opencodeAgents,
    agentSettings,
    agentsLoading,
    agentsError,
    agentSettingError,
    setAgentSetting,
    dismissAgentSettingError,
  } = useWorkspace();

  return (
    <SettingsSection
      title="Agent settings"
      description="Pick the OpenCode agent each board action runs."
    >
      {agentsLoading && <div className={`${ROW} ${ROW_DESC}`}>Loading agents…</div>}

      {agentsError && (
        <div className={`${ROW} font-sans text-[11.5px] leading-[1.5] font-medium text-red`}>
          {agentsError}
        </div>
      )}

      {agentSettingError && (
        <div className={`${ROW} flex items-center justify-between gap-3`}>
          <div className="font-sans text-[11.5px] leading-[1.5] font-medium text-red">
            {agentSettingError}
          </div>
          <button
            type="button"
            className="flex-none rounded-lg border border-lines px-[11px] py-[7px] font-sans text-[11.5px] leading-none font-medium text-fg2 hover:border-line hover:text-fg"
            onClick={dismissAgentSettingError}
          >
            Dismiss
          </button>
        </div>
      )}

      {!agentsLoading &&
        ACTIONS.map((action) => {
          const selected = agentSettings[action.id];
          const missing =
            selected !== null && !opencodeAgents.some((agent) => agent.name === selected);
          const canPick = opencodeAgents.length > 0 || missing;

          return (
            <div key={action.id} className={ROW}>
              <div className="min-w-0 flex-1">
                <div className="font-sans text-[12.5px] leading-[1.3] font-medium">
                  {action.label}
                </div>
                <div className={`mt-[3px] ${ROW_DESC}`}>{action.desc}</div>
              </div>

              <select
                className="w-[190px] flex-none rounded-lg border border-lines bg-sunken px-[10px] py-[9px] font-mono text-[11.5px] leading-none font-normal text-fg focus:border-line"
                aria-label={`Agent for ${action.label}`}
                value={selected ?? ""}
                onChange={(event) =>
                  setAgentSetting(action.id, event.target.value === "" ? null : event.target.value)
                }
                disabled={!canPick}
              >
                <option value="">
                  {opencodeAgents.length === 0 ? "No agents found" : "No agent"}
                </option>
                {missing && selected && <option value={selected}>{selected} (not found)</option>}
                {opencodeAgents.map((agent) => (
                  <option key={agent.name} value={agent.name}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
    </SettingsSection>
  );
}
