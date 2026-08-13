import { useWorkspace } from "../../store/WorkspaceProvider";
import type { StoredAgentSkill } from "../../../shared/ipc";
import { SettingsSection } from "./SettingsSection";

const ROW = "flex items-start gap-[14px] border-b border-lines px-4 py-[13px] last:border-b-0";
const ROW_DESC = "font-sans text-[11.5px] leading-[1.5] font-normal text-fg3";
const LABEL = "mb-[7px] font-sans text-[11px] leading-none font-medium text-fg4";
const FIELD =
  "w-full rounded-lg border border-lines bg-sunken px-3 py-[10px] font-mono text-[12.5px] leading-[1.3] font-normal focus:border-line";
const GHOST_BUTTON =
  "flex-none rounded-lg border border-lines px-[11px] py-[7px] font-sans text-[11.5px] leading-none font-medium text-fg2 hover:border-line hover:text-fg";

/**
 * The skills the user wrote themselves. Each one names something an agent can
 * be asked to run; the board actions below pick which of them they dispatch.
 */
export function AgentSkillsSection() {
  const {
    agentSkills,
    skillDraft,
    skillError,
    newAgentSkill,
    editAgentSkill,
    updateSkillDraft,
    closeSkillDraft,
    saveSkillDraft,
    removeAgentSkill,
  } = useWorkspace();

  // An open form for a skill in the list replaces that row, so the skill is
  // never shown twice while it is being rewritten.
  const editingId = skillDraft?.id;

  return (
    <SettingsSection
      title="Agent skills"
      description="Your own skills. Each one is what an agent is asked to run."
    >
      {agentSkills.length === 0 && !skillDraft && (
        <div className={`${ROW} ${ROW_DESC}`}>
          No skills yet — add one to put it behind a board action.
        </div>
      )}

      {agentSkills.map((skill) =>
        skill.id === editingId ? null : (
          <SkillRow
            key={skill.id}
            skill={skill}
            onEdit={() => editAgentSkill(skill)}
            onDelete={() => removeAgentSkill(skill.id)}
          />
        ),
      )}

      {skillDraft ? (
        <div className="flex flex-col gap-[14px] border-b border-lines px-4 py-[14px] last:border-b-0">
          <div>
            <div className={LABEL}>Name</div>
            <input
              className={FIELD}
              value={skillDraft.name}
              onChange={(event) => updateSkillDraft({ name: event.target.value })}
              placeholder="review-guard"
              autoFocus
            />
          </div>

          <div>
            <div className={LABEL}>Description</div>
            <input
              className="w-full rounded-lg border border-lines bg-sunken px-3 py-[10px] font-sans text-[13px] leading-[1.3] font-normal focus:border-line"
              value={skillDraft.description}
              onChange={(event) => updateSkillDraft({ description: event.target.value })}
              placeholder="Reads the diff and leaves line comments."
            />
          </div>

          <div>
            <div className={LABEL}>What the agent runs</div>
            <textarea
              className={`${FIELD} min-h-[76px] resize-y`}
              value={skillDraft.command}
              onChange={(event) => updateSkillDraft({ command: event.target.value })}
              placeholder="/review-pr"
            />
          </div>

          {skillError && (
            <div className="font-sans text-[11.5px] leading-[1.5] font-medium text-red">
              {skillError}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg bg-btn px-[14px] py-[9px] font-sans text-[12.5px] leading-none font-semibold text-btnfg hover:opacity-[0.88]"
              onClick={saveSkillDraft}
            >
              {skillDraft.id === undefined ? "Add skill" : "Save skill"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-lines px-[13px] py-[9px] font-sans text-[12.5px] leading-none font-medium text-fg2 hover:border-line"
              onClick={closeSkillDraft}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-[13px]">
          <button type="button" className={GHOST_BUTTON} onClick={newAgentSkill}>
            New skill
          </button>
        </div>
      )}
    </SettingsSection>
  );
}

interface SkillRowProps {
  skill: StoredAgentSkill;
  onEdit: () => void;
  onDelete: () => void;
}

function SkillRow({ skill, onEdit, onDelete }: SkillRowProps) {
  return (
    <div className={ROW}>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[12.5px] leading-none font-medium">{skill.name}</div>
        {skill.description && <div className={`mt-[6px] ${ROW_DESC}`}>{skill.description}</div>}
        <div className="mt-[6px] truncate font-mono text-[11px] leading-[1.4] font-normal text-fg4">
          {skill.command}
        </div>
      </div>
      <button type="button" className={GHOST_BUTTON} onClick={onEdit}>
        Edit
      </button>
      <button type="button" className={`${GHOST_BUTTON} hover:!text-red`} onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}
