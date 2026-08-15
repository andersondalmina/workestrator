/**
 * Reading a git repository from disk. Everything the app knows about what
 * makes a folder a usable project lives here, so the IPC layer and the
 * database stay free of git rules.
 */

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { commandEnvironment } from "./cliPath";
import type { RepositoryPlatform } from "../../shared/repoUrl";

const run = promisify(execFile);

/** Long enough for git on a cold, large repository; short enough to fail. */
const TIMEOUT_MS = 5_000;

/** The remote a project is linked to when the repository has several. */
const PREFERRED_REMOTE = "origin";

export interface GitRepository {
  /** Absolute path of the working tree root. */
  root: string;
  /** The root folder's name, e.g. `payments-api`. */
  name: string;
  /** URL of `origin`, or of the only other remote the repository has. */
  remoteUrl: string;
}

/**
 * Runs git in `directory`. Returns `null` when git ran but answered with a
 * failure — that is an answer about the directory, not a broken install — and
 * throws only when git could not be run at all.
 */
async function git(
  args: string[],
  directory: string,
  timeoutMs: number = TIMEOUT_MS,
): Promise<string | null> {
  try {
    const { stdout } = await run("git", args, {
      cwd: directory,
      timeout: timeoutMs,
      windowsHide: true,
      env: commandEnvironment(),
    });
    return stdout.trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Could not run git — check that it is installed");
    }
    return null;
  }
}

/** Resolves symlinks so a path from the file picker can be compared to git's. */
async function realPath(value: string): Promise<string> {
  try {
    return await fs.realpath(value);
  } catch {
    return path.resolve(value);
  }
}

/** The URL of `origin`, falling back to the first remote that has one. */
async function readRemoteUrl(directory: string): Promise<string | null> {
  const listed = await git(["remote"], directory);
  const remotes =
    listed
      ?.split("\n")
      .map((name) => name.trim())
      .filter(Boolean) ?? [];
  if (remotes.length === 0) return null;

  const ordered = remotes.includes(PREFERRED_REMOTE)
    ? [PREFERRED_REMOTE, ...remotes.filter((name) => name !== PREFERRED_REMOTE)]
    : remotes;

  for (const remote of ordered) {
    const url = await git(["remote", "get-url", remote], directory);
    if (url) return url;
  }
  return null;
}

/**
 * Reads `directory` as a git repository. Throws a message meant for the user
 * when the folder is not the root of a repository, or has nothing to link to.
 */
export async function readRepository(directory: string): Promise<GitRepository> {
  const selected = await realPath(directory);
  const label = path.basename(selected);

  const stats = await fs.stat(selected).catch(() => null);
  if (!stats?.isDirectory()) {
    throw new Error(`${label} is not a folder`);
  }

  const toplevel = await git(["rev-parse", "--show-toplevel"], selected);
  if (!toplevel) {
    throw new Error(`${label} is not a git repository`);
  }

  // Only the root is accepted: the project is named after the folder that was
  // picked, and a subfolder would name the same repository something else.
  const root = await realPath(toplevel);
  if (root !== selected) {
    throw new Error(
      `${label} is inside ${path.basename(root)} — pick the repository's root folder`,
    );
  }

  const remoteUrl = await readRemoteUrl(root);
  if (!remoteUrl) {
    throw new Error(`${label} has no git remote to link to`);
  }

  return { root, name: path.basename(root), remoteUrl };
}

/** Fetching a pull request's head reaches the network, so it gets far longer. */
const FETCH_TIMEOUT_MS = 120_000;

/** What names a branch this app made, as opposed to one the repository had. */
const BRANCH_PREFIX = "workestrator/";

/** The folder a repository's review checkouts live in, inside the repository. */
export const WORKTREE_DIRECTORY = ".workestrator";

/** Where a repository keeps its review checkouts. */
export function worktreeHome(root: string): string {
  return path.join(root, WORKTREE_DIRECTORY);
}

/**
 * Keeps the checkouts out of the repository's eyes.
 *
 * They sit inside the working tree, so without this every review leaves
 * `?? .workestrator/` in the user's `git status` and a whole second copy of the
 * source for anything that walks the tree. The rule goes in `info/exclude`
 * rather than `.gitignore`: `.gitignore` is the user's file and is committed,
 * and this is not a decision to make on their behalf in a pull request.
 *
 * Written to the common git directory, which is where a repository that is
 * itself a worktree keeps the one `info/exclude` all of them read.
 */
async function excludeWorktrees(root: string): Promise<void> {
  const common = await git(["rev-parse", "--path-format=absolute", "--git-common-dir"], root);
  if (!common) return;

  const rule = `/${WORKTREE_DIRECTORY}/`;
  const exclude = path.join(common, "info", "exclude");
  const current = await fs.readFile(exclude, "utf8").catch(() => "");
  if (current.split("\n").some((line) => line.trim() === rule)) return;

  const separator = current === "" || current.endsWith("\n") ? "" : "\n";
  await fs
    .mkdir(path.dirname(exclude), { recursive: true })
    .then(() => fs.appendFile(exclude, `${separator}# Workestrator's review checkouts\n${rule}\n`))
    .catch(() => {
      // A repository this app cannot write to still reviews fine; the user is
      // left with the folder showing up as untracked, which is not worth
      // refusing the review over.
    });
}

/**
 * The branch a pull request is checked out under when its own name is taken.
 * Named after the review rather than the pull request: every review gets a
 * worktree of its own, and the review before this one is still holding the
 * branch it checked out under.
 */
export function fallbackBranch(number: number, reviewId: number): string {
  return `${BRANCH_PREFIX}pr-${number}-r${reviewId}`;
}

export interface WorktreeRequest {
  /** Working tree root of the repository the worktree is added to. */
  root: string;
  /** Where the checkout goes. Anything already there is replaced. */
  worktreePath: string;
  /** The branch the pull request's changes are on. */
  branch: string;
  /** The pull request's number, used to reach a head on a fork. */
  number: number;
  /** The review this checkout belongs to, which is what keeps it to itself. */
  reviewId: number;
  platform: RepositoryPlatform;
}

/**
 * Puts a pull request's head in a worktree of its own, so it can be read
 * without touching whatever the user has checked out. Every review gets a new
 * one: a worktree the last review left behind has that review's changes and
 * whatever its agent wrote in it, and neither is what this review is reading.
 */
export async function createWorktree(request: WorktreeRequest): Promise<void> {
  // Before anything is written inside the repository, so the first review a
  // project ever runs does not show up in the user's `git status`.
  await excludeWorktrees(request.root);

  // A worktree whose folder was deleted by hand is still registered, and git
  // refuses to add another in its place until the record is dropped.
  await git(["worktree", "prune"], request.root);

  const head = await fetchHead(request);

  // The path carries the review's id, so there is normally nothing here. What
  // there could be is a folder from a review that was interrupted before git
  // finished with it, and that would only make `worktree add` refuse the path.
  await fs.rm(request.worktreePath, { recursive: true, force: true });
  await fs.mkdir(path.dirname(request.worktreePath), { recursive: true });

  // The pull request's own branch name first. Git refuses a branch that is
  // already checked out somewhere else — the user's own clone, or the worktree
  // an earlier review is still using — and that is the case worth checking out
  // under another name.
  for (const branch of [request.branch, fallbackBranch(request.number, request.reviewId)]) {
    const added = await git(
      ["worktree", "add", "-B", branch, request.worktreePath, head],
      request.root,
    );
    if (added !== null) return;
  }

  throw new Error(`Could not check out ${request.branch} to review it`);
}

/**
 * Takes a worktree away. Never throws: this runs to keep old checkouts from
 * piling up, and a folder that would not go is not worth failing a review over.
 *
 * A branch this app made for the checkout goes with it, since nothing else will
 * ever look at it. A branch the pull request named is left alone — that one is
 * the user's.
 */
export async function removeWorktree(root: string, worktreePath: string): Promise<void> {
  // Asked for the branch first, since after this the folder that knows it is
  // gone. Read only when the folder is there: git run in a folder that is not
  // fails the same way git being missing does, and that is not what happened.
  const present = await fs.stat(worktreePath).then(
    (stats) => stats.isDirectory(),
    () => false,
  );
  const branch = present ? await git(["rev-parse", "--abbrev-ref", "HEAD"], worktreePath) : null;

  await git(["worktree", "remove", "--force", worktreePath], root);
  // `worktree remove` refuses a folder git no longer answers for, which is the
  // one this is most needed for.
  await fs.rm(worktreePath, { recursive: true, force: true }).catch(() => {});
  await git(["worktree", "prune"], root);

  if (branch?.startsWith(BRANCH_PREFIX)) {
    await git(["branch", "-D", branch], root);
  }
}

/**
 * Fetches the pull request's head and answers with its commit, which is what
 * gets checked out. The commit is resolved here rather than passing
 * `FETCH_HEAD` along, because that is written per worktree: the one the fetch
 * wrote is not the one another worktree would read.
 *
 * The branch is tried first, and the platform's own read-only ref after it,
 * which is what reaches a pull request opened from a fork.
 */
async function fetchHead(request: WorktreeRequest): Promise<string> {
  const platformRef =
    request.platform === "gitlab"
      ? `refs/merge-requests/${request.number}/head`
      : `refs/pull/${request.number}/head`;

  for (const ref of [request.branch, platformRef]) {
    const fetched = await git(["fetch", "--force", "origin", ref], request.root, FETCH_TIMEOUT_MS);
    if (fetched === null) continue;

    const head = await git(["rev-parse", "FETCH_HEAD"], request.root);
    if (head) return head;
  }

  throw new Error(
    `Could not fetch ${request.branch} — check that origin has it and that you can reach it`,
  );
}
