import { useWorkspace } from "../../store/WorkspaceProvider";
import { CloseIcon, FolderIcon } from "../icons";

const LABEL = "mb-[7px] font-sans text-[11px] leading-none font-medium text-fg4";
const FIELD =
  "w-full rounded-lg border border-lines bg-sunken px-3 py-[10px] font-mono text-[12.5px] leading-[1.3] font-normal";
const CHOICE_ON = "border-line bg-panel2 text-fg";
const CHOICE_OFF = "border-lines bg-transparent text-fg3 hover:border-line";
const EMPTY = "font-sans text-[11.5px] leading-none font-normal text-fg4";

export function ComposerDialog() {
  const { form, projects, agentSkills, updateForm, closeComposer, submitComposer } = useWorkspace();

  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center pt-[88px]">
      <button
        type="button"
        className="absolute inset-0 animate-wk-fade-fast cursor-default bg-black/[0.36]"
        onClick={closeComposer}
        aria-label="Close composer"
      />

      <div
        className="relative w-[520px] animate-wk-pop overflow-hidden rounded-[14px] border border-line bg-panel shadow-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="New pull request"
      >
        <header className="flex items-center gap-[10px] border-b border-lines px-[18px] py-[15px]">
          <span className="font-sans text-[13px] leading-none font-semibold">New pull request</span>
          <div className="flex-1" />
          <button type="button" className="flex" onClick={closeComposer} aria-label="Close">
            <CloseIcon size={13} color="var(--fg3)" />
          </button>
        </header>

        <div className="flex flex-col gap-[14px] px-[18px] py-4">
          <div>
            <div className={LABEL}>Project</div>
            <div className="flex flex-wrap gap-[7px]">
              {projects.length === 0 && (
                <div className={EMPTY}>No projects yet — add one from the sidebar.</div>
              )}
              {projects.map((project) => {
                const selected = form.repo === project.id;
                return (
                  <button
                    key={project.id}
                    type="button"
                    className={`flex items-center gap-[7px] rounded-lg border px-[11px] py-2 font-mono text-[11.5px] leading-none font-normal ${
                      selected ? CHOICE_ON : CHOICE_OFF
                    }`}
                    onClick={() => updateForm({ repo: project.id })}
                  >
                    <FolderIcon size={13} color={selected ? project.icon : "var(--fg4)"} />
                    {project.repo}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-[9px]">
            <div>
              <div className={LABEL}>Compare branch</div>
              <input
                className={`${FIELD} focus:border-line`}
                value={form.branch}
                onChange={(event) => updateForm({ branch: event.target.value })}
                placeholder="fix/queue-rebase"
                autoFocus
              />
            </div>
            <div className="pb-[11px] font-mono text-[11px] leading-none font-normal text-fg4">
              into
            </div>
            <div>
              <div className={LABEL}>Base</div>
              <div className={`${FIELD} text-fg3`}>main</div>
            </div>
          </div>

          <div>
            <div className={LABEL}>Title</div>
            <input
              className="w-full rounded-lg border border-lines bg-sunken px-3 py-[10px] font-sans text-[13px] leading-[1.3] font-normal focus:border-line"
              value={form.title}
              onChange={(event) => updateForm({ title: event.target.value })}
              placeholder="Rebase and resolve conflicts in queue worker"
            />
          </div>

          <div>
            <div className={LABEL}>Review skill</div>
            <div className="flex flex-wrap gap-[7px]">
              {agentSkills.length === 0 && (
                <div className={EMPTY}>No skills yet — add one in settings.</div>
              )}
              {agentSkills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  className={`rounded-[7px] border px-[10px] py-[7px] font-mono text-[11.5px] leading-none font-normal ${
                    form.skill === skill.name ? CHOICE_ON : CHOICE_OFF
                  }`}
                  onClick={() => updateForm({ skill: skill.name })}
                >
                  {skill.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="flex items-center gap-2 border-t border-lines px-[18px] py-3">
          <button
            type="button"
            className="rounded-lg bg-btn px-[14px] py-[9px] font-sans text-[12.5px] leading-none font-semibold text-btnfg hover:opacity-[0.88]"
            onClick={submitComposer}
          >
            Open pull request
          </button>
          <button
            type="button"
            className="rounded-lg border border-lines px-[13px] py-[9px] font-sans text-[12.5px] leading-none font-medium text-fg2 hover:border-line"
            onClick={closeComposer}
          >
            Cancel
          </button>
          <div className="flex-1" />
          <span className="font-mono text-[10.5px] leading-none font-normal text-fg4">
            review skill runs on open
          </span>
        </footer>
      </div>
    </div>
  );
}
