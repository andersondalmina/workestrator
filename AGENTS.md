# AGENTS.md

Instructions for AI coding agents working in this repository. Humans should read
[README.md](README.md) first — this file covers what an agent needs to change code safely.

## Project overview

Workestrator is an **Electron desktop app** that turns open pull/merge requests into a board and
dispatches [opencode](https://opencode.ai) agents to review them or fix review comments, each in its
own git worktree.

There is **no backend**. The app shells out to CLIs the user already has installed and
authenticated: `gh`, `glab`, `git`, `opencode`. State lives in a local SQLite file via `node:sqlite`
(bundled with Electron's Node runtime — there is no native module to rebuild).

Stack: Electron + Electron Forge, React 19, TypeScript (strict), Vite, Tailwind CSS v4, Vitest.

## Commands

Every check below is also a `make` target. Prefer `make check` before handing work back.

| Command             | What it does                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `make check`        | format-check + lint + typecheck + test — run this                                            |
| `make test`         | Vitest, single run (`npm test`)                                                              |
| `make lint`         | ESLint over the repo                                                                         |
| `make lint-fix`     | ESLint with `--fix`                                                                          |
| `make typecheck`    | `tsc --noEmit`                                                                               |
| `make format`       | Prettier, writes changes                                                                     |
| `make format-check` | Prettier in check mode (what CI runs)                                                        |
| `make run`          | Launch the app in dev mode — **do not run this yourself**, it opens a window and never exits |
| `make build`        | Build platform installers                                                                    |

Node 22+ is required (`node:sqlite`). Install with `npm ci`.

## Releasing

A release is a tag push, and the tag is the source of truth. Nothing bumps the version for you.

1. Bump `version` in `package.json` on a branch and open a pull request — the same guardrail applies
   here as everywhere else, so the bump lands on `main` through review.
2. Tag the merge commit and push the tag:

   ```bash
   git tag v0.2.0 && git push origin v0.2.0
   ```

[`release.yml`](.github/workflows/release.yml) then refuses the run if the tag and `package.json`
disagree, re-runs `make check`, builds on macOS, Windows and Linux, and attaches the installers to a
GitHub release. A tag with a hyphen in it (`v0.2.0-beta.1`) is published as a prerelease.

Builds are unsigned; the release notes tell users how to get past Gatekeeper and SmartScreen.

## Architecture

Three processes, and the boundary between them is the thing to respect:

- **`src/main/`** — the Electron main process. The only place allowed to touch the filesystem, the
  database, or spawn CLIs.
  - `main.ts` / `window.ts` — app lifecycle and the browser window.
  - `ipc.ts` — registers one handler per `IpcChannel`. Handlers stay thin; logic lives in services.
  - `db.ts` — all SQL. Rows use `snake_case` columns and are mapped to `camelCase` domain types at
    this boundary; nothing outside `db.ts` sees a raw row.
  - `services/` — the real work: `gitService` (worktrees), `pullRequestService` (`gh`/`glab`),
    `reviewAgent` + `reviewService` (running opencode and streaming its events),
    `agentSettingsService`, `opencodeAgentService`, `cliPath`.
- **`src/preload/preload.ts`** — the context bridge. Exposes exactly the `WorkestratorApi` object
  and nothing else. Push channels are wrapped here so the renderer hands over a plain callback and
  gets an unsubscribe function back.
- **`src/renderer/`** — React UI. No Node APIs, no `electron` imports; it talks only through
  `window.workestrator`.
  - `store/` — `WorkspaceProvider` + `workspaceReducer` + `selectors` hold app state.
  - `components/` grouped by surface (`board/`, `panel/`, `settings/`, `composer/`, `ui/`).
- **`src/shared/`** — types and constants imported by all three sides: `ipc.ts` (the channel +
  payload contract), `agentEvent.ts`, `repoUrl.ts`. Must stay free of process-specific imports.

## Conventions

- **IPC changes go through `src/shared/ipc.ts` first.** Add the channel to `IpcChannel` and its
  payload types there, then implement the main-process handler, then expose it in `preload.ts`, then
  use it in the renderer. Skipping a step lets the two sides drift, which is exactly what that file
  exists to prevent.
- **TypeScript is strict**, with `noUnusedLocals` and `noUnusedParameters`. Do not add `any` or
  `@ts-expect-error` to get past a type error; fix the type. Prefix a genuinely unused binding with
  `_`.
- **Never invoke a CLI by string concatenation.** Spawn with an argument array so branch names,
  paths and PR titles cannot become shell syntax.
- **Formatting is Prettier's job** (100 cols, double quotes, semicolons, trailing commas). Do not
  hand-format; run `make format`.
- Comments explain _why_, not _what_. Match the density and voice of the file you're editing.
- Tests live next to their subject as `*.test.ts` and run under Vitest with no DOM environment, so
  they cover main-process services and shared logic. When you change a service, extend its test.

## Guardrails

- Do not commit or push unless asked. If asked, branch first — never commit straight to `main`.
- Do not add a dependency without saying why a stdlib or existing dependency won't do; keep the app
  free of native modules.
- Do not weaken a check (skipping a test, adding an ESLint disable, loosening `tsconfig`) to make a
  build pass. Fix the cause or report the blocker.
- Never write user secrets, tokens, or absolute paths from the developer's machine into the repo.
- The database schema in `db.ts` is created and migrated in place. Changing an existing column will
  break users' local data — add, don't rewrite.

## The harness

The guardrails above are enforced, not just written down, and the same rules apply whichever agent
you are. Both toolchains read **this file** and the path-scoped rules in `.github/instructions/`.

Everything an agent _reads_ is markdown; everything that _enforces_ is declarative data. There is
one script in the whole harness, and it exists only because its job cannot be expressed as data.

| Layer                | Claude Code                                             | opencode                                         |
| -------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| Rules                | `AGENTS.md` (via `CLAUDE.md`) + `.github/instructions/` | `AGENTS.md` + `instructions` in `opencode.json`  |
| Destructive commands | `permissions` in `.claude/settings.json`                | `permission.bash` in `opencode.json`             |
| Format on edit       | husky + lint-staged, then CI                            | built-in formatter (picks up Prettier)           |
| Verify before done   | `.claude/hooks/verify-done.mjs` (Stop)                  | — (pre-commit and CI)                            |
| Commands             | `.claude/commands/`                                     | `.opencode/commands` → symlink to the same files |
| Agents               | —                                                       | `.opencode/agents/` (`reviewer`, `fixer`)        |

Two things follow from this:

- **The command guard will stop you**, and it is not a suggestion. Recursive deletes, `git reset
--hard`, force pushes, `git clean` and `chmod 777` are denied; pushing, committing, adding a
  dependency and anything that writes to GitHub or GitLab will ask. `rm one-file.txt` is fine.
- **Finishing means the checks pass.** The Stop hook runs `make check` when you try to hand work
  back with a dirty tree, and returns the failure to you rather than letting it through.

### Keeping the two guards in step

The rule lists in `.claude/settings.json` and `opencode.json` cover the same ground, but **they
resolve matches by opposite rules**, so never copy an edit from one to the other without
rearranging it:

- **Claude Code** evaluates `deny`, then `ask`, then `allow`, and the first list to match wins.
  Order _within_ a list is irrelevant, and a narrower `allow` can never carve an exception out of a
  broader `deny` or `ask`.
- **opencode** evaluates a single flat table where the **last** matching pattern wins. The file is
  therefore ordered allow → ask → deny on purpose: putting a deny above an ask silently downgrades
  it, which is a bug this file has had once already.

Both use glob patterns, where a trailing ` *` enforces a word boundary — `rm -r *` matches `rm -r`
and `rm -r x` but not `rm -rf`, which is why the flag spellings are enumerated separately. Neither
matcher catches `--force` written as `--force-with-lease`, which is deliberate: that form refuses
to overwrite work it has not seen, so it only asks.

Two deliberate gaps, so nobody "fixes" them by mistake: a bare `npm install` prompts even though it
only restores the lockfile (an `ask` cannot be carved out), and there is no rule for `rm` with a
wildcard, because the pattern language has no way to say "contains a literal `*`". Use `npm ci`.

### Commands and agents

`.opencode/commands` is a symlink to `.claude/commands`, so `/check` and `/ipc` are one markdown
file each rather than two copies to keep in step. Git tracks the symlink, but a Windows clone with
`core.symlinks=false` will check it out as a text file and opencode will simply not find the
commands — a degradation, not a breakage. Replace it with copies if that becomes a nuisance.

`.opencode/agents/reviewer.md` and `fixer.md` are this repository reviewing itself: they are the
agents Workestrator's own **Reviewer** and **Fixed** board actions can be pointed at.
