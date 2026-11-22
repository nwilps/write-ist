/**
 * A project's details beyond its marker: its **target page count** and **which
 * workspaces it shows** — and the one save that Edit Project Details makes of
 * those, its name and its type together.
 *
 * ## Why not `project.md`
 *
 * `project.md` is the marker: whether a folder is a bundle at all is decided by
 * reading it, and a marker that cannot be read hides the project (ADR-0015,
 * ADR-0025). It holds four things and is written when a project is made or
 * renamed. A toggle the writer flips on a whim does not belong in the one file
 * whose damage loses the project from the list, so these live beside it in
 * `details.md`, a sidecar in ADR-0025's shape (amended to name it):
 *
 * ```
 * # Project details
 *
 * Target pages: 110
 * Workspaces: editor, notes, plan
 * ```
 *
 * ## Reading it
 *
 * - **Absent** (every project made before it): no target, and every workspace
 *   the application offers is shown.
 * - **There and readable**: each value put right quietly, as Settings' are — a
 *   target that is not a number is no target; a workspace id that is not one is
 *   left out. A workspace this version does not offer is **kept** in the list,
 *   so a project opened by an older Write-ist does not lose a newer one's choice.
 * - **There and unreadable** (not text, or no heading): the defaults are shown,
 *   and the file is **never written over** (ADR-0008 rule 3). Saving details
 *   then refuses, in words, and changes nothing.
 *
 * Changing the type changes **only** the format in `project.md`: never the
 * target, never the workspaces. And New Project Defaults (Settings) are for new
 * projects only; nothing here reads them.
 */
import { basename, join, type Filesystem } from "./filesystem.ts";
import { DETAILS_FILE, MARKER_FILE, type Project } from "./bundle.ts";
import { FORMATS, serialiseMarker, type ProjectFormat } from "./marker.ts";
import { confirmProject } from "./projects.ts";
import { checkRename, CannotRename, renameProject } from "./rename.ts";
import { MOST_PAGES, wholeNumber } from "../settings/settings.ts";

export interface ProjectDetails {
  /** Pages the writer is aiming at; 0 for none. */
  readonly targetPages: number;
  /**
   * The ids of the workspaces this project shows, in no particular order, or
   * `undefined` for "every one offered" — a project that never chose.
   * A workspace that is always on (the Editor) is shown whether it is here or not.
   */
  readonly workspaces: readonly string[] | undefined;
}

export const DEFAULT_DETAILS: ProjectDetails = { targetPages: 0, workspaces: undefined };

const LABELS = { targetPages: "Target pages", workspaces: "Workspaces" } as const;
const HEADING = "Project details";

/** The text of a `details.md`. */
export function serialiseDetails(details: ProjectDetails): string {
  return [
    `# ${HEADING}`,
    "",
    `${LABELS.targetPages}: ${details.targetPages === 0 ? "none" : details.targetPages}`,
    ...(details.workspaces === undefined ? [] : [`${LABELS.workspaces}: ${details.workspaces.join(", ")}`]),
    "",
  ].join("\n");
}

/** A workspace id as kept: lower case, letters, digits and dashes. */
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Read a `details.md`, or `null` if it is not one. Values are put right quietly. */
export function parseDetails(text: string): ProjectDetails | null {
  const lines = text.split(/\r\n?|\n/);
  if (!lines.some((line) => line.startsWith("# "))) return null;
  const labelled = new Map<string, string>();
  for (const line of lines) {
    const match = /^([A-Za-z][A-Za-z ]*):[ \t]*(.*)$/.exec(line);
    if (match !== null && !labelled.has(match[1]!)) labelled.set(match[1]!, match[2]!.trim());
  }
  const pages = labelled.get(LABELS.targetPages) ?? "";
  const listed = labelled.get(LABELS.workspaces);
  return {
    targetPages: /^none$/i.test(pages) ? 0 : wholeNumber(pages, 0, MOST_PAGES, 0),
    workspaces:
      listed === undefined
        ? undefined
        : [...new Set(listed.split(",").map((id) => id.trim().toLowerCase()).filter((id) => ID.test(id)))],
  };
}

export interface DetailsRead {
  readonly details: ProjectDetails;
  /** False when the file is there and could not be read: it is then never written. */
  readonly readable: boolean;
}

const decoder = new TextDecoder("utf-8", { fatal: true });

/** A project's details as its folder holds them now. Never throws: an unreadable file reads as the defaults. */
export async function readDetails(filesystem: Filesystem, projectPath: string): Promise<DetailsRead> {
  const path = join(projectPath, DETAILS_FILE);
  try {
    if (!(await filesystem.exists(path))) return { details: DEFAULT_DETAILS, readable: true };
    const parsed = parseDetails(decoder.decode(await filesystem.readFile(path)));
    return parsed === null ? { details: DEFAULT_DETAILS, readable: false } : { details: parsed, readable: true };
  } catch {
    return { details: DEFAULT_DETAILS, readable: false };
  }
}

/** Whether a workspace is shown, given the project's details and whether it is one that is always on. */
export function workspaceShown(details: ProjectDetails, id: string, alwaysOn: boolean): boolean {
  return alwaysOn || details.workspaces === undefined || details.workspaces.includes(id);
}

/** Thrown for a change that was refused; its message is for the writer. */
export class CannotEditDetails extends Error {}

export interface WantedDetails {
  readonly name: string;
  readonly format: ProjectFormat;
  readonly details: ProjectDetails;
}

const sameDetails = (one: ProjectDetails, other: ProjectDetails): boolean =>
  one.targetPages === other.targetPages &&
  (one.workspaces === undefined) === (other.workspaces === undefined) &&
  [...(one.workspaces ?? [])].sort().join() === [...(other.workspaces ?? [])].sort().join();

/**
 * Save what Edit Project Details asks for, and answer the project as it now is.
 *
 * **Everything that can refuse is asked first**, with nothing written: the
 * type is one of this surface's, the project is the one on disk now, the name
 * is free (`checkRename`), and `details.md` can be read. Then `details.md` is
 * written, then the rename and the type in one write of `project.md`
 * (`renameProject`, which puts the folder back if its marker cannot be
 * written). So a refusal changes nothing, and nothing here throws after the
 * folder has moved — which the open Editor relies on, since it goes on saving
 * to wherever this answers (`relocate`).
 */
export async function saveProjectDetails(
  filesystem: Filesystem,
  projectsDirectory: string,
  project: Project,
  wanted: WantedDetails,
): Promise<{ readonly project: Project; readonly details: ProjectDetails }> {
  // Within the surface only: changing surface is refused (ADR-0005).
  if (!(FORMATS as readonly string[]).includes(wanted.format)) {
    throw new CannotEditDetails(`A screenplay cannot become a ${String(wanted.format)}.`);
  }
  try {
    await confirmProject(filesystem, projectsDirectory, project, CannotEditDetails);
    const folder = await checkRename(filesystem, projectsDirectory, project, wanted.name);
    const renaming = folder !== basename(project.path) || folder !== project.marker.name;

    const held = await readDetails(filesystem, project.path);
    const details: ProjectDetails = {
      targetPages: wholeNumber(wanted.details.targetPages, 0, MOST_PAGES, 0),
      workspaces: wanted.details.workspaces,
    };
    const detailsChange = !sameDetails(details, held.details);
    if (detailsChange && !held.readable) {
      throw new CannotEditDetails(
        `This project's ${DETAILS_FILE} could not be read, so it has been left as it was and nothing was changed.`,
      );
    }

    if (detailsChange) {
      await filesystem.writeFile(join(project.path, DETAILS_FILE), new TextEncoder().encode(serialiseDetails(details)));
    }
    const retyped: Project = { path: project.path, marker: { ...project.marker, format: wanted.format } };
    if (renaming) return { project: await renameProject(filesystem, projectsDirectory, retyped, wanted.name), details };
    if (wanted.format !== project.marker.format) {
      await filesystem.writeFile(join(project.path, MARKER_FILE), new TextEncoder().encode(serialiseMarker(retyped.marker)));
      return { project: retyped, details };
    }
    return { project, details };
  } catch (error) {
    // A refused name is said in the same words as Rename Project says it.
    if (error instanceof CannotRename) throw new CannotEditDetails(error.message);
    throw error;
  }
}
