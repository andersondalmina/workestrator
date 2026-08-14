---
name: ipc-contract
description: The shared main/preload/renderer contract — how to add or change an IPC channel without letting the two sides drift.
applyTo: "src/shared/**/*.ts,src/preload/**/*.ts"
---

# IPC contract rules

`src/shared/` is imported by all three processes, and `preload.ts` is the only bridge between them.
A mistake here is invisible until runtime, because Electron will happily let a channel exist on one
side and not the other.

- **`src/shared/` must stay process-agnostic.** No `electron` import, no `node:*`, no DOM globals —
  types and pure functions only. Anything that needs a process is in the wrong folder.
- **Adding a channel is a four-step change, in this order:** declare it in `IpcChannel` with its
  payload and result types in `shared/ipc.ts` → implement the handler in `src/main/ipc.ts` →
  expose it on the `WorkestratorApi` object in `preload.ts` → use it in the renderer. Do all four
  in the same change.
- **`preload.ts` exposes the `api` object and nothing else.** Never pass `ipcRenderer`, a raw
  Electron object, or a function that takes a channel name from the renderer across the bridge.
- **Push channels wrap the listener.** A renderer callback cannot be handed to `ipcRenderer`
  directly; wrap it, register with `.on`, and return a disposer that calls `.off`.
- **Changing an existing payload type is a breaking change** across three files — update all of
  them, and check the reducer and selectors that consume it.
