// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";
import {
  IpcChannel,
  type ReviewEventPayload,
  type ReviewSummary,
  type WorkestratorApi,
} from "../shared/ipc";

const api: WorkestratorApi = {
  platform: process.platform,
  openExternal: (url) => ipcRenderer.invoke(IpcChannel.OpenExternal, url),
  listProjects: () => ipcRenderer.invoke(IpcChannel.ListProjects),
  addProject: () => ipcRenderer.invoke(IpcChannel.AddProject),
  deleteProject: (id) => ipcRenderer.invoke(IpcChannel.DeleteProject, id),
  fetchPullRequests: () => ipcRenderer.invoke(IpcChannel.FetchPullRequests),
  listOpencodeAgents: () => ipcRenderer.invoke(IpcChannel.ListOpencodeAgents),
  getAgentSettings: () => ipcRenderer.invoke(IpcChannel.GetAgentSettings),
  loadAgentConfiguration: () => ipcRenderer.invoke(IpcChannel.LoadAgentConfiguration),
  setAgentSetting: (action, agentName) =>
    ipcRenderer.invoke(IpcChannel.SetAgentSetting, action, agentName),
  listWorktreeApps: () => ipcRenderer.invoke(IpcChannel.ListWorktreeApps),
  openWorktree: (reviewId, appId) => ipcRenderer.invoke(IpcChannel.OpenWorktree, reviewId, appId),
  startReview: (request) => ipcRenderer.invoke(IpcChannel.StartReview, request),
  cancelReview: (id) => ipcRenderer.invoke(IpcChannel.CancelReview, id),
  listReviews: () => ipcRenderer.invoke(IpcChannel.ListReviews),
  getReview: (id) => ipcRenderer.invoke(IpcChannel.GetReview, id),
  // The two channels the main process talks on unasked. A listener cannot be
  // handed to `ipcRenderer` as it is — nothing from the renderer crosses the
  // bridge — so it is wrapped here, and unsubscribing is handed back.
  onReviewChanged: (listener) => {
    const handler = (_event: unknown, review: ReviewSummary) => listener(review);
    ipcRenderer.on(IpcChannel.ReviewChanged, handler);
    return () => {
      ipcRenderer.off(IpcChannel.ReviewChanged, handler);
    };
  },
  onReviewEvent: (listener) => {
    const handler = (_event: unknown, payload: ReviewEventPayload) => listener(payload);
    ipcRenderer.on(IpcChannel.ReviewEvent, handler);
    return () => {
      ipcRenderer.off(IpcChannel.ReviewEvent, handler);
    };
  },
};

contextBridge.exposeInMainWorld("workestrator", api);
