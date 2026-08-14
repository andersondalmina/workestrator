---
name: main-process
description: Non-negotiables for the Electron main process — IPC handlers, SQLite access, and spawning external CLIs.
applyTo: "src/main/**/*.ts"
---

# Main process rules

The main process is the only side with real privileges. Everything here can read the user's disk,
their git repositories and their authenticated CLIs, so treat it as the trust boundary it is.

- **Spawn, never shell out.** Use `spawn`/`execFile` with an argument array. Never build a command
  string from a branch name, path, PR title or anything else that came from a remote — one
  backtick in a PR title becomes shell execution.
- **Resolve CLIs through `services/cliPath.ts`.** Don't assume `gh`, `glab`, `git` or `opencode` are
  on the `PATH` an Electron GUI process inherits; they usually aren't.
- **All SQL lives in `db.ts`.** Services call `db.ts` functions, not the database. Use prepared
  statements with bound parameters, never interpolated SQL. Rows are `snake_case` and get mapped to
  the `camelCase` types from `src/shared/ipc.ts` before leaving the module.
- **Schema changes are additive.** The SQLite file is the user's local history; adding a column or a
  table is fine, renaming or dropping one destroys their data.
- **IPC handlers in `ipc.ts` stay thin** — validate the payload, delegate to a service, return a
  typed result. A handler that grows logic belongs in `services/`.
- **Long-running agent runs must stay cancellable.** Anything spawned for a review needs its child
  process tracked so `CancelReview` can actually kill it, and its cleanup must run on both the
  success and failure path.
- **Never import from `src/renderer/`.** Shared types come from `src/shared/`.
- Cover new service behaviour with a `*.test.ts` next to it; these run under Vitest with no DOM.
