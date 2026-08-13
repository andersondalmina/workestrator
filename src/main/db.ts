/**
 * The local database. `node:sqlite` ships with Electron's Node runtime, so
 * this is a real SQLite file with no native module to rebuild.
 */

import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { app } from "electron";
import type {
  ReviewStatus,
  ReviewSummary,
  SkillAction,
  SkillAssignments,
  StoredAgentSkill,
  StoredProject,
  StoredReview,
} from "../shared/ipc";

/** A row of `projects`, using the column names as they are on disk. */
interface ProjectRow {
  id: number;
  name: string;
  repository_link: string;
  local_path: string;
}

/** A row of `agent_skills`. Its columns already match the shared shape. */
type AgentSkillRow = StoredAgentSkill;

/** A row of `pull_request_reviews`, with the review text left out. */
interface ReviewRow {
  id: number;
  project_id: number;
  pull_request_id: string;
  pull_request_number: number;
  branch: string;
  status: string;
  worktree_path: string;
  started_at: string;
  finished_at: string | null;
}

const SELECT_COLUMNS = "id, name, repository_link, local_path";
const SKILL_COLUMNS = "id, name, description, command";
const REVIEW_COLUMNS =
  "id, project_id, pull_request_id, pull_request_number, branch, status, worktree_path, started_at, finished_at";

/** The `app_settings` key each board action's chosen skill is stored under. */
const ASSIGNMENT_KEY: Record<SkillAction, string> = {
  review: "skill.review",
  fixComments: "skill.fixComments",
};

let db: DatabaseSync | null = null;

function toStoredProject(row: ProjectRow): StoredProject {
  return {
    id: row.id,
    name: row.name,
    repositoryLink: row.repository_link,
    localPath: row.local_path,
  };
}

function toReviewSummary(row: ReviewRow): ReviewSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    pullRequestId: row.pull_request_id,
    pullRequestNumber: row.pull_request_number,
    branch: row.branch,
    // Anything the column does not recognise reads as failed rather than as a
    // review still running, which nothing would ever clear.
    status: REVIEW_STATUSES.has(row.status as ReviewStatus)
      ? (row.status as ReviewStatus)
      : "failed",
    worktreePath: row.worktree_path,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

/**
 * Every status a row may carry. Spelled out as a record rather than a list so
 * that a status added to the contract and forgotten here is a compile error
 * instead of a review that quietly reads back as failed.
 */
const REVIEW_STATUSES = new Set(
  Object.keys({
    running: true,
    completed: true,
    cancelled: true,
    failed: true,
  } satisfies Record<ReviewStatus, true>) as ReviewStatus[],
);

/** Opens the database file, creating the schema on first run. */
export function openDatabase(): DatabaseSync {
  if (db) return db;

  const file = path.join(app.getPath("userData"), "workestrator.db");
  const database = new DatabaseSync(file);
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      repository_link TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      description TEXT NOT NULL DEFAULT '',
      command TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pull_request_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      pull_request_id TEXT NOT NULL,
      pull_request_number INTEGER NOT NULL,
      branch TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT NOT NULL DEFAULT '',
      worktree_path TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS pull_request_reviews_pr
      ON pull_request_reviews (pull_request_id);
  `);

  addMissingColumns(database);

  db = database;
  return db;
}

/**
 * Columns added after the first release. `CREATE TABLE IF NOT EXISTS` leaves a
 * table that already exists alone, so a database written by an older build
 * needs them put on by hand.
 */
function addMissingColumns(database: DatabaseSync): void {
  const columns = database
    .prepare("SELECT name FROM pragma_table_info(?)")
    .all("projects") as unknown as { name: string }[];

  if (!columns.some((column) => column.name === "local_path")) {
    database.exec("ALTER TABLE projects ADD COLUMN local_path TEXT NOT NULL DEFAULT ''");
  }
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}

export function listProjects(): StoredProject[] {
  const rows = openDatabase()
    .prepare(`SELECT ${SELECT_COLUMNS} FROM projects ORDER BY id`)
    .all() as unknown as ProjectRow[];
  return rows.map(toStoredProject);
}

export function getProject(id: number): StoredProject | null {
  const row = openDatabase()
    .prepare(`SELECT ${SELECT_COLUMNS} FROM projects WHERE id = ?`)
    .get(id) as unknown as ProjectRow | undefined;
  return row ? toStoredProject(row) : null;
}

/**
 * Removes a project and the reviews run against its pull requests, which have
 * nothing left to belong to. Deleting a row that is not there is a no-op.
 */
export function deleteProject(id: number): void {
  const database = openDatabase();
  database.prepare("DELETE FROM projects WHERE id = ?").run(id);
  database.prepare("DELETE FROM pull_request_reviews WHERE project_id = ?").run(id);
}

/**
 * Inserts a project. The repository link is unique, so re-adding a repository
 * reports the name it is already tracked under instead of duplicating it.
 */
export function createProject(
  name: string,
  repositoryLink: string,
  localPath: string,
): StoredProject {
  const database = openDatabase();

  const existing = database
    .prepare(`SELECT ${SELECT_COLUMNS} FROM projects WHERE repository_link = ?`)
    .get(repositoryLink) as unknown as ProjectRow | undefined;
  if (existing) {
    throw new Error(`${existing.name} is already in your projects`);
  }

  const { lastInsertRowid } = database
    .prepare("INSERT INTO projects (name, repository_link, local_path) VALUES (?, ?, ?)")
    .run(name, repositoryLink, localPath);

  return { id: Number(lastInsertRowid), name, repositoryLink, localPath };
}

/** Every skill the user wrote, oldest first. */
export function listAgentSkills(): StoredAgentSkill[] {
  return openDatabase()
    .prepare(`SELECT ${SKILL_COLUMNS} FROM agent_skills ORDER BY id`)
    .all() as unknown as AgentSkillRow[];
}

export function getAgentSkill(id: number): StoredAgentSkill | null {
  const row = openDatabase()
    .prepare(`SELECT ${SKILL_COLUMNS} FROM agent_skills WHERE id = ?`)
    .get(id) as unknown as AgentSkillRow | undefined;
  return row ?? null;
}

/**
 * Inserts a skill. Names are unique so the two board actions always name
 * something distinct in the settings list.
 */
export function createAgentSkill(
  name: string,
  description: string,
  command: string,
): StoredAgentSkill {
  const database = openDatabase();
  requireFreeName(name, null);

  const { lastInsertRowid } = database
    .prepare("INSERT INTO agent_skills (name, description, command) VALUES (?, ?, ?)")
    .run(name, description, command);

  return { id: Number(lastInsertRowid), name, description, command };
}

/** Rewrites a skill in place, keeping its id so assignments survive an edit. */
export function updateAgentSkill(
  id: number,
  name: string,
  description: string,
  command: string,
): StoredAgentSkill {
  const database = openDatabase();
  if (!getAgentSkill(id)) throw new Error("That skill no longer exists");
  requireFreeName(name, id);

  database
    .prepare("UPDATE agent_skills SET name = ?, description = ?, command = ? WHERE id = ?")
    .run(name, description, command, id);

  return { id, name, description, command };
}

/**
 * Removes a skill and unassigns it everywhere, so no board action is left
 * pointing at a skill that is not there any more.
 */
export function deleteAgentSkill(id: number): void {
  const database = openDatabase();
  database.prepare("DELETE FROM agent_skills WHERE id = ?").run(id);
  database
    .prepare("DELETE FROM app_settings WHERE key IN (?, ?) AND value = ?")
    .run(ASSIGNMENT_KEY.review, ASSIGNMENT_KEY.fixComments, String(id));
}

/** Rejects a name another skill already answers to. */
function requireFreeName(name: string, exceptId: number | null): void {
  const clash = openDatabase()
    .prepare("SELECT id FROM agent_skills WHERE name = ? AND id IS NOT ?")
    .get(name, exceptId) as unknown as { id: number } | undefined;

  if (clash) throw new Error(`A skill named ${name} already exists`);
}

/**
 * Which skill each board action runs. A key that was never set, or that names
 * a skill since deleted, reads as unassigned.
 */
export function getSkillAssignments(): SkillAssignments {
  return {
    review: readAssignment("review"),
    fixComments: readAssignment("fixComments"),
  };
}

/** Puts a skill behind a board action, or clears it with `null`. */
export function setSkillAssignment(action: SkillAction, skillId: number | null): void {
  const database = openDatabase();
  const key = ASSIGNMENT_KEY[action];

  if (skillId === null) {
    database.prepare("DELETE FROM app_settings WHERE key = ?").run(key);
    return;
  }

  if (!getAgentSkill(skillId)) throw new Error("That skill no longer exists");

  database
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, String(skillId));
}

function readAssignment(action: SkillAction): number | null {
  const row = openDatabase()
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(ASSIGNMENT_KEY[action]) as unknown as { value: string } | undefined;

  if (!row) return null;

  const id = Number(row.value);
  return Number.isInteger(id) && getAgentSkill(id) ? id : null;
}

/** What a review is recorded as when it starts, before there is anything to say. */
export interface NewReview {
  projectId: number;
  pullRequestId: string;
  pullRequestNumber: number;
  branch: string;
  worktreePath: string;
}

/**
 * Records a review that has just started. Timestamps are written from here
 * rather than left to SQLite's `datetime('now')`, whose output carries no
 * timezone and would be read an hour or several out by whoever parses it.
 */
export function createReview(review: NewReview): ReviewSummary {
  const startedAt = new Date().toISOString();

  const { lastInsertRowid } = openDatabase()
    .prepare(
      `INSERT INTO pull_request_reviews
         (project_id, pull_request_id, pull_request_number, branch, status, worktree_path, started_at)
       VALUES (?, ?, ?, ?, 'running', ?, ?)`,
    )
    .run(
      review.projectId,
      review.pullRequestId,
      review.pullRequestNumber,
      review.branch,
      review.worktreePath,
      startedAt,
    );

  return {
    ...review,
    id: Number(lastInsertRowid),
    status: "running",
    startedAt,
    finishedAt: null,
  };
}

/** Writes down how a review ended: what the agent said, or what stopped it. */
export function finishReview(
  id: number,
  status: Exclude<ReviewStatus, "running">,
  result: string,
): ReviewSummary | null {
  openDatabase()
    .prepare("UPDATE pull_request_reviews SET status = ?, result = ?, finished_at = ? WHERE id = ?")
    .run(status, result, new Date().toISOString(), id);

  return getReviewSummary(id);
}

export function getReviewSummary(id: number): ReviewSummary | null {
  const row = openDatabase()
    .prepare(`SELECT ${REVIEW_COLUMNS} FROM pull_request_reviews WHERE id = ?`)
    .get(id) as unknown as ReviewRow | undefined;
  return row ? toReviewSummary(row) : null;
}

/** One review with what the agent wrote, which is the part the panel shows. */
export function getReview(id: number): StoredReview | null {
  const row = openDatabase()
    .prepare(`SELECT ${REVIEW_COLUMNS}, result FROM pull_request_reviews WHERE id = ?`)
    .get(id) as unknown as (ReviewRow & { result: string }) | undefined;

  return row ? { ...toReviewSummary(row), result: row.result } : null;
}

/** Every review, newest first, without the reviews themselves. */
export function listReviewSummaries(): ReviewSummary[] {
  const rows = openDatabase()
    .prepare(`SELECT ${REVIEW_COLUMNS} FROM pull_request_reviews ORDER BY id DESC`)
    .all() as unknown as ReviewRow[];
  return rows.map(toReviewSummary);
}

/**
 * Closes off reviews left running by an app that was quit or killed mid-run.
 * Nothing is watching those processes any more, so a row left as it was would
 * read as running for good.
 */
export function failInterruptedReviews(): void {
  openDatabase()
    .prepare(
      `UPDATE pull_request_reviews
       SET status = 'failed', result = ?, finished_at = ?
       WHERE status = 'running'`,
    )
    .run("The app closed before this review finished", new Date().toISOString());
}
