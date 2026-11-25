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
 * Bold scene headings: yes
 * Bold transitions: no
 * Blank lines before scene headings: 2
 * ```
 *
 * The last three are a screenplay's own formatting (`formatting.ts`), given by
 * New Project from Settings ▸ New Project Defaults and kept by the project
 * from then on: Settings changing later never reaches a project already made.
 *
 * A workspace's own per-project settings (ADR-0045) follow, a line each,
 * `Setting <workspace>.<setting>: yes` — none in a project whose workspaces
 * declare none, which is every project today. Edit Project Details changes
 * them; New Project starts them from Settings ▸ New Project Defaults; one for
 * a workspace this version does not offer is kept as it is.
 *
 * ## Reading it
 *
 * - **Absent** (every project made before it): no target, every workspace
 *   the application offers is shown, and the formatting the paper and the PDF
 *   always had. A file with none of the formatting lines reads the same way.
 * - **There and readable**: each value put right quietly, as Settings' are — a
 *   target that is not a number is no target; a workspace id that is not one is
 *   left out. A workspace this version does not offer is **kept** in the list,
 *   so a project opened by an older Write-ist does not lose a newer one's choice.
 * - **There and unreadable** (not text, or no heading): the defaults are shown,
 *   and the file is **never written over** (ADR-0008 rule 3). Saving details
 *   then refuses, in words, and changes nothing.
 *
 * Changing the type changes **only** the format in `project.md`: never the
 * target, never the workspaces, never the formatting — which Edit Project
 * Details does not offer, and its save keeps as the file has it. And New Project Defaults (Settings) are for new
 * projects only; nothing here reads them.
 */
import { basename, join, type Filesystem } from "./filesystem.ts";
import { DETAILS_FILE, MARKER_FILE, type Project } from "./bundle.ts";
import { FORMATS, serialiseMarker, type ProjectFormat } from "./marker.ts";
import { confirmProject } from "./projects.ts";
import { checkRename, CannotRename, renameProject } from "./rename.ts";
import { MOST_PAGES, wholeNumber, workspaceIdsOf } from "../settings/settings.ts";
import { DEFAULT_FORMATTING, type Formatting } from "../screenplay/formatting.ts";
import {
  hasSettings,
  sameSettings,
  SETTING_ID,
  type WorkspaceSettingValues,
} from "../settings/workspace-settings.ts";

export interface ProjectDetails {
  /** Pages the writer is aiming at; 0 for none. */
  readonly targetPages: number;
  /**
   * The ids of the workspaces this project shows, in no particular order, or
   * `undefined` for "every one offered" — a project that never chose.
   * A workspace that is always on (the Editor) is shown whether it is here or not.
   */
  readonly workspaces: readonly string[] | undefined;
  /**
   * A screenplay's own formatting, or `undefined` for a project that never
   * chose: it is set as the paper and the PDF always were (`formattingOf`).
   */
  readonly formatting?: Formatting | undefined;
  /**
   * The workspaces' own per-project settings that are set (`WorkspaceSetting`,
   * `place: "project"`), by workspace and setting id; the rest are each
   * setting's default. Absent when none are.
   */
  readonly workspaceSettings?: WorkspaceSettingValues | undefined;
}

export const DEFAULT_DETAILS: ProjectDetails = { targetPages: 0, workspaces: undefined };

const LABELS = {
  targetPages: "Target pages",
  workspaces: "Workspaces",
  boldSceneHeadings: "Bold scene headings",
  boldTransitions: "Bold transitions",
  blankLinesBeforeSceneHeadings: "Blank lines before scene headings",
} as const;

/** The formatting a project is set with: its own, or the paper's and the PDF's as they always were. */
export function formattingOf(details: ProjectDetails): Formatting {
  return details.formatting ?? DEFAULT_FORMATTING;
}

const yesNo = (on: boolean): string => (on ? "yes" : "no");
const HEADING = "Project details";

/** The text of a `details.md`. */
export function serialiseDetails(details: ProjectDetails): string {
  return [
    `# ${HEADING}`,
    "",
    `${LABELS.targetPages}: ${details.targetPages === 0 ? "none" : details.targetPages}`,
    ...(details.workspaces === undefined ? [] : [`${LABELS.workspaces}: ${details.workspaces.join(", ")}`]),
    ...(details.formatting === undefined
      ? []
      : [
          `${LABELS.boldSceneHeadings}: ${yesNo(details.formatting.boldSceneHeadings)}`,
          `${LABELS.boldTransitions}: ${yesNo(details.formatting.boldTransitions)}`,
          `${LABELS.blankLinesBeforeSceneHeadings}: ${details.formatting.blankLinesBeforeSceneHeadings}`,
        ]),
    ...Object.entries(details.workspaceSettings ?? {})
      .flatMap(([workspace, values]) => Object.entries(values).map(([id, on]) => `${SETTING_LINE} ${workspace}.${id}: ${yesNo(on)}`))
      .sort(),
    "",
  ].join("\n");
}

/** How a workspace's setting starts its line in `details.md`. */
const SETTING_LINE = "Setting";

/** A workspace's setting's line: `Setting notes.word-wrap: yes`. */
const SETTING = /^Setting ([a-z0-9][a-z0-9-]{0,63})\.([a-z0-9][a-z0-9-]{0,63}):[ \t]*(yes|no)[ \t]*$/i;

/** The workspaces' settings in a file's lines, put right quietly: a line that is not one is left out. */
function workspaceSettingsFrom(lines: readonly string[]): WorkspaceSettingValues | undefined {
  const values: Record<string, Record<string, boolean>> = {};
  for (const line of lines) {
    const match = SETTING.exec(line);
    if (match === null) continue;
    const [, workspace, id, said] = match as unknown as [string, string, string, string];
    if (!SETTING_ID.test(workspace) || !SETTING_ID.test(id) || values[workspace]?.[id] !== undefined) continue;
    (values[workspace] ??= {})[id] = /^yes$/i.test(said);
  }
  return hasSettings(values) ? values : undefined;
}

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
  const formatting = formattingFrom(labelled);
  const workspaceSettings = workspaceSettingsFrom(lines);
  return {
    ...(formatting === undefined ? {} : { formatting }),
    ...(workspaceSettings === undefined ? {} : { workspaceSettings }),
    targetPages: /^none$/i.test(pages) ? 0 : wholeNumber(pages, 0, MOST_PAGES, 0),
    workspaces: listed === undefined ? undefined : workspaceIdsOf(listed.split(",")),
  };
}

/**
 * The formatting lines, put right quietly: a yes/no that is neither, or a
 * count that is not 1 or 2, is the value the project had before it chose.
 * `undefined` when there are none.
 */
function formattingFrom(labelled: ReadonlyMap<string, string>): Formatting | undefined {
  const headings = labelled.get(LABELS.boldSceneHeadings);
  const transitions = labelled.get(LABELS.boldTransitions);
  const blank = labelled.get(LABELS.blankLinesBeforeSceneHeadings);
  if (headings === undefined && transitions === undefined && blank === undefined) return undefined;
  const flag = (value: string | undefined, fallback: boolean): boolean =>
    value !== undefined && /^yes$/i.test(value) ? true : value !== undefined && /^no$/i.test(value) ? false : fallback;
  return {
    boldSceneHeadings: flag(headings, DEFAULT_FORMATTING.boldSceneHeadings),
    boldTransitions: flag(transitions, DEFAULT_FORMATTING.boldTransitions),
    blankLinesBeforeSceneHeadings: blank === "1" ? 1 : blank === "2" ? 2 : DEFAULT_FORMATTING.blankLinesBeforeSceneHeadings,
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

/** `{ workspaceSettings }`: those held, with those wanted over them; nothing when there are none. */
function mergedSettings(
  held: WorkspaceSettingValues | undefined,
  wanted: WorkspaceSettingValues | undefined,
): { workspaceSettings?: WorkspaceSettingValues } {
  const merged: Record<string, Record<string, boolean>> = {};
  for (const values of [held, wanted]) {
    for (const [workspace, each] of Object.entries(values ?? {})) merged[workspace] = { ...merged[workspace], ...each };
  }
  return hasSettings(merged) ? { workspaceSettings: merged } : {};
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
  [...(one.workspaces ?? [])].sort().join() === [...(other.workspaces ?? [])].sort().join() &&
  sameSettings(one.workspaceSettings, other.workspaceSettings);

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
      // Not Edit Project Details' to change: kept as the project has it.
      ...(held.details.formatting === undefined ? {} : { formatting: held.details.formatting }),
      // The workspaces' own: the ones asked for over the ones held, so one this version does not offer is kept.
      ...mergedSettings(held.details.workspaceSettings, wanted.details.workspaceSettings),
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
