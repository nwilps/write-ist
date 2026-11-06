/**
 * Deleting a project — which is **moving it, never erasing it**.
 *
 * The bundle goes, whole and unchanged, into the deleted folder:
 * `~/Documents/write-ist/Deleted Projects/` (`DELETED_FOLDER`). It leaves the
 * projects list because the list reads only the top of the default location
 * (`projects.ts`), and it comes back the same way it went: move its folder
 * back out of `Deleted Projects` into `write-ist`, and it is listed again with
 * its id, its manuscript and everything beside it as they were.
 *
 * **Nothing here can lose a word.** The only call that changes the disk is
 * `moveFolder`, one atomic rename that never replaces anything and refuses to
 * cross disks rather than copy and delete. There is no recursive delete
 * anywhere on this path, and no fallback to one. A move that fails leaves the
 * project where it was.
 */
import { basename, join, type Filesystem } from "./filesystem.ts";
import { DELETED_FOLDER, folderNameFor, MARKER_FILE, type Project } from "./bundle.ts";
import { confirmProject } from "./projects.ts";

/** Thrown for a delete that was refused; its message is for the writer. Nothing moved. */
export class CannotDelete extends Error {}

/** `~/Documents/write-ist/Deleted Projects/`, for the default location given. */
export function deletedFolderIn(projectsDirectory: string): string {
  return join(projectsDirectory, DELETED_FOLDER);
}

/**
 * How many times a name in the deleted folder is tried. More than one only
 * when something else takes the name between choosing it and moving there.
 */
const ATTEMPTS = 5;

/**
 * Move a project into the deleted folder, and answer where it went.
 *
 * Its folder keeps its name there; one already of that name — the same title
 * deleted twice — makes this one "Title 2", as two imports would. A folder
 * already in the deleted folder is never replaced, merged into or touched.
 */
export async function deleteProject(
  filesystem: Filesystem,
  projectsDirectory: string,
  project: Project,
): Promise<string> {
  await confirmProject(filesystem, projectsDirectory, project, CannotDelete);

  const deleted = deletedFolderIn(projectsDirectory);
  // A project someone named `Deleted Projects` before the name was kept for
  // this: putting bundles inside it would bury them in another project.
  const held = await filesystem.readDirectory(deleted);
  if (held.some((entry) => entry.name === MARKER_FILE)) {
    throw new CannotDelete(
      `“${DELETED_FOLDER}” in your projects folder is itself a project, so nothing can be moved into it. ` +
        `Rename that project first. “${project.marker.name}” has not been moved.`,
    );
  }
  await filesystem.createDirectory(deleted);

  const name = basename(project.path);
  for (let attempt = 1; ; attempt++) {
    const taken = new Set((await filesystem.readDirectory(deleted)).map((entry) => entry.name));
    const to = join(deleted, folderNameFor(name, taken));
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
