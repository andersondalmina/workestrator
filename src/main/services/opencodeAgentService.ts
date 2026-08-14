/**
 * Listing the OpenCode agents the user has configured. The CLI prints them as
 * human-readable blocks rather than JSON, so this module runs the command and
 * parses the headers out.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { OpencodeAgent } from "../../shared/ipc";
import { searchPath } from "./cliPath";

const run = promisify(execFile);

const TIMEOUT_MS = 20_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

/** Matches a header line like `code-reviewer (primary)`. */
const AGENT_HEADER = /^(\S+)\s+\((primary|subagent)\)$/;

/**
 * Reads agent names and types from `opencode agent list` output. Each agent
 * starts with a header line; the JSON permission block that follows is skipped.
 */
export function parseAgentList(stdout: string): OpencodeAgent[] {
  const agents: OpencodeAgent[] = [];

  for (const line of stdout.split("\n")) {
    const match = AGENT_HEADER.exec(line.trim());
    if (!match) continue;

    const [, name, type] = match;
    if (type === "primary") {
      agents.push({ name, type: "primary" });
    }
  }

  return agents;
}

/** Every primary OpenCode agent the user has configured. */
export async function listOpencodeAgents(): Promise<OpencodeAgent[]> {
  try {
    const { stdout } = await run("opencode", ["agent", "list"], {
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
      env: { ...process.env, PATH: searchPath() },
    });
    return parseAgentList(stdout);
  } catch (error) {
    const failed = error as NodeJS.ErrnoException;
    if (failed.code === "ENOENT") {
      throw new Error("Listing agents needs the opencode CLI — install it from opencode.ai");
    }
    throw error;
  }
}
