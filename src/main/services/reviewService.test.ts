import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Stands in for the repositories the projects were added from. */
let repositories = "";

vi.mock("electron", () => ({
  app: { getPath: () => repositories },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock("../db", () => ({
  createReview: vi.fn(),
  finishReview: vi.fn(),
  getAgentSettings: vi.fn(),
  getProject: vi.fn(),
  listProjects: vi.fn(() => [
    {
      id: 1,
      name: "one",
      repositoryLink: "",
      localPath: path.join(repositories, "one"),
      createdAt: "",
    },
    {
      id: 2,
      name: "two",
      repositoryLink: "",
      localPath: path.join(repositories, "two"),
      createdAt: "",
    },
    // Added before the app recorded where repositories live, so there is no
    // folder to look in.
    { id: 3, name: "three", repositoryLink: "", localPath: "", createdAt: "" },
  ]),
  setReviewWorktreePath: vi.fn(),
}));

vi.mock("./gitService", async () => {
  const actual = await vi.importActual<typeof import("./gitService")>("./gitService");
  return {
    worktreeHome: actual.worktreeHome,
    createWorktree: vi.fn(),
    removeWorktree: vi.fn(),
  };
});

const { removeWorktree, worktreeHome } = await import("./gitService");
const { pruneAllWorktrees } = await import("./reviewService");

/** A checkout folder, aged so the order they are considered in is the test's. */
async function checkout(project: string, name: string, minutesOld: number): Promise<string> {
  const directory = path.join(worktreeHome(path.join(repositories, project)), name);
  await fs.mkdir(directory, { recursive: true });

  const at = new Date(Date.now() - minutesOld * 60_000);
  await fs.utimes(directory, at, at);

  return directory;
}

const removed = () => vi.mocked(removeWorktree).mock.calls.map(([, directory]) => directory);

describe("pruneAllWorktrees", () => {
  beforeEach(async () => {
    repositories = await fs.mkdtemp(path.join(os.tmpdir(), "workestrator-prune-"));
    vi.mocked(removeWorktree).mockClear();
  });

  afterEach(async () => {
    await fs.rm(repositories, { recursive: true, force: true });
  });

  it("keeps the three newest checkouts a repository has", async () => {
    const newest = await checkout("one", "pr-4-r9", 1);
    const newer = await checkout("one", "pr-4-r8", 2);
    const kept = await checkout("one", "pr-7-r7", 3);
    const old = await checkout("one", "pr-4-r6", 4);
    const oldest = await checkout("one", "pr-4-r5", 5);

    await pruneAllWorktrees();

    expect(removed()).toEqual([old, oldest]);
    for (const directory of [newest, newer, kept]) {
      await expect(fs.stat(directory)).resolves.toBeTruthy();
    }
  });

  // Each repository holds its own checkouts, so one busy project cannot push
  // another's out.
  it("counts each repository's checkouts separately", async () => {
    await checkout("one", "pr-4-r1", 1);
    await checkout("one", "pr-4-r2", 2);
    await checkout("one", "pr-4-r3", 3);
    await checkout("two", "pr-9-r4", 4);

    await pruneAllWorktrees();

    expect(removed()).toEqual([]);
  });

  it("leaves anything else in the folder alone", async () => {
    await checkout("one", "pr-1-r1", 1);
    await checkout("one", "notes", 2);

    await pruneAllWorktrees();

    expect(removed()).toEqual([]);
  });

  it("says nothing when no review has ever run", async () => {
    await expect(pruneAllWorktrees()).resolves.toBeUndefined();
    expect(removed()).toEqual([]);
  });
});
