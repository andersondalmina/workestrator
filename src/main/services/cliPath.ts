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
