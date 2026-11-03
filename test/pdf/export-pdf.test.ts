/**
 * Slice 2, step 5 — the PDF. What is asserted is what the pages mean: the
 * count and the breaks are the editor's, the title page is the preview's, the
 * text printed is the manuscript's printable text, and nothing private is in it.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeFile } from "../../src/decode.ts";
import { renderPdf, type CourierPrimeFaces } from "../../src/pdf/render.ts";
import { exportPdf, suggestedPdfName } from "../../src/project/export-pdf.ts";
import { CHARACTER_INCHES, ELEMENT_GEOMETRY, PAGE } from "../../src/screenplay/geometry.ts";
import { exportScreenplay, importScreenplay } from "../../src/screenplay/import.ts";
import { layout, MORE_TEXT } from "../../src/screenplay/layout.ts";
import { withoutCommentsAndBoneyard } from "../../src/screenplay/fountain-copy.ts";
import { pdfPagesOf } from "../../src/screenplay/pdf-pages.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { titlePageRuns } from "../../src/screenplay/title-page-layout.ts";
import { readFixtureBytes } from "../support/files.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const font = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(root, "app", "public", "fonts", `CourierPrime-${name}.ttf`)));
const faces: CourierPrimeFaces = {
  regular: font("Regular"),
  bold: font("Bold"),
  italic: font("Italic"),
  boldItalic: font("BoldItalic"),
};

const advance = CHARACTER_INCHES * 72;
const bigFish = () =>
  parse(decodeFile(exportScreenplay(importScreenplay(readFixtureBytes("Big-Fish.fountain")).document)).text);

/** The text of each page of a PDF, with each line's x and baseline, via pdf.js. */
async function extract(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const pages: { text: string; x: number; y: number }[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    pages.push(
      content.items.flatMap((item) =>
        "str" in item && item.str !== ""
          ? [{ text: item.str, x: item.transform[4]!, y: 792 - item.transform[5]! }]
          : [],
      ),
    );
  }
  return { pages, fontNames: await fontsOf(bytes) };
}
const fontsOf = async (bytes: Uint8Array): Promise<string[]> =>
  [...new TextDecoder("latin1").decode(bytes).matchAll(/\/FontName\s*\/(CourierPrime-[A-Za-z]+-\d+)/g)].map((m) => m[1]!);

describe("pagination parity with the editor", () => {
  it("prints exactly the layout's pages: same count, same lines, same rows (Big Fish)", () => {
    const document = bigFish();
    const reduced = withoutCommentsAndBoneyard(document);
    const laid = layout(document);
    expect(layout(reduced).totalPages).toBe(laid.totalPages);
    const printed = pdfPagesOf(document);
    expect(printed.pages).toHaveLength(laid.totalPages);
    printed.pages.forEach((runs, at) => {
      const expected = laid.pages[at]!.lines.filter((line) => line.text !== "").length;
      const lines = new Set(runs.filter((r) => r.y >= 69).map((r) => r.y));
      // One baseline per layout row, plus the page number's on pages after the first.
      expect(lines.size).toBeLessThanOrEqual(expected + 1);
    });
  });

  it("has (MORE) and CONT'D lines where the paper draws them, and a number from page 2", () => {
    const document = bigFish();
    const laid = layout(document);
    const printed = pdfPagesOf(document);
    const all = printed.pages.flat().map((run) => run.text);
    expect(all.filter((t) => t === MORE_TEXT).length).toBe(
      laid.pages.flatMap((p) => p.lines).filter((l) => l.kind === "more").length,
    );
    expect(printed.pages[0]!.some((r) => /^\d+\.$/.test(r.text))).toBe(false);
    printed.pages.slice(1).forEach((runs, at) => {
      const number = runs.find((r) => r.y === 45)!;
      expect(number.text).toBe(`${at + 2}.`);
      expect(number.x + number.text.length * advance).toBeCloseTo(540, 1);
    });
  });

  it("puts every run on the 12pt grid at its element's indent", () => {
    const document = parse("INT. ROOM - DAY\n\nAction here.\n\nMARY\n(softly)\nHello there.\n\nCUT TO:\n");
    const [page] = pdfPagesOf(document).pages;
    const at = (text: string) => page!.find((r) => r.text === text)!;
    const left = PAGE.marginLeftInches * 72;
    expect(at("Action here.").x).toBeCloseTo(left, 1);
    expect(at("MARY").x).toBeCloseTo(left + ELEMENT_GEOMETRY.character.indent * advance, 1);
    expect(at("Hello there.").x).toBeCloseTo(left + ELEMENT_GEOMETRY.dialogue.indent * advance, 1);
    expect(at("CUT TO:").x + 7 * advance).toBeCloseTo(511.2, 1); // 7.1in, the transition box's edge
    for (const run of page!) expect((run.y - 81) % PAGE.leadingPoints).toBe(0);
  });
});

describe("the title page", () => {
  const source = "Title: Big Fish\nCredit: written by\nAuthor: John August\nDraft date: 1 May 2003\nContact: Me\n\nINT. A - DAY\n\nHi.\n";
  it("is page 1, and is the preview's own list of runs", () => {
    const document = parse(source);
    expect(pdfPagesOf(document).titlePage).toEqual(titlePageRuns(document.titlePage));
    expect(pdfPagesOf(document).titlePage.length).toBeGreaterThan(0);
  });

  it("puts Draft date above Contact", () => {
    const runs = pdfPagesOf(parse(source)).titlePage;
    expect(runs.find((r) => r.text === "1 May 2003")!.y).toBeLessThan(runs.find((r) => r.text === "Me")!.y);
  });

  it("is skipped when empty, so the PDF is just the script", async () => {
    const document = parse("INT. A - DAY\n\nHi.\n");
    expect(pdfPagesOf(document).titlePage).toEqual([]);
    const bytes = await renderPdf(pdfPagesOf(document), faces);
    expect((await extract(bytes)).pages).toHaveLength(layout(document).totalPages);
  });
});

describe("what is left out", () => {
  const source = [
    "INT. KITCHEN - DAY",
    "",
    "MARY",
    "I [[c:a1 secret remark]]never said[[/c:a1]] that.",
    "",
    "/*",
    "",
    "CUT MATERIAL",
    "",
    "*/",
    "",
    "Action stays.",
    "",
  ].join("\n");

  it("keeps the words a comment pointed at, and drops the remark and the boneyard", async () => {
    const bytes = await renderPdf(pdfPagesOf(parse(source)), faces);
    const text = (await extract(bytes)).pages.flat().map((i) => i.text).join(" ");
    expect(text).toContain("never said");
    expect(text).toContain("Action stays.");
    expect(text).not.toMatch(/secret remark|CUT MATERIAL|\[\[|\/\*/);
  });
});

describe("the file", () => {
  it("has Y + 1 pages with a title page, embeds subset Courier Prime, and prints the manuscript's text", async () => {
    const document = bigFish();
    const printed = pdfPagesOf(document);
    expect(printed.titlePage.length).toBeGreaterThan(0);
    const bytes = await renderPdf(printed, faces);
    const { pages, fontNames } = await extract(bytes);
    expect(pages).toHaveLength(layout(document).totalPages + 1);
    expect(fontNames.length).toBeGreaterThan(0);
    expect(fontNames.every((n) => /CourierPrime/.test(n))).toBe(true);

    // Printable text: the layout's text lines, page by page. The page number
    // (y = 45) and the lines the layout adds at a break are taken out of the PDF's.
    const laid = layout(withoutCommentsAndBoneyard(document));
    laid.pages.forEach((page, at) => {
      const added = page.lines.filter((l) => l.kind !== "text").map((l) => l.text);
      const got = pages[at + 1]!.filter((i) => Math.abs(i.y - 45) > 1).map((i) => i.text);
      for (const text of added) got.splice(got.indexOf(text), 1);
      const expected = page.lines.filter((l) => l.kind === "text" && l.text !== "").map((l) => l.text);
      expect(got.join("").replace(/\s+/g, "")).toBe(expected.join("").replace(/\s+/g, ""));
    });
  }, 60_000);

  it("embeds subsets, not whole faces", async () => {
    const bytes = await renderPdf(pdfPagesOf(parse("Hi.\n")), faces);
    const whole = faces.regular.length + faces.bold.length + faces.italic.length + faces.boldItalic.length;
    expect(bytes.length).toBeLessThan(whole / 4);
  });

  it("writes to the chosen place, never the manuscript, and offers the project's name", async () => {
    const writes: string[] = [];
    const filesystem = { writeFile: async (path: string, bytes: Uint8Array) => void writes.push(`${path}:${bytes.length > 100}`) };
    const project = { path: "/p", marker: { name: "My: Script" } } as never;
    expect(suggestedPdfName(project)).toBe("My Script.pdf");
    await exportPdf(filesystem as never, project, parse("Hi.\n"), faces, "/out/a.pdf");
    expect(writes).toEqual(["/out/a.pdf:true"]);
    await expect(exportPdf(filesystem as never, project, parse("Hi.\n"), faces, "/p/manuscript.fountain")).rejects.toThrow(
      /manuscript/,
    );
    expect(writes).toHaveLength(1);
  });
});

describe("the menu and the window", () => {
  const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
  it("offers Export as PDF… beside the Fountain copy, and exports the live model, not a save", () => {
    expect(read("app", "src", "workspaces", "editor", "menus.ts")).toMatch(
      /Save a Copy as Fountain…[^}]*\},\s*\{ label: "Export as PDF…"[^}]*act: act\.exportPdf/,
    );
    const editor = read("app", "src", "workspaces", "editor", "editor.ts");
    const body = editor.slice(editor.indexOf("exportAsPdf = () =>"), editor.indexOf("Step 4 and 6"));
    expect(body).toContain("manuscriptOf(state.doc)");
    expect(body).toMatch(/destination === undefined\) return;/);
    expect(body).not.toMatch(/session\.save|saving\.now|saveAndShow/);
  });
});
