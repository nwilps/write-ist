/**
 * Exporting the PDF (slice 2, step 5): the finished-product copy as paper.
 *
 * Like the Fountain copy, **not a save**: it reads the model it is handed,
 * touches no manuscript, history or autosave, and keeps no record of the file
 * (ADR-0009). It goes through the filesystem port's `writeFile`, so the PDF
 * lands whole or not at all (ADR-0008 rule 5).
 */
import { pdfPagesOf } from "../screenplay/pdf-pages.ts";
import type { ScreenplayDocument } from "../screenplay/document.ts";
import { renderPdf, type CourierPrimeFaces } from "../pdf/render.ts";
import { MANUSCRIPT_FILE, type Project } from "./bundle.ts";
import { join, type Filesystem } from "./filesystem.ts";

/** The name offered in the save dialog: the project's own, with `.pdf`. */
export function suggestedPdfName(project: Project): string {
  const name = project.marker.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim();
  return `${name === "" ? "Untitled" : name}.pdf`;
}

export async function exportPdf(
  filesystem: Filesystem,
  project: Project,
  document: ScreenplayDocument,
  faces: CourierPrimeFaces,
  destination: string,
): Promise<void> {
  if (destination === join(project.path, MANUSCRIPT_FILE)) {
    throw new Error("That is the project's own manuscript. Choose another place for the PDF.");
  }
  await filesystem.writeFile(destination, await renderPdf(pdfPagesOf(document), faces));
}
