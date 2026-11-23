/**
 * Every way a script can leave the project, one row each.
 *
 * The Export As dialog and the command behind it read this list and know no
 * format by name, so a new format is a new row here. Each row reaches the
 * format's own writer; like those writers, nothing here saves the project. A
 * row can be listed before its writer exists (`writable: false`): the dialog
 * offers it with Export dimmed, and `exportScript` refuses it.
 */
import type { CourierPrimeFaces } from "../pdf/render.ts";
import type { ScreenplayDocument } from "../screenplay/document.ts";
import type { PageRange, PdfEmphasis } from "../screenplay/pdf-pages.ts";
import type { Formatting } from "../screenplay/formatting.ts";
import type { Project } from "./bundle.ts";
import { saveFountainCopy, suggestedCopyName } from "./copy.ts";
import { exportPdf, suggestedPdfName } from "./export-pdf.ts";
import type { Filesystem } from "./filesystem.ts";

/** The native save dialogs: each answers with a path, or nothing if the writer cancelled. */
export interface ExportPlaces {
  readonly chooseCopyLocation: (suggestedName: string) => Promise<string | undefined>;
  readonly choosePdfLocation: (suggestedName: string) => Promise<string | undefined>;
}

export interface ExportWrite {
  readonly filesystem: Filesystem;
  readonly project: Project;
  readonly document: ScreenplayDocument;
  readonly faces: () => Promise<CourierPrimeFaces>;
  readonly destination: string;
  /** Absent for the whole script, and always absent for a format without pages. */
  readonly range: PageRange | undefined;
  /** The project's own formatting, for a format that sets the script on pages. */
  readonly formatting?: Formatting;
  /** Which types this export prints bold, for a format set in type. Absent: none. */
  readonly emphasis?: PdfEmphasis;
}

export interface ExportFormat {
  readonly id: string;
  readonly label: string;
  /** Whether Write-ist can write the format yet. A row that cannot is listed, and nothing writes it. */
  readonly writable: boolean;
  /** Whether the format is made of numbered pages a writer could choose among. */
  readonly pageRange: boolean;
  /** Whether the format is set in type, so this export can print headings and transitions bold. */
  readonly emphasis: boolean;
  /** What the writer is told when the file could not be written. */
  readonly failure: string;
  readonly suggestedName: (project: Project) => string;
  readonly chooseLocation: (places: ExportPlaces, suggestedName: string) => Promise<string | undefined>;
  readonly write: (job: ExportWrite) => Promise<void>;
}

/** The first row is the dialog's default. */
export const EXPORT_FORMATS: readonly ExportFormat[] = [
  {
    id: "pdf",
    label: "PDF",
    writable: true,
    pageRange: true,
    emphasis: true,
    failure: "Write-ist could not export the PDF.",
    suggestedName: suggestedPdfName,
    chooseLocation: (places, name) => places.choosePdfLocation(name),
    write: async ({ filesystem, project, document, faces, destination, range, formatting, emphasis }) =>
      exportPdf(filesystem, project, document, await faces(), destination, range, formatting, emphasis),
  },
  {
    // One continuous text file of the whole script: it has no pages to choose.
    id: "fountain",
    label: "Fountain",
    writable: true,
    pageRange: false,
    emphasis: false,
    failure: "Write-ist could not export the Fountain copy.",
    suggestedName: suggestedCopyName,
    chooseLocation: (places, name) => places.chooseCopyLocation(name),
    write: ({ filesystem, project, document, destination }) =>
      saveFountainCopy(filesystem, project, document, destination),
  },
  {
    // Listed so the writer can see it is coming. There is no writer yet: it asks
    // nowhere and writes nothing, and `exportScript` turns it away before either.
    id: "fdx",
    label: "Final Draft (.fdx)",
    writable: false,
    pageRange: false,
    emphasis: false,
    failure: "Write-ist cannot export Final Draft files yet.",
    suggestedName: (project) => `${project.marker.name}.fdx`,
    chooseLocation: async () => undefined,
    write: () => Promise.reject(new Error("Write-ist cannot export Final Draft files yet.")),
  },
];

export interface ExportJob {
  readonly filesystem: Filesystem;
  readonly project: Project;
  readonly places: ExportPlaces;
  /** Asked once the destination is chosen, so the file is the script as it is then. */
  readonly document: () => ScreenplayDocument;
  readonly faces: () => Promise<CourierPrimeFaces>;
  readonly range?: PageRange | undefined;
  /** The project's own formatting (`details.md`). Default: as until now. */
  readonly formatting?: Formatting;
  /** Which types this export prints bold (Export As). Default: none. */
  readonly emphasis?: PdfEmphasis;
}

/** Ask where, then write. `false`: the writer cancelled the save dialog and nothing was written. */
export async function exportScript(format: ExportFormat, job: ExportJob): Promise<boolean> {
  if (!format.writable) throw new Error(format.failure);
  const destination = await format.chooseLocation(job.places, format.suggestedName(job.project));
  if (destination === undefined) return false;
  await format.write({
    filesystem: job.filesystem,
    project: job.project,
    document: job.document(),
    faces: job.faces,
    destination,
    range: format.pageRange ? job.range : undefined,
    ...(job.formatting === undefined ? {} : { formatting: job.formatting }),
    ...(job.emphasis === undefined || !format.emphasis ? {} : { emphasis: job.emphasis }),
  });
  return true;
}
