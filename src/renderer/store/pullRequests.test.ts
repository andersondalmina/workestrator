import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { relativeTime, toBoardTasks } from "./pullRequests";
import type { RemotePullRequest } from "../../shared/ipc";
import type { Project } from "../types";

const NOW = new Date("2026-08-14T12:00:00.000Z");

const project: Project = {
  id: "db:1",
  repo: "acme/api",
  icon: "var(--green)",
  repositoryLink: "https://github.com/acme/api",
};

function pullRequest(overrides: Partial<RemotePullRequest> = {}): RemotePullRequest {
  return {
    id: "github:acme/api:12",
    projectId: 1,
    platform: "github",
    number: 12,
    title: "Harden agent settings loading",
    branch: "agent/settings",
    url: "https://github.com/acme/api/pull/12",
    author: "dalmina",
    draft: false,
    mine: false,
    reviewedByMe: false,
    conflicted: false,
    approved: false,
    changesRequested: false,
    additions: 12,
    deletions: 3,
    createdAt: "2026-08-14T10:00:00.000Z",
    updatedAt: "2026-08-14T11:00:00.000Z",
    checks: [],
    ...overrides,
  };
}

/** The single card `toBoardTasks` builds for one pull request. */
function cardFor(overrides: Partial<RemotePullRequest> = {}) {
  const [task] = toBoardTasks([pullRequest(overrides)], [project]);
  return task;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toBoardTasks", () => {
  it("files a pull request against the project it was fetched for", () => {
    const task = cardFor();

    expect(task).toMatchObject({
      id: "github:acme/api:12",
      scope: "db:1",
      repo: "acme/api",
      repoColor: "var(--green)",
      pr: 12,
      author: "dalmina",
      lane: "Open pull requests",
      platform: "github",
    });
  });

  it("drops a pull request whose project was deleted between fetch and answer", () => {
    expect(toBoardTasks([pullRequest({ projectId: 9 })], [project])).toEqual([]);
  });

  it("keeps the pull requests whose projects are still on the board", () => {
    const tasks = toBoardTasks(
      [pullRequest({ id: "a" }), pullRequest({ id: "b", projectId: 9 }), pullRequest({ id: "c" })],
      [project],
    );

    expect(tasks.map((task) => task.id)).toEqual(["a", "c"]);
  });

  it("leaves the diff size off when the CLI does not report one, as GitLab's does not", () => {
    expect(cardFor({ additions: null, deletions: null })).toMatchObject({
      plus: undefined,
      minus: undefined,
    });
  });

  it("signs the diff size when the CLI does report one", () => {
    expect(cardFor({ additions: 12, deletions: 3 })).toMatchObject({ plus: "+12", minus: "-3" });
  });

  it("counts a card as failing when any check failed", () => {
    const task = cardFor({
      checks: [
        { name: "lint", state: "passed" },
        { name: "test", state: "failed" },
      ],
    });

    expect(task.failing).toBe(true);
    expect(task.checks).toEqual([
      { name: "lint", state: "passed", time: "—", tone: "green" },
      { name: "test", state: "failed", time: "—", tone: "red" },
    ]);
  });

  it("tones a check state it does not know as plain foreground", () => {
    expect(cardFor({ checks: [{ name: "odd", state: "cancelled" }] }).checks?.[0].tone).toBe("fg");
  });

  it("opens the timeline with the status and who opened it", () => {
    expect(cardFor().timeline).toEqual([
      { text: "Waiting on your review", by: "github · 1h ago", tone: "orange" },
      { text: "Opened by @dalmina", by: "github · 2h ago", tone: "fg" },
    ]);
  });
});

describe("the column a pull request lands in", () => {
  it.each([
    ["a draft, whoever wrote it", { draft: true }, "working"],
    ["a draft of your own", { draft: true, mine: true }, "working"],
    ["an approved pull request", { approved: true }, "merge"],
    ["your own open pull request", { mine: true }, "review"],
    ["one you have already reviewed", { reviewedByMe: true }, "review"],
    ["somebody else's you have not read", {}, "needs"],
  ])("puts %s in %s", (_label, overrides, column) => {
    expect(cardFor(overrides).col).toBe(column);
  });

  it("reads draft before approved, since being a draft outranks it", () => {
    expect(cardFor({ draft: true, approved: true }).col).toBe("working");
  });

  it("reads approved before yours, so an approved PR of yours is ready to merge", () => {
    expect(cardFor({ approved: true, mine: true }).col).toBe("merge");
  });
});

describe("the state label on the card", () => {
  it.each([
    ["conflicted", { conflicted: true }, "conflicted", "red"],
    ["changes requested", { changesRequested: true }, "changes requested", "orange"],
    ["draft", { draft: true }, "draft", "fg"],
    ["approved", { approved: true }, "approved", "green"],
    ["open", {}, "in review", "violet"],
  ])("labels %s", (_label, overrides, state, tone) => {
    expect(cardFor(overrides)).toMatchObject({ prState: state, prTone: tone });
  });

  it("reads conflicted before everything else", () => {
    expect(cardFor({ conflicted: true, changesRequested: true, draft: true }).prState).toBe(
      "conflicted",
    );
  });
});

describe("the status line at the foot of the card", () => {
  it.each([
    ["a merge conflict", { conflicted: true }, "Merge conflict to resolve", "orange", true],
    ["changes requested", { changesRequested: true }, "Changes requested", "orange", true],
    [
      "a failing check",
      { checks: [{ name: "test", state: "failed" }] },
      "Checks failing",
      "red",
      true,
    ],
    [
      "a running check",
      { checks: [{ name: "test", state: "running" }] },
      "Checks running",
      "blue",
      false,
    ],
    ["a draft", { draft: true }, "Draft, not up for review", "blue", false],
    ["an approved PR", { approved: true }, "Approved and mergeable", "green", false],
    ["one waiting on you", {}, "Waiting on your review", "orange", true],
    ["one of your own", { mine: true }, "Waiting on review", "violet", false],
    ["one you reviewed", { reviewedByMe: true }, "Waiting on review", "violet", false],
  ])("reports %s", (_label, overrides, status, tone, blocked) => {
    // A blocked card is marked square, one still moving is marked round.
    expect(cardFor(overrides)).toMatchObject({ status, tone, mark: blocked ? "2px" : "50%" });
  });

  it("reads a conflict before a failing check, since that is what you must act on", () => {
    expect(cardFor({ conflicted: true, checks: [{ name: "t", state: "failed" }] }).status).toBe(
      "Merge conflict to resolve",
    );
  });

  it("reads a failing check before a running one", () => {
    const task = cardFor({
      checks: [
        { name: "a", state: "running" },
        { name: "b", state: "failed" },
      ],
    });

    expect(task.status).toBe("Checks failing");
  });

  it("reads a failing check before the draft it is on", () => {
    expect(cardFor({ draft: true, checks: [{ name: "t", state: "failed" }] }).status).toBe(
      "Checks failing",
    );
  });
});

describe("relativeTime", () => {
  it.each([
    ["2026-08-14T12:00:00.000Z", "now"],
    ["2026-08-14T11:59:31.000Z", "now"],
    ["2026-08-14T11:59:00.000Z", "1m ago"],
    ["2026-08-14T11:01:00.000Z", "59m ago"],
    ["2026-08-14T11:00:00.000Z", "1h ago"],
    ["2026-08-13T13:00:00.000Z", "23h ago"],
    ["2026-08-13T12:00:00.000Z", "1d ago"],
    ["2026-08-07T12:00:00.000Z", "7d ago"],
  ])("writes %s as %s", (iso, expected) => {
    expect(relativeTime(iso)).toBe(expected);
  });

  it("writes a timestamp it cannot read as a dash", () => {
    expect(relativeTime("not a date")).toBe("—");
  });

  it("does not count backwards for a timestamp in the future", () => {
    expect(relativeTime("2026-08-14T13:00:00.000Z")).toBe("now");
  });
});
