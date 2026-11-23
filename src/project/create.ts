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
 *
 * **New Project Defaults** (Settings) are read here and nowhere else: given
 * the defaults for the type being made, the project starts with them —
 * `details.md` holding its target pages, the workspaces it shows and a
 * screenplay's formatting, and
 * `goals.md` its daily goal when that is on. They are the project's own from
 * then on: a later change in Settings never reaches a project already made,
 * and an existing project is never touched by them.
 */
import {
  exportScreenplay,
  importScreenplay,
} from "../screenplay/import.ts";
import { join } from "./filesystem.ts";
import {
  DETAILS_FILE,
  folderNameFor,
  MANUSCRIPT_FILE,
  MARKER_FILE,
  type Project,
} from "./bundle.ts";
import type { ImportDependencies } from "./import.ts";
import { serialiseDetails } from "./details.ts";
import { writeGoals } from "../goals/file.ts";
import { NO_GOALS } from "../goals/history.ts";
import type { ProjectDefaults } from "../settings/settings.ts";
import {
  FORMAT_VERSION,
  FORMATS,
  serialiseMarker,
  type ProjectFormat,
  type ProjectMarker,
} from "./marker.ts";

// Kept beside `FORMATS` (`marker.ts`), so Settings can read it without reaching this file.
export { COMING_FORMATS } from "./marker.ts";

export interface NewProject {
  readonly title: string;
  readonly type: ProjectFormat;
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
  defaults?: ProjectDefaults,
): Promise<Project> {
  const typed = title.replace(/\s+/g, " ").trim();
  if (typed === "") throw new CannotCreate("A project needs a title.");
  // Only screenplays exist; a type that is not one must not quietly become one.
  if (!FORMATS.includes(type)) {
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
    format: type,
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
  // Before the marker, which is written last: until it is, this is not a project.
  if (defaults !== undefined) {
    await filesystem.writeFile(
      join(path, DETAILS_FILE),
      new TextEncoder().encode(
        serialiseDetails({
          targetPages: defaults.targetPages,
          // As Settings keeps them: `undefined` is every workspace offered.
          workspaces: defaults.workspaces,
          formatting: {
            boldSceneHeadings: defaults.boldSceneHeadings,
            boldTransitions: defaults.boldTransitions,
            blankLinesBeforeSceneHeadings: defaults.blankLinesBeforeSceneHeadings,
          },
        }),
      ),
    );
    if (defaults.dailyGoalOn) {
      await writeGoals(filesystem, { path, marker }, { ...NO_GOALS, goal: defaults.dailyGoal });
    }
  }
  await filesystem.writeFile(
    join(path, MARKER_FILE),
    new TextEncoder().encode(serialiseMarker(marker)),
  );
  return { path, marker };
}
