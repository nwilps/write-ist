/**
 * Deleting a project — which is **moving it, never erasing it**.
 *
 * The bundle goes, whole and unchanged, into the Graveyard:
 * `~/Documents/write-ist/Graveyard/` (`GRAVEYARD_FOLDER`). It leaves the
 * projects list because the list reads only the top of the default location
 * (`projects.ts`), and it comes back the same way it went: move its folder
 * back out of `Graveyard` into `write-ist`, and it is listed again with its
 * id, its manuscript and everything beside it as they were.
 *
 * **Nothing here can lose a word.** What changes the disk is `moveFolder`, one
 * atomic rename that never replaces anything and refuses to cross disks rather
 * than copy and delete, and `removeEmptyFolder`, which cannot remove a folder
 * with anything in it. There is no recursive delete anywhere on this path, and
 * no fallback to one. A move that fails leaves the project where it was.
 */
import { basename, join, type Filesystem } from "./filesystem.ts";
import { FORMER_GRAVEYARD_FOLDER, folderNameFor, GRAVEYARD_FOLDER, MARKER_FILE, type Project } from "./bundle.ts";
import { confirmProject } from "./projects.ts";

/** Thrown for a delete that was refused; its message is for the writer. Nothing moved. */
export class CannotDelete extends Error {}

/** `~/Documents/write-ist/Graveyard/`, for the default location given. */
export function graveyardIn(projectsDirectory: string): string {
  return join(projectsDirectory, GRAVEYARD_FOLDER);
}

/**
 * How many times a name in the Graveyard is tried. More than one only
 * when something else takes the name between choosing it and moving there.
 */
const ATTEMPTS = 5;

/**
 * Move a project into the Graveyard, and answer where it went.
 *
 * Its folder keeps its name there; one already of that name — the same title
 * deleted twice — makes this one "Title 2", as two imports would. A folder
 * already in the Graveyard is never replaced, merged into or touched.
 */
export async function deleteProject(
  filesystem: Filesystem,
  projectsDirectory: string,
  project: Project,
): Promise<string> {
  await confirmProject(filesystem, projectsDirectory, project, CannotDelete);

  const graveyard = graveyardIn(projectsDirectory);
  // A project someone named `Graveyard` before the name was kept for this:
  // putting bundles inside it would bury them in another project.
  const held = await filesystem.readDirectory(graveyard);
  if (held.some((entry) => entry.name === MARKER_FILE)) {
    throw new CannotDelete(
      `“${GRAVEYARD_FOLDER}” in your projects folder is itself a project, so nothing can be moved into it. ` +
        `Rename that project first. “${project.marker.name}” has not been moved.`,
    );
  }
  await filesystem.createDirectory(graveyard);

  const name = basename(project.path);
  for (let attempt = 1; ; attempt++) {
    const taken = new Set((await filesystem.readDirectory(graveyard)).map((entry) => entry.name));
    const to = join(graveyard, folderNameFor(name, taken));
    try {
      await filesystem.moveFolder(project.path, to);
      return to;
    } catch (error) {
      // The name was taken a moment after it was chosen, and the project is
      // still where it was: choose again. Anything else is the answer.
      const raced =
        attempt < ATTEMPTS &&
        (await filesystem.exists(to)) &&
        (await filesystem.exists(join(project.path, MARKER_FILE)));
      if (!raced) throw error;
    }
  }
}

/**
 * Bring a `Deleted Projects` folder, from before the Graveyard had its name,
 * into the Graveyard. Safe to run again: stopped part way, the next run finishes.
 *
 * With no Graveyard yet the folder is simply renamed. With one, each folder in
 * it moves across, numbered if the name is taken, and the emptied folder goes.
 * Loose files cannot be moved one by one, so whatever is left travels in the
 * old folder, which then sits inside the Graveyard.
 *
 * A `project.md` at the top of either folder makes it a project, not this: it
 * is left alone, and so is everything else until it is renamed.
 */
export async function moveDeletedProjectsToGraveyard(
  filesystem: Filesystem,
  projectsDirectory: string,
): Promise<void> {
  const entries = await filesystem.readDirectory(projectsDirectory);
  if (!entries.some((entry) => entry.name === FORMER_GRAVEYARD_FOLDER && entry.isDirectory)) return;

  const former = join(projectsDirectory, FORMER_GRAVEYARD_FOLDER);
  const held = await filesystem.readDirectory(former);
  if (held.some((entry) => entry.name === MARKER_FILE)) return;

  const graveyard = graveyardIn(projectsDirectory);
  if (!(await filesystem.exists(graveyard))) {
    await filesystem.moveFolder(former, graveyard);
    return;
  }

  const already = await filesystem.readDirectory(graveyard);
  if (already.some((entry) => entry.name === MARKER_FILE)) return;
  const taken = new Set(already.map((entry) => entry.name));
  for (const entry of held) {
    if (!entry.isDirectory) continue;
    const name = folderNameFor(entry.name, taken);
    await filesystem.moveFolder(join(former, entry.name), join(graveyard, name));
    taken.add(name);
  }

  if ((await filesystem.readDirectory(former)).length === 0) {
    await filesystem.removeEmptyFolder(former);
  } else {
    await filesystem.moveFolder(former, join(graveyard, folderNameFor(FORMER_GRAVEYARD_FOLDER, taken)));
  }
}
