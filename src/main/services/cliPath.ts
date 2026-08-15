/**
 * Finding the command line tools the app shells out to. A packaged app is
 * launched by the OS rather than from a shell, so it does not inherit the
 * user's PATH and would not find `gh`, `glab` or `opencode` in, say,
 * Homebrew's directory without this.
 */

import path from "node:path";

/** Where package managers put CLIs. */
const CLI_DIRECTORIES = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  ...(process.env.HOME ? [path.join(process.env.HOME, ".local", "bin")] : []),
];

/** The inherited PATH first, so a CLI the user installed elsewhere still wins. */
export function searchPath(): string {
  const inherited = process.env.PATH?.split(path.delimiter) ?? [];
  const extra = CLI_DIRECTORIES.filter((directory) => !inherited.includes(directory));
  return [...inherited, ...extra].join(path.delimiter);
}

/**
 * What git reads instead of looking around the folder it was run in. Git sets
 * these for the commands it runs itself — a hook, a rebase, an editor — and any
 * of them in the app's own environment sends every `git` call it makes to that
 * repository rather than the one it was pointed at, whatever `cwd` says.
 */
const GIT_LOCATION_VARIABLES = [
  "GIT_DIR",
  "GIT_COMMON_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
  "GIT_CEILING_DIRECTORIES",
];

/**
 * The environment a CLI this app spawns should see: the user's, with the CLIs
 * findable and nothing left in it that would answer "which repository?" on the
 * folder's behalf.
 */
export function commandEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: searchPath() };
  for (const name of GIT_LOCATION_VARIABLES) delete env[name];
  return env;
}
