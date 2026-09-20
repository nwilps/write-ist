/**
 * Import: bringing a script Write-ist has never seen into a new project
 * (`CONTEXT.md`, ADR-0028).
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
 *   3. **What was adjusted is named**, with its count, in the import report
 *      (ADR-0020). This module adds nothing to the report and takes nothing
 *      away: the existing importer counts, and this carries the answer out.
 */
import { exportScreenplay, importScreenplay, type ImportReport } from "../screenplay/import.ts";
import type { ScreenplayDocument } from "../screenplay/document.ts";
import { basename, join, type Filesystem } from "./filesystem.ts";
import { folderNameFor, MANUSCRIPT_FILE, MARKER_FILE, type Project } from "./bundle.ts";
import { FORMAT_VERSION, serialiseMarker, type ProjectMarker } from "./marker.ts";

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
}

export interface ImportedProject {
  readonly bundlePath: string;
  readonly project: Project;
  /** Shown at once, and dismissed by the writer (ADR-0028). */
  readonly report: ImportReport;
  /** The document as imported, for the editor to open without re-reading. */
  readonly document: ScreenplayDocument;
}

/** The default way to mint a project id: a UUID4 (ADR-0015). */
export function newProjectId(): string {
  return crypto.randomUUID();
}

export async function importProject(
  { filesystem, newProjectId: mintId }: ImportDependencies,
  { sourcePath, projectsDirectory }: ImportRequest,
): Promise<ImportedProject> {
  // The one and only touch of the writer's file.
  const bytes = await filesystem.readFile(sourcePath);

  const { document, report } = importScreenplay(bytes);
  const marker: ProjectMarker = {
    name: projectNameFor(document, sourcePath),
    formatVersion: FORMAT_VERSION,
    projectId: mintId(),
    format: "Feature",
  };

  await filesystem.createDirectory(projectsDirectory);
  const taken = new Set(
    (await filesystem.readDirectory(projectsDirectory))
      .filter((entry) => entry.isDirectory)
      .map((entry) => entry.name),
  );
  const bundlePath = join(projectsDirectory, folderNameFor(marker.name, taken));
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

  return { bundlePath, project: { path: bundlePath, marker }, report, document };
}

/**
 * What to call the new project: the title page's `Title`, or else the file
 * name (#38).
 *
 * The title is taken the way a writer would read it aloud — its marks are
 * already lifted out of the model (ADR-0027), and a title spread over
 * continuation lines is one name, not three. *Brick & Steel* writes its title
 * `_**BRICK & STEEL**_` over two indented lines, and the writer's name for it
 * is "BRICK & STEEL FULL RETIRED".
 */
function projectNameFor(document: ScreenplayDocument, sourcePath: string): string {
  const title = document.titlePage.find((field) => field.key.toLowerCase() === "title");
  if (title !== undefined) {
    const name = [title.inline, ...title.continuations]
      .map((value) => value.text.trim())
      .filter((line) => line !== "")
      .join(" ");
    if (name !== "") return name;
  }
  return fileNameWithoutExtension(sourcePath);
}

function fileNameWithoutExtension(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
