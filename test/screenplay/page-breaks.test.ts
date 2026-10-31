/**
 * Q-A — where a page may break, after Final Draft (docs/adr/0033).
 *
 * Each test slides a passage down the page by one line at a time, so every
 * remainder at the foot is tried, and asserts what the break *means*: where a
 * split falls, what closes the page, what opens the next. Totals alone would
 * pass with a cue stranded at the foot.
 */
import { describe, expect, it } from "vitest";
import { decodeFile } from "../../src/decode.ts";
import type { Element, ScreenplayDocument } from "../../src/screenplay/document.ts";
import { ELEMENT_GEOMETRY, PAGE } from "../../src/screenplay/geometry.ts";
import { exportScreenplay, importScreenplay } from "../../src/screenplay/import.ts";
import { layout, type Layout, type LayoutLine } from "../../src/screenplay/layout.ts";
import { wrapCount, wrapStarts } from "../../src/screenplay/paginate.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { readFixtureBytes } from "../support/files.ts";

function el(type: Element["type"], text: string, extra: Partial<Element> = {}): Element {
  return { type, text, forced: false, ...extra };
}

function doc(elements: Element[]): ScreenplayDocument {
  return { titlePage: [], elements, comments: [], endsWithNewline: true };
}

function loadFixture(name: string): ScreenplayDocument {
  return parse(
    decodeFile(exportScreenplay(importScreenplay(readFixtureBytes(name)).document)).text,
  );
}

/**
 * One sentence of exactly `lines` full lines at `type`'s measure: four-letter
 * words, so the next sentence starts a fresh line and the sentence end is a
 * line end. (`tag` makes sentences differ; it replaces the first word.)
 */
function sentence(type: "dialogue" | "action", lines: number, tag: string): string {
  const perLine = Math.floor((ELEMENT_GEOMETRY[type].width + 1) / 5);
  const words = Array.from({ length: perLine * lines }, () => "word");
  words[0] = tag.padEnd(4, "x").slice(0, 4);
  words[words.length - 1] = "end.";
  return words.join(" ");
}

const texts = (l: Layout): LayoutLine[] =>
  l.pages.flatMap((page) => [...page.lines]).filter((line) => line.kind === "text");

/** `filler` one-line actions, then the passage. */
function slid(filler: number, passage: Element[]): ScreenplayDocument {
  const elements: Element[] = [el("scene-heading", "INT. ROOM - DAY")];
  for (let k = 0; k < filler; k++) elements.push(el("action", `Beat ${k}.`));
  return doc([...elements, ...passage]);
}

describe("a split falls at the end of a sentence", () => {
  it("dialogue: the first part ends a sentence when one fits, and each side keeps two lines", () => {
    let seen = 0;
    const speech = ["A", "B", "C"].map((t) => sentence("dialogue", 7, t)).join(" ");
    for (let filler = 0; filler < 60; filler++) {
      const d = slid(filler, [el("character", "EDWARD"), el("dialogue", speech)]);
      const l = layout(d);
      for (const split of l.splits) {
        seen++;
        const head = d.elements[split.elementIndex]!.text.slice(0, split.offset).trimEnd();
        // A sentence end when one fits the room; else (head shorter than the
        // first 7-line sentence) the last line break that does.
        const headLines = wrapCount(head, ELEMENT_GEOMETRY.dialogue.width);
        expect(head.endsWith(".") || headLines < 7, `filler ${filler}`).toBe(true);
        const sides = l.pages.map(
          (p) =>
            p.lines.filter((x) => x.kind === "text" && x.elementIndex === split.elementIndex)
              .length,
        );
        for (const n of sides.filter((n) => n > 0)) expect(n).toBeGreaterThanOrEqual(2);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("action: the first part ends a sentence when one fits, and no (MORE) or CONT'D is drawn", () => {
    let seen = 0;
    const action = ["A", "B", "C"].map((t) => sentence("action", 7, t)).join(" ");
    for (let filler = 0; filler < 60; filler++) {
      const d = slid(filler, [el("action", action)]);
      const l = layout(d);
      expect(l.pages.flatMap((p) => p.lines).filter((x) => x.kind !== "text")).toEqual([]);
      for (const split of l.splits) {
        seen++;
        const head = d.elements[split.elementIndex]!.text.slice(0, split.offset).trimEnd();
        expect(
          head.endsWith(".") || wrapCount(head, ELEMENT_GEOMETRY.action.width) < 7,
          `filler ${filler}`,
        ).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("a sentence end in the middle of a line counts; the rest is re-wrapped as a fresh paragraph", () => {
    // Sentences of 3 lines and a bit: the ends fall mid-line.
    const width = ELEMENT_GEOMETRY.action.width;
    const bit = (tag: string) => `${tag} ${"word ".repeat(Math.floor((width * 3.4) / 5))}end.`;
    const action = [bit("A"), bit("B"), bit("C"), bit("D")].join(" ");
    let midLine = 0;
    for (let filler = 0; filler < 60; filler++) {
      const d = slid(filler, [el("action", action)]);
      const l = layout(d);
      const index = d.elements.length - 1;
      for (const split of l.splits) {
        const text = d.elements[index]!.text;
        expect(text.slice(0, split.offset).trimEnd().endsWith("."), `filler ${filler}`).toBe(true);
        const next = l.pages[split.page - 1]!.lines.find((x) => x.elementIndex === index)!;
        expect(next.start).toBe(split.offset);
        expect(next.row).toBe(0);
        if (wrapStarts(text, width).every((o) => o !== split.offset)) {
          midLine++;
        }
        // The rest wraps afresh: its lines equal the wrap of the rest alone.
        const rest = text.slice(split.offset);
        const shown = l.pages[split.page - 1]!.lines.filter((x) => x.elementIndex === index);
        expect(shown.length).toBeLessThanOrEqual(wrapCount(rest, width));
        expect(shown[0]!.text).toBe(rest.slice(0, shown[0]!.text.length));
      }
    }
    expect(midLine).toBeGreaterThan(0);
  });

  it("with no usable sentence end, moves a short element whole to the next page (rule 3)", () => {
    // 6 lines, one sentence: no 2/2 sentence split, but it fits a page.
    const wall = sentence("action", 6, "W");
    for (let filler = 0; filler < 60; filler++) {
      const d = slid(filler, [el("action", wall)]);
      const l = layout(d);
      expect(l.splits, `filler ${filler}`).toEqual([]);
    }
  });

  it("a piece too tall for a page splits at a line break, still two and two (rule 4)", () => {
    const wall = Array.from({ length: 700 }, () => "word").join(" ");
    expect(wrapCount(wall, ELEMENT_GEOMETRY.action.width)).toBeGreaterThan(PAGE.linesPerPage);
    let seen = 0;
    for (let filler = 0; filler < 60; filler++) {
      const d = slid(filler, [el("action", wall)]);
      const l = layout(d);
      const index = d.elements.length - 1;
      const parts = l.pages
        .map((p) => p.lines.filter((x) => x.kind === "text" && x.elementIndex === index).length)
        .filter((n) => n > 0);
      if (parts.length > 1) seen++;
      for (const n of parts) expect(n).toBeGreaterThanOrEqual(2);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("starts every page at row 0 (rule 5)", () => {
    for (let filler = 0; filler < 60; filler++) {
      const d = slid(filler, [
        el("action", sentence("action", 5, "A")),
        el("scene-heading", "EXT. YARD - DAY"),
        el("action", sentence("action", 5, "B")),
      ]);
      for (const page of layout(d).pages) {
        expect(page.lines[0]!.row, `filler ${filler} p${page.number}`).toBe(0);
      }
    }
  });

  it("with no sentence end in the room, a one-sentence piece too tall for a page splits at the last line break that leaves two and two (rule 4)", () => {
    // One 100-line sentence: its only end is the last line, never in the room.
    const wall = sentence("action", 100, "W");
    let seen = 0;
    for (let filler = 0; filler < 60; filler++) {
      const d = slid(filler, [el("action", wall)]);
      const l = layout(d);
      const index = d.elements.length - 1;
      const parts = l.pages
        .map((p) => p.lines.filter((x) => x.kind === "text" && x.elementIndex === index).length)
        .filter((n) => n > 0);
      // Never moved whole: the first page already holds the start of it.
      expect(parts.length, `filler ${filler}`).toBeGreaterThan(1);
      const first = l.pages.find((p) => p.lines.some((x) => x.elementIndex === index))!;
      const head = first.lines.filter((x) => x.elementIndex === index);
      // The head runs to the foot of the text area (the sheet's last row is
      // (MORE)'s), or is the two-line minimum when less than two lines remain.
      const lastRow = head[head.length - 1]!.row;
      expect(lastRow === PAGE.linesPerPage - 2 || head.length === 2, `filler ${filler}`).toBe(true);
      seen++;
    }
    expect(seen).toBe(60);
  });

  it("does not take an abbreviation for a sentence end", () => {
    // Every wrapped line ends "Mr." — none is a sentence end, so the split is the fallback's.
    const width = ELEMENT_GEOMETRY.action.width;
    const words: string[] = [];
    while (wrapCount(words.join(" "), width) < 70) words.push(words.length % 2 ? "Mr." : "see");
    expect(wrapCount(words.join(" "), width)).toBeGreaterThan(PAGE.linesPerPage);
    expect(() => layout(slid(3, [el("action", words.join(" "))]))).not.toThrow();
  });
});

describe("what a break may not do", () => {
  const SPEECH = [
    el("character", "EDWARD"),
    el("parenthetical", "(quietly)"),
    el("dialogue", [sentence("dialogue", 3, "A"), sentence("dialogue", 3, "B")].join(" ")),
  ];

  it("never ends a page on a scene heading, a cue or a parenthetical", () => {
    for (let filler = 0; filler < 60; filler++) {
      const d = slid(filler, [...SPEECH, el("scene-heading", "EXT. YARD - DAY"), ...SPEECH]);
      for (const page of layout(d).pages) {
        const last = [...page.lines].reverse().find((x) => x.kind === "text")!;
        expect(
          ["scene-heading", "character", "parenthetical"],
          `filler ${filler} p${page.number}`,
        ).not.toContain(d.elements[last.elementIndex]!.type);
      }
    }
  });

  it("keeps a heading with the first lines of the action after it", () => {
    for (let filler = 0; filler < 60; filler++) {
      const d = slid(filler, [
        el("scene-heading", "EXT. YARD - DAY"),
        el("action", [sentence("action", 4, "A"), sentence("action", 4, "B")].join(" ")),
      ]);
      const heading = d.elements.length - 2;
      const l = layout(d);
      const page = l.pages.find((p) => p.lines.some((x) => x.elementIndex === heading))!;
      expect(
        page.lines.some((x) => x.elementIndex === heading + 1),
        `filler ${filler}`,
      ).toBe(true);
    }
  });

  it("closes and reopens a speech that breaks between its elements", () => {
    let seen = 0;
    for (let filler = 0; filler < 60; filler++) {
      const d = slid(filler, [
        el("character", "EDWARD"),
        el("dialogue", sentence("dialogue", 3, "A")),
        el("parenthetical", "(beat)"),
        el("dialogue", sentence("dialogue", 3, "B")),
      ]);
      const l = layout(d);
      const at = (i: number) => l.pagination.pageOfElement[i]!;
      const [first, , third] = [d.elements.length - 3, 0, d.elements.length - 2];
      if (at(first) === at(third)) continue;
      seen++;
      const before = l.pages[at(first) - 1]!;
      expect(before.lines.at(-1), `filler ${filler}`).toMatchObject({
        kind: "more",
        row: before.lines.at(-2)!.row + 1,
      });
      expect(before.lines.at(-1)!.row).toBeLessThan(PAGE.linesPerPage);
      const after = l.pages[at(third) - 1]!;
      expect(after.lines[0]).toMatchObject({
        kind: "contd",
        text: "EDWARD (CONT'D)",
        row: -1,
      });
      expect(after.lines[1]).toMatchObject({
        kind: "text",
        elementIndex: third,
        row: 0,
      });
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("may end a page on a parenthetical that follows dialogue, with (MORE) after it", () => {
    // Big Fish page 30: "leave with you." / "(closer)" / (MORE). A parenthetical
    // straight after the cue still keeps with its dialogue (the test above).
    let seen = 0;
    for (let filler = 0; filler < 60; filler++) {
      const d = slid(filler, [
        el("character", "EDWARD"),
        el("dialogue", sentence("dialogue", 3, "A")),
        el("parenthetical", "(closer)"),
        el("dialogue", sentence("dialogue", 4, "B")),
      ]);
      const paren = d.elements.length - 2;
      const l = layout(d);
      const page = l.pages.find((p) => p.lines.some((x) => x.elementIndex === paren))!;
      const last = page.lines.at(-1)!;
      if (page.number === l.totalPages || last.kind !== "more") continue;
      if (page.lines.at(-2)!.elementIndex !== paren) continue;
      seen++;
      expect(l.pages[page.number]!.lines[0]).toMatchObject({ kind: "contd", row: -1 });
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("moves the action before a transition with it, so a transition does not open a page", () => {
    // Big Fish page 113 to 114: "TIRES SMOKE as the car peals out." goes over with "BACK TO:".
    for (let filler = 0; filler < 60; filler++) {
      const d = slid(filler, [
        el("action", "The car pulls away."),
        el("transition", "BACK TO:"),
        el("scene-heading", "INT. HOSPITAL - DAY"),
      ]);
      const car = d.elements.length - 3;
      const l = layout(d);
      expect(l.pagination.pageOfElement[car], `filler ${filler}`).toBe(
        l.pagination.pageOfElement[car + 1],
      );
    }
  });

  it("moves a speech too short to split whole, with its cue", () => {
    for (let filler = 0; filler < 60; filler++) {
      const d = slid(filler, [
        el("character", "EDWARD"),
        el("dialogue", sentence("dialogue", 3, "A")),
      ]);
      const l = layout(d);
      expect(l.splits).toEqual([]);
      const cue = d.elements.length - 2;
      expect(l.pagination.pageOfElement[cue]).toBe(l.pagination.pageOfElement[cue + 1]);
    }
  });

  it("never lets a (MORE) or CONT'D line run off the sheet", () => {
    for (let filler = 0; filler < 60; filler++) {
      const d = slid(filler, [...SPEECH, ...SPEECH]);
      for (const page of layout(d).pages) {
        for (const line of page.lines) expect(line.row).toBeLessThan(PAGE.linesPerPage);
      }
    }
  });
});

describe("the rules on the committed fixtures", () => {
  const BREAKS = [
    ["Big-Fish.fountain", { splits: 10, more: 8 }],
    ["Brick-&-Steel.fountain", { splits: 0, more: 0 }],
    ["Big-Fish-augmented.fountain", { splits: 11, more: 11 }],
  ] as const;

  for (const [name, expected] of BREAKS) {
    it(`${name}: ${expected.splits} splits, ${expected.more} (MORE), every one well-formed`, () => {
      const d = loadFixture(name);
      const l = layout(d);
      expect(l.splits).toHaveLength(expected.splits);

      const lines = l.pages.flatMap((p) => [...p.lines]);
      expect(lines.filter((x) => x.kind === "more")).toHaveLength(expected.more);
      expect(lines.filter((x) => x.kind === "contd")).toHaveLength(expected.more);

      for (const page of l.pages) {
        const body = page.lines.filter((x) => x.kind === "text");
        const last = body.at(-1);
        if (last !== undefined) {
          const type = d.elements[last.elementIndex]!.type;
          expect(["scene-heading", "character"]).not.toContain(type);
          // A parenthetical may close a page only after dialogue, ahead of (MORE).
          if (type === "parenthetical") {
            expect(d.elements[last.elementIndex - 1]!.type).toBe("dialogue");
            expect(page.lines.at(-1)!.kind).toBe("more");
          }
        }
        // (MORE) is the last line of its page; CONT'D the first of the next.
        page.lines.forEach((line, k) => {
          if (line.kind === "more") {
            expect(k).toBe(page.lines.length - 1);
            expect(l.pages[page.number]!.lines[0]!.kind).toBe("contd");
          }
        });
      }

      for (const split of l.splits) {
        const element = d.elements[split.elementIndex]!;
        const parts = l.pages
          .map(
            (p) =>
              p.lines.filter((x) => x.kind === "text" && x.elementIndex === split.elementIndex)
                .length,
          )
          .filter((n) => n > 0);
        for (const n of parts)
          expect(n, `${name} element ${split.elementIndex}`).toBeGreaterThanOrEqual(2);
        expect(["action", "dialogue"]).toContain(element.type);
      }
    });
  }
});

describe("Big Fish against Final Draft's own PDF", () => {
  it("puts (MORE) on the eight pages the PDF does", () => {
    // Pages 24, 30, 49, 52, 80, 97, 98 and 107 of fountain.io's Big-Fish.pdf.
    const l = layout(loadFixture("Big-Fish.fountain"));
    const pages = l.pages
      .filter((page) => page.lines.some((x) => x.kind === "more"))
      .map((page) => page.number);
    expect(pages).toEqual([24, 30, 49, 52, 80, 97, 98, 107]);
  });
});
