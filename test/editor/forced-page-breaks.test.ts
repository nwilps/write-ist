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
 * printed, and that the file keeps both.
 *
 * Since Noah's 2026-11-21 tweak the `===` *is* on the paper, faint and taking
 * no row, so it can be seen and taken out; and typing one makes a break at
 * once, deleting from one removes it at once (`page-break-editing.ts`).
 */
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
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
import { joinBackwards, joinForwards, removePageBreak, setElementType, splitElement } from "../../src/screenplay/element-keys.ts";
import { fountainCopyOf } from "../../src/screenplay/fountain-copy.ts";
import { exportScreenplay, importScreenplay } from "../../src/screenplay/import.ts";
import { layout, type Layout } from "../../src/screenplay/layout.ts";
import { canRemovePageBreak, placeOnBreak } from "../../src/screenplay/page-break-editing.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { redo, undo } from "prosemirror-history";
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
      nodeViews: hiddenTitlePage,
      decorations: () => seams(),
      dispatchTransaction: (tr) => {
        state = state.apply(tr);
        view.updateState(state);
      },
    });
    return { view, state: () => state };
  }

  it("shows each break's `===` as a line of its own, and keeps the epigraph", () => {
    // The `===` is on the paper to be seen and taken out (Noah, 2026-11-21);
    // it is never printed (above) and never takes a row (`editor.css`).
    const { view } = mounted(decodeFile(bigFishBytes()).text);
    const lines = [...view.dom.querySelectorAll<HTMLElement>("[data-element]")].filter((node) => !node.hidden);
    expect(lines[0]!.textContent).toBe(EPIGRAPH);
    expect(lines[1]!.dataset["element"]).toBe("page-break");
    expect(lines[1]!.textContent).toMatch(BREAK_LINE);
  });

  it("shows a seam to a new sheet straight after each break, page 1's with no number", () => {
    const { view } = mounted(SMALL);
    const breaks = [...view.dom.querySelectorAll<HTMLElement>('[data-element="page-break"]')];
    expect(breaks.map((line) => line.textContent)).toEqual(["====", "==="]);
    for (const line of breaks) {
      expect(line.hidden).toBe(false);
      const seam = line.nextElementSibling as HTMLElement;
      expect(seam.classList.contains("sheet-break")).toBe(true);
      expect((seam.nextElementSibling as HTMLElement).dataset["element"]).not.toBe("page-break");
    }
    const heads = [...view.dom.querySelectorAll(".sheet-break__head")].map((head) => head.textContent);
    expect(heads).toEqual(["", "2."]);
  });

  it("lets the caret into a break, as into any line", () => {
    const { view, state } = mounted(SMALL);
    let into = -1;
    state().doc.forEach((node, offset) => {
      if (node.textContent === "===") into = offset + 4;
    });
    view.dispatch(state().tr.setSelection(TextSelection.create(state().doc, into)));
    expect(state().selection.$head.parent.textContent).toBe("===");
  });
});

/** Where the line reading `text` starts and ends, in `state`. */
function lineOf(state: EditorState, text: string): { start: number; end: number } {
  let found: { start: number; end: number } | undefined;
  state.doc.forEach((node, offset) => {
    if (found === undefined && node.type.name === "element" && node.textContent === text)
      found = { start: offset + 1, end: offset + 1 + node.content.size };
  });
  if (found === undefined) throw new Error(`no line reads ${text}`);
  return found;
}

/** A writer at the keyboard: the state, typing, and the keys that delete. */
function writer(source: string) {
  let state = editorStateFor(parse(source));
  const run = (command: (state: EditorState, dispatch: (tr: Transaction) => void) => boolean) =>
    command(state, (tr) => {
      state = state.apply(tr);
    });
  return {
    state: () => state,
    caret: (at: number) => (state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)))),
    type: (text: string) => {
      for (const character of text) state = state.apply(state.tr.insertText(character));
    },
    backspace: () => {
      if (!run(joinBackwards)) {
        const at = state.selection.head;
        state = state.apply(state.tr.delete(at - 1, at));
      }
    },
    undo: () => run(undo),
    redo: () => run(redo),
    run,
  };
}

const types = (state: EditorState) => manuscriptOf(state.doc).elements.map((element) => element.type);
const pages = (state: EditorState) => layout(manuscriptOf(state.doc)).pages.map((page) => page.lines.map((line) => line.text));

const TWO_LINES = "INT. KITCHEN - DAY\n\nFirst line.\n\nSecond line.\n";

describe("typing a break (Noah, 2026-11-21)", () => {
  /** `===` typed on a new line between the two, as the writer types it. */
  function typedBreak() {
    const at = writer(TWO_LINES);
    at.caret(lineOf(at.state(), "First line.").end);
    at.run(splitElement);
    at.type("===");
    return at;
  }

  it("makes `===` on its own line a break the moment the third `=` is typed", () => {
    const at = writer(TWO_LINES);
    at.caret(lineOf(at.state(), "First line.").end);
    at.run(splitElement);
    at.type("==");
    expect(types(at.state())).not.toContain("page-break");
    at.type("=");
    expect(types(at.state())).toEqual(["scene-heading", "action", "page-break", "action"]);
  });

  it("starts a new sheet straight away, on the paper and in the PDF alike", () => {
    const at = typedBreak();
    expect(pages(at.state())).toEqual([["INT. KITCHEN - DAY", "First line."], ["Second line."]]);
    const seams = sheetBreaks(layout(manuscriptOf(at.state().doc)));
    expect(seams.map((seam) => seam.page)).toEqual([2]);
    // The paper's seam sits after the break, and the PDF prints no `===`.
    const printed = pdfPagesOf(manuscriptOf(at.state().doc));
    expect(printed.pages.map((page) => page.filter((run) => !/^\d+\.$/.test(run.text)).map((run) => run.text))).toEqual([
      ["INT. KITCHEN - DAY", "First line."],
      ["Second line."],
    ]);
  });

  it("keeps more `=` a break, and the file keeps them as typed", () => {
    const at = typedBreak();
    at.type("==");
    expect(types(at.state())).toContain("page-break");
    const file = serialise(manuscriptOf(at.state().doc));
    expect(file).toBe("INT. KITCHEN - DAY\n\nFirst line.\n\n=====\n\nSecond line.\n");
    // Reopened, it is the same break: the census, not only the bytes.
    expect(parse(file).elements.map((element) => element.type)).toEqual(types(at.state()));
    expect(serialise(parse(file))).toBe(file);
  });

  it("is taken back by Undo, break and all, and put back by Redo", () => {
    const at = typedBreak();
    const broken = at.state().doc;
    at.undo();
    expect(types(at.state())).not.toContain("page-break");
    expect(pages(at.state())).toHaveLength(1);
    at.redo();
    expect(at.state().doc.eq(broken)).toBe(true);
  });

  it("is not made of a line that only starts with `===`, or of a forced action", () => {
    const at = typedBreak();
    at.type(" x");
    expect(types(at.state())).not.toContain("page-break");
    // `!===` in the file says "action, not a break"; an edit elsewhere leaves it so.
    const forced = writer("!===\n\nWords.\n");
    forced.caret(lineOf(forced.state(), "Words.").end);
    forced.type("!");
    expect(types(forced.state())).toEqual(["action", "action"]);
    expect(serialise(manuscriptOf(forced.state().doc))).toBe("!===\n\nWords.!\n");
  });
});

describe("deleting a break's `===`", () => {
  it("takes the break out at once, when a `=` goes", () => {
    const at = writer(SMALL);
    at.caret(lineOf(at.state(), "===").end);
    const before = pages(at.state()).length;
    at.backspace();
    expect(types(at.state()).filter((type) => type === "page-break")).toHaveLength(1);
    expect(manuscriptOf(at.state().doc).elements.find((element) => element.text === "==")?.type).toBe("action");
    expect(pages(at.state())).toHaveLength(before - 1);
    // And Undo puts the break back.
    at.undo();
    expect(lineOf(at.state(), "===")).toBeDefined();
    expect(types(at.state()).filter((type) => type === "page-break")).toHaveLength(2);
  });

  it("takes it out whole with Backspace at its start or Delete at its end", () => {
    for (const [where, key] of [["start", joinBackwards], ["end", joinForwards]] as const) {
      const at = writer(SMALL);
      const line = lineOf(at.state(), "===");
      at.caret(where === "start" ? line.start : line.end);
      at.run(key);
      expect(types(at.state()).filter((type) => type === "page-break"), where).toHaveLength(1);
      // The lines either side are as they were.
      expect(lineOf(at.state(), "Before the second break.")).toBeDefined();
      expect(lineOf(at.state(), "After the second break.")).toBeDefined();
    }
  });
});

describe("Remove Page Break", () => {
  it("is offered only on a break line", () => {
    const state = editorStateFor(parse(SMALL));
    const line = lineOf(state, "===");
    expect(canRemovePageBreak(state, line.start)).toBe(true);
    expect(canRemovePageBreak(state, line.end)).toBe(true);
    // Between elements, just before the break: still the break's line.
    expect(canRemovePageBreak(state, line.start - 1)).toBe(true);
    expect(canRemovePageBreak(state, lineOf(state, "After the second break.").start)).toBe(false);
  });

  it("takes the break out whole, as one undo step, and the sheet closes up", () => {
    const at = writer(SMALL);
    const before = at.state().doc;
    expect(at.run(removePageBreak(lineOf(at.state(), "===").start + 1))).toBe(true);
    expect(pages(at.state())).toEqual([["INT. KITCHEN - DAY", "Before the second break.", "After the second break."]]);
    expect(at.state().selection.$head.parent.textContent).toBe("After the second break.");
    expect(serialise(manuscriptOf(at.state().doc))).not.toMatch(/^===$/m);
    at.undo();
    expect(at.state().doc.eq(before)).toBe(true);
  });

  it("is reached by a right-click on the `===`, which WebKit answers with the place after it", () => {
    // Measured in WebKit: a point on the drawn `===` gives the break as the node
    // it is inside, and the position just past it — the next sheet's first line.
    const state = editorStateFor(parse(SMALL));
    const line = lineOf(state, "===");
    const after = line.end + 1;
    expect(canRemovePageBreak(state, after)).toBe(false);
    const at = placeOnBreak(state.doc, { pos: after, inside: line.start - 1 });
    expect(at).toBe(line.end);
    expect(canRemovePageBreak(state, at)).toBe(true);
    // Inside the `===` already, or not on a break at all, the place is left alone.
    expect(placeOnBreak(state.doc, { pos: line.start + 1, inside: line.start - 1 })).toBe(line.start + 1);
    const words = lineOf(state, "After the second break.");
    expect(placeOnBreak(state.doc, { pos: words.start + 2, inside: words.start - 1 })).toBe(words.start + 2);
    expect(placeOnBreak(state.doc, { pos: 5, inside: -1 })).toBe(5);
  });

  it("does nothing off a break", () => {
    const at = writer(SMALL);
    expect(at.run(removePageBreak(lineOf(at.state(), "After the second break.").start))).toBe(false);
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
