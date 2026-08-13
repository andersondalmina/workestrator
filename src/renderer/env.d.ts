/// <reference types="vite/client" />
import type { WorkestratorApi } from "../shared/ipc";

declare global {
  interface Window {
    /** Injected by the preload script; undefined outside the Electron shell. */
    workestrator?: WorkestratorApi;
  }
}

export {};
