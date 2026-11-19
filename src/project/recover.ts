/**
 * The Graveyard, read and undone: what is in it, and bringing a project back.
 *
 * Recovering is the inverse of `deleteProject` (`delete.ts`) and is made of the
 * same one safe step: **`moveFolder`, one atomic rename that never replaces
 * anything.** The bundle goes back, whole and unchanged, into the default
 * location, and is listed again with its id, its manuscript and everything
 * beside it as they were (ADR-0044, *Recovering a project*).
 *
 * Its folder keeps its name, unless a project of that name has been made since
 * — then it comes back as "Title 2", as a second delete or import would. A
 * folder in the projects folder is never replaced, merged into or touched.
 *
 * Only what is a project is listed: a folder in the Graveyard with a readable
 * `project.md`. Anything else there — loose files, a `Deleted Projects` folder
 * brought in whole, a project whose marker will not read — is left exactly
 * where it is, for the writer's file manager.
 */
import { basename, join, type Filesystem } from "./filesystem.ts";
import { folderNameFor, MARKER_FILE, type Project } from "./bundle.ts";
import { graveyardIn } from "./delete.ts";
import { readMarker } from "./projects.ts";

/** Thrown for a recovery that was refused; its message is for the writer. Nothing moved. */
export class CannotRecover extends Error {}

/** How many times a name in the projects folder is tried, as `deleteProject` does. */
const ATTEMPTS = 5;

/**
 * Every project in the Graveyard, by name without case. A Graveyard that is not
 * there yet is an empty one.
 */
export async function listGraveyard(filesystem: Filesystem, projectsDirectory: string): Promise<readonly Project[]> {
  const graveyard = graveyardIn(projectsDirectory);
  const buried: Project[] = [];
  for (const entry of await filesystem.readDirectory(graveyard)) {
    if (!entry.isDirectory || entry.name.startsWith(".")) continue;
    const path = join(graveyard, entry.name);
    const marker = await readMarker(filesystem, path);
    if (typeof marker === "string") continue;
    buried.push({ path, marker });
  }
  return buried.sort(
    (one, other) =>
      one.marker.name.localeCompare(other.marker.name, "en", { sensitivity: "base" }) ||
      basename(one.path).localeCompare(basename(other.path)),
  );
}

/**
 * Check that the project the writer pointed at is the one in the Graveyard now:
 * directly inside it, and holding the same project id. Anything else is refused.
 */
export async function confirmBuried(filesystem: Filesystem, projectsDirectory: string, project: Project): Promise<void> {
  const name = basename(project.path);
  if (name === "" || name.startsWith(".") || project.path !== join(graveyardIn(projectsDirectory), name)) {
    throw new CannotRecover(`“${project.marker.name}” is not in the Graveyard, so it has been left alone.`);
  }
  const marker = await readMarker(filesystem, project.path);
  if (typeof marker === "string" || marker.projectId !== project.marker.projectId) {
    throw new CannotRecover(
      `“${project.marker.name}” has changed on disk since the Graveyard was read, so it has been left alone.`,
    );
  }
}

/**
 * Move a project out of the Graveyard and back into the projects folder, and
 * answer the project as it now is.
 */
export async function recoverProject(
  filesystem: Filesystem,
  projectsDirectory: string,
  project: Project,
): Promise<Project> {
  await confirmBuried(filesystem, projectsDirectory, project);

  const name = basename(project.path);
  for (let attempt = 1; ; attempt++) {
    const taken = new Set((await filesystem.readDirectory(projectsDirectory)).map((entry) => entry.name));
    const to = join(projectsDirectory, folderNameFor(name, taken));
    try {
      await filesystem.moveFolder(project.path, to);
      return { path: to, marker: project.marker };
    } catch (error) {
      // The name was taken a moment after it was chosen, and the project is
      // still in the Graveyard: choose again. Anything else is the answer.
      const raced =
        attempt < ATTEMPTS &&
        (await filesystem.exists(to)) &&
        (await filesystem.exists(join(project.path, MARKER_FILE)));
      if (!raced) throw error;
    }
  }
}
