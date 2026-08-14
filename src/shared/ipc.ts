/**
 * Contract shared by the main process, the preload bridge and the renderer.
 * Keeping it in one place means a channel can never drift between the two sides.
 */

import type { AgentEvent } from "./agentEvent";
import type { RepositoryPlatform } from "./repoUrl";

export const IpcChannel = {
  OpenExternal: "shell:open-external",
  ListProjects: "projects:list",
  AddProject: "projects:add",
  DeleteProject: "projects:delete",
  FetchPullRequests: "pull-requests:fetch",
  ListOpencodeAgents: "agents:list",
  GetAgentSettings: "agents:get-settings",
  LoadAgentConfiguration: "agents:load",
  SetAgentSetting: "agents:set",
  StartReview: "reviews:start",
  CancelReview: "reviews:cancel",
  ListReviews: "reviews:list",
  GetReview: "reviews:get",
  /** Pushed by the main process: a review started, finished or failed. */
  ReviewChanged: "reviews:changed",
  /** Pushed by the main process: a running review's agent did something. */
  ReviewEvent: "reviews:event",
} as const;

/**
 * A project as it is stored in the local database. Every field is read from
 * the folder the user picked — its name, its git remote and where it sits on
 * disk — rather than typed by hand, so none can disagree with the repository.
 */
export interface StoredProject {
  id: number;
  name: string;
  repositoryLink: string;
  /** Absolute path of the repository's working tree, used to add worktrees. */
  localPath: string;
}

/**
 * A primary OpenCode agent, as listed by `opencode agent list`.
 */
export interface OpencodeAgent {
  name: string;
  type: "primary";
}

/** The board actions an OpenCode agent can be assigned to. */
export type AgentAction = "reviewer" | "fixer";

/**
 * Which OpenCode agent each board action runs. `null` means no agent has been
 * picked yet.
 */
export type AgentSettings = Record<AgentAction, string | null>;

/** OpenCode agents plus the board assignments read from the database. */
export interface AgentConfiguration {
  agents: OpencodeAgent[];
  settings: AgentSettings;
  /** Set when `opencode agent list` could not be read; settings still come from the database. */
  agentsError: string | null;
}

/** A CI check as the platform reported it, reduced to what the board shows. */
export interface RemoteCheck {
  name: string;
  /** `passed`, `failed`, `running`, `queued` or `skipped`. */
  state: string;
}

/**
 * An open pull request — or merge request — as one of the CLIs reported it.
 * Both platforms are flattened into these fields so the board never has to
 * ask which one a card came from.
 */
export interface RemotePullRequest {
  /** Stable across fetches, so a card keeps its place on the board. */
  id: string;
  /** The project row this was fetched for. */
  projectId: number;
  platform: RepositoryPlatform;
  /** `number` on GitHub, `iid` on GitLab. */
  number: number;
  title: string;
  /** The branch the changes are on. */
  branch: string;
  /** The pull request's page on GitHub or GitLab. */
  url: string;
  /** Handle of whoever opened it, without the `@`. */
  author: string;
  draft: boolean;
  /** Opened by the account the CLI is signed in as. */
  mine: boolean;
  /**
   * The signed-in account has already reviewed or commented on this one, so it
   * is no longer waiting for a first look. Always `false` on GitLab, whose
   * merge request list does not say who left the notes.
   */
  reviewedByMe: boolean;
  /** Cannot be merged until someone resolves a conflict. */
  conflicted: boolean;
  approved: boolean;
  changesRequested: boolean;
  /** `null` when the CLI does not report a diff size, as GitLab's does not. */
  additions: number | null;
  deletions: number | null;
  /** ISO timestamps, as both CLIs report them. */
  createdAt: string;
  updatedAt: string;
  checks: RemoteCheck[];
}

/** Why one project contributed nothing, e.g. its CLI is not installed. */
export interface PullRequestFailure {
  projectId: number;
  /** The project's name, so the message names something the user added. */
  project: string;
  message: string;
}

/**
 * One pass over every saved project. A project that could not be read fails on
 * its own: the others still return their pull requests.
 */
export interface PullRequestFetch {
  pullRequests: RemotePullRequest[];
  failures: PullRequestFailure[];
}

/**
 * Where a review got to. A run that is still going is `running`; one the agent
 * finished is `completed`, whatever it thought of the code; `cancelled` is one
 * the user stopped; and `failed` covers everything that stopped it saying
 * anything at all.
 */
export type ReviewStatus = "running" | "completed" | "cancelled" | "failed";

/** What the renderer must hand over to have a pull request reviewed. */
export interface ReviewRequest {
  /** The `projects` row the pull request was fetched for. */
  projectId: number;
  /** `RemotePullRequest.id`, which is what a review is filed under. */
  pullRequestId: string;
  pullRequestNumber: number;
  /** The pull request's own page, which is the prompt the agent is given. */
  pullRequestUrl: string;
  branch: string;
  platform: RepositoryPlatform;
}

/**
 * A review as the list shows it. The review itself is left out: a list of them
 * would carry every word the agent wrote for a panel that shows one at a time.
 */
export interface ReviewSummary {
  id: number;
  projectId: number;
  pullRequestId: string;
  pullRequestNumber: number;
  branch: string;
  status: ReviewStatus;
  /** Where the pull request was checked out to, for the curious. */
  worktreePath: string;
  /** ISO timestamps. `finishedAt` is null while the review is running. */
  startedAt: string;
  finishedAt: string | null;
}

/** A review with what came of it: the agent's own words, or why there are none. */
export interface StoredReview extends ReviewSummary {
  result: string;
}

/**
 * Something the agent did, and the review it was doing it for. Only running
 * reviews send these, and they are sent once as they happen: nothing keeps
 * them, so a window that opens later sees the review but not the working.
 */
export interface ReviewEventPayload {
  reviewId: number;
  event: AgentEvent;
}

/** Shape exposed on `window.workestrator` by the preload script. */
export interface WorkestratorApi {
  /** `process.platform` of the host, used for platform specific chrome. */
  platform: NodeJS.Platform;
  /** Opens an https URL in the user's default browser. */
  openExternal(url: string): Promise<void>;
  /** Every saved project, oldest first. */
  listProjects(): Promise<StoredProject[]>;
  /**
   * Opens the OS folder picker and saves the chosen git repository. Resolves
   * to `null` when the picker was dismissed, and rejects when the folder is
   * not a git repository or is already tracked.
   */
  addProject(): Promise<StoredProject | null>;
  /** Forgets a saved project. Deleting one that is already gone is a no-op. */
  deleteProject(id: number): Promise<void>;
  /**
   * Asks `gh` and `glab` for the open pull requests of every saved project.
   * Rejects only when nothing could be attempted at all; a CLI that is missing
   * or cannot reach its host comes back as a failure for that project.
   */
  fetchPullRequests(): Promise<PullRequestFetch>;
  /** Every primary OpenCode agent the user has configured. */
  listOpencodeAgents(): Promise<OpencodeAgent[]>;
  /** Which OpenCode agent each board action currently runs. */
  getAgentSettings(): Promise<AgentSettings>;
  /**
   * Lists OpenCode agents and reads saved assignments. Assignments that no
   * longer name a known agent are cleared in the database.
   */
  loadAgentConfiguration(): Promise<AgentConfiguration>;
  /** Puts an OpenCode agent behind a board action, or clears it with `null`. */
  setAgentSetting(action: AgentAction, agentName: string | null): Promise<void>;
  /**
   * Checks the pull request out into a worktree of its own and turns the
   * review agent loose on it. Resolves as soon as the run has started, with
   * the review it was recorded as; how it ends arrives on `onReviewChanged`.
   *
   * Asking again for a pull request already being reviewed resolves to the run
   * that is under way rather than starting a second one.
   */
  startReview(request: ReviewRequest): Promise<ReviewSummary>;
  /**
   * Stops a review that is still running, killing the agent it is waiting on.
   * The run ends as `cancelled`, keeping whatever the agent had written by
   * then. Cancelling one that has already ended does nothing.
   */
  cancelReview(id: number): Promise<void>;
  /** Every review ever run, newest first, without the reviews themselves. */
  listReviews(): Promise<ReviewSummary[]>;
  /** One review, with what the agent wrote. `null` when it is not there. */
  getReview(id: number): Promise<StoredReview | null>;
  /**
   * Called whenever a review starts, finishes or fails. Returns the function
   * that stops listening.
   */
  onReviewChanged(listener: (review: ReviewSummary) => void): () => void;
  /**
   * Called for each thing a running review's agent does — a thought, a tool
   * call, a message it finished writing. Returns the function that stops
   * listening.
   */
  onReviewEvent(listener: (payload: ReviewEventPayload) => void): () => void;
}
