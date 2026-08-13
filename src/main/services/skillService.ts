/**
 * The skill use cases: what the app does when the user writes a skill of their
 * own and puts it behind one of the board actions. The IPC layer only forwards
 * to these, and only this module knows what makes a skill worth storing.
 */

import type {
  AgentSkillDraft,
  SkillAction,
  SkillAssignments,
  StoredAgentSkill,
} from "../../shared/ipc";
import {
  createAgentSkill,
  deleteAgentSkill,
  getSkillAssignments,
  listAgentSkills,
  setSkillAssignment,
  updateAgentSkill,
} from "../db";

/** Keeps a runaway paste from filling a card or a select with prose. */
const MAX_NAME = 60;
const MAX_DESCRIPTION = 200;
const MAX_COMMAND = 2000;

/** Every skill the user wrote, oldest first. */
export function getAgentSkills(): StoredAgentSkill[] {
  return listAgentSkills();
}

/**
 * Creates a skill, or rewrites the one the draft carries an id for. Rejects
 * with a message for the user when the name is missing or already taken.
 */
export function saveAgentSkill(draft: AgentSkillDraft): StoredAgentSkill {
  const name = clamp(draft.name, MAX_NAME);
  if (!name) throw new Error("A skill needs a name");

  const description = clamp(draft.description, MAX_DESCRIPTION);
  const command = clamp(draft.command, MAX_COMMAND);
  if (!command) throw new Error("A skill needs something to run");

  return draft.id === undefined
    ? createAgentSkill(name, description, command)
    : updateAgentSkill(draft.id, name, description, command);
}

/**
 * Forgets a skill. Deleting one that is already gone is a no-op, and whatever
 * board action was running it is left with none rather than a dangling id.
 */
export function removeAgentSkill(id: number): void {
  deleteAgentSkill(id);
}

/** Which skill each board action runs. */
export function getAssignments(): SkillAssignments {
  return getSkillAssignments();
}

/** Puts a skill behind a board action, or clears it with `null`. */
export function assignSkill(action: SkillAction, skillId: number | null): void {
  setSkillAssignment(action, skillId);
}

function clamp(value: string, limit: number): string {
  return value.trim().slice(0, limit);
}
