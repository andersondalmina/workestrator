/**
 * Reading open pull requests through the platform CLIs. `gh` answers for
 * GitHub projects and `glab` for GitLab ones, which means the app inherits
 * whatever credentials the user already signed those tools in with instead of
 * asking for a token of its own.
 *
 * Everything platform specific stops here: the rest of the app only sees the
 * flattened `RemotePullRequest`.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  PullRequestFailure,
  PullRequestFetch,
  RemoteCheck,
  RemotePullRequest,
  StoredProject,
} from "../../shared/ipc";
import { parseRepositoryLink } from "../../shared/repoUrl";
import { listProjects } from "../db";
import { searchPath } from "./cliPath";

const run = promisify(execFile);

/** A CLI call reaches the network, so it gets longer than a local git call. */
const TIMEOUT_MS = 20_000;

/** Pull request lists with their checks attached are well past the 1MB default. */
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

/** How many open pull requests to take from a single project. */
const PER_PROJECT_LIMIT = 50;

/** At most this many checks are kept per pull request, newest last. */
const CHECK_LIMIT = 8;

const CLI_FOR_PLATFORM = { github: "gh", gitlab: "glab" } as const;

/** The fields of a pull request the board can show. */
const GH_FIELDS = [
  "number",
  "title",
  "headRefName",
  "url",
  "author",
  "isDraft",
  "createdAt",
  "updatedAt",
  "additions",
  "deletions",
  "reviewDecision",
  "mergeable",
  "statusCheckRollup",
  "reviews",
  "comments",
].join(",");

/** `gh pr list --json` output, as far as this module reads it. */
interface GhPullRequest {
  number: number;
  title: string;
  headRefName: string;
  url: string;
  author: { login?: string } | null;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  /** `APPROVED`, `CHANGES_REQUESTED`, `REVIEW_REQUIRED`, or empty. */
  reviewDecision: string;
  /** `MERGEABLE`, `CONFLICTING` or `UNKNOWN`. */
  mergeable: string;
  statusCheckRollup: GhCheck[] | null;
  /** Every submitted review, approvals and plain comments alike. */
  reviews: GhAuthored[] | null;
  /** Comments on the conversation tab. */
  comments: GhAuthored[] | null;
}

/** The only part of a review or comment this module reads: who left it. */
interface GhAuthored {
  author: { login?: string } | null;
}

/** A check run or a commit status — the rollup mixes both. */
interface GhCheck {
  /** Set on check runs. */
  name?: string;
  /** Set on commit statuses instead of `name`. */
  context?: string;
  /** Check runs: `QUEUED`, `IN_PROGRESS`, `COMPLETED`. */
  status?: string;
  /** Check runs: `SUCCESS`, `FAILURE`, `SKIPPED`, ... */
  conclusion?: string;
  /** Commit statuses: `SUCCESS`, `FAILURE`, `PENDING`, `ERROR`. */
  state?: string;
}

/** `glab mr list --output json` output, which is the GitLab API's own shape. */
interface GlabMergeRequest {
  iid: number;
  title: string;
  source_branch: string;
  web_url: string;
  author: { username?: string } | null;
  draft?: boolean;
  work_in_progress?: boolean;
  has_conflicts?: boolean;
  /** `mergeable`, `conflict`, `not_approved`, `draft_status`, ... */
  detailed_merge_status?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Asks every saved project's CLI for its open pull requests. Projects are read
 * side by side, and one that fails only takes its own result with it.
 */
export async function fetchPullRequests(): Promise<PullRequestFetch> {
  const results = await Promise.all(listProjects().map(readProject));

  return {
    pullRequests: results.flatMap((result) =>
      "pullRequests" in result ? result.pullRequests : [],
    ),
    failures: results.flatMap((result) => ("message" in result ? [result] : [])),
  };
}

type ProjectResult = { projectId: number; pullRequests: RemotePullRequest[] } | PullRequestFailure;

async function readProject(project: StoredProject): Promise<ProjectResult> {
  const parsed = parseRepositoryLink(project.repositoryLink);
  if (!parsed?.platform) {
    return failure(project, "is not hosted on GitHub or GitLab");
  }

  const cli = CLI_FOR_PLATFORM[parsed.platform];
  const args =
    parsed.platform === "github"
      ? [
          "pr",
          "list",
          "--repo",
          parsed.url,
          "--state",
          "open",
          "--limit",
          String(PER_PROJECT_LIMIT),
          "--json",
          GH_FIELDS,
        ]
      : [
          "mr",
          "list",
          "--repo",
          parsed.url,
          "--output",
          "json",
          "--per-page",
          String(PER_PROJECT_LIMIT),
        ];

  // Who the CLI is signed in as decides which column a pull request lands in,
  // and it is asked for beside the list rather than after it.
  const [list, viewer] = await Promise.allSettled([
    runCli(cli, args),
    viewerLogin(cli, parsed.host),
  ]);

  if (list.status === "rejected") {
    return failure(project, cliErrorMessage(cli, list.reason));
  }
  const me = viewer.status === "fulfilled" ? viewer.value : null;

  try {
    return {
      projectId: project.id,
      pullRequests:
        parsed.platform === "github"
          ? parseJson<GhPullRequest[]>(list.value).map((pr) => fromGitHub(pr, project.id, me))
          : parseJson<GlabMergeRequest[]>(list.value).map((mr) => fromGitLab(mr, project.id, me)),
    };
  } catch {
    return failure(project, `answered ${cli} with something this app cannot read`);
  }
}

/**
 * The handle the CLI is signed in as on a host, or `null` when it cannot say —
 * the board then treats every pull request as somebody else's, which is the
 * safe reading: nothing is silently marked as already looked at.
 *
 * One lookup per host is kept for the life of the process, since a fetch asks
 * for every project at once and the answer does not change while the app runs.
 */
const VIEWERS = new Map<string, Promise<string | null>>();

function viewerLogin(cli: string, host: string): Promise<string | null> {
  const key = `${cli}@${host}`;
  const cached = VIEWERS.get(key);
  if (cached) return cached;

  const pending = readViewerLogin(cli, host).catch(() => null);
  VIEWERS.set(key, pending);
  return pending;
}

async function readViewerLogin(cli: string, host: string): Promise<string | null> {
  const stdout = await runCli(cli, ["api", "user", "--hostname", host]);
  // GitHub calls it `login`, GitLab `username`.
  const user: unknown = JSON.parse(stdout.trim() || "{}");
  const login =
    (user as { login?: unknown; username?: unknown }).login ??
    (user as { username?: unknown }).username;

  return typeof login === "string" && login ? login : null;
}

function failure(project: StoredProject, message: string): PullRequestFailure {
  return {
    projectId: project.id,
    project: project.name,
    message: `${project.name} ${message}`,
  };
}

/** Empty output means the CLI printed nothing rather than an empty list. */
function parseJson<T>(stdout: string): T {
  const parsed: unknown = JSON.parse(stdout.trim() || "[]");
  if (!Array.isArray(parsed)) throw new Error("Expected a list");
  return parsed as T;
}

async function runCli(cli: string, args: string[]): Promise<string> {
  const { stdout } = await run(cli, args, {
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
    env: { ...process.env, PATH: searchPath() },
  });
  return stdout;
}

/**
 * Turns a failed CLI call into a line worth showing. A missing binary is the
 * one case the user can only fix outside the app, so it says so plainly;
 * everything else — not signed in, host unreachable, repository gone — is
 * already explained by the CLI's own first line.
 */
function cliErrorMessage(cli: string, error: unknown): string {
  // What `execFile` rejects with: the spawn error, plus what the CLI printed.
  const failed = error as NodeJS.ErrnoException & {
    killed?: boolean;
    stderr?: string;
  };

  if (failed.code === "ENOENT") {
    return `needs the ${cli} CLI — install it and sign in with \`${cli} auth login\``;
  }
  if (failed.killed) {
    return `timed out waiting for ${cli}`;
  }

  const reported = failed.stderr
    ?.split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !/^\W*$/.test(line));

  return `could not be read: ${reported ?? failed.message}`;
}

function fromGitHub(pr: GhPullRequest, projectId: number, me: string | null): RemotePullRequest {
  const author = pr.author?.login ?? "unknown";

  return {
    id: `pr:${projectId}:${pr.number}`,
    projectId,
    platform: "github",
    number: pr.number,
    title: pr.title,
    branch: pr.headRefName,
    url: pr.url,
    author,
    draft: pr.isDraft,
    mine: me !== null && author === me,
    reviewedByMe:
      me !== null &&
      [...(pr.reviews ?? []), ...(pr.comments ?? [])].some((entry) => entry.author?.login === me),
    conflicted: pr.mergeable === "CONFLICTING",
    approved: pr.reviewDecision === "APPROVED",
    changesRequested: pr.reviewDecision === "CHANGES_REQUESTED",
    additions: pr.additions,
    deletions: pr.deletions,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    checks: toChecks(pr.statusCheckRollup ?? []),
  };
}

function fromGitLab(mr: GlabMergeRequest, projectId: number, me: string | null): RemotePullRequest {
  const status = mr.detailed_merge_status;
  const author = mr.author?.username ?? "unknown";

  return {
    id: `pr:${projectId}:${mr.iid}`,
    projectId,
    platform: "gitlab",
    number: mr.iid,
    title: mr.title,
    branch: mr.source_branch,
    url: mr.web_url,
    author,
    draft: mr.draft ?? mr.work_in_progress ?? false,
    mine: me !== null && author === me,
    // `glab mr list` reports how many notes a merge request has but not who
    // wrote them, so somebody else's stays in "Needs you" until it is approved
    // rather than being guessed at.
    reviewedByMe: false,
    conflicted: mr.has_conflicts === true || status === "conflict",
    // GitLab has no review decision: an MR that reports itself mergeable has
    // already cleared whatever approval rules the project set.
    approved: status === "mergeable",
    changesRequested: false,
    // `glab mr list` reports no diff size, and asking per merge request would
    // cost one API call each.
    additions: null,
    deletions: null,
    createdAt: mr.created_at,
    updatedAt: mr.updated_at,
    checks: [],
  };
}

/**
 * Flattens the status rollup. A workflow that ran several times reports one
 * entry per run, so the last one for a name is the one that counts.
 */
function toChecks(rollup: GhCheck[]): RemoteCheck[] {
  const byName = new Map<string, RemoteCheck>();

  for (const check of rollup) {
    const name = check.name ?? check.context;
    if (name) byName.set(name, { name, state: checkState(check) });
  }

  return [...byName.values()].slice(-CHECK_LIMIT);
}

function checkState(check: GhCheck): string {
  if (check.status === "QUEUED") return "queued";
  if (check.status && check.status !== "COMPLETED") return "running";

  switch (check.conclusion ?? check.state) {
    case "SUCCESS":
      return "passed";
    case "FAILURE":
    case "TIMED_OUT":
    case "CANCELLED":
    case "ERROR":
      return "failed";
    case "PENDING":
    case "EXPECTED":
      return "running";
    case "SKIPPED":
    case "NEUTRAL":
      return "skipped";
    default:
      return "queued";
  }
}
