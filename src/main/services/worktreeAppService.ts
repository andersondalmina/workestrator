/**
 * Opening a pull request's checkout in something the user already has. A review
 * leaves the pull request in a worktree of its own; this is what leads to it,
 * so the folder can be read in Finder, a shell or an editor without going and
 * finding it by hand.
 *
 * The renderer never names a path: it names a review, and the checkout that
 * review recorded is what gets opened. Paths stay in the main process, where
 * they are made.
 */

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { WorktreeApp } from "../../shared/ipc";
import { getReviewSummary } from "../db";

const run = promisify(execFile);

/** Handing a folder to the OS is immediate; the app it starts is not waited on. */
const TIMEOUT_MS = 10_000;

/** What it takes to open a folder in one app on one platform. */
export interface WorktreeAppEntry {
  /** Stable id the renderer asks for the app back by. */
  id: string;
  name: string;
  platform: NodeJS.Platform;
  /**
   * Where the app is installed. The first of these that exists is the one
   * opened, and an entry with none is one the platform reaches by name.
   */
  bundles: string[];
  /** Listed even when none of its bundles is there, because the OS ships it. */
  always: boolean;
  /** What to run to open `worktree`, given whichever bundle was found. */
  command(bundle: string | null, worktree: string): { file: string; args: string[] };
}

/** `open -a` takes an app's name as well as its bundle, which is the fallback. */
function openWith(name: string) {
  return (bundle: string | null, worktree: string) => ({
    file: "open",
    args: ["-a", bundle ?? name, worktree],
  });
}

/**
 * Every app the board can open a worktree in, in the order they are offered.
 * The first entry of a platform is the one the panel's own button runs, so
 * Finder leads: it is the one every Mac has and the one that shows the folder
 * as a folder.
 *
 * Adding an app — Cursor, iTerm, Explorer, a Linux file manager — is one entry
 * here and nothing else.
 */
const ENTRIES: WorktreeAppEntry[] = [
  {
    id: "finder",
    name: "Finder",
    platform: "darwin",
    bundles: [],
    always: true,
    command: (_bundle, worktree) => ({ file: "open", args: [worktree] }),
  },
  {
    id: "terminal",
    name: "Terminal",
    platform: "darwin",
    // Moved under /System in Catalina; the older path is still where it is on
    // anything that upgraded from before it.
    bundles: [
      "/System/Applications/Utilities/Terminal.app",
      "/Applications/Utilities/Terminal.app",
    ],
    always: true,
    command: openWith("Terminal"),
  },
  {
    id: "vscode",
    name: "Visual Studio Code",
    platform: "darwin",
    bundles: [
      "/Applications/Visual Studio Code.app",
      path.join(os.homedir(), "Applications", "Visual Studio Code.app"),
    ],
    always: false,
    command: openWith("Visual Studio Code"),
  },
];

/** The apps that could be offered on a platform, before checking what is installed. */
export function entriesFor(platform: NodeJS.Platform): WorktreeAppEntry[] {
  return ENTRIES.filter((entry) => entry.platform === platform);
}

/** The first of `paths` that is there, or `null` when none of them is. */
async function firstExisting(paths: string[]): Promise<string | null> {
  for (const candidate of paths) {
    const found = await fs.access(candidate).then(
      () => true,
      () => false,
    );
    if (found) return candidate;
  }
  return null;
}

/**
 * The apps this machine can open a worktree in. An app the OS ships is listed
 * whether or not it was found where it usually lives; anything else has to be
 * installed to be offered.
 */
export async function listWorktreeApps(): Promise<WorktreeApp[]> {
  const listed = await Promise.all(
    entriesFor(process.platform).map(async (entry) => {
      if (entry.always) return { id: entry.id, name: entry.name };
      const bundle = await firstExisting(entry.bundles);
      return bundle ? { id: entry.id, name: entry.name } : null;
    }),
  );

  return listed.filter((app): app is WorktreeApp => app !== null);
}

/**
 * Opens the worktree a review was run in. Everything that can have gone since
 * the panel drew its button — the review, its checkout, the app — is answered
 * with a message the panel can show rather than a failed promise nobody reads.
 */
export async function openWorktree(reviewId: number, appId: string): Promise<void> {
  const entry = entriesFor(process.platform).find((candidate) => candidate.id === appId);
  if (!entry) {
    throw new Error(`Nothing here opens a worktree in ${appId}`);
  }

  const review = getReviewSummary(reviewId);
  if (!review) {
    throw new Error("That review is no longer on the board");
  }

  const stats = await fs.stat(review.worktreePath).catch(() => null);
  if (!stats?.isDirectory()) {
    // Either the folder was cleared out, or the review that makes it is still
    // fetching — both are "there is nothing to open yet", and waiting on a
    // checkout is not something a button in a header should do.
    throw new Error("That checkout is not on disk — review the pull request again");
  }

  const bundle = await firstExisting(entry.bundles);
  const { file, args } = entry.command(bundle, review.worktreePath);

  try {
    await run(file, args, { timeout: TIMEOUT_MS, windowsHide: true });
  } catch {
    throw new Error(`Could not open the worktree in ${entry.name}`);
  }
}
