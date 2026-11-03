/**
 * Creating a project from nothing: a titled, empty screenplay in a new bundle.
 *
 * The sibling of import (`import.ts`), minus the file: the same bundle, the same
 * marker, the same order of writes (manuscript first, marker last — a crash
 * between them leaves a folder that is not a bundle, ADR-0015). The id is
 * minted by the caller's `newProjectId`, as import's is.
 *
 * What lands on disk is what an import of a script holding only a title page
 * would have made: `manuscript.fountain` (`Title: …`, no elements yet) and
 * `project.md`. The manuscript is built by the model's own serialiser, so it
 * is a file Write-ist would have written itself.
 */
import {
  exportScreenplay,
  importScreenplay,
} from "../screenplay/import.ts";
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

/** What kinds of project can be made. Novels arrive with the prose surface. */
export const PROJECT_TYPES = ["Screenplay"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export interface NewProject {
  readonly title: string;
  readonly type: ProjectType;
}

/** Thrown for a request that cannot be made; its message is for the writer. */
export class CannotCreate extends Error {}

/**
 * Make an empty project with the writer's title, in the default location.
 *
 * The title is the project's name and its folder name. When a folder of that
 * name is taken the new project is "Title 2" in the list as well as on disk —
 * two rows with one name would be indistinguishable — while the manuscript's
 * title page keeps the title as typed.
 */
export async function createProject(
  { filesystem, newProjectId }: ImportDependencies,
  projectsDirectory: string,
  { title, type }: NewProject,
): Promise<Project> {
  const typed = title.replace(/\s+/g, " ").trim();
  if (typed === "") throw new CannotCreate("A project needs a title.");
  // Only screenplays exist; a type that is not one must not quietly become one.
  if (!PROJECT_TYPES.includes(type)) {
    throw new CannotCreate(`Write-ist cannot make a ${String(type)} yet.`);
  }

  await filesystem.createDirectory(projectsDirectory);
  const taken = new Set(
    (await filesystem.readDirectory(projectsDirectory))
      .filter((entry) => entry.isDirectory)
      .map((entry) => entry.name),
  );
  const folder = folderNameFor(typed, taken);
  const marker: ProjectMarker = {
    name: folder,
    formatVersion: FORMAT_VERSION,
    projectId: newProjectId(),
    format: "Feature",
  };

  // A newline would end the title early and turn the rest into another field,
  // so the title is one line (it is collapsed above).
  const { document } = importScreenplay(
    new TextEncoder().encode(`Title: ${typed}\n\n`),
  );

  const path = join(projectsDirectory, folder);
  await filesystem.createDirectory(path);
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
