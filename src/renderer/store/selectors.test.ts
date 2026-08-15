import { describe, expect, it } from "vitest";
import {
  applyMoves,
  groupIntoColumns,
  isReviewable,
  matchesFilters,
  nextColumnId,
  primaryActionLabel,
  tasksForScope,
} from "./selectors";
import type { BoardTask, ColumnId } from "../types";

function task(overrides: Partial<BoardTask> = {}): BoardTask {
  return {
    id: "1",
    col: "review",
    title: "Harden agent settings loading",
    branch: "agent/settings",
    pr: 12,
    status: "Waiting on review",
    tone: "violet",
    time: "1h ago",
    repo: "acme/api",
    repoColor: "var(--green)",
    lane: "Open pull requests",
    ...overrides,
  };
}

describe("tasksForScope", () => {
  const tasks = [
    task({ id: "a", scope: "db:1" }),
    task({ id: "b", scope: "db:2" }),
    task({ id: "c", scope: "db:1" }),
  ];

  it("keeps every task under 'all'", () => {
    expect(tasksForScope("all", tasks).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps only the chosen project's tasks", () => {
    expect(tasksForScope("db:1", tasks).map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("returns nothing for a project with no tasks", () => {
    expect(tasksForScope("db:9", tasks)).toEqual([]);
  });
});

describe("applyMoves", () => {
  it("moves a task to the column it was dragged to", () => {
    const moved = applyMoves([task({ id: "a", col: "review" })], { a: "merge" });
    expect(moved[0].col).toBe("merge");
  });

  it("leaves a task that has not been moved where it is", () => {
    const moved = applyMoves([task({ id: "a", col: "review" })], { b: "merge" });
    expect(moved[0].col).toBe("review");
  });

  it("does not mutate the tasks it was given", () => {
    const original = task({ id: "a", col: "review" });
    applyMoves([original], { a: "merge" });
    expect(original.col).toBe("review");
  });
});

describe("matchesFilters", () => {
  const subject = task({ title: "Harden agent settings", branch: "agent/settings", pr: 42 });

  it("keeps everything when nothing is filtered", () => {
    expect(matchesFilters(subject, "", "all")).toBe(true);
  });

  it.each([
    ["a word of the title", "harden"],
    ["the title in another case", "AGENT SETTINGS"],
    ["part of the branch", "agent/"],
    ["the pull request number", "42"],
    ["a query padded with spaces", "  harden  "],
  ])("matches on %s", (_label, query) => {
    expect(matchesFilters(subject, query, "all")).toBe(true);
  });

  it("rejects a query that matches nothing on the card", () => {
    expect(matchesFilters(subject, "database", "all")).toBe(false);
  });

  it("matches nothing on the number of a card that has none", () => {
    expect(matchesFilters(task({ pr: null }), "42", "all")).toBe(false);
  });

  it("keeps only your own under the 'mine' chip", () => {
    expect(matchesFilters(task({ mine: true }), "", "mine")).toBe(true);
    expect(matchesFilters(task({ mine: false }), "", "mine")).toBe(false);
  });

  it("keeps only failing cards under the 'failing' chip", () => {
    expect(matchesFilters(task({ failing: true }), "", "failing")).toBe(true);
    expect(matchesFilters(task({ failing: false }), "", "failing")).toBe(false);
  });

  it("applies the query and the chip together", () => {
    expect(matchesFilters(task({ title: "Harden", mine: true }), "harden", "mine")).toBe(true);
    expect(matchesFilters(task({ title: "Harden", mine: false }), "harden", "mine")).toBe(false);
  });
});

describe("groupIntoColumns", () => {
  it("returns every column, in board order, even with no tasks", () => {
    const columns = groupIntoColumns([]);

    expect(columns.map((column) => column.id)).toEqual(["working", "needs", "review", "merge"]);
    expect(columns.every((column) => column.isEmpty && column.count === 0)).toBe(true);
  });

  it("counts the tasks in each column", () => {
    const columns = groupIntoColumns([
      task({ id: "a", col: "review" }),
      task({ id: "b", col: "review" }),
      task({ id: "c", col: "merge" }),
    ]);

    const byId = Object.fromEntries(columns.map((column) => [column.id, column]));
    expect(byId.review.count).toBe(2);
    expect(byId.review.isEmpty).toBe(false);
    expect(byId.merge.count).toBe(1);
    expect(byId.working.isEmpty).toBe(true);
  });
});

describe("nextColumnId", () => {
  it.each([
    ["working", "needs"],
    ["needs", "review"],
    ["review", "merge"],
  ])("advances %s to %s", (from, to) => {
    expect(nextColumnId(from as ColumnId)).toBe(to);
  });

  it("holds at the last column rather than running off the end", () => {
    expect(nextColumnId("merge")).toBe("merge");
  });
});

describe("primaryActionLabel", () => {
  it.each([
    ["merge", "Merge pull request"],
    ["needs", "Unblock and re-run skill"],
    ["working", "Send to review"],
    ["review", "Approve"],
  ])("labels the %s column's action", (column, label) => {
    expect(primaryActionLabel(column as ColumnId)).toBe(label);
  });
});

describe("isReviewable", () => {
  const pullRequest = task({
    pr: 12,
    url: "https://github.com/acme/api/pull/12",
    platform: "github",
  });

  it("takes a task with a pull request behind it", () => {
    expect(isReviewable(pullRequest)).toBe(true);
  });

  it.each<[string, Partial<BoardTask>]>([
    ["number", { pr: null }],
    ["url", { url: undefined }],
    ["platform", { platform: undefined }],
  ])("refuses a task with no %s", (_what, missing) => {
    expect(isReviewable({ ...pullRequest, ...missing })).toBe(false);
  });
});
