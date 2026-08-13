import { FILTER_CHIPS } from "../../data/board";
import { useWorkspace } from "../../store/WorkspaceProvider";
import { BoardColumn } from "./BoardColumn";
import { BoardSkeleton } from "./BoardSkeleton";
import { EmptyState } from "./EmptyState";

function BoardHeader() {
  const { isAllScope, activeProject, chip, setChip, isFiltered, tasks, visibleTasks } =
    useWorkspace();

  return (
    <div className="flex-none px-5 pt-4">
      <div className="min-w-0">
        <div className="font-sans text-base leading-[1.3] font-semibold tracking-[-0.01em]">
          {isAllScope ? "All pull requests" : activeProject?.repo}
        </div>
      </div>

      <div className="mt-[14px] flex items-center gap-[6px] border-b border-lines pb-3">
        {FILTER_CHIPS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`rounded-[20px] border px-[10px] py-[5px] font-sans text-[11.5px] leading-[1.3] font-medium ${
              chip === option.id
                ? "border-line bg-panel2 text-fg"
                : "border-lines bg-transparent text-fg3 hover:border-line"
            }`}
            onClick={() => setChip(option.id)}
          >
            {option.label}
          </button>
        ))}
        <div className="flex-1" />
        {isFiltered && (
          <div className="font-mono text-[11px] leading-none font-normal text-fg4">
            {visibleTasks.length} of {tasks.length} tasks
          </div>
        )}
      </div>
    </div>
  );
}

export function BoardScreen() {
  const { loading, visibleTasks, columns } = useWorkspace();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BoardHeader />

      {loading && <BoardSkeleton />}

      {!loading && visibleTasks.length === 0 && <EmptyState />}

      {!loading && visibleTasks.length > 0 && (
        <div className="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
          {columns.map((column) => (
            <BoardColumn key={column.id} column={column} />
          ))}
          <div className="min-w-[40px] flex-1" />
        </div>
      )}
    </div>
  );
}
