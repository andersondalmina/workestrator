import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorktree, fallbackBranch, removeWorktree, worktreeHome } from "./gitService";

const run = promisify(execFile);

/**
 * The tests set the variables git exports to its own hooks, and the helper here
 * has to answer for the folder it is given just as the code under test does —
 * otherwise the assertions read the repository the variables name.
 */
function plainEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[name];
  return env;
}

describe("fallbackBranch", () => {
  // Every review checks out into a worktree of its own, so the name a review
  // falls back to has to be its own too: the review before it is still holding
  // the one named after the pull request.
  it("names a branch no other review can be holding", () => {
    expect(fallbackBranch(12, 3)).toBe("workestrator/pr-12-r3");
    expect(fallbackBranch(12, 3)).not.toBe(fallbackBranch(12, 4));
  });
});

/**
 * The worktree side needs real repositories: what is being checked is what git
 * does with a branch that is already checked out, which nothing but git knows.
 */
describe("createWorktree", () => {
  let temporary: string;
  let origin: string;
  let clone: string;

  const git = (args: string[], cwd: string) => run("git", args, { cwd, env: plainEnv() });

  beforeEach(async () => {
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), "workestrator-git-"));
    origin = path.join(temporary, "origin");
    clone = path.join(temporary, "clone");

    await fs.mkdir(origin, { recursive: true });
    await git(["init", "--initial-branch=main"], origin);
    await git(["config", "user.email", "test@example.com"], origin);
    await git(["config", "user.name", "Test"], origin);
    await fs.writeFile(path.join(origin, "README.md"), "first\n");
    await git(["add", "."], origin);
    await git(["commit", "-m", "first"], origin);

    await git(["checkout", "-b", "feature"], origin);
    await fs.writeFile(path.join(origin, "README.md"), "second\n");
    await git(["commit", "-am", "second"], origin);
    await git(["checkout", "main"], origin);

    await git(["clone", origin, clone], temporary);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(temporary, { recursive: true, force: true });
  });

  const request = (reviewId: number) => ({
    root: clone,
    worktreePath: path.join(worktreeHome(clone), `pr-7-r${reviewId}`),
    branch: "feature",
    number: 7,
    reviewId,
    platform: "github" as const,
  });

  it("checks the pull request's branch out into its own folder", async () => {
    const first = request(1);
    await createWorktree(first);

    expect(await fs.readFile(path.join(first.worktreePath, "README.md"), "utf8")).toBe("second\n");

    const { stdout } = await git(["rev-parse", "--abbrev-ref", "HEAD"], first.worktreePath);
    expect(stdout.trim()).toBe("feature");
  });

  // The review before this one still has the branch, and git refuses to check
  // the same branch out twice. The second review gets a name of its own rather
  // than failing, and both are reading the same commit either way.
  it("gives a second review its own branch and leaves the first alone", async () => {
    const first = request(1);
    const second = request(2);

    await createWorktree(first);
    await createWorktree(second);

    const head = async (worktree: string) =>
      (await git(["rev-parse", "HEAD"], worktree)).stdout.trim();
    const branch = async (worktree: string) =>
      (await git(["rev-parse", "--abbrev-ref", "HEAD"], worktree)).stdout.trim();

    expect(await branch(first.worktreePath)).toBe("feature");
    expect(await branch(second.worktreePath)).toBe("workestrator/pr-7-r2");
    expect(await head(second.worktreePath)).toBe(await head(first.worktreePath));
  });

  // The checkout lives inside the repository, so without the exclude rule every
  // review leaves `?? .workestrator/` in the user's own `git status`.
  it("keeps the checkout out of the repository's status", async () => {
    await createWorktree(request(1));

    const status = await git(["status", "--short"], clone);
    expect(status.stdout.trim()).toBe("");

    const clean = await git(["clean", "-nd"], clone);
    expect(clean.stdout).not.toContain(".workestrator");
  });

  it("writes the exclude rule once, however many reviews run", async () => {
    await createWorktree(request(1));
    await createWorktree(request(2));

    const exclude = await fs.readFile(path.join(clone, ".git", "info", "exclude"), "utf8");
    expect(exclude.split("\n").filter((line) => line.trim() === "/.workestrator/")).toHaveLength(1);
  });

  // A project folder that is itself a worktree keeps no `.git` directory of its
  // own, so the rule has to be written where git actually reads it from.
  it("excludes from the shared git directory when the project is a worktree", async () => {
    const nested = path.join(temporary, "nested");
    await git(["worktree", "add", "-b", "nested", nested, "main"], clone);

    await createWorktree({
      ...request(1),
      root: nested,
      worktreePath: path.join(worktreeHome(nested), "pr-7-r1"),
    });

    const status = await git(["status", "--short"], nested);
    expect(status.stdout.trim()).toBe("");
  });

  // Git sets these for the commands it runs itself, so the app inherits them
  // whenever it is started from a hook — which is how the repository's own
  // pre-commit hook first ran these tests against the wrong repository.
  it("ignores a repository named in the environment", async () => {
    vi.stubEnv("GIT_DIR", path.join(origin, ".git"));
    vi.stubEnv("GIT_INDEX_FILE", ".git/index");
    vi.stubEnv("GIT_WORK_TREE", origin);

    const only = request(1);
    await createWorktree(only);

    expect(await fs.readFile(path.join(only.worktreePath, "README.md"), "utf8")).toBe("second\n");
  });

  it("replaces a folder an interrupted review left at the same path", async () => {
    const only = request(1);
    await fs.mkdir(only.worktreePath, { recursive: true });
    await fs.writeFile(path.join(only.worktreePath, "leftover.txt"), "junk\n");

    await createWorktree(only);

    await expect(fs.stat(path.join(only.worktreePath, "leftover.txt"))).rejects.toThrow();
    expect(await fs.readFile(path.join(only.worktreePath, "README.md"), "utf8")).toBe("second\n");
  });
});

describe("removeWorktree", () => {
  let temporary: string;
  let origin: string;
  let clone: string;

  const git = (args: string[], cwd: string) => run("git", args, { cwd, env: plainEnv() });

  beforeEach(async () => {
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), "workestrator-git-"));
    origin = path.join(temporary, "origin");
    clone = path.join(temporary, "clone");

    await fs.mkdir(origin, { recursive: true });
    await git(["init", "--initial-branch=main"], origin);
    await git(["config", "user.email", "test@example.com"], origin);
    await git(["config", "user.name", "Test"], origin);
    await fs.writeFile(path.join(origin, "README.md"), "first\n");
    await git(["add", "."], origin);
    await git(["commit", "-m", "first"], origin);
    await git(["branch", "feature"], origin);

    await git(["clone", origin, clone], temporary);
  });

  afterEach(async () => {
    await fs.rm(temporary, { recursive: true, force: true });
  });

  const request = (reviewId: number) => ({
    root: clone,
    worktreePath: path.join(worktreeHome(clone), `pr-7-r${reviewId}`),
    branch: "feature",
    number: 7,
    reviewId,
    platform: "github" as const,
  });

  const branches = async () =>
    (await git(["branch", "--format=%(refname:short)"], clone)).stdout.trim().split("\n");

  it("takes the folder and the branch this app made", async () => {
    const first = request(1);
    const second = request(2);
    await createWorktree(first);
    await createWorktree(second);

    expect(await branches()).toContain("workestrator/pr-7-r2");

    await removeWorktree(clone, second.worktreePath);

    await expect(fs.stat(second.worktreePath)).rejects.toThrow();
    expect(await branches()).not.toContain("workestrator/pr-7-r2");
  });

  // The pull request's branch is the user's, and it is checked out in their own
  // clone as often as not.
  it("leaves the pull request's own branch behind", async () => {
    const only = request(1);
    await createWorktree(only);

    await removeWorktree(clone, only.worktreePath);

    await expect(fs.stat(only.worktreePath)).rejects.toThrow();
    expect(await branches()).toContain("feature");
  });

  it("says nothing about a folder that is already gone", async () => {
    await expect(
      removeWorktree(clone, path.join(worktreeHome(clone), "never-there")),
    ).resolves.toBeUndefined();
  });
});
