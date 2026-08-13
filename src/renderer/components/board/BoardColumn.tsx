import type { ColumnWithTasks } from "../../store/selectors";
import { TaskCard } from "./TaskCard";

export function BoardColumn({ column }: { column: ColumnWithTasks }) {
  return (
    <section className="flex min-h-0 w-[var(--colw)] flex-none flex-col border-r border-lines">
      <header className="flex flex-none items-center gap-[9px] px-[14px] pt-[14px] pb-[10px]">
        <span className="size-[9px] rounded-[3px]" style={{ background: column.color }} />
        <span className="flex-1 font-sans text-[12.5px] leading-none font-semibold text-fg">
          {column.name}
        </span>
        <span className="font-mono text-[11px] leading-none font-normal text-fg4">
          {column.count}
        </span>
      </header>

      <div className="flex w-full flex-1 flex-col gap-[var(--cgap)] overflow-y-auto px-3 pt-[2px] pb-5">
        {column.tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        {column.isEmpty && (
          <div className="rounded-[10px] border border-dashed border-lines px-3 py-4 text-center font-sans text-[11.5px] leading-[1.5] font-normal text-fg4">
            {column.emptyText}
          </div>
        )}
      </div>
    </section>
  );
}
