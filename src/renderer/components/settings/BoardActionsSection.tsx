import { useWorkspace } from "../../store/WorkspaceProvider";
import type { SkillAction } from "../../../shared/ipc";
import { SettingsSection } from "./SettingsSection";

const ROW = "flex items-center gap-[14px] border-b border-lines px-4 py-[13px] last:border-b-0";
const ROW_DESC = "font-sans text-[11.5px] leading-[1.5] font-normal text-fg3";

const ACTIONS: { id: SkillAction; label: string; desc: string }[] = [
  {
    id: "review",
    label: "Start review",
    desc: "Runs on the button shown on cards in Needs you.",
  },
  {
    id: "fixComments",
    label: "Fix comments",
    desc: "Runs on the button shown on cards in In review.",
  },
];

/** Which of the user's skills each button on a card dispatches. */
export function BoardActionsSection() {
  const { agentSkills, skillAssignments, assignSkill } = useWorkspace();

  return (
    <SettingsSection
      title="Board actions"
      description="Pick the skill each button on a pull request card runs."
    >
      {ACTIONS.map((action) => (
        <div key={action.id} className={ROW}>
          <div className="min-w-0 flex-1">
            <div className="font-sans text-[12.5px] leading-[1.3] font-medium">{action.label}</div>
            <div className={`mt-[3px] ${ROW_DESC}`}>{action.desc}</div>
          </div>

          <select
            className="w-[190px] flex-none rounded-lg border border-lines bg-sunken px-[10px] py-[9px] font-mono text-[11.5px] leading-none font-normal text-fg focus:border-line"
            aria-label={`Skill for ${action.label}`}
            value={skillAssignments[action.id] ?? ""}
            onChange={(event) =>
              assignSkill(action.id, event.target.value === "" ? null : Number(event.target.value))
            }
            disabled={agentSkills.length === 0}
          >
            <option value="">{agentSkills.length === 0 ? "No skills yet" : "No skill"}</option>
            {agentSkills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </SettingsSection>
  );
}
