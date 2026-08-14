#!/usr/bin/env node
/**
 * Stop hook: makes "I'm done" mean "the checks pass".
 *
 * The PostToolUse hook lints one file at a time, which catches a typo but not
 * a change that type-checks alone and breaks a test three modules away. This
 * runs the same checks CI runs, at the moment the agent tries to hand back,
 * and feeds any failure to it as something still to fix.
 *
 * Nothing here blocks twice: `stop_hook_active` marks a turn the agent is
 * already continuing because of this hook, and a second block on the same
 * finding would be a loop rather than a signal.
 */

import { execSync } from "node:child_process";

/** How much of a failure to hand back. Enough to act on, not a whole log. */
const MAX_OUTPUT = 4000;

const readStdin = async () => {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
};

const run = (command, cwd) =>
  execSync(command, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

try {
  const payload = JSON.parse((await readStdin()) || "{}");
  const root = payload?.cwd ?? process.cwd();

  // Already continuing from this hook — say nothing rather than loop.
  if (payload?.stop_hook_active) process.exit(0);

  // A turn that changed no tracked file has nothing to verify.
  const dirty = run("git status --porcelain", root).trim();
  if (!dirty) process.exit(0);

  try {
    run("npm run check", root);
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim().slice(-MAX_OUTPUT);

    process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason:
          `\`npm run check\` fails, so this change is not finished yet. Fix the cause — ` +
          `do not skip the test or silence the rule — then run \`make check\` again.\n\n${output}`,
      }),
    );
  }
} catch {
  // Fail open — a broken verifier must not trap the agent mid-session.
}

process.exit(0);
