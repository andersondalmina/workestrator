import type { RepositoryPlatform } from "../shared/repoUrl";

/** Semantic colour names used by the board; resolved to CSS vars in `data/board.ts`. */
export type Tone = "blue" | "orange" | "violet" | "green" | "red" | "fg";

export type ColumnId = "working" | "needs" | "review" | "merge";

export type Theme = "dark" | "light";
export type Screen = "board" | "settings";
export type ChipId = "all" | "mine" | "failing";

export interface Column {
  id: ColumnId;
  name: string;
  color: string;
  emptyText: string;
}

export interface TimelineEvent {
  text: string;
  by: string;
  tone?: Tone;
}

export interface Check {
  name: string;
  state: string;
  time: string;
  tone: Tone;
}

export interface FileChange {
  path: string;
  plus: string;
  minus: string;
}

/** A pull request an agent is working on. */
export interface Task {
  id: string;
  col: ColumnId;
  title: string;
  branch: string;
  pr: number | null;
  prState?: string;
  prTone?: Tone;
  /** The skill that owns the task; unset on pull requests read from a remote. */
  skill?: string;
  /** Handle of whoever opened the pull request, set on fetched ones instead. */
  author?: string;
  /** The pull request's own page, when the task came from GitHub or GitLab. */
  url?: string;
  /** Where the pull request was read from; unset on tasks the app made up. */
  platform?: RepositoryPlatform;
  plus?: string;
  minus?: string;
  status: string;
  tone: Tone;
  time: string;
  /** Border radius of the status mark: round for progress, square for blocked. */
  mark?: string;
  mine?: boolean;
  failing?: boolean;
  files?: FileChange[];
  checks?: Check[];
  timeline?: TimelineEvent[];
}

/** A task once it knows which project (and therefore which repo) it belongs to. */
export interface BoardTask extends Task {
  repo: string;
  repoColor: string;
  /** The project view the task was filed under, e.g. "Review queue". */
  lane: string;
  /** Set on tasks created in-session so they can be scoped to a project. */
  scope?: string;
}

export interface Project {
  id: string;
  repo: string;
  icon: string;
  /** Where the project's repository lives, as the local database has it. */
  repositoryLink: string;
}

export interface ComposerForm {
  title: string;
  branch: string;
  skill: string;
  repo: string;
}
