/**
 * Having a pull request reviewed. The pull request is checked out into a
 * worktree of its own and `opencode` is turned loose on it there, so the review
 * reads the code as the pull request has it without disturbing whatever the
 * user is working on.
 *
 * A run outlives the call that started it: `startReview` answers as soon as the
 * review has been recorded, and how it ended is broadcast to the windows when
 * the agent is done.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { BrowserWindow } from "electron";
import {
  IpcChannel,
  type ReviewEventPayload,
  type ReviewRequest,
  type ReviewStatus,
  type ReviewSummary,
} from "../../shared/ipc";
import type { AgentEvent } from "../../shared/agentEvent";
import {
  createReview,
  finishReview,
  getAgentSettings,
  getProject,
  listProjects,
  setReviewWorktreePath,
} from "../db";
import { createWorktree, removeWorktree, worktreeHome } from "./gitService";
import { CANCELLED, runReviewAgent } from "./reviewAgent";

/** A run under way, and the handle that stops it. */
interface Run {
  review: ReviewSummary;
  controller: AbortController;
}

/**
 * The pull requests being reviewed right now. A card can be pressed twice, and
 * a second run would only fight the first over the same worktree.
 */
const running = new Map<string, Run>();

/**
 * Starts a review and answers once it is recorded as running. Asking for a
 * pull request that is already being reviewed answers with that review.
 *
 * Only what can be settled on the spot is refused here. Everything the run has
 * to go and find out — whether the branch can be fetched, whether the agent
 * has anything to say — becomes a failed review instead, which is something
 * the panel can show rather than a message that scrolls past.
 */
export function startReview(request: ReviewRequest): ReviewSummary {
  const current = running.get(request.pullRequestId);
  if (current) return current.review;

  const project = getProject(request.projectId);
  if (!project) {
    throw new Error("That project is no longer on the board");
  }
  if (!project.localPath) {
    throw new Error(`Re-add ${project.name} so its repository folder is known`);
  }

  const reviewer = getAgentSettings().reviewer;
  if (!reviewer) {
    throw new Error("Pick a Reviewer agent in Settings");
  }

  const started = createReview({
    projectId: request.projectId,
    pullRequestId: request.pullRequestId,
    pullRequestNumber: request.pullRequestNumber,
    branch: request.branch,
  });

  // The checkout is named after the review, so where it goes is only settled
  // once the review has an id.
  const review: ReviewSummary = {
    ...started,
    worktreePath: worktreePathFor(started, project.localPath),
  };
  setReviewWorktreePath(review.id, review.worktreePath);

  const controller = new AbortController();
  running.set(request.pullRequestId, { review, controller });
  broadcast(review);

  // Deliberately not awaited: checking the pull request out takes seconds and
  // the agent takes minutes. How it went arrives on `onReviewChanged`.
  void runAgent(review, project.localPath, request, reviewer, controller.signal).finally(() => {
    running.delete(request.pullRequestId);
  });

  return review;
}

/**
 * Stops a review that is still going. A review that has already ended — or one
 * this process never started, as every row does after a restart — is left as
 * it is: there is nothing left to stop.
 */
export function cancelReview(id: number): void {
  for (const run of running.values()) {
    if (run.review.id === id) {
      run.controller.abort();
      return;
    }
  }
}

/**
 * Clears the checkouts left over from before, which is what takes away the ones
 * a crash left behind: nothing is running yet, so nothing here is in use.
 */
export async function pruneAllWorktrees(): Promise<void> {
  for (const project of listProjects()) {
    if (project.localPath) await pruneWorktrees(project.localPath);
  }
}

/** What the folders of a project's checkouts are named after. */
const WORKTREE_PREFIX = "pr-";

/**
 * Each review keeps its own checkout, in the repository it belongs to and named
 * so no two reviews share one.
 */
function worktreePathFor(review: ReviewSummary, root: string): string {
  return path.join(
    worktreeHome(root),
    `${WORKTREE_PREFIX}${review.pullRequestNumber}-r${review.id}`,
  );
}

/**
 * Checks the pull request out, runs the agent to completion and writes down
 * what it said. Nothing here throws: a review that could not be run is a
 * failed review, which is the thing the panel has to show either way.
 *
 * A cancelled run is not a failed one, however it ended — the checkout can be
 * interrupted mid-fetch and the agent is killed outright, both of which arrive
 * here as errors — so `signal` decides, not what was thrown.
 */
async function runAgent(
  review: ReviewSummary,
  root: string,
  request: ReviewRequest,
  agentName: string,
  signal: AbortSignal,
): Promise<void> {
  try {
    await createWorktree({
      root,
      worktreePath: review.worktreePath,
      branch: request.branch,
      number: request.pullRequestNumber,
      reviewId: review.id,
      platform: request.platform,
    });

    const written = await runReviewAgent(
      review.worktreePath,
      request.pullRequestUrl,
      agentName,
      signal,
      (event) => broadcastEvent(review.id, event),
    );
    // Whatever the agent had written by the time it was stopped is still worth
    // keeping, but the run is not one that finished.
    save(review.id, signal.aborted ? "cancelled" : "completed", written);
  } catch (error) {
    if (signal.aborted) save(review.id, "cancelled", CANCELLED);
    else save(review.id, "failed", errorMessage(error));
  } finally {
    await pruneWorktrees(root);
  }
}

/**
 * How many of a project's checkouts are kept. A review's worktree is left
 * behind so the code it read can be opened and looked at, and each one is a
 * whole checkout of the repository, so only the last few are worth the disk.
 */
const KEEP_WORKTREES = 3;

/**
 * Takes away all but the newest few of a project's checkouts. Runs after every
 * review and once at startup, which is what clears the ones a crash left.
 *
 * Never throws. This is housekeeping, and a review that was written is not
 * failed over a folder that would not go.
 */
async function pruneWorktrees(root: string): Promise<void> {
  try {
    const home = worktreeHome(root);
    const entries = await fs.readdir(home, { withFileTypes: true });

    const dated = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(WORKTREE_PREFIX))
        .map(async (entry) => {
          const directory = path.join(home, entry.name);
          const stats = await fs.stat(directory).catch(() => null);
          return { directory, at: stats?.mtimeMs ?? 0 };
        }),
    );

    // A review still under way is reading its worktree, and it is not always
    // the newest one — a long review outlives the short ones started after it.
    const held = new Set([...running.values()].map((run) => run.review.worktreePath));

    const stale = dated
      .filter((entry) => !held.has(entry.directory))
      .sort((left, right) => right.at - left.at)
      .slice(KEEP_WORKTREES);

    for (const entry of stale) {
      await removeWorktree(root, entry.directory);
    }
  } catch {
    // Nothing has been checked out for this project yet, most likely.
  }
}

function save(id: number, status: Exclude<ReviewStatus, "running">, result: string): void {
  const finished = finishReview(id, status, result);
  if (finished) broadcast(finished);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Every window follows every review, since any of them can show the board. */
function broadcast(review: ReviewSummary): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannel.ReviewChanged, review);
  }
}

/**
 * The agent working, sent on as it happens. Nothing is written down: a window
 * that was not open to hear it has the review itself to read instead, which is
 * the part worth keeping.
 */
function broadcastEvent(reviewId: number, event: AgentEvent): void {
  const payload: ReviewEventPayload = { reviewId, event };
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannel.ReviewEvent, payload);
  }
}
