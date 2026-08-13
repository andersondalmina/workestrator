/**
 * Reading a git repository from disk. Everything the app knows about what
 * makes a folder a usable project lives here, so the IPC layer and the
 * database stay free of git rules.
 */

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
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

/** The branch a pull request is checked out under when its own name is taken. */
function fallbackBranch(number: number): string {
  return `workestrator/pr-${number}`;
}

export interface WorktreeRequest {
  /** Working tree root of the repository the worktree is added to. */
  root: string;
  /** Where the checkout goes. Created if it is not there, reused if it is. */
  worktreePath: string;
  /** The branch the pull request's changes are on. */
  branch: string;
  /** The pull request's number, used to reach a head on a fork. */
  number: number;
  platform: RepositoryPlatform;
}

/**
 * Puts a pull request's head in a worktree of its own, so it can be read
 * without touching whatever the user has checked out. An existing worktree is
 * reset onto the head rather than replaced, which is what makes reviewing the
 * same pull request twice cheap.
 */
export async function ensureWorktree(request: WorktreeRequest): Promise<void> {
  // A worktree whose folder was deleted by hand is still registered, and git
  // refuses to add another in its place until the record is dropped.
  await git(["worktree", "prune"], request.root);

  const head = await fetchHead(request);
  const existing = await worktreeState(request.worktreePath);

  if (existing === "usable") {
    const reset = await git(["reset", "--hard", head], request.worktreePath);
    if (reset === null) {
      throw new Error("Could not update the worktree the review reads from");
    }
    // The last review may have left files behind; the next one reads the pull
    // request, not what an agent did to it.
    await git(["clean", "-fd"], request.worktreePath);
    return;
  }

  // A folder that is no longer a worktree git answers for — the repository was
  // re-cloned under it, say — would only make `worktree add` refuse to use the
  // path. It is one this app made, inside its own data directory, so it goes.
  if (existing === "stale") {
    await fs.rm(request.worktreePath, { recursive: true, force: true });
  }

  await fs.mkdir(path.dirname(request.worktreePath), { recursive: true });

  // The pull request's own branch name first. Git refuses a branch that is
  // already checked out somewhere else — most often in the user's own clone —
  // and that is the one case worth checking out under another name.
  for (const branch of [request.branch, fallbackBranch(request.number)]) {
    const added = await git(
      ["worktree", "add", "-B", branch, request.worktreePath, head],
      request.root,
    );
    if (added !== null) return;
  }

  throw new Error(`Could not check out ${request.branch} to review it`);
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

/**
 * What is at the worktree path already: nothing, a working tree git still
 * answers for, or a folder left over from one it does not.
 */
async function worktreeState(directory: string): Promise<"missing" | "usable" | "stale"> {
  const stats = await fs.stat(directory).catch(() => null);
  if (!stats?.isDirectory()) return "missing";

  const inside = await git(["rev-parse", "--is-inside-work-tree"], directory);
  return inside === "true" ? "usable" : "stale";
}
