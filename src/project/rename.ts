/**
 * Renaming a project: its folder and the name in its `project.md`, together.
 *
 * A project's name is its folder's name (`create.ts`, `import.ts`), so a
 * rename is both: the folder moves to the new name, and the marker's heading
 * is rewritten to match. **The manuscript is not touched** — its title page
 * is the writer's words (ADR-0020), and the project's name was never read from
 * it. The id does not change (ADR-0015): it is the same project, called
 * something else.
 *
 * A name already taken is **refused, never numbered**. Create and import give
 * a duplicate "Title 2" because the writer asked for a new project; here they
 * asked for one name in particular, and quietly giving them another is not
 * what they asked. Nothing is ever replaced either way: the move is
 * `moveFolder`, which fails rather than land on anything.
 */
import { basename, join, type Filesystem } from "./filesystem.ts";
import { cleanFolderName, DELETED_FOLDER, MARKER_FILE, type Project } from "./bundle.ts";
import { serialiseMarker } from "./marker.ts";
import { confirmProject } from "./projects.ts";
import { message } from "../message.ts";

/** Thrown for a rename that was refused or undone; its message is for the writer. */
export class CannotRename extends Error {}

/**
 * Give a project a new name, and answer the project as it now is.
 *
 * The name is made safe for the disk as a new project's title is — `A/B`
 * becomes `A B` — and that is the name the list shows, as it does for one
 * made new. Answering the same name changes nothing on disk.
 */
export async function renameProject(
  filesystem: Filesystem,
  projectsDirectory: string,
  project: Project,
  newName: string,
): Promise<Project> {
  const typed = newName.replace(/\s+/g, " ").trim();
  if (typed === "") throw new CannotRename("A project needs a name.");
  const folder = cleanFolderName(typed);
  // A folder whose name starts with a dot is hidden, and the list never shows one.
  if (folder.startsWith(".")) {
    throw new CannotRename("A name that starts with a dot would hide the project. Choose another name.");
  }
  if (folder.toLowerCase() === DELETED_FOLDER.toLowerCase()) {
    throw new CannotRename(`“${DELETED_FOLDER}” is where deleted projects go. Choose another name.`);
  }

  await confirmProject(filesystem, projectsDirectory, project, CannotRename);
  const current = basename(project.path);
  if (folder === current && project.marker.name === folder) return project;

  // Compared without case, as `folderNameFor` compares: two names differing
  // only in case are one folder on macOS and Windows. The project's own
  // folder does not count, so a rename that only changes case is allowed.
  const clash = (await filesystem.readDirectory(projectsDirectory)).find(
    (entry) => entry.name !== current && entry.name.toLowerCase() === folder.toLowerCase(),
  );
  if (clash !== undefined) {
    throw new CannotRename(
      `There is already something called “${clash.name}” in your projects folder. Choose another name.`,
    );
  }

  const path = join(projectsDirectory, folder);
  const moved = path !== project.path;
  if (moved) await filesystem.moveFolder(project.path, path);

  const marker = { ...project.marker, name: folder };
  try {
    await filesystem.writeFile(join(path, MARKER_FILE), new TextEncoder().encode(serialiseMarker(marker)));
  } catch (error) {
    // Half a rename is a folder and a marker that disagree. Put the folder
    // back, so that a failure is a rename that did not happen at all.
    if (!moved) throw error;
    try {
      await filesystem.moveFolder(path, project.path);
    } catch {
      throw new CannotRename(
        `The folder is now called “${folder}”, but its project.md could not be updated, so the list may ` +
          `still show “${project.marker.name}”. Nothing in it was lost. ${message(error)}`,
      );
    }
    throw error;
  }
  return { path, marker };
}
