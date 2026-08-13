import { useWorkspace } from "../../store/WorkspaceProvider";

export function EmptyState() {
  const { tasks, projects, scopeName, openComposer, addProject, clearFilters } = useWorkspace();
  const nothingHere = tasks.length === 0;
  // Before the first project there is nowhere for a task to go, so the board
  // asks for a repository rather than for a pull request.
  const noProjects = projects.length === 0;

  if (noProjects) {
    return (
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="max-w-[340px] text-center">
          <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl border border-dashed border-line">
            <span className="size-[10px] rotate-45 rounded-[3px] border-[1.5px] border-fg4" />
          </div>
          <div className="font-sans text-sm leading-[1.4] font-semibold">No projects yet</div>
          <div className="mt-[6px] font-sans text-[12.5px] leading-[1.6] font-normal text-pretty text-fg3">
            Add a repository from this computer and Workestrator will read its open pull requests
            onto the board.
          </div>
          <button
            type="button"
            className="mt-[18px] rounded-lg bg-btn px-[14px] py-2 font-sans text-[12.5px] leading-none font-semibold text-btnfg hover:opacity-[0.88]"
            onClick={addProject}
          >
            Add a project
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <div className="max-w-[340px] text-center">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl border border-dashed border-line">
          <span className="size-[10px] rotate-45 rounded-[3px] border-[1.5px] border-fg4" />
        </div>
        <div className="font-sans text-sm leading-[1.4] font-semibold">
          {nothingHere ? `Nothing in ${scopeName} yet` : "No tasks match this filter"}
        </div>
        <div className="mt-[6px] font-sans text-[12.5px] leading-[1.6] font-normal text-pretty text-fg3">
          {nothingHere
            ? "No pull requests have been routed here. Dispatch a task and a skill will pick it up on the next poll."
            : `Your search and filters exclude every task in ${scopeName}.`}
        </div>
        <button
          type="button"
          className="mt-[18px] rounded-lg bg-btn px-[14px] py-2 font-sans text-[12.5px] leading-none font-semibold text-btnfg hover:opacity-[0.88]"
          onClick={nothingHere ? openComposer : clearFilters}
        >
          {nothingHere ? "Dispatch first task" : "Clear filters"}
        </button>
      </div>
    </div>
  );
}
