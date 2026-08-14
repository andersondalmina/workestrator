import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import {
  applyMoves,
  groupIntoColumns,
  matchesFilters,
  tasksForScope,
  type ColumnWithTasks,
} from "./selectors";
import {
  initialState,
  NO_AGENT_SETTINGS,
  storedProjectId,
  workspaceReducer,
  type WorkspaceState,
} from "./workspaceReducer";
import type { AgentEvent } from "../../shared/agentEvent";
import type { AgentAction, ReviewSummary } from "../../shared/ipc";
import type { BoardTask, ChipId, ComposerForm, Project, Screen, Theme } from "../types";

/** How long the board shows its skeleton when the scope changes. */
const LOADING_MS = 460;

/** Answered for a review with nothing recorded, so the empty case is one array. */
const NO_EVENTS: AgentEvent[] = [];

/** Unwraps the wrapper `ipcRenderer.invoke` puts around a main-process error. */
function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']*':\s*/, "").replace(/^Error:\s*/, "");
}

export interface ProjectSummary extends Project {
  openCount: number;
  /** True when something in the project is waiting on the user. */
  hasBlocked: boolean;
  isActive: boolean;
}

export interface WorkspaceValue extends WorkspaceState {
  // Derived board data
  isAllScope: boolean;
  activeProject: Project | null;
  scopeName: string;
  tasks: BoardTask[];
  visibleTasks: BoardTask[];
  columns: ColumnWithTasks[];
  projectSummaries: ProjectSummary[];
  allTaskCount: number;
  isFiltered: boolean;
  selectedTask: BoardTask | null;
  /** The OpenCode agent the Reviewer action runs, or `null` while none is set. */
  reviewerAgent: string | null;
  /** The OpenCode agent the Fixed action runs, or `null` while none is set. */
  fixerAgent: string | null;
  /** The pull requests an agent is reading right now. */
  reviewingIds: Set<string>;
  /** Every review run against a pull request, newest first. */
  reviewsFor: (taskId: string) => ReviewSummary[];
  /** What a review's agent has been seen doing, oldest first. */
  eventsFor: (reviewId: number) => AgentEvent[];

  // Actions
  setQuery: (query: string) => void;
  clearQuery: () => void;
  setChip: (chip: ChipId) => void;
  clearFilters: () => void;
  selectScope: (scope: string) => void;
  openTask: (id: string) => void;
  closeTask: () => void;
  advanceSelectedTask: () => void;
  goToScreen: (screen: Screen) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  openComposer: () => void;
  closeComposer: () => void;
  updateForm: (patch: Partial<ComposerForm>) => void;
  submitComposer: () => void;
  /** Picks a folder from the OS and adds it as a project. */
  addProject: () => void;
  /** Forgets a project and every pull request that belonged to it. */
  removeProject: (id: string) => void;
  dismissAddProjectError: () => void;
  /** Reads the open pull requests of every project through `gh` and `glab`. */
  fetchPullRequests: () => void;
  dismissFetchNotice: () => void;
  /** Puts an OpenCode agent behind a board action, or clears it with `null`. */
  setAgentSetting: (action: AgentAction, agentName: string | null) => void;
  dismissAgentSettingError: () => void;
  /** Checks a pull request out and has the review agent read it. */
  startReview: (task: BoardTask) => void;
  /** Stops a review that is still running. How it ended arrives on its own. */
  cancelReview: (id: number) => void;
  /** Reads a stored review, which the panel then shows instead of the list. */
  openReviewById: (id: number) => void;
  closeReview: () => void;
  dismissReviewError: () => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);
  const {
    theme,
    scope,
    query,
    chip,
    screen,
    loading,
    openId,
    extra,
    fetched,
    moved,
    projects,
    addProjectBusy,
    agentSettings,
    reviews,
    reviewEvents,
    openReview,
  } = state;

  /** Which fetch the board is waiting on; older answers are ignored. */
  const latestFetch = useRef(0);

  /** The review already read again after it stopped running. */
  const chasedReview = useRef<number | null>(null);

  // Theme is read from the root element by the token stylesheet.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // A short beat on every scope change, so the board swaps through its
  // skeleton rather than snapping between two different sets of cards.
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => dispatch({ type: "finishLoading" }), LOADING_MS);
    return () => window.clearTimeout(timer);
  }, [loading, scope]);

  // One pass over every project, run by the main process because only it can
  // reach `gh` and `glab`. A project whose CLI is missing or signed out comes
  // back as a failure alongside the pull requests the others did return.
  //
  // Adding a project starts a fetch of its own, so two can be in the air at
  // once; only the last one asked for is allowed to land, and an answer that
  // has been overtaken is dropped rather than left to undo a newer board.
  const runFetch = useCallback((announce: boolean) => {
    const api = window.workestrator;
    if (!api) {
      dispatch({
        type: "fetchFailed",
        message: "Pull requests can only be fetched in the desktop app",
      });
      return;
    }

    const request = (latestFetch.current += 1);
    const isCurrent = () => request === latestFetch.current;

    dispatch({ type: "fetchPending" });
    api
      .fetchPullRequests()
      .then((result) => {
        if (!isCurrent()) return;
        dispatch({
          type: "pullRequestsFetched",
          pullRequests: result.pullRequests,
          failures: result.failures,
          announce,
        });
      })
      .catch((error: unknown) => {
        if (!isCurrent()) return;
        dispatch({ type: "fetchFailed", message: errorMessage(error) });
      });
  }, []);

  // Asked for by hand, so the result is worth reporting either way.
  const fetchPullRequests = useCallback(() => runFetch(true), [runFetch]);

  // The board starts empty and fills from the database, then reads the pull
  // requests of whatever it found, so it opens on what the remotes actually
  // have. Outside the Electron shell there is no bridge, so nothing is read.
  useEffect(() => {
    let cancelled = false;
    window.workestrator
      ?.listProjects()
      .then((saved) => {
        if (cancelled) return;
        dispatch({ type: "projectsLoaded", projects: saved });
        // The projects land first, so the fetch has boards to file against.
        if (saved.length > 0) runFetch(false);
      })
      .catch((error: unknown) => {
        console.error("Could not load saved projects", error);
      });
    return () => {
      cancelled = true;
    };
  }, [runFetch]);

  // OpenCode agents and the board actions they sit behind. Saved assignments
  // always load from the database; listing agents is attempted separately so a
  // CLI failure does not hide what was already picked. Outside the Electron
  // shell there is no bridge, so the settings screen opens empty rather than
  // failing.
  useEffect(() => {
    let cancelled = false;
    const api = window.workestrator;
    if (!api) {
      dispatch({
        type: "agentsLoaded",
        agents: [],
        settings: NO_AGENT_SETTINGS,
        agentsError: "Agents can only be listed in the desktop app",
      });
      return;
    }

    api
      .loadAgentConfiguration()
      .then((configuration) => {
        if (cancelled) return;
        dispatch({
          type: "agentsLoaded",
          agents: configuration.agents,
          settings: configuration.settings,
          agentsError: configuration.agentsError,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        dispatch({
          type: "agentsLoaded",
          agents: [],
          settings: NO_AGENT_SETTINGS,
          agentsError: errorMessage(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setAgentSetting = useCallback(
    (action: AgentAction, agentName: string | null) => {
      const previous = agentSettings[action];
      dispatch({ type: "agentAssigned", action, agentName });
      window.workestrator?.setAgentSetting(action, agentName).catch((error: unknown) =>
        dispatch({
          type: "agentSettingFailed",
          action,
          previous,
          message: errorMessage(error),
        }),
      );
    },
    [agentSettings],
  );

  // Reviews outlive the window that asked for one — they run in the main
  // process — so the board reads what is already recorded and then follows
  // whatever happens next, rather than only knowing about its own runs.
  //
  // The agent's working comes over a second subscription, because it arrives
  // by the hundred while a review is running and the board has no use for any
  // of it: only the panel showing that review does.
  useEffect(() => {
    const api = window.workestrator;
    if (!api) return;

    let cancelled = false;
    api
      .listReviews()
      .then((loaded) => {
        if (!cancelled) dispatch({ type: "reviewsLoaded", reviews: loaded });
      })
      .catch((error: unknown) => {
        console.error("Could not load reviews", error);
      });

    const unsubscribe = api.onReviewChanged((review) =>
      dispatch({ type: "reviewChanged", review }),
    );
    const unsubscribeEvents = api.onReviewEvent(({ reviewId, event }) =>
      dispatch({ type: "reviewEvent", reviewId, event }),
    );

    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeEvents();
    };
  }, []);

  // The main process owns the run: it answers with the review it recorded,
  // and says how that review ended over the subscription above.
  //
  // The panel opens on that review as soon as there is one, since watching the
  // agent work is the reason to have started it — the alternative is a button
  // that says "Reviewing…" over a list the run has to be found in again.
  const startReview = useCallback((task: BoardTask) => {
    const projectId = storedProjectId(task.scope ?? "");
    if (projectId === null || !task.pr || !task.url || !task.platform) {
      dispatch({
        type: "reviewFailed",
        message: "Only pull requests read from a project can be reviewed",
      });
      return;
    }

    const api = window.workestrator;
    if (!api) {
      dispatch({
        type: "reviewFailed",
        message: "Pull requests can only be reviewed in the desktop app",
      });
      return;
    }

    api
      .startReview({
        projectId,
        pullRequestId: task.id,
        pullRequestNumber: task.pr,
        pullRequestUrl: task.url,
        branch: task.branch,
        platform: task.platform,
      })
      .then((review) => {
        dispatch({ type: "reviewChanged", review });
        // Nothing is read back for it: a review that has only just started has
        // written nothing down yet, and what it does from here arrives on the
        // event subscription.
        dispatch({ type: "reviewLoaded", review: { ...review, result: "" } });
      })
      .catch((error: unknown) => dispatch({ type: "reviewFailed", message: errorMessage(error) }));
  }, []);

  // Nothing is dispatched here: the main process ends the run it was asked to
  // stop and reports that over the same subscription as any other ending, so
  // the panel is never told the review stopped before it actually has.
  const cancelReview = useCallback((id: number) => {
    window.workestrator
      ?.cancelReview(id)
      .catch((error: unknown) => dispatch({ type: "reviewFailed", message: errorMessage(error) }));
  }, []);

  const openReviewById = useCallback((id: number) => {
    dispatch({ type: "reviewOpened" });
    window.workestrator
      ?.getReview(id)
      .then((review) => dispatch({ type: "reviewLoaded", review }))
      .catch((error: unknown) => {
        dispatch({ type: "reviewLoaded", review: null });
        dispatch({ type: "reviewFailed", message: errorMessage(error) });
      });
  }, []);

  // A review opened while it was still running had nothing in it to read. Once
  // it ends, what the agent wrote is read again so the panel fills in where it
  // stands, rather than leaving an empty page that has to be reopened. Each
  // review is only ever chased once, so an empty one cannot loop.
  //
  // The review already on screen is left up while the database answers, rather
  // than going through `reviewOpened`: it is a review being filled in, not one
  // being opened, and blanking it would throw away the timeline of the run the
  // user is in the middle of reading.
  useEffect(() => {
    if (!openReview || openReview.status === "running" || openReview.result) {
      return;
    }
    if (chasedReview.current === openReview.id) return;

    chasedReview.current = openReview.id;
    let cancelled = false;
    window.workestrator
      ?.getReview(openReview.id)
      .then((review) => {
        // Whatever the panel moved on to in the meantime is what it is showing.
        if (!cancelled && review) dispatch({ type: "reviewLoaded", review });
      })
      .catch((error: unknown) => {
        if (!cancelled) dispatch({ type: "reviewFailed", message: errorMessage(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [openReview]);

  const reviewsFor = useCallback((taskId: string) => reviews[taskId] ?? [], [reviews]);

  const eventsFor = useCallback(
    (reviewId: number) => reviewEvents[reviewId] ?? NO_EVENTS,
    [reviewEvents],
  );

  const reviewingIds = useMemo(
    () =>
      new Set(
        Object.entries(reviews)
          .filter(([, list]) => list.some((review) => review.status === "running"))
          .map(([taskId]) => taskId),
      ),
    [reviews],
  );

  const reviewerAgent = agentSettings.reviewer;
  const fixerAgent = agentSettings.fixer;

  // Everything the session added to the board: composed pull requests first,
  // then the ones the last fetch read from GitHub and GitLab.
  const sessionTasks = useMemo(() => [...extra, ...fetched], [extra, fetched]);

  const tasks = useMemo(
    () => applyMoves(tasksForScope(scope, sessionTasks), moved),
    [scope, sessionTasks, moved],
  );

  const visibleTasks = useMemo(
    () => tasks.filter((task) => matchesFilters(task, query, chip)),
    [tasks, query, chip],
  );

  const columns = useMemo(() => groupIntoColumns(visibleTasks), [visibleTasks]);

  const projectSummaries = useMemo<ProjectSummary[]>(
    () =>
      projects.map((project) => {
        const projectTasks = applyMoves(tasksForScope(project.id, sessionTasks), moved);
        return {
          ...project,
          openCount: projectTasks.length,
          hasBlocked: projectTasks.some((task) => task.col === "needs"),
          isActive: scope === project.id && screen === "board",
        };
      }),
    [projects, sessionTasks, moved, scope, screen],
  );

  const allTaskCount = useMemo(() => tasksForScope("all", sessionTasks).length, [sessionTasks]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === openId) ?? null,
    [tasks, openId],
  );

  const activeProject = projects.find((project) => project.id === scope) ?? null;

  const selectScope = useCallback(
    (next: string) => {
      if (scope === next && screen === "board") return;
      dispatch({ type: "selectScope", scope: next });
    },
    [scope, screen],
  );

  const advanceSelectedTask = useCallback(() => {
    if (!selectedTask) return;
    dispatch({
      type: "advanceTask",
      id: selectedTask.id,
      from: selectedTask.col,
    });
  }, [selectedTask]);

  const toggleTheme = useCallback(
    () => dispatch({ type: "setTheme", theme: theme === "light" ? "dark" : "light" }),
    [theme],
  );

  // The whole flow lives in the main process: it opens the OS folder picker,
  // reads the folder as a git repository and saves it. Here we only reflect
  // what came back — a new project, a dismissed picker, or a reason it failed.
  const addProject = useCallback(() => {
    if (addProjectBusy) return;

    const api = window.workestrator;
    if (!api) {
      dispatch({
        type: "addProjectFailed",
        message: "Projects can only be added in the desktop app",
      });
      return;
    }

    dispatch({ type: "addProjectPending" });
    api
      .addProject()
      .then((project) => {
        if (!project) {
          dispatch({ type: "addProjectCancelled" });
          return;
        }
        // The project opens its own board, so its pull requests are read
        // right away rather than waiting to be asked for.
        dispatch({ type: "projectAdded", project });
        runFetch(false);
      })
      .catch((error: unknown) =>
        dispatch({ type: "addProjectFailed", message: errorMessage(error) }),
      );
  }, [addProjectBusy, runFetch]);

  // The row goes away in the background: the sidebar has already dropped the
  // project, so a failed delete is only worth reporting to the console — the
  // project comes back on the next launch, when the database is read again.
  const removeProject = useCallback((id: string) => {
    dispatch({ type: "projectRemoved", id });

    const rowId = storedProjectId(id);
    if (rowId === null) return;

    window.workestrator?.deleteProject(rowId).catch((error: unknown) => {
      console.error("Could not delete project", error);
    });
  }, []);

  const value = useMemo<WorkspaceValue>(
    () => ({
      ...state,
      isAllScope: scope === "all",
      activeProject,
      scopeName: activeProject ? activeProject.repo : "All PRs",
      tasks,
      visibleTasks,
      columns,
      projectSummaries,
      allTaskCount,
      isFiltered: query.length > 0 || chip !== "all",
      selectedTask,
      reviewerAgent,
      fixerAgent,
      reviewingIds,
      reviewsFor,
      eventsFor,

      setQuery: (next) => dispatch({ type: "setQuery", query: next }),
      clearQuery: () => dispatch({ type: "setQuery", query: "" }),
      setChip: (next) => dispatch({ type: "setChip", chip: next }),
      clearFilters: () => dispatch({ type: "clearFilters" }),
      selectScope,
      openTask: (id) => dispatch({ type: "openTask", id }),
      closeTask: () => dispatch({ type: "closeTask" }),
      advanceSelectedTask,
      goToScreen: (next) => dispatch({ type: "setScreen", screen: next }),
      setTheme: (next) => dispatch({ type: "setTheme", theme: next }),
      toggleTheme,
      openComposer: () => dispatch({ type: "openComposer" }),
      closeComposer: () => dispatch({ type: "closeComposer" }),
      updateForm: (patch) => dispatch({ type: "updateForm", patch }),
      submitComposer: () => dispatch({ type: "submitComposer" }),
      addProject,
      removeProject,
      dismissAddProjectError: () => dispatch({ type: "dismissAddProjectError" }),
      fetchPullRequests,
      dismissFetchNotice: () => dispatch({ type: "dismissFetchNotice" }),
      setAgentSetting,
      dismissAgentSettingError: () => dispatch({ type: "dismissAgentSettingError" }),
      startReview,
      cancelReview,
      openReviewById,
      closeReview: () => dispatch({ type: "closeReview" }),
      dismissReviewError: () => dispatch({ type: "dismissReviewError" }),
    }),
    [
      state,
      scope,
      query,
      chip,
      activeProject,
      tasks,
      visibleTasks,
      columns,
      projectSummaries,
      allTaskCount,
      selectedTask,
      selectScope,
      advanceSelectedTask,
      toggleTheme,
      addProject,
      removeProject,
      fetchPullRequests,
      reviewerAgent,
      fixerAgent,
      setAgentSetting,
      reviewingIds,
      reviewsFor,
      eventsFor,
      startReview,
      cancelReview,
      openReviewById,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside a WorkspaceProvider");
  }
  return value;
}
