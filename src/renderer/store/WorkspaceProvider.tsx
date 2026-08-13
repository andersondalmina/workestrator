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
  EMPTY_SKILL_DRAFT,
  initialState,
  storedProjectId,
  workspaceReducer,
  type WorkspaceState,
} from "./workspaceReducer";
import type {
  AgentSkillDraft,
  ReviewSummary,
  SkillAction,
  StoredAgentSkill,
} from "../../shared/ipc";
import type { BoardTask, ChipId, ComposerForm, Project, Screen, Theme } from "../types";

/** How long the board shows its skeleton when the scope changes. */
const LOADING_MS = 460;

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
  /** The skill "Start review" runs, or `null` while none is assigned. */
  reviewSkill: StoredAgentSkill | null;
  /** The skill "Fix comments" runs, or `null` while none is assigned. */
  fixCommentsSkill: StoredAgentSkill | null;
  /** The pull requests an agent is reading right now. */
  reviewingIds: Set<string>;
  /** Every review run against a pull request, newest first. */
  reviewsFor: (taskId: string) => ReviewSummary[];

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
  /** Opens the settings form on a blank skill. */
  newAgentSkill: () => void;
  /** Opens the settings form on a skill that already exists. */
  editAgentSkill: (skill: StoredAgentSkill) => void;
  updateSkillDraft: (patch: Partial<AgentSkillDraft>) => void;
  closeSkillDraft: () => void;
  /** Saves whatever the form holds, creating or rewriting a skill. */
  saveSkillDraft: () => void;
  removeAgentSkill: (id: number) => void;
  /** Puts a skill behind a board action, or clears it with `null`. */
  assignSkill: (action: SkillAction, skillId: number | null) => void;
  dismissSkillError: () => void;
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
    agentSkills,
    skillAssignments,
    skillDraft,
    reviews,
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

  // The user's own skills and the board actions they sit behind. Both are read
  // together so an action can never be shown running a skill the list has not
  // loaded yet. Outside the Electron shell there is no database, so the
  // settings screen opens on an empty list rather than failing.
  useEffect(() => {
    let cancelled = false;
    const api = window.workestrator;
    if (!api) return;

    Promise.all([api.listAgentSkills(), api.getSkillAssignments()])
      .then(([skills, assignments]) => {
        if (cancelled) return;
        dispatch({ type: "agentSkillsLoaded", skills, assignments });
      })
      .catch((error: unknown) => {
        console.error("Could not load skills", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // The database is what decides whether a skill is valid — it owns the unique
  // name — so the list is only updated once it has answered.
  const saveSkillDraft = useCallback(() => {
    if (!skillDraft) return;

    const api = window.workestrator;
    if (!api) {
      dispatch({
        type: "skillFailed",
        message: "Skills can only be saved in the desktop app",
      });
      return;
    }

    api
      .saveAgentSkill(skillDraft)
      .then((skill) => dispatch({ type: "agentSkillSaved", skill }))
      .catch((error: unknown) => dispatch({ type: "skillFailed", message: errorMessage(error) }));
  }, [skillDraft]);

  // The row goes away in the background, as a forgotten project does: it comes
  // back on the next launch if the delete never landed.
  const removeAgentSkill = useCallback((id: number) => {
    dispatch({ type: "agentSkillRemoved", id });
    window.workestrator?.deleteAgentSkill(id).catch((error: unknown) => {
      console.error("Could not delete skill", error);
    });
  }, []);

  const assignSkill = useCallback((action: SkillAction, skillId: number | null) => {
    dispatch({ type: "skillAssigned", action, skillId });
    window.workestrator
      ?.assignSkill(action, skillId)
      .catch((error: unknown) => dispatch({ type: "skillFailed", message: errorMessage(error) }));
  }, []);

  // Reviews outlive the window that asked for one — they run in the main
  // process — so the board reads what is already recorded and then follows
  // whatever happens next, rather than only knowing about its own runs.
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

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // The main process owns the run: it answers with the review it recorded,
  // and says how that review ended over the subscription above.
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
      .then((review) => dispatch({ type: "reviewChanged", review }))
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
  useEffect(() => {
    if (!openReview || openReview.status === "running" || openReview.result) {
      return;
    }
    if (chasedReview.current === openReview.id) return;

    chasedReview.current = openReview.id;
    openReviewById(openReview.id);
  }, [openReview, openReviewById]);

  const reviewsFor = useCallback((taskId: string) => reviews[taskId] ?? [], [reviews]);

  const reviewingIds = useMemo(
    () =>
      new Set(
        Object.entries(reviews)
          .filter(([, list]) => list.some((review) => review.status === "running"))
          .map(([taskId]) => taskId),
      ),
    [reviews],
  );

  const skillById = useCallback(
    (id: number | null) => agentSkills.find((skill) => skill.id === id) ?? null,
    [agentSkills],
  );

  const reviewSkill = useMemo(
    () => skillById(skillAssignments.review),
    [skillById, skillAssignments.review],
  );

  const fixCommentsSkill = useMemo(
    () => skillById(skillAssignments.fixComments),
    [skillById, skillAssignments.fixComments],
  );

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
      reviewSkill,
      fixCommentsSkill,
      reviewingIds,
      reviewsFor,

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
      newAgentSkill: () => dispatch({ type: "openSkillDraft", draft: EMPTY_SKILL_DRAFT }),
      editAgentSkill: (skill) => dispatch({ type: "openSkillDraft", draft: { ...skill } }),
      updateSkillDraft: (patch) => dispatch({ type: "updateSkillDraft", patch }),
      closeSkillDraft: () => dispatch({ type: "closeSkillDraft" }),
      saveSkillDraft,
      removeAgentSkill,
      assignSkill,
      dismissSkillError: () => dispatch({ type: "dismissSkillError" }),
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
      reviewSkill,
      fixCommentsSkill,
      saveSkillDraft,
      removeAgentSkill,
      assignSkill,
      reviewingIds,
      reviewsFor,
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
