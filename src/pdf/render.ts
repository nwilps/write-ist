/**
 * Pages of positioned text in, PDF bytes out (slice 2, step 5).
 *
 * This is the whole interface to the PDF library: `PdfPages` and the four
 * Courier Prime faces go in, bytes come out, and nothing about where a line
 * falls is decided here (ADR-0001, ADR-0024). So the library can be swapped, or
 * the function moved to Rust, without touching the layout.
 *
 * The library is pdf-lib (MIT) with @pdf-lib/fontkit (MIT): each face is
 * embedded as a subset, only the glyphs the script uses. Nothing is fetched at
 * run time; the caller hands in the font bytes.
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import { CHARACTER_INCHES, PAGE } from "../screenplay/geometry.ts";
import type { PdfPages } from "../screenplay/pdf-pages.ts";
import { SHEET_POINTS, type TitlePageRun } from "../screenplay/title-page-layout.ts";

export interface CourierPrimeFaces {
  readonly regular: Uint8Array;
  readonly bold: Uint8Array;
  readonly italic: Uint8Array;
  readonly boldItalic: Uint8Array;
}

const ADVANCE = CHARACTER_INCHES * 72;

export async function renderPdf(pages: PdfPages, faces: CourierPrimeFaces): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setProducer("Write-ist");
  pdf.setCreator("Write-ist");
  const fonts = {
    regular: await pdf.embedFont(faces.regular, { subset: true }),
    bold: await pdf.embedFont(faces.bold, { subset: true }),
    italic: await pdf.embedFont(faces.italic, { subset: true }),
    boldItalic: await pdf.embedFont(faces.boldItalic, { subset: true }),
  };
  const sheets = pages.titlePage.length === 0 ? pages.pages : [pages.titlePage, ...pages.pages];
  for (const runs of sheets) {
    const page = pdf.addPage([SHEET_POINTS.width, SHEET_POINTS.height]);
    for (const run of runs) draw(page, fonts, run);
  }
  // Plain objects, so the faces' names can be read from the file without inflating it.
  return pdf.save({ useObjectStreams: false });
}

function draw(
  page: PDFPage,
  fonts: Record<"regular" | "bold" | "italic" | "boldItalic", PDFFont>,
  run: TitlePageRun,
): void {
  const font = run.bold ? (run.italic ? fonts.boldItalic : fonts.bold) : run.italic ? fonts.italic : fonts.regular;
  const y = SHEET_POINTS.height - run.y;
  page.drawText(run.text, { x: run.x, y, font, size: PAGE.fontSizePoints });
  if (run.underline) {
    page.drawLine({
      start: { x: run.x, y: y - 1.5 },
      end: { x: run.x + run.text.length * ADVANCE, y: y - 1.5 },
      thickness: 0.6,
    });
  }
}
