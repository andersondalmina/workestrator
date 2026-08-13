# Workestrator

![Workestrator](doc/hero.png)

Workestrator is a desktop app that turns your open pull requests into a board, and lets you dispatch an AI agent to review them or fix review comments — right in a git worktree of your own machine.

## What it does

- **Board view** — every open pull/merge request across your saved projects, pulled straight from `gh` and `glab`, laid out as cards you can act on.
- **Agent settings** — pick an [opencode](https://opencode.ai) agent for each board action: **Reviewer** (review PRs) and **Fixed** (fix review comments).
- **One-click reviews** — starting a review checks the pull request out into its own git worktree and runs your chosen Reviewer agent, streaming the result back live.
- **Local history** — every review is recorded in a local SQLite database, so you can revisit what the agent said, cancel a run in progress, or pick up where you left off.
- **No hosted backend** — the app shells out to CLIs you already have installed and authenticated (`gh`, `glab`, `git`, `opencode`); nothing leaves your machine except what those tools do.

## Requirements

- macOS, Windows, or Linux
- [Node.js](https://nodejs.org/) and npm
- [`gh`](https://cli.github.com/) and/or [`glab`](https://gitlab.com/gitlab-org/cli), signed in to the platforms your projects live on
- [`opencode`](https://opencode.ai) installed and configured with at least one primary agent, for running reviews

## Getting started

```bash
npm install
npm start
```

This launches the app in development mode via Electron Forge.

## Usage

1. Open **Add project** and pick a local git repository — its name and remote are read from the folder itself.
2. Workestrator fetches its open pull/merge requests and lists them on the board.
3. In **Settings**, pick an OpenCode agent for **Reviewer** and/or **Fixed**.
4. Click a card's review action to check the pull request out into its own worktree and set the agent loose. Progress and results show up in the task panel as the review runs.

## Scripts

| Command                                   | Description                                 |
| ----------------------------------------- | ------------------------------------------- |
| `npm start`                               | Run the app in development mode             |
| `npm run package`                         | Package the app without building installers |
| `npm run make`                            | Build platform installers                   |
| `npm run publish`                         | Publish a build                             |
| `npm run lint` / `npm run lint:fix`       | Lint the codebase                           |
| `npm run format` / `npm run format:check` | Format the codebase with Prettier           |

## Tech stack

Electron, React 19, TypeScript, Vite, Tailwind CSS, and Electron Forge — with `node:sqlite` for local storage, so there's no native module to rebuild.

## License

MIT
