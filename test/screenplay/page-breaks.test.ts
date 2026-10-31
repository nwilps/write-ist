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
import { wrapCount } from "../../src/screenplay/paginate.ts";
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

  it("with no sentence end to use, splits at a line break, still two and two", () => {
    const wall = Array.from({ length: 120 }, () => "word").join(" ");
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
        row: 0,
      });
      expect(after.lines[1]).toMatchObject({
        kind: "text",
        elementIndex: third,
        row: 1,
      });
    }
    expect(seen).toBeGreaterThan(0);
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
    ["Big-Fish.fountain", { splits: 9, more: 7 }],
    ["Brick-&-Steel.fountain", { splits: 0, more: 0 }],
    ["Big-Fish-augmented.fountain", { splits: 10, more: 9 }],
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
          expect(["scene-heading", "character", "parenthetical"]).not.toContain(
            d.elements[last.elementIndex]!.type,
          );
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
