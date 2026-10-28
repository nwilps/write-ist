/**
 * Opening a project: reading the manuscript a bundle already holds.
 *
 * **Opening is not importing** (`GLOSSARY.md`). An import brings in a script
 * Write-ist has never seen, applies ADR-0020's enumerated normalisations and
 * reports them. Opening applies none of them and reports nothing: the
 * manuscript is parsed as it stands, and nothing is written. A writer's file
 * changes when their screenplay does, and opening a project is not that (#37,
 * story 39).
 *
 * That leaves one question this deliberately does not answer: what to do when
 * the manuscript on disk is not what Write-ist last wrote. Comparing the two,
 * reloading, and keeping both when the writer has also typed, is ADR-0028's and
 * belongs to #42. Nothing here guesses at it.
 */
import { decodeFile } from "../decode.ts";
import type { ScreenplayDocument } from "../screenplay/document.ts";
import { parse } from "../screenplay/parse.ts";
import { MANUSCRIPT_FILE, type Project } from "./bundle.ts";
import { join, type Filesystem } from "./filesystem.ts";

export interface OpenedProject {
  readonly project: Project;
  /** The manuscript, parsed (ADR-0019). */
  readonly document: ScreenplayDocument;
  /**
   * The bytes that were read, kept exactly as they were.
   *
   * This is what Write-ist last saw on disk, which is the comparison ADR-0028
   * makes before every save. Keeping it is also the cheap half of ADR-0008
   * rule 3: a save can only be refused for a manuscript that could not be read
   * if something remembers what was read.
   */
  readonly manuscript: Uint8Array;
}

/**
 * Read and parse a project's manuscript.
 *
 * **It rejects rather than resolving to an empty screenplay** when the file
 * cannot be read — the `Filesystem` port already promises that, and it is
 * ADR-0008 rule 3's whole point: v1 initialised empty state from a failed read
 * and the next save wrote it over the good file.
 */
export async function openProject(
  filesystem: Filesystem,
  project: Project,
): Promise<OpenedProject> {
  const manuscript = await filesystem.readFile(join(project.path, MANUSCRIPT_FILE));
  // The same lenient-in, strict-out decode the importer uses (ADR-0020):
  // Write-ist writes UTF-8, and a manuscript edited elsewhere and saved as
  // "Unicode" still opens with every character intact.
  return { project, document: parse(decodeFile(manuscript).text), manuscript };
}
