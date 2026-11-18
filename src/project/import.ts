/**
 * Import: bringing a script Write-ist has never seen into a new project
 * (`GLOSSARY.md`, ADR-0028).
 *
 * Three promises, in the order they matter:
 *
 *   1. **The file the writer imported from is never written to.** It is read
 *      once, and that is the only call this module makes against it. A bundle
 *      is a folder (ADR-0025) and a loose `.fountain` is not one, so importing
 *      is a copy by construction — but the promise is load-bearing enough that
 *      the test reads the source's bytes before and after.
 *   2. **The project is saved the moment the import completes** (ADR-0028).
 *      A writer who imports a script and leaves finds it there when they come
 *      back.
 *   3. **What was adjusted is counted** (ADR-0020). This module adds nothing to
 *      the report and takes nothing away: the existing importer counts, and this
 *      carries the answer out. The app no longer shows it (2026-11-18).
 *
 * The project takes the name the writer typed. With none it is named for the
 * script's title page, or for the file when that gives no title. It is the type
 * the writer chose.
 */
import type { TitlePageField } from "../screenplay/document.ts";
import { exportScreenplay, importScreenplay, type ImportReport } from "../screenplay/import.ts";
import { join, type Filesystem } from "./filesystem.ts";
import {
  cleanFolderName,
  folderNameFor,
  MANUSCRIPT_FILE,
  MARKER_FILE,
  refusedProjectName,
  type Project,
} from "./bundle.ts";
import { FORMAT_VERSION, FORMATS, serialiseMarker, type ProjectFormat, type ProjectMarker } from "./marker.ts";

export interface ImportDependencies {
  readonly filesystem: Filesystem;
  /**
   * Mints a project id (ADR-0015). Injected rather than called directly so a
   * test can name the id it expects — the id is minted, never derived from
   * the file, and a test that could not tell the difference would not catch a
   * day when it started being derived.
   */
  readonly newProjectId: () => string;
}

export interface ImportRequest {
  /** The writer's own file. Read, never written. */
  readonly sourcePath: string;
  /** The default location, `~/Documents/write-ist/` (ADR-0016). */
  readonly projectsDirectory: string;
  /** What the project is, written as `Format:` in `project.md`. A Feature if not said. */
  readonly format?: ProjectFormat;
  /** What the writer typed to call it. Blank: the title page's Title, or the file's name. */
  readonly name?: string;
}

export interface ImportedProject {
  readonly bundlePath: string;
  readonly project: Project;
  /** What was adjusted, counted. Not shown to the writer. */
  readonly report: ImportReport;
}

/** Thrown for a request that cannot be made; its message is for the writer. */
export class CannotImport extends Error {}

/** The default way to mint a project id: a UUID4 (ADR-0015). */
export function newProjectId(): string {
  return crypto.randomUUID();
}

export async function importProject(
  { filesystem, newProjectId: mintId }: ImportDependencies,
  { sourcePath, projectsDirectory, format = "Feature", name }: ImportRequest,
): Promise<ImportedProject> {
  // Only screenplays exist; a type that is not one must not quietly become one.
  if (!FORMATS.includes(format)) {
    throw new CannotImport(`Write-ist cannot import a ${String(format)} yet.`);
  }
  const refused = refusedImportName(name);
  if (refused !== undefined) throw new CannotImport(refused);

  // The one and only touch of the writer's file.
  const bytes = await filesystem.readFile(sourcePath);

  const { document, report } = importScreenplay(bytes);
  const typed = typedName(name);
  const found = titleOf(document.titlePage) ?? projectNameFor(sourcePath);

  await filesystem.createDirectory(projectsDirectory);
  const taken = new Set(
    (await filesystem.readDirectory(projectsDirectory))
      .filter((entry) => entry.isDirectory)
      .map((entry) => entry.name),
  );
  const folder = folderNameFor(typed ?? found, taken);
  const marker: ProjectMarker = {
    // A typed name is the folder's, as a new project's title is, "Title 2" included.
    name: typed === undefined ? found : folder,
    formatVersion: FORMAT_VERSION,
    projectId: mintId(),
    format,
  };
  const bundlePath = join(projectsDirectory, folder);
  await filesystem.createDirectory(bundlePath);

  // The manuscript first, the marker last. A crash between the two then leaves
  // a folder with no marker, which ADR-0015 says is not a bundle and is never
  // written into — so it is ignored rather than listed as a project whose
  // screenplay is missing. The reverse order fails the other way.
  await filesystem.writeFile(join(bundlePath, MANUSCRIPT_FILE), exportScreenplay(document));
  await filesystem.writeFile(
    join(bundlePath, MARKER_FILE),
    new TextEncoder().encode(serialiseMarker(marker)),
  );

  return { bundlePath, project: { path: bundlePath, marker }, report };
}

/** Why a typed name will not do, in the writer's words. Blank is fine: it is optional. */
export function refusedImportName(name: string | undefined): string | undefined {
  const typed = typedName(name);
  if (typed === undefined) return undefined;
  return refusedProjectName(typed) ?? refusedProjectName(cleanFolderName(typed));
}

/** The typed name on one line; undefined when nothing was typed but space. */
function typedName(name: string | undefined): string | undefined {
  return name?.replace(/\s+/g, " ").trim() || undefined;
}

/** A chosen file's own name. The native picker answers in the platform's separators. */
export function sourceFileName(path: string): string {
  return path.split(/[\\/]/).filter((part) => part !== "").pop() ?? "";
}

/**
 * The title page's Title on one line, its lines joined and its marks gone.
 * Undefined when there is none, or none a project could be called: a title
 * that leaves no folder name, or one that would hide the folder from the list.
 */
function titleOf(titlePage: readonly TitlePageField[]): string | undefined {
  const field = titlePage.find(({ key }) => key.trim().toLowerCase() === "title");
  if (field === undefined) return undefined;
  const title = [field.inline, ...field.continuations]
    .map((line) => line.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const folder = cleanFolderName(title);
  return folder === "Untitled" || folder.startsWith(".") ? undefined : title;
}

/**
 * What to call a project with no title: the file's name, without its
 * extension. One line and never empty, or `project.md` would not read back as
 * a project.
 */
function projectNameFor(sourcePath: string): string {
  const file = sourceFileName(sourcePath);
  const dot = file.lastIndexOf(".");
  const name = dot > 0 ? file.slice(0, dot) : file;
  return name.replace(/\s+/g, " ").trim() || "Untitled";
}
