import { toBoardTasks } from "./pullRequests";
import { nextColumnId } from "./selectors";
import type {
  AgentAction,
  AgentSettings,
  OpencodeAgent,
  PullRequestFailure,
  RemotePullRequest,
  ReviewSummary,
  StoredProject,
  StoredReview,
} from "../../shared/ipc";
import type { AgentEvent } from "../../shared/agentEvent";
import type { BoardTask, ChipId, ColumnId, ComposerForm, Project, Screen, Theme } from "../types";

/** Accents handed out to added projects, so each gets a distinct folder tint. */
const PROJECT_ACCENTS = ["var(--green)", "var(--orange)", "var(--red)", "var(--blue)"];

/**
 * How much of one review's working is kept. A review that goes on long enough
 * to pass this has a timeline nobody is scrolling all of, and the end of it is
 * the part still worth having, so the oldest blocks fall off the top the way
 * they would out of a terminal.
 */
const EVENT_LIMIT = 500;

/**
 * How many reviews are kept working for at once. Only the one in the panel is
 * ever read, and a window left open all day runs plenty of them, so the buffers
 * behind it are let go oldest first rather than held until the window reloads.
 */
const REVIEW_LIMIT = 5;

/** Shapes a database row into the project the board works with. */
export function toProject(stored: StoredProject): Project {
  return {
    id: `db:${stored.id}`,
    repo: stored.name,
    // Keyed off the row id so a project keeps its colour across restarts.
    icon: PROJECT_ACCENTS[stored.id % PROJECT_ACCENTS.length],
    repositoryLink: stored.repositoryLink,
  };
}

/** The database row behind a project id, or `null` if the id is not one. */
export function storedProjectId(projectId: string): number | null {
  const match = /^db:(\d+)$/.exec(projectId);
  return match ? Number(match[1]) : null;
}

/** A line at the foot of the board reporting what an action did. */
export interface Notice {
  message: string;
  tone: "green" | "red";
}

export const NO_AGENT_SETTINGS: AgentSettings = {
  reviewer: null,
  fixer: null,
};

/** Where the chosen theme is kept, so the app opens back on it next launch. */
const THEME_STORAGE_KEY = "workestrator:theme";

/** Reads the saved theme, falling back to dark for a first run or a bad value. */
function storedTheme(): Theme {
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  return value === "light" || value === "dark" ? value : "dark";
}

export interface WorkspaceState {
  theme: Theme;
  screen: Screen;
  /** `'all'` or a project id. */
  scope: string;
  query: string;
  chip: ChipId;
  loading: boolean;
  openId: string | null;
  composerOpen: boolean;
  form: ComposerForm;
  /** Columns tasks have been moved to from the detail panel. */
  moved: Record<string, ColumnId>;
  /** Tasks created from the composer. */
  extra: BoardTask[];
  /** Pull requests read from GitHub and GitLab by the last fetch. */
  fetched: BoardTask[];
  /** The projects loaded from the database. */
  projects: Project[];
  /** Set while the folder picker is open, to keep it from opening twice. */
  addProjectBusy: boolean;
  /** Why the last attempt failed, e.g. the folder is not a git repository. */
  addProjectError: string | null;
  /** Set while the CLIs are being asked for pull requests. */
  fetchBusy: boolean;
  /** What the last fetch had to say, if anything. */
  fetchNotice: Notice | null;
  /** Primary OpenCode agents available for board actions. */
  opencodeAgents: OpencodeAgent[];
  /** Which OpenCode agent each board action runs. */
  agentSettings: AgentSettings;
  /** Set while `opencode agent list` is being read. */
  agentsLoading: boolean;
  /** Why the agent list could not be read, e.g. opencode is not installed. */
  agentsError: string | null;
  /** Why the last agent assignment could not be saved. */
  agentSettingError: string | null;
  /**
   * The reviews run against each pull request, newest first, keyed by the id
   * of the pull request they were run for. Kept beside the cards rather than
   * on them, since a fetch replaces every fetched card wholesale.
   */
  reviews: Record<string, ReviewSummary[]>;
  /**
   * What each review's agent has been seen doing, in the order it arrived,
   * keyed by the id of the review it belongs to. Only ever filled by a run
   * this window was open for: nothing writes these down, so a review from a
   * previous launch has none and shows only what it ended up writing.
   */
  reviewEvents: Record<number, AgentEvent[]>;
  /** The review being read in the panel, or `null` while the list is shown. */
  openReview: StoredReview | null;
  /** Set between opening a review and its text being read back. */
  openReviewBusy: boolean;
  /** Why a review could not be started, e.g. the project moved on disk. */
  reviewError: string | null;
}

export const initialState: WorkspaceState = {
  theme: storedTheme(),
  screen: "board",
  scope: "all",
  query: "",
  chip: "all",
  loading: false,
  openId: null,
  composerOpen: false,
  form: { title: "", branch: "", repo: "" },
  moved: {},
  extra: [],
  fetched: [],
  projects: [],
  addProjectBusy: false,
  addProjectError: null,
  fetchBusy: false,
  fetchNotice: null,
  opencodeAgents: [],
  agentSettings: NO_AGENT_SETTINGS,
  agentsLoading: true,
  agentsError: null,
  agentSettingError: null,
  reviews: {},
  reviewEvents: {},
  openReview: null,
  openReviewBusy: false,
  reviewError: null,
};

export type WorkspaceAction =
  | { type: "setQuery"; query: string }
  | { type: "setChip"; chip: ChipId }
  | { type: "clearFilters" }
  | { type: "selectScope"; scope: string }
  | { type: "finishLoading" }
  | { type: "openTask"; id: string }
  | { type: "closeTask" }
  | { type: "advanceTask"; id: string; from: ColumnId }
  | { type: "setScreen"; screen: Screen }
  | { type: "setTheme"; theme: Theme }
  | { type: "openComposer" }
  | { type: "closeComposer" }
  | { type: "updateForm"; patch: Partial<ComposerForm> }
  | { type: "submitComposer" }
  | { type: "projectsLoaded"; projects: StoredProject[] }
  | { type: "addProjectPending" }
  | { type: "addProjectCancelled" }
  | { type: "addProjectFailed"; message: string }
  | { type: "dismissAddProjectError" }
  | { type: "projectAdded"; project: StoredProject }
  | { type: "projectRemoved"; id: string }
  | { type: "fetchPending" }
  | { type: "fetchFailed"; message: string }
  | {
      type: "pullRequestsFetched";
      pullRequests: RemotePullRequest[];
      failures: PullRequestFailure[];
      /** False for the fetches the app starts by itself, which stay quiet. */
      announce: boolean;
    }
  | { type: "dismissFetchNotice" }
  | {
      type: "agentsLoaded";
      agents: OpencodeAgent[];
      settings: AgentSettings;
      agentsError: string | null;
    }
  | { type: "agentAssigned"; action: AgentAction; agentName: string | null }
  | {
      type: "agentSettingFailed";
      action: AgentAction;
      previous: string | null;
      message: string;
    }
  | { type: "dismissAgentSettingError" }
  | { type: "reviewsLoaded"; reviews: ReviewSummary[] }
  | { type: "reviewChanged"; review: ReviewSummary }
  | { type: "reviewEvent"; reviewId: number; event: AgentEvent }
  | { type: "reviewOpened" }
  | { type: "reviewLoaded"; review: StoredReview | null }
  | { type: "closeReview" }
  | { type: "reviewFailed"; message: string }
  | { type: "dismissReviewError" };

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "setQuery":
      return { ...state, query: action.query };

    case "setChip":
      return { ...state, chip: action.chip };

    case "clearFilters":
      return { ...state, query: "", chip: "all" };

    // Switching scope replays the short skeleton state the design shows.
    case "selectScope":
      return {
        ...state,
        scope: action.scope,
        loading: true,
        openId: null,
        screen: "board",
      };

    case "finishLoading":
      return { ...state, loading: false };

    // A panel always opens on the pull request itself, never on a review left
    // open from whatever was being read last.
    case "openTask":
      return {
        ...state,
        openId: action.id,
        openReview: null,
        openReviewBusy: false,
      };

    case "closeTask":
      return { ...state, openId: null };

    case "advanceTask":
      return {
        ...state,
        moved: { ...state.moved, [action.id]: nextColumnId(action.from) },
        openId: null,
      };

    case "setScreen":
      return {
        ...state,
        screen: action.screen,
        openId: action.screen === "settings" ? null : state.openId,
      };

    case "setTheme":
      localStorage.setItem(THEME_STORAGE_KEY, action.theme);
      return { ...state, theme: action.theme };

    // Opening the composer from inside a project preselects that project;
    // from "All PRs" it opens on whatever was picked last, or the first
    // project, so the form is never left pointing at nothing.
    case "openComposer": {
      const known = state.projects.some((project) => project.id === state.form.repo);

      return {
        ...state,
        composerOpen: true,
        form: {
          ...state.form,
          repo:
            state.scope === "all"
              ? known
                ? state.form.repo
                : (state.projects[0]?.id ?? "")
              : state.scope,
        },
      };
    }

    case "closeComposer":
      return { ...state, composerOpen: false };

    case "updateForm":
      return { ...state, form: { ...state.form, ...action.patch } };

    // Nothing can be filed until there is a project to file it against.
    case "submitComposer": {
      const target =
        state.projects.find((project) => project.id === state.form.repo) ?? state.projects[0];
      if (!target) return { ...state, composerOpen: false };

      const created: BoardTask = {
        id: `n${Date.now()}`,
        scope: target.id,
        col: "working",
        title: state.form.title.trim() || "Untitled pull request",
        branch: state.form.branch.trim() || "agent/untitled",
        lane: "Dispatched",
        repo: target.repo,
        repoColor: target.icon,
        // The remote hands out the number, so the card has none until fetched.
        pr: null,
        prState: "draft",
        prTone: "fg",
        skill: undefined,
        status: "Opening pull request",
        tone: "blue",
        time: "now",
        mark: "50%",
        mine: true,
      };

      return {
        ...state,
        composerOpen: false,
        // Stay on "All PRs" if that is where you were, otherwise follow the PR.
        scope: state.scope === "all" ? "all" : target.id,
        form: {
          title: "",
          branch: "",
          repo: target.id,
        },
        extra: [...state.extra, created],
      };
    }

    case "projectsLoaded":
      return { ...state, projects: action.projects.map(toProject) };

    // Opening the picker clears whatever the last attempt reported.
    case "addProjectPending":
      return { ...state, addProjectBusy: true, addProjectError: null };

    // The picker was dismissed: nothing was added and nothing went wrong.
    case "addProjectCancelled":
      return { ...state, addProjectBusy: false };

    case "addProjectFailed":
      return {
        ...state,
        addProjectBusy: false,
        addProjectError: action.message,
      };

    case "dismissAddProjectError":
      return { ...state, addProjectError: null };

    // Adding a project opens the new project's board.
    case "projectAdded": {
      const project = toProject(action.project);
      return {
        ...state,
        projects: [...state.projects, project],
        addProjectBusy: false,
        addProjectError: null,
        scope: project.id,
        loading: true,
        openId: null,
        screen: "board",
      };
    }

    // Deleting a project takes its pull requests with it, both the fetched
    // ones and the ones created this session. Whatever was scoped to it falls
    // back to "All PRs".
    case "projectRemoved": {
      const projects = state.projects.filter((project) => project.id !== action.id);
      const fallbackRepo = projects[0]?.id ?? "";

      return {
        ...state,
        projects,
        extra: state.extra.filter((task) => task.scope !== action.id),
        fetched: state.fetched.filter((task) => task.scope !== action.id),
        scope: state.scope === action.id ? "all" : state.scope,
        openId: null,
        form: {
          ...state.form,
          repo: state.form.repo === action.id ? fallbackRepo : state.form.repo,
        },
      };
    }

    // Asking again clears what the last answer said.
    case "fetchPending":
      return { ...state, fetchBusy: true, fetchNotice: null };

    case "fetchFailed":
      return {
        ...state,
        fetchBusy: false,
        fetchNotice: { message: action.message, tone: "red" },
      };

    // The answer replaces the fetched cards rather than adding to them, so a
    // pull request that was merged or closed since the last fetch leaves the
    // board and fetching twice cannot double anything up. Cards are built
    // here, against the projects as they stand now, so a fetch that overlapped
    // a project being added or forgotten still lands on the right board.
    case "pullRequestsFetched": {
      const tasks = toBoardTasks(action.pullRequests, state.projects);
      const known = new Set(state.fetched.map((task) => task.id));
      const opened = tasks.filter((task) => !known.has(task.id)).length;
      const notice = noticeFor(state, tasks.length, opened, action.failures);

      return {
        ...state,
        fetched: tasks,
        fetchBusy: false,
        // A fetch nobody asked for only speaks up when something went wrong.
        fetchNotice: action.announce || notice.tone === "red" ? notice : null,
      };
    }

    case "dismissFetchNotice":
      return { ...state, fetchNotice: null };

    case "agentsLoaded":
      return {
        ...state,
        opencodeAgents: action.agents,
        agentSettings: action.settings,
        agentsLoading: false,
        agentsError: action.agentsError,
        agentSettingError: null,
      };

    case "agentAssigned":
      return {
        ...state,
        agentSettings: {
          ...state.agentSettings,
          [action.action]: action.agentName,
        },
        agentSettingError: null,
      };

    case "agentSettingFailed":
      return {
        ...state,
        agentSettings: {
          ...state.agentSettings,
          [action.action]: action.previous,
        },
        agentSettingError: action.message,
      };

    case "dismissAgentSettingError":
      return { ...state, agentSettingError: null };

    case "reviewsLoaded":
      return { ...state, reviews: groupReviews(action.reviews) };

    // One review, as the main process reported it starting or ending. It takes
    // the place of the row it updates, or joins the front of the list.
    case "reviewChanged": {
      const { review } = action;
      const known = state.reviews[review.pullRequestId] ?? [];
      const replaced = known.some((entry) => entry.id === review.id);

      return {
        ...state,
        reviews: {
          ...state.reviews,
          [review.pullRequestId]: replaced
            ? known.map((entry) => (entry.id === review.id ? review : entry))
            : [review, ...known],
        },
        // What the panel is reading has just been rewritten underneath it.
        openReview:
          state.openReview?.id === review.id
            ? { ...state.openReview, ...review }
            : state.openReview,
      };
    }

    // One thing the agent did, filed under the review it was doing it for. An
    // event that has been seen before takes the place of the one it repeats —
    // opencode reports a tool call again when it revisits one — so the same
    // call is never shown twice. Reviews are numbered as they are recorded, so
    // nothing here has to be cleared: a new run cannot land on an old buffer.
    case "reviewEvent": {
      const known = state.reviewEvents[action.reviewId] ?? [];
      const at = known.findIndex((entry) => entry.id === action.event.id);
      const next =
        at === -1
          ? [...known, action.event]
          : known.map((entry, index) => (index === at ? action.event : entry));

      return {
        ...state,
        reviewEvents: forget({ ...state.reviewEvents, [action.reviewId]: trim(next) }),
      };
    }

    // The panel switches to the review before its text has been read, so the
    // list is not left up while the database answers.
    case "reviewOpened":
      return { ...state, openReviewBusy: true, openReview: null };

    case "reviewLoaded":
      return { ...state, openReviewBusy: false, openReview: action.review };

    case "closeReview":
      return { ...state, openReview: null, openReviewBusy: false };

    case "reviewFailed":
      return { ...state, reviewError: action.message };

    case "dismissReviewError":
      return { ...state, reviewError: null };

    default:
      return state;
  }
}

/**
 * One review's working, cut back to what the timeline draws. Turn endings are
 * kept whatever happens: they are never a block of their own, they are a
 * handful of bytes each, and the token total is added up from them — dropping
 * one would make a running total run backwards.
 */
function trim(events: AgentEvent[]): AgentEvent[] {
  let excess = events.filter((event) => event.kind !== "step_finish").length - EVENT_LIMIT;
  if (excess <= 0) return events;

  return events.filter((event) => {
    if (event.kind === "step_finish" || excess <= 0) return true;
    excess -= 1;
    return false;
  });
}

/** The reviews still worth holding the working of, which is the newest few. */
function forget(events: Record<number, AgentEvent[]>): Record<number, AgentEvent[]> {
  const ids = Object.keys(events).map(Number);
  if (ids.length <= REVIEW_LIMIT) return events;

  // Reviews are numbered as they are recorded, so the smallest ids are oldest.
  const kept: Record<number, AgentEvent[]> = {};
  for (const id of ids.sort((a, b) => b - a).slice(0, REVIEW_LIMIT)) kept[id] = events[id];

  return kept;
}

/** Reviews filed under the pull request they were run for, newest first. */
function groupReviews(reviews: ReviewSummary[]): Record<string, ReviewSummary[]> {
  const grouped: Record<string, ReviewSummary[]> = {};

  // The database reads them back newest first, so appending keeps that order.
  for (const review of reviews) {
    (grouped[review.pullRequestId] ??= []).push(review);
  }

  return grouped;
}

/**
 * What the fetch reports back. A project it could not read wins over the
 * count, because that is the part the user has to do something about — the
 * pull requests it did find are already on the board to be seen.
 */
function noticeFor(
  state: WorkspaceState,
  total: number,
  opened: number,
  failures: PullRequestFailure[],
): Notice {
  // With no project there is nowhere to fetch from, which is worth saying
  // rather than counting zero pull requests.
  if (state.projects.length === 0) {
    return { message: "Add a project to fetch its pull requests", tone: "red" };
  }

  const [first, ...rest] = failures;
  if (first) {
    const more = rest.length > 0 ? ` (+${rest.length} more)` : "";
    return { message: `${first.message}${more}`, tone: "red" };
  }

  const summary =
    opened === 0 ? "No new pull requests" : `${opened} new pull request${opened === 1 ? "" : "s"}`;

  return { message: `${summary} · ${total} open in total`, tone: "green" };
}
