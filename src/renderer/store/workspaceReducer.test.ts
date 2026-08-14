/**
 * The reducer reads the saved theme out of `localStorage` while it is being
 * imported, so these run against a DOM rather than bare Node.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  initialState,
  storedProjectId,
  toProject,
  workspaceReducer,
  type WorkspaceAction,
  type WorkspaceState,
} from "./workspaceReducer";
import type { RemotePullRequest, ReviewSummary, StoredProject } from "../../shared/ipc";
import type { AgentEvent } from "../../shared/agentEvent";
import type { BoardTask, Project } from "../types";

/** The state as it stands after `patch`, without repeating every field. */
function stateWith(patch: Partial<WorkspaceState> = {}): WorkspaceState {
  return { ...initialState, ...patch };
}

/** One step of the reducer, which is how every case below reads. */
function reduce(state: Partial<WorkspaceState>, action: WorkspaceAction): WorkspaceState {
  return workspaceReducer(stateWith(state), action);
}

function project(id: number, name = `repo-${id}`): Project {
  return toProject({
    id,
    name,
    repositoryLink: `https://github.com/${name}`,
    localPath: `/${name}`,
  });
}

function task(overrides: Partial<BoardTask> = {}): BoardTask {
  return {
    id: "1",
    col: "review",
    title: "A pull request",
    branch: "agent/one",
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

function review(overrides: Partial<ReviewSummary> = {}): ReviewSummary {
  return {
    id: 1,
    projectId: 1,
    pullRequestId: "pr-1",
    pullRequestNumber: 12,
    branch: "agent/one",
    status: "running",
    worktreePath: "/tmp/wt",
    startedAt: "2026-08-14T10:00:00.000Z",
    finishedAt: null,
    ...overrides,
  };
}

function textEvent(id: string): AgentEvent {
  return { kind: "text", id, text: id };
}

beforeEach(() => {
  localStorage.clear();
});

describe("toProject", () => {
  it("shapes a database row into a board project", () => {
    const stored: StoredProject = {
      id: 1,
      name: "acme/api",
      repositoryLink: "https://github.com/acme/api",
      localPath: "/src/api",
    };

    expect(toProject(stored)).toEqual({
      id: "db:1",
      repo: "acme/api",
      icon: "var(--orange)",
      repositoryLink: "https://github.com/acme/api",
    });
  });

  it("keys the accent off the row id, so a project keeps its colour across restarts", () => {
    const iconOf = (id: number) => project(id).icon;

    expect(iconOf(1)).toBe(iconOf(5));
    expect(iconOf(1)).not.toBe(iconOf(2));
  });
});

describe("storedProjectId", () => {
  it("reads the row id out of a project id", () => {
    expect(storedProjectId("db:12")).toBe(12);
  });

  it.each([["all"], ["db:"], ["db:abc"], ["n1723640000000"], ["12"]])(
    "returns null for %s, which is not a stored project",
    (id) => {
      expect(storedProjectId(id)).toBeNull();
    },
  );
});

describe("the theme", () => {
  it("saves the chosen theme so the app opens back on it", () => {
    const next = reduce({ theme: "dark" }, { type: "setTheme", theme: "light" });

    expect(next.theme).toBe("light");
    expect(localStorage.getItem("workestrator:theme")).toBe("light");
  });

  it.each([
    ["light", "light"],
    ["dark", "dark"],
    ["chartreuse", "dark"],
    [null, "dark"],
  ])("opens on %s as %s", async (saved, expected) => {
    localStorage.clear();
    if (saved !== null) localStorage.setItem("workestrator:theme", saved);

    // `initialState` is built while the module loads, so it has to be reloaded
    // to see a different saved value.
    vi.resetModules();
    const reloaded = await import("./workspaceReducer");

    expect(reloaded.initialState.theme).toBe(expected);
  });
});

describe("the panel", () => {
  it("opens a pull request on itself, not on a review left open from before", () => {
    const next = reduce(
      { openReview: { ...review(), result: "old" }, openReviewBusy: true },
      { type: "openTask", id: "pr-2" },
    );

    expect(next).toMatchObject({ openId: "pr-2", openReview: null, openReviewBusy: false });
  });

  it("advances a task to the next column and closes the panel", () => {
    const next = reduce({ openId: "a" }, { type: "advanceTask", id: "a", from: "needs" });

    expect(next.moved).toEqual({ a: "review" });
    expect(next.openId).toBeNull();
  });

  it("closes the panel when the settings screen opens", () => {
    expect(reduce({ openId: "a" }, { type: "setScreen", screen: "settings" }).openId).toBeNull();
  });

  it("leaves the panel alone when the board screen opens", () => {
    expect(reduce({ openId: "a" }, { type: "setScreen", screen: "board" }).openId).toBe("a");
  });
});

describe("the composer", () => {
  const projects = [project(1), project(2)];

  it("preselects the project you are looking at", () => {
    const next = reduce({ projects, scope: "db:2" }, { type: "openComposer" });
    expect(next.form.repo).toBe("db:2");
  });

  it("keeps the last project picked when opened from All PRs", () => {
    const next = reduce(
      { projects, scope: "all", form: { title: "", branch: "", repo: "db:2" } },
      { type: "openComposer" },
    );

    expect(next.form.repo).toBe("db:2");
  });

  it("falls back to the first project when the last one picked is gone", () => {
    const next = reduce(
      { projects, scope: "all", form: { title: "", branch: "", repo: "db:9" } },
      { type: "openComposer" },
    );

    expect(next.form.repo).toBe("db:1");
  });

  it("points at nothing when there is no project to file against", () => {
    const next = reduce({ projects: [], scope: "all" }, { type: "openComposer" });
    expect(next.form.repo).toBe("");
  });

  it("files a pull request against the chosen project and clears the form", () => {
    const next = reduce(
      {
        projects,
        scope: "db:1",
        form: { title: " Add board ", branch: " agent/board ", repo: "db:1" },
      },
      { type: "submitComposer" },
    );

    expect(next.extra).toHaveLength(1);
    expect(next.extra[0]).toMatchObject({
      scope: "db:1",
      col: "working",
      title: "Add board",
      branch: "agent/board",
      repo: "repo-1",
      pr: null,
      mine: true,
      lane: "Dispatched",
    });
    expect(next.form).toEqual({ title: "", branch: "", repo: "db:1" });
    expect(next.composerOpen).toBe(false);
  });

  it("names an untitled pull request rather than filing a blank one", () => {
    const next = reduce(
      { projects, form: { title: "   ", branch: "", repo: "db:1" } },
      { type: "submitComposer" },
    );

    expect(next.extra[0]).toMatchObject({
      title: "Untitled pull request",
      branch: "agent/untitled",
    });
  });

  it("files nothing when there is no project at all", () => {
    const next = reduce({ projects: [] }, { type: "submitComposer" });

    expect(next.extra).toEqual([]);
    expect(next.composerOpen).toBe(false);
  });

  it("stays on All PRs when that is where you were", () => {
    const next = reduce(
      { projects, scope: "all", form: { title: "x", branch: "", repo: "db:2" } },
      { type: "submitComposer" },
    );

    expect(next.scope).toBe("all");
  });

  it("follows the pull request when you were inside a project", () => {
    const next = reduce(
      { projects, scope: "db:1", form: { title: "x", branch: "", repo: "db:2" } },
      { type: "submitComposer" },
    );

    expect(next.scope).toBe("db:2");
  });
});

describe("removing a project", () => {
  const projects = [project(1), project(2)];

  const removed = () =>
    reduce(
      {
        projects,
        scope: "db:1",
        openId: "a",
        form: { title: "", branch: "", repo: "db:1" },
        extra: [task({ id: "x", scope: "db:1" }), task({ id: "y", scope: "db:2" })],
        fetched: [task({ id: "p", scope: "db:1" }), task({ id: "q", scope: "db:2" })],
      },
      { type: "projectRemoved", id: "db:1" },
    );

  it("takes its pull requests with it, fetched and composed alike", () => {
    const next = removed();

    expect(next.extra.map((t) => t.id)).toEqual(["y"]);
    expect(next.fetched.map((t) => t.id)).toEqual(["q"]);
  });

  it("falls back to All PRs when the project you were in is the one removed", () => {
    expect(removed().scope).toBe("all");
    expect(removed().openId).toBeNull();
  });

  it("points the composer at whatever project is left", () => {
    expect(removed().form.repo).toBe("db:2");
  });

  it("leaves the scope alone when a different project is removed", () => {
    const next = reduce({ projects, scope: "db:2" }, { type: "projectRemoved", id: "db:1" });
    expect(next.scope).toBe("db:2");
  });
});

describe("a fetch coming back", () => {
  const projects = [project(1)];

  function pullRequest(id: string): RemotePullRequest {
    return {
      id,
      projectId: 1,
      platform: "github",
      number: 12,
      title: id,
      branch: "agent/one",
      url: `https://github.com/acme/api/pull/12`,
      author: "dalmina",
      draft: false,
      mine: true,
      reviewedByMe: false,
      conflicted: false,
      approved: false,
      changesRequested: false,
      additions: null,
      deletions: null,
      createdAt: "2026-08-14T10:00:00.000Z",
      updatedAt: "2026-08-14T10:00:00.000Z",
      checks: [],
    };
  }

  const fetched = (
    ids: string[],
    options: {
      known?: BoardTask[];
      announce?: boolean;
      failures?: { projectId: number; project: string; message: string }[];
    } = {},
  ) =>
    reduce(
      { projects, fetched: options.known ?? [] },
      {
        type: "pullRequestsFetched",
        pullRequests: ids.map(pullRequest),
        failures: options.failures ?? [],
        announce: options.announce ?? true,
      },
    );

  it("replaces the fetched cards rather than adding to them", () => {
    const next = fetched(["b"], { known: [task({ id: "a" })] });
    expect(next.fetched.map((t) => t.id)).toEqual(["b"]);
  });

  it("counts only the pull requests it had not seen", () => {
    const before = fetched(["a"]).fetched;
    const next = fetched(["a", "b"], { known: before });

    expect(next.fetchNotice).toEqual({
      message: "1 new pull request · 2 open in total",
      tone: "green",
    });
  });

  it("writes the count in the plural", () => {
    expect(fetched(["a", "b"]).fetchNotice?.message).toBe("2 new pull requests · 2 open in total");
  });

  it("says so when nothing is new", () => {
    const before = fetched(["a"]).fetched;
    expect(fetched(["a"], { known: before }).fetchNotice?.message).toBe(
      "No new pull requests · 1 open in total",
    );
  });

  it("stays quiet about a fetch nobody asked for", () => {
    expect(fetched(["a"], { announce: false }).fetchNotice).toBeNull();
  });

  it("speaks up about a failure even when nobody asked", () => {
    const next = fetched(["a"], {
      announce: false,
      failures: [{ projectId: 1, project: "acme/api", message: "gh is not installed" }],
    });

    expect(next.fetchNotice).toEqual({ message: "gh is not installed", tone: "red" });
  });

  it("counts the other failures behind the first", () => {
    const next = fetched([], {
      failures: [
        { projectId: 1, project: "a", message: "gh is not installed" },
        { projectId: 2, project: "b", message: "glab is not installed" },
        { projectId: 3, project: "c", message: "no network" },
      ],
    });

    expect(next.fetchNotice?.message).toBe("gh is not installed (+2 more)");
  });

  it("asks for a project rather than counting zero pull requests", () => {
    const next = reduce(
      { projects: [] },
      { type: "pullRequestsFetched", pullRequests: [], failures: [], announce: true },
    );

    expect(next.fetchNotice).toEqual({
      message: "Add a project to fetch its pull requests",
      tone: "red",
    });
  });

  it("clears the last notice when a new fetch starts", () => {
    const next = reduce({ fetchNotice: { message: "old", tone: "red" } }, { type: "fetchPending" });

    expect(next).toMatchObject({ fetchBusy: true, fetchNotice: null });
  });
});

describe("agent settings", () => {
  it("puts an agent behind a board action", () => {
    const next = reduce(
      { agentSettingError: "old" },
      { type: "agentAssigned", action: "reviewer", agentName: "review-bot" },
    );

    expect(next.agentSettings).toEqual({ reviewer: "review-bot", fixer: null });
    expect(next.agentSettingError).toBeNull();
  });

  it("puts the previous agent back when saving fails", () => {
    const next = reduce(
      { agentSettings: { reviewer: "review-bot", fixer: null } },
      {
        type: "agentSettingFailed",
        action: "reviewer",
        previous: "old-bot",
        message: "database is locked",
      },
    );

    expect(next.agentSettings.reviewer).toBe("old-bot");
    expect(next.agentSettingError).toBe("database is locked");
  });
});

describe("reviews", () => {
  it("files reviews under the pull request they were run for", () => {
    const next = reduce(
      {},
      {
        type: "reviewsLoaded",
        reviews: [
          review({ id: 3, pullRequestId: "pr-1" }),
          review({ id: 2, pullRequestId: "pr-2" }),
          review({ id: 1, pullRequestId: "pr-1" }),
        ],
      },
    );

    expect(next.reviews["pr-1"].map((r) => r.id)).toEqual([3, 1]);
    expect(next.reviews["pr-2"].map((r) => r.id)).toEqual([2]);
  });

  it("puts a review it has not seen at the front of the list", () => {
    const next = reduce(
      { reviews: { "pr-1": [review({ id: 1 })] } },
      { type: "reviewChanged", review: review({ id: 2 }) },
    );

    expect(next.reviews["pr-1"].map((r) => r.id)).toEqual([2, 1]);
  });

  it("replaces the review it updates, keeping its place", () => {
    const next = reduce(
      { reviews: { "pr-1": [review({ id: 2 }), review({ id: 1 })] } },
      { type: "reviewChanged", review: review({ id: 1, status: "completed" }) },
    );

    expect(next.reviews["pr-1"].map((r) => r.status)).toEqual(["running", "completed"]);
  });

  it("updates the review the panel is reading underneath it", () => {
    const next = reduce(
      { openReview: { ...review({ id: 1 }), result: "the review text" } },
      { type: "reviewChanged", review: review({ id: 1, status: "completed" }) },
    );

    // The summary has no `result`, so patching must not wipe the text.
    expect(next.openReview).toMatchObject({ status: "completed", result: "the review text" });
  });

  it("leaves the panel alone when a different review changes", () => {
    const next = reduce(
      { openReview: { ...review({ id: 1 }), result: "text" } },
      { type: "reviewChanged", review: review({ id: 2, status: "completed" }) },
    );

    expect(next.openReview?.status).toBe("running");
  });

  it("shows the review before its text has been read back", () => {
    const next = reduce({ openReview: { ...review(), result: "old" } }, { type: "reviewOpened" });

    expect(next).toMatchObject({ openReviewBusy: true, openReview: null });
  });
});

describe("what a running agent is seen doing", () => {
  it("keeps the events in the order they arrived", () => {
    let state = stateWith({});
    for (const id of ["a", "b", "c"]) {
      state = workspaceReducer(state, { type: "reviewEvent", reviewId: 1, event: textEvent(id) });
    }

    expect(state.reviewEvents[1].map((event) => event.id)).toEqual(["a", "b", "c"]);
  });

  it("replaces an event it has already seen rather than showing it twice", () => {
    // opencode reports a tool call again when it revisits one.
    let state = stateWith({});
    for (const event of [textEvent("a"), textEvent("b"), { ...textEvent("a"), text: "again" }]) {
      state = workspaceReducer(state, { type: "reviewEvent", reviewId: 1, event });
    }

    expect(state.reviewEvents[1]).toEqual([
      { kind: "text", id: "a", text: "again" },
      { kind: "text", id: "b", text: "b" },
    ]);
  });

  it("keeps each review's events apart", () => {
    let state = stateWith({});
    state = workspaceReducer(state, { type: "reviewEvent", reviewId: 1, event: textEvent("a") });
    state = workspaceReducer(state, { type: "reviewEvent", reviewId: 2, event: textEvent("a") });

    expect(state.reviewEvents[1]).toHaveLength(1);
    expect(state.reviewEvents[2]).toHaveLength(1);
  });

  it("drops the oldest blocks once one review has run long enough", () => {
    let state = stateWith({});
    for (let i = 0; i < 520; i++) {
      state = workspaceReducer(state, {
        type: "reviewEvent",
        reviewId: 1,
        event: textEvent(`e${i}`),
      });
    }

    const events = state.reviewEvents[1];
    expect(events).toHaveLength(500);
    // The end is the part still worth having, the way a terminal scrolls.
    expect(events[0].id).toBe("e20");
    expect(events.at(-1)?.id).toBe("e519");
  });

  it("never drops a turn ending, since the token total is added up from them", () => {
    let state = stateWith({});
    state = workspaceReducer(state, {
      type: "reviewEvent",
      reviewId: 1,
      event: { kind: "step_finish", id: "finish", tokens: { input: 1, output: 2, reasoning: 0 } },
    });
    for (let i = 0; i < 520; i++) {
      state = workspaceReducer(state, {
        type: "reviewEvent",
        reviewId: 1,
        event: textEvent(`e${i}`),
      });
    }

    const events = state.reviewEvents[1];
    expect(events.filter((event) => event.kind === "step_finish")).toHaveLength(1);
    expect(events.filter((event) => event.kind !== "step_finish")).toHaveLength(500);
  });

  it("lets go of the oldest reviews' buffers rather than holding them all day", () => {
    let state = stateWith({});
    for (const reviewId of [1, 2, 3, 4, 5, 6, 7]) {
      state = workspaceReducer(state, {
        type: "reviewEvent",
        reviewId,
        event: textEvent("a"),
      });
    }

    // Reviews are numbered as they are recorded, so the smallest ids are oldest.
    expect(
      Object.keys(state.reviewEvents)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([3, 4, 5, 6, 7]);
  });
});

describe("errors the board reports", () => {
  it.each([
    ["dismissAddProjectError", "addProjectError"],
    ["dismissFetchNotice", "fetchNotice"],
    ["dismissAgentSettingError", "agentSettingError"],
    ["dismissReviewError", "reviewError"],
  ] as const)("clears what %s dismisses", (type, field) => {
    const next = reduce({ [field]: "something went wrong" }, { type } as WorkspaceAction);
    expect(next[field]).toBeNull();
  });

  it("clears the last error when the folder picker opens again", () => {
    const next = reduce({ addProjectError: "not a git repository" }, { type: "addProjectPending" });
    expect(next).toMatchObject({ addProjectBusy: true, addProjectError: null });
  });

  it("reports nothing when the picker is simply dismissed", () => {
    const next = reduce({ addProjectBusy: true }, { type: "addProjectCancelled" });
    expect(next).toMatchObject({ addProjectBusy: false, addProjectError: null });
  });
});

describe("an action the reducer does not know", () => {
  it("leaves the state exactly as it was", () => {
    const state = stateWith({ query: "harden" });
    expect(workspaceReducer(state, { type: "nonsense" } as unknown as WorkspaceAction)).toBe(state);
  });
});
