import { BrowserWindow, ipcMain, shell } from "electron";
import {
  IpcChannel,
  type AgentSkillDraft,
  type ReviewRequest,
  type SkillAction,
} from "../shared/ipc";
import { getReview, listReviewSummaries } from "./db";
import {
  addProjectFromDirectory,
  getProjects,
  projectHosts,
  removeProject,
} from "./services/projectService";
import { fetchPullRequests } from "./services/pullRequestService";
import { cancelReview, startReview } from "./services/reviewService";
import {
  assignSkill,
  getAgentSkills,
  getAssignments,
  removeAgentSkill,
  saveAgentSkill,
} from "./services/skillService";

const SKILL_ACTIONS = new Set<SkillAction>(["review", "fixComments"]);

const PLATFORMS = new Set(["github", "gitlab"]);

/** Hosts that may be handed to the OS browser whatever is in the database. */
const ALLOWED_HOSTS = new Set(["github.com", "www.github.com", "gitlab.com"]);

/**
 * A URL is openable when it is https and points either at a platform we know
 * or at the host of a repository the user added — which is what makes a pull
 * request on a self-managed GitLab reachable without opening up every host.
 */
function isAllowed(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    return ALLOWED_HOSTS.has(url.hostname) || projectHosts().has(url.hostname);
  } catch {
    return false;
  }
}

/** Transport only: every handler forwards to a service and returns its result. */
export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.OpenExternal, async (_event, url: unknown) => {
    if (typeof url !== "string" || !isAllowed(url)) {
      throw new Error(`Refused to open untrusted URL: ${String(url)}`);
    }
    await shell.openExternal(url);
  });

  ipcMain.handle(IpcChannel.ListProjects, () => getProjects());

  // The folder picker is modal to the window that asked for it.
  ipcMain.handle(IpcChannel.AddProject, (event) =>
    addProjectFromDirectory(BrowserWindow.fromWebContents(event.sender)),
  );

  ipcMain.handle(IpcChannel.DeleteProject, (_event, id: unknown) => {
    if (typeof id !== "number" || !Number.isInteger(id)) {
      throw new Error(`Not a project id: ${String(id)}`);
    }
    removeProject(id);
  });

  ipcMain.handle(IpcChannel.FetchPullRequests, () => fetchPullRequests());

  ipcMain.handle(IpcChannel.ListAgentSkills, () => getAgentSkills());

  ipcMain.handle(IpcChannel.SaveAgentSkill, (_event, draft: unknown) =>
    saveAgentSkill(toSkillDraft(draft)),
  );

  ipcMain.handle(IpcChannel.DeleteAgentSkill, (_event, id: unknown) => {
    removeAgentSkill(toRowId(id, "skill id"));
  });

  ipcMain.handle(IpcChannel.GetSkillAssignments, () => getAssignments());

  ipcMain.handle(IpcChannel.AssignSkill, (_event, action: unknown, skillId: unknown) => {
    if (typeof action !== "string" || !SKILL_ACTIONS.has(action as SkillAction)) {
      throw new Error(`Not a board action: ${String(action)}`);
    }
    assignSkill(action as SkillAction, skillId === null ? null : toRowId(skillId, "skill id"));
  });

  ipcMain.handle(IpcChannel.StartReview, (_event, request: unknown) =>
    startReview(toReviewRequest(request)),
  );

  ipcMain.handle(IpcChannel.CancelReview, (_event, id: unknown) => {
    cancelReview(toRowId(id, "review id"));
  });

  ipcMain.handle(IpcChannel.ListReviews, () => listReviewSummaries());

  ipcMain.handle(IpcChannel.GetReview, (_event, id: unknown) =>
    getReview(toRowId(id, "review id")),
  );
}

/**
 * A review runs an agent over a checkout of whatever URL it is handed, so the
 * URL is held to the same rule as one being opened in the browser: https, and
 * a platform or a project the user added.
 */
function toReviewRequest(value: unknown): ReviewRequest {
  if (typeof value !== "object" || value === null) {
    throw new Error("Not a review request");
  }

  const { projectId, pullRequestId, pullRequestNumber, pullRequestUrl, branch, platform } =
    value as Record<string, unknown>;

  if (typeof pullRequestUrl !== "string" || !isAllowed(pullRequestUrl)) {
    throw new Error(`Refused to review untrusted URL: ${String(pullRequestUrl)}`);
  }
  if (typeof platform !== "string" || !PLATFORMS.has(platform)) {
    throw new Error(`Not a platform: ${String(platform)}`);
  }

  return {
    projectId: toRowId(projectId, "project id"),
    pullRequestId: toText(pullRequestId, "pull request id"),
    pullRequestNumber: toRowId(pullRequestNumber, "pull request number"),
    pullRequestUrl,
    branch: toText(branch, "branch"),
    platform: platform as ReviewRequest["platform"],
  };
}

/** Nothing crosses the bridge unread: the renderer is treated as untrusted. */
function toSkillDraft(value: unknown): AgentSkillDraft {
  if (typeof value !== "object" || value === null) {
    throw new Error("Not a skill");
  }

  const { id, name, description, command } = value as Record<string, unknown>;

  return {
    id: id === undefined ? undefined : toRowId(id, "skill id"),
    name: toText(name, "skill name"),
    description: description === undefined ? "" : toText(description, "skill description"),
    command: toText(command, "skill command"),
  };
}

function toRowId(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Not a ${what}: ${String(value)}`);
  }
  return value;
}

function toText(value: unknown, what: string): string {
  if (typeof value !== "string") {
    throw new Error(`Not a ${what}: ${String(value)}`);
  }
  return value;
}
