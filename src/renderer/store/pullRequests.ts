/**
 * Turning pull requests read from GitHub and GitLab into board cards. The
 * fetch itself knows nothing about columns or tones, so the decision of where
 * a pull request belongs on the board is made here and only here.
 */

import type { RemoteCheck, RemotePullRequest } from "../../shared/ipc";
import type { BoardTask, Check, ColumnId, Project, Tone } from "../types";

/** The view name fetched pull requests are filed under. */
const LANE = "Open pull requests";

const CHECK_TONE: Record<string, Tone> = {
  passed: "green",
  failed: "red",
  running: "blue",
  queued: "fg",
  skipped: "fg",
};

/**
 * Cards for the pull requests whose project is still on the board. A project
 * deleted between the fetch and its answer simply drops its pull requests.
 */
export function toBoardTasks(pullRequests: RemotePullRequest[], projects: Project[]): BoardTask[] {
  const byId = new Map(projects.map((project) => [project.id, project]));

  return pullRequests.flatMap((pullRequest) => {
    const project = byId.get(`db:${pullRequest.projectId}`);
    return project ? [toBoardTask(pullRequest, project)] : [];
  });
}

function toBoardTask(pullRequest: RemotePullRequest, project: Project): BoardTask {
  const checks = pullRequest.checks.map(toCheck);
  const failing = checks.some((check) => check.state === "failed");
  const status = statusFor(pullRequest, checks, failing);

  return {
    id: pullRequest.id,
    scope: project.id,
    col: columnFor(pullRequest),
    title: pullRequest.title,
    branch: pullRequest.branch,
    lane: LANE,
    repo: project.repo,
    repoColor: project.icon,
    pr: pullRequest.number,
    prState: stateLabel(pullRequest),
    prTone: stateTone(pullRequest),
    author: pullRequest.author,
    mine: pullRequest.mine,
    url: pullRequest.url,
    platform: pullRequest.platform,
    plus: pullRequest.additions === null ? undefined : `+${pullRequest.additions}`,
    minus: pullRequest.deletions === null ? undefined : `-${pullRequest.deletions}`,
    status: status.text,
    tone: status.tone,
    time: relativeTime(pullRequest.updatedAt),
    // Square marks read as blocked, round ones as still moving.
    mark: status.blocked ? "2px" : "50%",
    failing,
    checks,
    timeline: [
      {
        text: status.text,
        by: `${pullRequest.platform} · ${relativeTime(pullRequest.updatedAt)}`,
        tone: status.tone,
      },
      {
        text: `Opened by @${pullRequest.author}`,
        by: `${pullRequest.platform} · ${relativeTime(pullRequest.createdAt)}`,
        tone: "fg",
      },
    ],
  };
}

/**
 * Which column a pull request belongs to, read from the outside in: what has
 * already been decided about it first, then how far the reader has got with it.
 *
 * - Working: still a draft, whoever wrote it.
 * - Ready to merge: someone has approved it.
 * - Needs you: somebody else's, and you have not looked at it yet.
 * - In review: everything else — your own open pull requests, and the ones you
 *   have already commented on.
 */
function columnFor(pullRequest: RemotePullRequest): ColumnId {
  if (pullRequest.draft) return "working";
  if (pullRequest.approved) return "merge";
  if (pullRequest.mine || pullRequest.reviewedByMe) return "review";
  return "needs";
}

function stateLabel(pullRequest: RemotePullRequest): string {
  if (pullRequest.conflicted) return "conflicted";
  if (pullRequest.changesRequested) return "changes requested";
  if (pullRequest.draft) return "draft";
  if (pullRequest.approved) return "approved";
  return "in review";
}

function stateTone(pullRequest: RemotePullRequest): Tone {
  if (pullRequest.conflicted) return "red";
  if (pullRequest.changesRequested) return "orange";
  if (pullRequest.draft) return "fg";
  if (pullRequest.approved) return "green";
  return "violet";
}

interface Status {
  text: string;
  tone: Tone;
  /** True when the pull request cannot move without someone deciding something. */
  blocked: boolean;
}

/**
 * The line at the foot of the card. What blocks the pull request outranks what
 * its checks are doing, since that is what the reader has to act on.
 */
function statusFor(pullRequest: RemotePullRequest, checks: Check[], failing: boolean): Status {
  if (pullRequest.conflicted) {
    return { text: "Merge conflict to resolve", tone: "orange", blocked: true };
  }
  if (pullRequest.changesRequested) {
    return { text: "Changes requested", tone: "orange", blocked: true };
  }
  if (failing) {
    return { text: "Checks failing", tone: "red", blocked: true };
  }
  if (checks.some((check) => check.state === "running")) {
    return { text: "Checks running", tone: "blue", blocked: false };
  }
  if (pullRequest.draft) {
    return { text: "Draft, not up for review", tone: "blue", blocked: false };
  }
  if (pullRequest.approved) {
    return { text: "Approved and mergeable", tone: "green", blocked: false };
  }
  // Somebody else's that you have not answered yet: the wait is on you.
  if (!pullRequest.mine && !pullRequest.reviewedByMe) {
    return { text: "Waiting on your review", tone: "orange", blocked: true };
  }
  return { text: "Waiting on review", tone: "violet", blocked: false };
}

function toCheck(check: RemoteCheck): Check {
  return {
    name: check.name,
    state: check.state,
    // The CLIs report how a check ended, not how long it took.
    time: "—",
    tone: CHECK_TONE[check.state] ?? "fg",
  };
}

/** Timestamps are shown the way the rest of the board writes them. */
export function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";

  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}
