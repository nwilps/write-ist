/**
 * The PDF against the paper, for dual dialogue and the 7pt grid: every line the
 * layout puts on a sheet is printed at the row and the x the paper draws it,
 * and a pair that does not fit moves to the next sheet whole, in both.
 *
 * The expected x values are written out from Brick & Steel's measurements
 * (`geometry.ts`, DUAL_GEOMETRY): left column at 108pt, right at 333pt, a
 * column 207pt wide, a transition ending at 511.2pt (7.1in).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderPdf, type CourierPrimeFaces } from "../../src/pdf/render.ts";
import { layout } from "../../src/screenplay/layout.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { pdfPagesOf } from "../../src/screenplay/pdf-pages.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const font = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(root, "app", "public", "fonts", `CourierPrime-${name}.ttf`)));
const faces: CourierPrimeFaces = {
  regular: font("Regular"),
  bold: font("Bold"),
  italic: font("Italic"),
  boldItalic: font("BoldItalic"),
};

const PAIR = [
  "INT. A - DAY",
  "",
  "STEEL",
  "(low)",
  "Screw retirement.",
  "",
  "BRICK ^",
  "Screw retirement, the long way round, and then some more besides.",
  "",
  "SMASH CUT TO:",
  "",
].join("\n");

async function extract(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const pages: { text: string; x: number; y: number; width: number }[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    pages.push(
      content.items.flatMap((item) =>
        "str" in item && item.str !== ""
          ? [{ text: item.str, x: item.transform[4]!, y: 792 - item.transform[5]!, width: item.width }]
          : [],
      ),
    );
  }
  return pages;
}

describe("a dual pair in the PDF", () => {
  const document = parse(PAIR);
  const [page] = pdfPagesOf(document).pages;
  const at = (text: string) => page!.find((r) => r.text === text)!;

  it("sets each column where Brick & Steel does, and names centred on their columns", () => {
    expect(at("Screw retirement.").x).toBeCloseTo(108, 1);
    // Parenthetical: four characters in.
    expect(at("(low)").x).toBeCloseTo(108 + 4 * 7, 1);
    // Right dialogue begins at 333pt.
    expect(page!.find((r) => r.text.startsWith("Screw retirement,"))!.x).toBeCloseTo(333, 1);
    // STEEL (5): 194pt (centre 211.5 less 17.5); BRICK: 419pt.
    expect(at("STEEL").x).toBeCloseTo(211.5 - 17.5, 1);
    expect(at("BRICK").x).toBeCloseTo(436.5 - 17.5, 1);
  });

  it("puts the cues on one row, and never prints the caret", () => {
    expect(at("STEEL").y).toBe(at("BRICK").y);
    expect(page!.some((r) => r.text.includes("^"))).toBe(false);
    expect(page!.some((r) => /[-_─—]{3,}/.test(r.text))).toBe(false);
  });

  it("right-aligns a transition to 7.1in", () => {
    const run = at("SMASH CUT TO:");
    // Brick & Steel: 420pt measured at 6.99pt a character; 7.1in = 511.2pt at 7.
    expect(run.x).toBeCloseTo(420, -0.3);
    expect(run.x + 13 * 7).toBeCloseTo(511.2, 1);
  });
});

describe("every line of the layout is printed where the paper puts it", () => {
  it("matches the layout line for line, in the runs and in the file", async () => {
    const document = parse(PAIR);
    const laid = layout(document);
    const printed = pdfPagesOf(document);
    expect(printed.pages).toHaveLength(laid.totalPages);
    const bytes = await renderPdf(printed, faces);
    const read = await extract(bytes);
    laid.pages.forEach((sheet, n) => {
      for (const line of sheet.lines.filter((l) => l.text !== "")) {
        const y = 81 + line.row * 12;
        const run = printed.pages[n]!.find((r) => r.y === y && line.text.startsWith(r.text));
        expect(run, `${line.text} @row ${line.row}`).toBeDefined();
        const found = read[n]!.find((r) => Math.abs(r.y - y) < 0.5 && Math.abs(r.x - run!.x) < 0.05);
        expect(found, `${line.text} in the file`).toBeDefined();
      }
    });
  });

  it("advances 7pt a character in the file, not Courier Prime's 7.195", async () => {
    const bytes = await renderPdf(pdfPagesOf(parse("INT. A - DAY\n\nTwenty characters.. ok\n")), faces);
    const [sheet] = await extract(bytes);
    const run = sheet!.find((r) => r.text.startsWith("Twenty"))!;
    // pdf.js folds character spacing into the item's width.
    expect(run.width / run.text.length).toBeCloseTo(7, 1);
  });
});

describe("a pair that does not fit moves whole, as on the paper", () => {
  const filler = Array.from({ length: 52 }, (_, i) => `Action line ${i}.`).join("\n\n");
  const source = `INT. A - DAY\n\n${filler}\n\nSTEEL\nHi.\n\nBRICK ^\nYo.\n`;

  it("has both cues on the same sheet, at the same row, in the layout and in the PDF", () => {
    const document = parse(source);
    const laid = layout(document);
    expect(laid.totalPages).toBeGreaterThan(1);
    const sheetOf = (name: string) => laid.pages.findIndex((p) => p.lines.some((l) => l.text === name));
    expect(sheetOf("STEEL")).toBe(sheetOf("BRICK"));
    expect(sheetOf("STEEL")).toBeGreaterThan(0);
    const printed = pdfPagesOf(document).pages[sheetOf("STEEL")]!;
    const steel = printed.find((r) => r.text === "STEEL")!;
    const brick = printed.find((r) => r.text === "BRICK")!;
    expect(steel.y).toBe(brick.y);
    expect(printed.find((r) => r.text === "Hi.")!.x).toBeCloseTo(108, 1);
    expect(printed.find((r) => r.text === "Yo.")!.x).toBeCloseTo(333, 1);
  });
});
