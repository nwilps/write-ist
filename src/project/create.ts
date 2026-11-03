/**
 * Creating a project from nothing: an empty screenplay in a new bundle.
 *
 * The sibling of import (`import.ts`), minus the file: the same bundle, the same
 * marker, the same order of writes (manuscript first, marker last — a crash
 * between them leaves a folder that is not a bundle, ADR-0015). The id is
 * minted by the caller's `newProjectId`, as import's is.
 */
import { exportScreenplay, importScreenplay } from "../screenplay/import.ts";
import { join } from "./filesystem.ts";
import {
  folderNameFor,
  MANUSCRIPT_FILE,
  MARKER_FILE,
  type Project,
} from "./bundle.ts";
import type { ImportDependencies } from "./import.ts";
import {
  FORMAT_VERSION,
  serialiseMarker,
  type ProjectMarker,
} from "./marker.ts";

/** What a new project is called until the writer gives it a title. */
export const DEFAULT_PROJECT_NAME = "Untitled Screenplay";

/**
 * Make an empty Feature in the default location.
 *
 * The name is the folder name, so when "Untitled Screenplay" is taken the new
 * project is "Untitled Screenplay 2" in the list as well as on disk — two rows
 * with one name would be indistinguishable.
 */
export async function createProject(
  { filesystem, newProjectId }: ImportDependencies,
  projectsDirectory: string,
): Promise<Project> {
  await filesystem.createDirectory(projectsDirectory);
  const taken = new Set(
    (await filesystem.readDirectory(projectsDirectory))
      .filter((entry) => entry.isDirectory)
      .map((entry) => entry.name),
  );
  const folder = folderNameFor(DEFAULT_PROJECT_NAME, taken);
  const marker: ProjectMarker = {
    name: folder,
    formatVersion: FORMAT_VERSION,
    projectId: newProjectId(),
    format: "Feature",
  };

  const path = join(projectsDirectory, folder);
  await filesystem.createDirectory(path);
  const { document } = importScreenplay(new Uint8Array());
  await filesystem.writeFile(
    join(path, MANUSCRIPT_FILE),
    exportScreenplay(document),
  );
  await filesystem.writeFile(
    join(path, MARKER_FILE),
    new TextEncoder().encode(serialiseMarker(marker)),
  );
  return { path, marker };
}
