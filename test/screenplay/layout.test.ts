/**
 * #87 — The page rule: a layout of lines and split points.
 *
 * The layout reads the same chunks the count does, so these tests assert what
 * the lines *mean* — where a speech is closed and reopened, what is on each
 * page — and not only that the totals agree (AGENTS.md: check the census).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeFile } from "../../src/decode.ts";
import type { Element, ScreenplayDocument } from "../../src/screenplay/document.ts";
import { ELEMENT_GEOMETRY, PAGE } from "../../src/screenplay/geometry.ts";
import { exportScreenplay, importScreenplay } from "../../src/screenplay/import.ts";
import { layout, MORE_TEXT, type Layout, type LayoutLine } from "../../src/screenplay/layout.ts";
import { paginate, wrapCount, wrapStarts } from "../../src/screenplay/paginate.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { readFixtureBytes } from "../support/files.ts";

const FIXTURES = [
  ["Big-Fish.fountain", 120],
  ["Brick-&-Steel.fountain", 4],
  ["Big-Fish-augmented.fountain", 120],
] as const;

function loadFixture(name: string): ScreenplayDocument {
  return parse(
    decodeFile(exportScreenplay(importScreenplay(readFixtureBytes(name)).document)).text,
  );
}

function el(type: Element["type"], text: string, extra: Partial<Element> = {}): Element {
  return { type, text, forced: false, ...extra };
}

function doc(elements: Element[]): ScreenplayDocument {
  return { titlePage: [], elements, comments: [], endsWithNewline: true };
}

/** Words that wrap to at least `lines` lines at the dialogue measure. */
function speechOf(lines: number): string {
  const width = ELEMENT_GEOMETRY.dialogue.width;
  const words: string[] = [];
  while (wrapCount(words.join(" "), width) < lines) words.push(`word${words.length}`);
  return words.join(" ");
}

const allLines = (l: Layout): LayoutLine[] => l.pages.flatMap((page) => [...page.lines]);

/** A small seeded generator, rewound per test (docs/STANDARDS.md: determinism). */
function generator(seed: number): (n: number) => number {
  let state = seed;
  return (n) => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % n;
  };
}

describe("wrapStarts is wrapCount's rule with offsets", () => {
  it("agrees with wrapCount on generated text at every width", () => {
    const next = generator(7);
    const pieces = ["a", "bb", "cccc", "ddddddddd", "e".repeat(40), " ", "  ", "   "];
    for (let trial = 0; trial < 500; trial++) {
      let text = "";
      for (let k = next(30); k >= 0; k--) text += pieces[next(pieces.length)]!;
      for (const width of [1, 5, 10, 35, 61]) {
        const starts = wrapStarts(text, width);
        expect(starts.length, JSON.stringify({ text, width })).toBe(wrapCount(text, width));
        expect([...starts].sort((a, b) => a - b)).toEqual(starts);
      }
    }
  });
});

describe("layout on the committed fixtures", () => {
  for (const [name, pages] of FIXTURES) {
    it(`${name}: totalPages equals paginate (${pages}) and every printed element is whole`, () => {
      const d = loadFixture(name);
      const l = layout(d);
      expect(l.totalPages).toBe(paginate(d).totalPages);
      expect(l.totalPages).toBe(pages);
      expect(l.pages.map((p) => p.number)).toEqual(Array.from({ length: pages }, (_, i) => i + 1));

      // Census: each paginated element's lines, rejoined, are its own text.
      const text = new Map<number, string[]>();
      for (const line of allLines(l)) {
        if (line.kind !== "text") continue;
        const parts = text.get(line.elementIndex) ?? [];
        parts.push(line.text);
        text.set(line.elementIndex, parts);
      }
      let checked = 0;
      for (const [index, page] of paginate(d).pageOfElement.entries()) {
        if (page === undefined) continue;
        const element = d.elements[index]!;
        if (element.type === "page-break") continue;
        const squash = (value: string | undefined): string | undefined =>
          value?.trim().replace(/ +/g, " ");
        expect(squash(text.get(index)?.join(" ")), `element ${index}`).toBe(squash(element.text));
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });
  }

  it("no row is used twice in a column, rows rise, and none is past the page", () => {
    for (const [name] of FIXTURES) {
      for (const page of layout(loadFixture(name)).pages) {
        const seen = new Set<string>();
        let last = -1;
        for (const line of page.lines) {
          const key = `${line.row}/${line.column}`;
          expect(seen.has(key), `${name} p${page.number} ${key}`).toBe(false);
          seen.add(key);
          expect(line.row).toBeGreaterThanOrEqual(last);
          expect(line.row).toBeLessThan(PAGE.linesPerPage);
          last = line.row;
        }
      }
    }
  });

  it("carries marks onto the line they fall on, relative to the line", () => {
    const d = doc([
      el("scene-heading", "INT. ROOM - DAY"),
      el("action", `${"x".repeat(60)} bold tail`, {
        marks: [{ mark: "bold", start: 61, end: 65 }],
      }),
    ]);
    const lines = allLines(layout(d)).filter((line) => line.kind === "text");
    expect(lines.map((line) => line.text)).toEqual([
      "INT. ROOM - DAY",
      "x".repeat(60),
      "bold tail",
    ]);
    expect(lines[1]!.marks).toBeUndefined();
    expect(lines[2]!.marks).toEqual([{ mark: "bold", start: 0, end: 4 }]);
    expect(lines[2]!.start).toBe(61);
  });
});

describe("a speech that crosses a break", () => {
  function split(cue: string, extra: Element[] = []): Layout {
    return layout(
      doc([
        el("scene-heading", "INT. ROOM - DAY"),
        el("action", "He waits."),
        el("character", cue),
        ...extra,
        el("dialogue", speechOf(70)),
      ]),
    );
  }

  it("closes the page with (MORE) and reopens with the bare cue (CONT'D)", () => {
    const l = split("EDWARD");
    expect(l.totalPages).toBe(2);
    expect(l.pages[0]!.lines.at(-1)).toMatchObject({
      kind: "more",
      text: MORE_TEXT,
      row: PAGE.linesPerPage - 1,
    });
    expect(l.pages[1]!.lines[0]).toMatchObject({
      kind: "contd",
      text: "EDWARD (CONT'D)",
      row: 0,
    });
    expect(l.pages[1]!.lines[1]).toMatchObject({ kind: "text", row: 1 });
  });

  it("keeps (V.O.) and adds (CONT'D) after it", () => {
    expect(split("EDWARD (V.O.)").pages[1]!.lines[0]!.text).toBe("EDWARD (V.O.) (CONT'D)");
  });

  it("does not double a (CONT'D) the cue already carries", () => {
    expect(split("EDWARD (CONT'D)").pages[1]!.lines[0]!.text).toBe("EDWARD (CONT'D)");
    expect(split("EDWARD (V.O.) (CONT'D)").pages[1]!.lines[0]!.text).toBe("EDWARD (V.O.) (CONT'D)");
  });

  it("finds the cue past a parenthetical", () => {
    const l = split("EDWARD", [el("parenthetical", "(quietly)")]);
    expect(l.pages[1]!.lines[0]!.text).toBe("EDWARD (CONT'D)");
  });

  it("reports where the split falls, and it is a line start", () => {
    const d = doc([
      el("scene-heading", "INT. ROOM - DAY"),
      el("character", "EDWARD"),
      el("dialogue", speechOf(70)),
    ]);
    const l = layout(d);
    expect(l.splits).toHaveLength(1);
    const [only] = l.splits;
    expect(only).toMatchObject({ elementIndex: 2, page: 2 });
    const secondPart = l.pages[1]!.lines.find((line) => line.kind === "text")!;
    expect(only!.offset).toBe(secondPart.start);
    expect(wrapStarts(d.elements[2]!.text, ELEMENT_GEOMETRY.dialogue.width)).toContain(
      only!.offset,
    );
  });

  it("never leaves a single line alone at the foot or the head", () => {
    // Slide the start of a long speech down the page so every remainder is tried.
    let splitSeen = 0;
    for (let filler = 0; filler < 40; filler++) {
      const elements: Element[] = [el("scene-heading", "INT. ROOM - DAY")];
      for (let k = 0; k < filler; k++) elements.push(el("action", `Beat ${k}.`));
      elements.push(el("character", "EDWARD"), el("dialogue", speechOf(57)));
      const l = layout(doc(elements));
      const speech = elements.length - 1;
      const parts = l.pages
        .map(
          (page) =>
            page.lines.filter((line) => line.kind === "text" && line.elementIndex === speech)
              .length,
        )
        .filter((n) => n > 0);
      if (parts.length > 1) {
        splitSeen++;
        for (const n of parts) expect(n, `filler ${filler}: ${parts}`).toBeGreaterThan(1);
      }
    }
    expect(splitSeen).toBeGreaterThan(0);
  });

  it("moves a dual-dialogue band whole, and never splits it", () => {
    const l = layout(
      doc([
        el("scene-heading", "INT. ROOM - DAY"),
        el("character", "EDWARD"),
        el("dialogue", speechOf(60)),
        el("character", "SANDRA", { dual: true }),
        el("dialogue", "Short."),
      ]),
    );
    const lines = allLines(l);
    expect(lines.some((line) => line.kind === "more" || line.kind === "contd")).toBe(false);
    const left = lines.filter((line) => line.column === "left");
    const right = lines.filter((line) => line.column === "right");
    expect(left.length).toBeGreaterThan(right.length);
    expect(right.map((line) => line.text)).toEqual(["SANDRA", "Short."]);
    expect(right[0]!.row).toBe(left[0]!.row);
    const pagesWithBand = l.pages.filter((p) => p.lines.some((line) => line.column !== "full"));
    expect(pagesWithBand).toHaveLength(1);
  });
});

describe("the layout is the count", () => {
  it("is incremental and equals a full layout after any edit sequence", () => {
    const next = generator(42);
    for (let trial = 0; trial < 12; trial++) {
      let d = doc([el("scene-heading", "INT. ROOM - DAY")]);
      let l = layout(d);
      for (let step = 0; step < 120; step++) {
        const elements = [...d.elements];
        const at = next(elements.length);
        const roll = next(10);
        if (roll < 3) {
          elements.splice(
            at + 1,
            0,
            el("action", `Beat ${step}. ${"word. word word ".repeat(next(12))}`.trim()),
          );
        } else if (roll < 5) {
          const cue = el("character", ["EDWARD", "SANDRA (V.O.)", "WILL (CONT'D)"][next(3)]!);
          const aside =
            next(2) === 0
              ? []
              : [el("parenthetical", "(beat)"), el("dialogue", speechOf(1 + next(6)))];
          elements.splice(at + 1, 0, cue, el("dialogue", speechOf(1 + next(80))), ...aside);
        } else if (roll < 6) {
          elements.splice(at + 1, 0, el("page-break", ""));
        } else if (roll < 7 && elements.length > 2) {
          elements.splice(at, 1);
        } else {
          const target = elements[at]!;
          if (target.type === "action" || target.type === "dialogue") {
            elements[at] = {
              ...target,
              text: `${target.text} ${"more. more ".repeat(next(20))}`.trim(),
            };
          }
        }
        d = { ...d, elements };
        l = layout(d, l, Math.max(0, at - 1));
        const full = layout(d);
        const where = `trial ${trial} step ${step}`;
        expect(l.totalPages, where).toBe(full.totalPages);
        expect(l.pages, where).toEqual(full.pages);
        expect(l.pagination.chunks, where).toEqual(full.pagination.chunks);
        expect(l.splits, where).toEqual(full.splits);
        expect(l.pagination.fill, where).toEqual(full.pagination.fill);
        expect(l.pagination.pageOfElement, where).toEqual(full.pagination.pageOfElement);
        expect(l.totalPages, where).toBe(paginate(d).totalPages);
      }
    }
  });

  it("reuses the pages before the edit rather than rebuilding them", () => {
    const d = loadFixture("Big-Fish.fountain");
    const l = layout(d);
    const last = d.elements.length - 1;
    const edited = {
      ...d,
      elements: d.elements.map((e, i) => (i === last ? { ...e, text: `${e.text} and on` } : e)),
    };
    const again = layout(edited, l, last);
    expect(again.pagination.resumedFromPage).toBeGreaterThan(100);
    expect(again.pages[0]).toBe(l.pages[0]);
    expect(again.pages[50]).toBe(l.pages[50]);
  });

  it("holds the 16 ms keystroke budget, measurer included", () => {
    const d = loadFixture("Big-Fish.fountain");
    let l = layout(d);
    const dirty = Math.floor(d.elements.length / 2);
    const runs = 200;
    // The loop's own work — building the edited document — is inside the timing.
    const start = performance.now();
    for (let i = 0; i < runs; i++) {
      const edited = {
        ...d,
        elements: d.elements.map((e, k) => (k === dirty ? { ...e, text: `${e.text}${i % 3}` } : e)),
      };
      l = layout(edited, l, dirty);
    }
    expect((performance.now() - start) / runs).toBeLessThan(16);
  });
});

describe("the engine stays out of the DOM (ADR-0024)", () => {
  it("names no browser measurement", () => {
    for (const file of ["layout.ts", "paginate.ts"]) {
      const source = readFileSync(new URL(`../../src/screenplay/${file}`, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(source).not.toMatch(
        /measureText|getClientRects|getBoundingClientRect|document\.createElement/,
      );
    }
  });
});
