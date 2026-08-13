import { COLUMNS } from "../data/board";
import type { BoardTask, ChipId, Column, ColumnId } from "../types";

export interface ColumnWithTasks extends Column {
  count: number;
  tasks: BoardTask[];
  isEmpty: boolean;
}

/**
 * The tasks belonging to `scope`, which is either a project id or `'all'`.
 * Every task on the board is scoped to a project: fetched pull requests to the
 * project they were read from, composed ones to the project they were filed in.
 */
export function tasksForScope(scope: string, tasks: BoardTask[]): BoardTask[] {
  return tasks.filter((task) => scope === "all" || task.scope === scope);
}

/** Applies the columns tasks have been moved to during the session. */
export function applyMoves(tasks: BoardTask[], moved: Record<string, ColumnId>): BoardTask[] {
  return tasks.map((task) => ({ ...task, col: moved[task.id] ?? task.col }));
}

export function matchesFilters(task: BoardTask, query: string, chip: ChipId): boolean {
  const q = query.trim().toLowerCase();
  if (
    q &&
    !(
      task.title.toLowerCase().includes(q) ||
      task.branch.toLowerCase().includes(q) ||
      String(task.pr ?? "").includes(q)
    )
  ) {
    return false;
  }

  if (chip === "mine" && !task.mine) return false;
  if (chip === "failing" && !task.failing) return false;
  return true;
}

export function groupIntoColumns(tasks: BoardTask[]): ColumnWithTasks[] {
  return COLUMNS.map((column) => {
    const columnTasks = tasks.filter((task) => task.col === column.id);
    return {
      ...column,
      count: columnTasks.length,
      tasks: columnTasks,
      isEmpty: columnTasks.length === 0,
    };
  });
}

/** The column a task lands in when its panel action is confirmed. */
export function nextColumnId(current: ColumnId): ColumnId {
  const index = COLUMNS.findIndex((column) => column.id === current);
  return COLUMNS[Math.min(index + 1, COLUMNS.length - 1)].id;
}

export function primaryActionLabel(column: ColumnId): string {
  switch (column) {
    case "merge":
      return "Merge pull request";
    case "needs":
      return "Unblock and re-run skill";
    case "working":
      return "Send to review";
    default:
      return "Approve";
  }
}
