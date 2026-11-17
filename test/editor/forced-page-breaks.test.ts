/**
 * @vitest-environment jsdom
 *
 * A forced page break (`===`, Fountain's) is a new sheet, on the paper and in
 * the PDF, and is never lost from the file.
 *
 * Big Fish opens with an epigraph, then `====`, then FADE IN:. The epigraph
 * used to be left out of the layout altogether — the engine skipped what stood
 * above a leading break so that page 1 would start after it — and so it was
 * missing from the PDF, and on the paper it shared page 1's sheet with a
 * visible line of `====`. What is asserted here is what each surface means:
 * which sheet the epigraph is on, which line opens the next, that no `===` is
 * drawn or printed, and that the file keeps both.
 */
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { drawSheetBreak } from "../../app/src/workspaces/editor/sheet-break.ts";
import { decodeFile } from "../../src/decode.ts";
import { renderPdf } from "../../src/pdf/render.ts";
import type { ScreenplayDocument } from "../../src/screenplay/document.ts";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { joinBackwards, joinForwards, setElementType } from "../../src/screenplay/element-keys.ts";
import { fountainCopyOf } from "../../src/screenplay/fountain-copy.ts";
import { exportScreenplay, importScreenplay } from "../../src/screenplay/import.ts";
import { layout, type Layout } from "../../src/screenplay/layout.ts";
import { hiddenPageBreak } from "../../src/screenplay/page-break-editing.ts";
import { pdfPagesOf } from "../../src/screenplay/pdf-pages.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { paperDecorations, sheetBreaks } from "../../src/screenplay/sheets.ts";
import { hiddenTitlePage } from "../../src/screenplay/title-page-editing.ts";
import { readFixtureBytes } from "../support/files.ts";

const EPIGRAPH = "This is a Southern story, full of lies and fabrications, but truer for their inclusion.";
const BREAK_LINE = /^={3,}$/;

const bigFishBytes = () => readFixtureBytes("Big-Fish.fountain");
const bigFish = (): ScreenplayDocument =>
  parse(decodeFile(exportScreenplay(importScreenplay(bigFishBytes()).document)).text);

/** A small invented script: a title page, an epigraph above a leading break, and a break mid-script. */
const SMALL =
  "Title: A Small Test\nAuthor: Nobody\n\n" +
  "Words above the break.\n\n" +
  "====\n\n" +
  "INT. KITCHEN - DAY\n\n" +
  "Before the second break.\n\n" +
  "===\n\n" +
  "After the second break.\n";

const textLines = (laid: Layout) =>
  [...laid.frontMatter, ...laid.pages].flatMap((sheet) => sheet.lines.map((line) => line.text));

describe("the layout: the paper's sheets and the PDF's pages", () => {
  it("puts Big Fish's epigraph on a sheet of its own before page 1, unnumbered", () => {
    const document = bigFish();
    const laid = layout(document);
    expect(laid.frontMatter).toHaveLength(1);
    expect(laid.frontMatter[0]!.number).toBe(0);
    expect(laid.frontMatter[0]!.lines.map((line) => line.text).join(" ")).toBe(EPIGRAPH);
    // Page 1 is still FADE IN:, and the count is still the body's alone.
    expect(laid.pages[0]!.lines[0]!.text).toBe("FADE IN:");
    expect(laid.totalPages).toBe(123);
  });

  it("draws and prints no line of `===`", () => {
    expect(textLines(layout(bigFish())).filter((text) => BREAK_LINE.test(text))).toEqual([]);
    expect(textLines(layout(parse(SMALL))).filter((text) => BREAK_LINE.test(text))).toEqual([]);
  });

  it("starts a new sheet at each break, the one mid-script included", () => {
    const laid = layout(parse(SMALL));
    expect(laid.frontMatter.map((sheet) => sheet.lines.map((line) => line.text))).toEqual([
      ["Words above the break."],
    ]);
    expect(laid.pages.map((page) => page.lines.map((line) => line.text))).toEqual([
      ["INT. KITCHEN - DAY", "Before the second break."],
      ["After the second break."],
    ]);
    // A seam before page 1, which carries no number, and one before page 2.
    expect(sheetBreaks(laid).map((seam) => seam.page)).toEqual([1, 2]);
  });
});

describe("the paper", () => {
  function mounted(source: string) {
    let state = editorStateFor(parse(source));
    const seams = () => paperDecorations(state.doc, layout(manuscriptOf(state.doc)), drawSheetBreak);
    const view = new EditorView(window.document.createElement("div"), {
      state,
      nodeViews: { ...hiddenTitlePage, ...hiddenPageBreak },
      decorations: () => seams(),
      dispatchTransaction: (tr) => {
        state = state.apply(tr);
        view.updateState(state);
      },
    });
    return { view, state: () => state };
  }

  it("holds no `===`, and keeps the epigraph", () => {
    const { view } = mounted(decodeFile(bigFishBytes()).text);
    const visible = [...view.dom.querySelectorAll<HTMLElement>("[data-element]")].filter((node) => !node.hidden);
    expect(visible.some((node) => BREAK_LINE.test(node.textContent ?? ""))).toBe(false);
    expect(view.dom.textContent).not.toMatch(/===/);
    expect(visible[0]!.textContent).toBe(EPIGRAPH);
  });

  it("shows a seam to a new sheet where each break is, page 1's with no number", () => {
    const { view } = mounted(SMALL);
    const breaks = [...view.dom.querySelectorAll<HTMLElement>('[data-element="page-break"]')];
    expect(breaks).toHaveLength(2);
    for (const hidden of breaks) {
      expect(hidden.hidden).toBe(true);
      expect(hidden.textContent).toBe("");
      // Straight after the break: the seam, then the next sheet's first line.
      const seam = hidden.nextElementSibling as HTMLElement;
      expect(seam.classList.contains("sheet-break")).toBe(true);
      expect((seam.nextElementSibling as HTMLElement).dataset["element"]).not.toBe("page-break");
    }
    const heads = [...view.dom.querySelectorAll(".sheet-break__head")].map((head) => head.textContent);
    expect(heads).toEqual(["", "2."]);
  });

  it("keeps the caret out of a break, and lets no typing into one", () => {
    const { view, state } = mounted(SMALL);
    const at = (text: string) => {
      let found = -1;
      state().doc.forEach((node, offset) => {
        if (node.textContent === text) found = offset;
      });
      return found;
    };
    // Arrowing down off the epigraph lands inside the break; it is carried on.
    const into = at("====") + 1;
    view.dispatch(state().tr.setSelection(TextSelection.create(state().doc, into)));
    expect(state().selection.$head.parent.textContent).toBe("INT. KITCHEN - DAY");
    // Typing at a position inside a break is refused.
    const before = state().doc;
    view.dispatch(state().tr.insertText("x", into));
    expect(state().doc.eq(before)).toBe(true);
  });
});

describe("Backspace, Delete and element types beside a break", () => {
  const at = (state: EditorState, text: string, end = false) => {
    let found = -1;
    state.doc.forEach((node, offset) => {
      if (node.textContent === text) found = offset + 1 + (end ? node.content.size : 0);
    });
    return state.apply(state.tr.setSelection(TextSelection.create(state.doc, found)));
  };
  const run = (state: EditorState, command: typeof joinBackwards) => {
    let next = state;
    command(state, (tr) => (next = state.apply(tr)));
    return next;
  };
  const texts = (state: EditorState) => manuscriptOf(state.doc).elements.map((element) => element.text);

  it("Backspace at the start of the line after a break takes the break out, and both lines stay", () => {
    const after = run(at(editorStateFor(parse(SMALL)), "After the second break."), joinBackwards);
    expect(texts(after)).toEqual([
      "Words above the break.",
      "====",
      "INT. KITCHEN - DAY",
      "Before the second break.",
      "After the second break.",
    ]);
  });

  it("Delete at the end of the line before a break does the same", () => {
    const after = run(at(editorStateFor(parse(SMALL)), "Before the second break.", true), joinForwards);
    expect(texts(after)).not.toContain("===");
    expect(texts(after)).toContain("Before the second break.");
    expect(texts(after)).toContain("After the second break.");
  });

  it("a type given to a selection across a break leaves the break a break", () => {
    let state = editorStateFor(parse(SMALL));
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, state.doc.content.size - 1)));
    const after = run(state, setElementType("action"));
    expect(manuscriptOf(after.doc).elements.filter((element) => element.type === "page-break")).toHaveLength(2);
  });
});

describe("the PDF", () => {
  it("prints the epigraph on its own page between the title page and page 1", () => {
    const printed = pdfPagesOf(bigFish());
    expect(printed.frontMatter).toHaveLength(1);
    expect(printed.frontMatter[0]!.map((run) => run.text).join(" ")).toBe(EPIGRAPH);
    // No page number on it, and page 1 is still FADE IN: with none either.
    expect(printed.frontMatter[0]!.some((run) => /^\d+\.$/.test(run.text))).toBe(false);
    expect(printed.pages[0]![0]!.text).toBe("FADE IN:");
    expect([...printed.frontMatter, ...printed.pages].flat().some((run) => BREAK_LINE.test(run.text))).toBe(false);
  });

  it("is a file with the content above the break on its own page", async () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const font = (name: string) =>
      new Uint8Array(readFileSync(join(root, "app", "public", "fonts", `CourierPrime-${name}.ttf`)));
    const bytes = await renderPdf(pdfPagesOf(parse(SMALL)), {
      regular: font("Regular"),
      bold: font("Bold"),
      italic: font("Italic"),
      boldItalic: font("BoldItalic"),
    });
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim());
    }
    expect(pages).toHaveLength(4);
    expect(pages[0]).toContain("A Small Test");
    expect(pages[1]).toBe("Words above the break.");
    expect(pages[2]).toBe("INT. KITCHEN - DAY Before the second break.");
    expect(pages[3]).toBe("2. After the second break.");
  }, 30_000);
});

describe("the file: save and Save a Copy as Fountain", () => {
  it("saves Big Fish with the epigraph and the `====` exactly where they were", () => {
    const state = editorStateFor(bigFish());
    const saved = decodeFile(exportScreenplay(manuscriptOf(state.doc))).text;
    expect(saved).toBe(decodeFile(exportScreenplay(importScreenplay(bigFishBytes()).document)).text);
    expect(saved).toContain(`${EPIGRAPH}\n\n====\n\n**FADE IN:**`);
  });

  it("keeps them after an edit on page 1", () => {
    const state = editorStateFor(bigFish());
    let fadeIn = -1;
    state.doc.forEach((node, offset) => {
      if (node.textContent === "FADE IN:" && fadeIn < 0) fadeIn = offset + 1;
    });
    const edited = state.apply(state.tr.insertText("SLOWLY ", fadeIn));
    const saved = decodeFile(exportScreenplay(manuscriptOf(edited.doc))).text;
    expect(saved).toContain(`${EPIGRAPH}\n\n====\n\n**SLOWLY FADE IN:**`);
  });

  it("keeps both breaks and everything above them in the save and in the Fountain copy", () => {
    const document = manuscriptOf(editorStateFor(parse(SMALL)).doc);
    expect(decodeFile(exportScreenplay(document)).text).toBe(SMALL);
    const copy = decodeFile(fountainCopyOf(document)).text;
    expect(copy).toContain("Words above the break.\n\n====\n\nINT. KITCHEN - DAY");
    expect(copy).toContain("Before the second break.\n\n===\n\nAfter the second break.");
    expect(copy).toContain("Title: A Small Test");
  });

  it("keeps Big Fish's epigraph and break in the Fountain copy", () => {
    const copy = decodeFile(fountainCopyOf(bigFish())).text;
    expect(copy).toContain(`${EPIGRAPH}\n\n====\n\n**FADE IN:**`);
  });
});
