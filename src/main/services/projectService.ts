/**
 * The project use cases: what the app does when you add or list a project.
 * The IPC layer only forwards to these, and only this module knows that
 * adding a project means picking a folder, reading it as a repository and
 * storing the result.
 */

import { dialog, type BrowserWindow, type OpenDialogOptions } from "electron";
import { parseRepositoryLink } from "../../shared/repoUrl";
import type { StoredProject } from "../../shared/ipc";
import { createProject, deleteProject, listProjects } from "../db";
import { readRepository } from "./gitService";

const PICKER: OpenDialogOptions = {
  title: "Select a project folder",
  buttonLabel: "Add project",
  properties: ["openDirectory"],
};

/** Every saved project, oldest first. */
export function getProjects(): StoredProject[] {
  return listProjects();
}

/**
 * The hosts the saved projects live on, e.g. `gitlab.acme.dev`. Adding a
 * project is what makes its host one the app will open links on.
 */
export function projectHosts(): Set<string> {
  const hosts = listProjects().flatMap((project) => {
    const parsed = parseRepositoryLink(project.repositoryLink);
    return parsed ? [parsed.host] : [];
  });
  return new Set(hosts);
}

/**
 * Forgets a project. Only the app's own record goes away: the repository on
 * disk is left untouched, so the same folder can be added again later.
 */
export function removeProject(id: number): void {
  deleteProject(id);
}

/**
 * Asks the OS for a folder and saves it as a project. Resolves to `null` when
 * the picker was dismissed, and rejects with a message for the user when the
 * folder is not a git repository or is already tracked.
 */
export async function addProjectFromDirectory(
  parent: BrowserWindow | null,
): Promise<StoredProject | null> {
  const directory = await pickDirectory(parent);
  if (!directory) return null;

  const repository = await readRepository(directory);
  return createProject(repository.name, toRepositoryLink(repository.remoteUrl), repository.root);
}

/** `null` when the user closed the picker without choosing a folder. */
async function pickDirectory(parent: BrowserWindow | null): Promise<string | null> {
  const result = parent
    ? await dialog.showOpenDialog(parent, PICKER)
    : await dialog.showOpenDialog(PICKER);

  return result.canceled ? null : (result.filePaths[0] ?? null);
}

/**
 * Normalises a remote to the repository's own https URL, so a repository
 * cloned over SSH and one cloned over https are recognised as the same
 * project. Remotes we cannot parse are stored as git reported them.
 */
function toRepositoryLink(remoteUrl: string): string {
  return parseRepositoryLink(remoteUrl)?.url ?? remoteUrl;
}
