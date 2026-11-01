/**
 * Saving a copy as Fountain (slice 2, step 7): the finished-product export.
 *
 * The bytes are `fountainCopyOf` — comments and the boneyard left out — and
 * they go through the filesystem port's `writeFile`, so the copy lands whole
 * or not at all like every other write (ADR-0008 rule 5). It is **not a
 * save**: nothing here touches the manuscript, the model, the undo history or
 * the autosave, and the copy is not tracked — the project is not re-pointed
 * at it, and no record of it is kept (ADR-0009).
 */
import { fountainCopyOf } from "../screenplay/fountain-copy.ts";
import type { ScreenplayDocument } from "../screenplay/document.ts";
import { MANUSCRIPT_FILE, type Project } from "./bundle.ts";
import { join, type Filesystem } from "./filesystem.ts";

/** The name offered in the save dialog: the project's own, with `.fountain`. */
export function suggestedCopyName(project: Project): string {
  const name = project.marker.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim();
  return `${name === "" ? "Untitled" : name}.fountain`;
}

/**
 * Write the copy to `destination`, wherever the writer chose.
 *
 * Refuses the project's own manuscript: a "copy" over the file it is a copy
 * of would be a save that dropped the writer's comments (ADR-0020).
 */
export async function saveFountainCopy(
  filesystem: Filesystem,
  project: Project,
  document: ScreenplayDocument,
  destination: string,
): Promise<void> {
  if (destination === join(project.path, MANUSCRIPT_FILE)) {
    throw new Error(
      "That is the project's own manuscript. A copy there would leave out your comments " +
        "and cut material. Choose another place.",
    );
  }
  await filesystem.writeFile(destination, fountainCopyOf(document));
}
