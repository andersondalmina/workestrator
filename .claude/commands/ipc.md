---
description: Add or change an IPC channel across all three processes
argument-hint: [what the channel should do]
---

Add or change the IPC channel for: $ARGUMENTS

Follow `.github/instructions/ipc-contract.instructions.md`. All four steps land in one change, in
this order — skipping one lets the two sides drift, which is the whole reason the contract exists:

1. **`src/shared/ipc.ts`** — declare the channel on `IpcChannel`, with its payload and result
   types. This file stays process-agnostic: no `electron`, no `node:*`, no DOM.
2. **`src/main/ipc.ts`** — implement the handler. Validate the payload, then delegate to a service
   in `src/main/services/`; handlers stay thin.
3. **`src/preload/preload.ts`** — expose it on the `WorkestratorApi` object. A push channel wraps
   the renderer's callback and returns a disposer that calls `.off`.
4. **The renderer** — use it through `window.workestrator`, never `ipcRenderer`. If a subscription
   is involved, return its disposer from the `useEffect`.

Cover the new service behaviour with a test next to it, then run `make check`.
