/**
 * @vitest-environment jsdom
 *
 * The seams between sheets (ADR-0033, ADR-0024, ADR-0026).
 *
 * Asserts what a seam *means* — which element begins each sheet, where inside a
 * split element the seam falls, what closes and reopens a speech — and that
 * none of it is ever in the document, not only that the bytes survive.
 */
import { EditorView } from "prosemirror-view";
import { describe, expect, it } from "vitest";
import { decodeFile } from "../../src/decode.ts";
import type { Element, ScreenplayDocument } from "../../src/screenplay/document.ts";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { ELEMENT_GEOMETRY, PAGE } from "../../src/screenplay/geometry.ts";
import { exportScreenplay, importScreenplay } from "../../src/screenplay/import.ts";
import { layout } from "../../src/screenplay/layout.ts";
import { paginate, wrapCount } from "../../src/screenplay/paginate.ts";
import { parse } from "../../src/screenplay/parse.ts";
import {
  manuscriptStarts,
  sheetBreaks,
  sheetDecorations,
  type SheetBreak,
} from "../../src/screenplay/sheets.ts";
import { drawSheetBreak } from "../../app/src/workspaces/editor/sheet-break.ts";
import { readFixtureBytes } from "../support/files.ts";

const FIXTURES = ["Big-Fish.fountain", "Brick-&-Steel.fountain"] as const;

function loadFixture(name: string): ScreenplayDocument {
  return parse(
    decodeFile(exportScreenplay(importScreenplay(readFixtureBytes(name)).document)).text,
  );
}

function el(type: Element["type"], text: string): Element {
  return { type, text, forced: false };
}

function doc(elements: Element[]): ScreenplayDocument {
  return { titlePage: [], elements, comments: [], endsWithNewline: true };
}

function speechOf(lines: number): string {
  const width = ELEMENT_GEOMETRY.dialogue.width;
  const words: string[] = [];
  while (wrapCount(words.join(" "), width) < lines) words.push(`word${words.length}`);
  return words.join(" ");
}

/** A speech too long for one page, so it must cross a break. */
function speechAcrossABreak(cue: string): ScreenplayDocument {
  return doc([
    el("scene-heading", "INT. ROOM - DAY"),
    el("character", cue),
    el("dialogue", speechOf(70)),
  ]);
}

const draw = (seam: SheetBreak): HTMLElement => drawSheetBreak(seam);

describe.each(FIXTURES)("on %s", (name) => {
  const document = loadFixture(name);
  const laid = layout(document);
  const breaks = sheetBreaks(laid);
  const state = editorStateFor(document);

  it("has one seam for every sheet after the first", () => {
    expect(laid.totalPages).toBe(paginate(document).totalPages);
    expect(breaks).toHaveLength(laid.totalPages - 1);
    expect(breaks.map((seam) => seam.page)).toEqual(
      Array.from({ length: laid.totalPages - 1 }, (_, i) => i + 2),
    );
    expect(sheetDecorations(state.doc, laid, draw).find()).toHaveLength(laid.totalPages - 1);
  });

  it("falls where the layout says each page begins", () => {
    const starts = manuscriptStarts(state.doc);
    expect(starts).toHaveLength(document.elements.length);
    const widgets = sheetDecorations(state.doc, laid, draw)
      .find()
      .sort((a, b) => a.from - b.from);
    breaks.forEach((seam, i) => {
      const first = laid.pages[seam.page - 1]!.lines.find((line) => line.kind === "text")!;
      expect(seam.elementIndex).toBe(first.elementIndex);
      const node = state.doc.nodeAt(starts[seam.elementIndex]!)!;
      expect(node.textContent).toBe(document.elements[seam.elementIndex]!.text);
      const expected =
        seam.offset === 0
          ? starts[seam.elementIndex]!
          : starts[seam.elementIndex]! + 1 + seam.offset;
      expect(widgets[i]!.from).toBe(expected);
      if (seam.offset > 0) {
        // Inside the element: the text before the seam is exactly what the
        // first sheet holds of it, and the text after begins the next.
        const before = state.doc.textBetween(starts[seam.elementIndex]! + 1, widgets[i]!.from);
        expect(before).toBe(document.elements[seam.elementIndex]!.text.slice(0, seam.offset));
      }
    });
  });

  it("leaves rows left that make every sheet 55 lines", () => {
    for (const seam of breaks) {
      const last = laid.pages[seam.page - 2]!.lines.at(-1)!;
      expect(last.row + 1 + seam.rowsLeft).toBe(PAGE.linesPerPage);
    }
  });

  it("closes a speech with (MORE) exactly where it is reopened", () => {
    const more = breaks.filter((seam) => seam.more).length;
    const contd = breaks.filter((seam) => seam.contd !== undefined).length;
    expect(more).toBe(contd);
    for (const seam of breaks) {
      if (seam.contd !== undefined) expect(seam.contd).toContain("(CONT'D)");
    }
    console.log(
      `${name}: ${laid.totalPages} pages, ${breaks.length} seams, ${more} speeches split`,
    );
  });

  it("leaves the document, and so the file, untouched", () => {
    const before = exportScreenplay(manuscriptOf(state.doc));
    const view = new EditorView(window.document.createElement("div"), {
      state,
      decorations: () => sheetDecorations(state.doc, laid, draw),
    });
    try {
      expect(view.dom.querySelectorAll(".sheet-break")).toHaveLength(breaks.length);
      expect(exportScreenplay(manuscriptOf(view.state.doc))).toEqual(before);
      // Nothing of a seam is in the text the editor can copy or cut.
      const all = view.state.doc.textBetween(0, view.state.doc.content.size, "\n");
      expect(all).not.toContain("(MORE)");
      expect(all).not.toMatch(/^\d+\.$/m);
    } finally {
      view.destroy();
    }
  });
});

describe("(MORE) and (CONT'D)", () => {
  it.each([
    ["a bare cue", "MAYA", "MAYA (CONT'D)"],
    ["a cue with (V.O.)", "EDWARD (V.O.)", "EDWARD (V.O.) (CONT'D)"],
    ["a cue already ending (CONT'D), not doubled", "MAYA (CONT'D)", "MAYA (CONT'D)"],
  ])("closes and reopens a speech split over a break: %s", (_, cue, reopened) => {
    const laid = layout(speechAcrossABreak(cue));
    const [seam] = sheetBreaks(laid);
    expect(seam).toBeDefined();
    expect(seam!.more).toBe(true);
    expect(seam!.contd).toBe(reopened);
    // Inside the speech's own dialogue element, not before it.
    expect(seam!.offset).toBeGreaterThan(0);
  });

  it("draws nothing of the kind where action splits", () => {
    const sentence = "She crosses the room slowly, and the light follows her. ";
    const laid = layout(
      doc([
        ...Array.from({ length: 52 }, (_, i) => el("action", `Beat ${i}.`)),
        el("action", sentence.repeat(14).trim()),
      ]),
    );
    const seams = sheetBreaks(laid);
    expect(seams.length).toBeGreaterThan(0);
    for (const seam of seams) {
      expect(seam.more).toBe(false);
      expect(seam.contd).toBeUndefined();
    }
  });

  it("puts no (MORE) on a break between elements of a finished speech", () => {
    const laid = layout(
      doc([
        ...Array.from({ length: 54 }, (_, i) => el("action", `Beat ${i}.`)),
        el("action", "Next."),
      ]),
    );
    for (const seam of sheetBreaks(laid)) expect(seam.more).toBe(false);
  });
});

describe("what a seam is made of", () => {
  const seam: SheetBreak = {
    page: 12,
    elementIndex: 3,
    offset: 40,
    rowsLeft: 7,
    more: true,
    contd: "MAYA (CONT'D)",
  };

  it("draws (MORE), the foot, the desk, the page number and the reopened cue, in that order", () => {
    const dom = drawSheetBreak(seam);
    expect([...dom.children].map((child) => child.classList[0])).toEqual([
      "sheet-break__more",
      "sheet-break__foot",
      "sheet-break__desk",
      "sheet-break__head",
      "sheet-break__contd",
    ]);
    expect(dom.querySelector(".sheet-break__more")!.textContent).toBe("(MORE)");
    expect(dom.querySelector(".sheet-break__head")!.textContent).toBe("12.");
    expect(dom.querySelector(".sheet-break__foot")!.textContent).toBe("\n".repeat(7));
    expect(dom.querySelector(".sheet-break__cue")!.textContent).toBe("MAYA ");
    expect(dom.querySelector(".sheet-break__extension")!.textContent).toBe("(CONT'D)");
  });

  it("is not editable and not read out", () => {
    const dom = drawSheetBreak(seam);
    expect(dom.contentEditable).toBe("false");
    expect(dom.getAttribute("aria-hidden")).toBe("true");
  });

  it("omits (MORE) and the cue between whole elements", () => {
    const dom = drawSheetBreak({
      page: 2,
      elementIndex: 0,
      offset: 0,
      rowsLeft: 0,
      more: false,
    });
    expect([...dom.children].map((child) => child.classList[0])).toEqual([
      "sheet-break__foot",
      "sheet-break__desk",
      "sheet-break__head",
    ]);
  });
});
