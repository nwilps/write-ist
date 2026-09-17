/**
 * Markdown's marks, and the trap at the boundary between the two surfaces.
 *
 * ADR-0011: **`_word_` is underline in Fountain and italics in Markdown.** The
 * same characters, two surfaces, opposite meanings. A shared mark table would
 * be wrong on one of them, so each surface states its own — and this file
 * exists partly to make that a test rather than a comment.
 *
 * The census at the bottom makes the claim a byte gate cannot: that marks were
 * found at all. A parser that reads `[Socrates]{.smallcaps}` as a paragraph
 * with brackets in it writes the identical file back.
 */
import { describe, expect, it } from "vitest";
import type { Mark } from "../../src/marks.ts";
import type { ProseDocument } from "../../src/prose/document.ts";
import { importProse } from "../../src/prose/import.ts";
import { parse } from "../../src/prose/parse.ts";
import { serialise } from "../../src/prose/serialise.ts";
import { assertBytesEqual } from "../support/byte-diff.ts";
import { readFixtureBytes } from "../support/files.ts";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

const roundTrips = (source: string): void => {
  assertBytesEqual(utf8(source), utf8(serialise(parse(source))), {
    expectedLabel: "source",
    actualLabel: "output",
  });
};

/** The one element a single-block source parses to. */
const only = (source: string): ProseDocument["elements"][number] => {
  const { elements } = parse(source);
  expect(elements).toHaveLength(1);
  return elements[0]!;
};

describe("the same characters, two surfaces, opposite meanings", () => {
  it("reads `_word_` as italics here, where Fountain reads underline", () => {
    expect(only("He was _late_.").marks).toEqual([
      { mark: "italic", start: 7, end: 11, spelling: "_" },
    ]);
  });

  it("remembers which spelling the writer used, and writes that one back", () => {
    // Both mean italics and Pandoc renders them identically. Emitting our
    // favourite would rewrite a file that already said what it meant, which
    // is not on ADR-0020's list — the same reason a setext heading remembers
    // its underline.
    expect(serialise(parse("He was _late_."))).toBe("He was _late_.");
    expect(serialise(parse("He was *late*."))).toBe("He was *late*.");
    expect(only("He was *late*.").marks).toEqual([{ mark: "italic", start: 7, end: 11 }]);
  });

  it("reads `**` and `__` as bold", () => {
    expect(only("Quite **stately**.").marks).toEqual([{ mark: "bold", start: 6, end: 13 }]);
    expect(only("Quite __stately__.").marks).toEqual([
      { mark: "bold", start: 6, end: 13, spelling: "__" },
    ]);
    roundTrips("Quite __stately__.");
  });
});

describe("underline and small caps are Pandoc's bracketed span", () => {
  it("reads both classes", () => {
    expect(only("[Socrates]{.smallcaps}, who narrates.").text).toBe("Socrates, who narrates.");
    expect(only("[Socrates]{.smallcaps}, who narrates.").marks).toEqual([
      { mark: "smallcaps", start: 0, end: 8 },
    ]);
    expect(only("More [Jowett]{.underline} than Plato.").marks).toEqual([
      { mark: "underline", start: 5, end: 11 },
    ]);
    roundTrips("[Socrates]{.smallcaps}, who narrates.");
  });

  it("carries a span across a line wrap, which a screenplay element cannot", () => {
    // The acceptance fixture underlines a phrase that breaks over two lines. A
    // paragraph is one element holding all its lines, so the range simply
    // contains the newline.
    const source = "it reads as such --- [occasionally more\nJowett than Plato]{.underline}.";
    const paragraph = only(source);

    expect(paragraph.marks).toHaveLength(1);
    expect(paragraph.text.slice(paragraph.marks![0]!.start, paragraph.marks![0]!.end)).toBe(
      "occasionally more\nJowett than Plato",
    );
    roundTrips(source);
  });

  it("leaves a footnote reference alone, because nothing follows its bracket", () => {
    const source = "It reads as such.[^jowett]";

    expect(only(source).marks).toBeUndefined();
    expect(only(source).text).toBe(source);
    roundTrips(source);
  });

  it("leaves a class it cannot write back, whole rather than in part", () => {
    // All or nothing. `{.underline .footnote}` is not an underline plus
    // something we dropped; it is an attribute block outside the subset, and
    // keeping the half we understand is how a file stops saying what it said.
    const source = "A [word]{.underline .footnote} here.";

    expect(only(source).marks).toBeUndefined();
    roundTrips(source);
  });
});

describe("a delimiter that marks nothing stays in the text", () => {
  it("keeps every spelling of a scene break, which is made of the same characters", () => {
    for (const source of ["* * *", "***", "---", "___"]) {
      const element = only(source);
      expect(element.type).toBe("scene-break");
      expect(element.marks).toBeUndefined();
      expect(element.text).toBe(source);
    }
  });

  it("does not italicise inside a word, so a file name survives", () => {
    expect(only("Open big_fish_final.md now.").marks).toBeUndefined();
    roundTrips("Open big_fish_final.md now.");
  });

  it("leaves a passthrough table untouched, marks and all", () => {
    const source = ["| a | b |", "|---|---|", "| *x* | [y]{.underline} |"].join("\n");
    const element = only(source);

    expect(element.type).toBe("passthrough");
    expect(element.marks).toBeUndefined();
    expect(element.text).toBe(source);
    roundTrips(source);
  });
});

describe("marks inside the blocks that hold prose", () => {
  it("marks a heading, and the hashes stay outside the mark", () => {
    const heading = only("## The *Question* of Justice");

    expect(heading.text).toBe("The Question of Justice");
    expect(heading.marks).toEqual([{ mark: "italic", start: 4, end: 12 }]);
    roundTrips("## The *Question* of Justice");
  });

  it("marks a quote and a line block, inside their markers rather than outside", () => {
    roundTrips("> Until *philosophers* are kings,\n> cities will never have rest.");
    roundTrips("| Not to be *born* is best\n|     when all is reckoned in,");
  });

  it("writes a mark that crosses a wrap once, and the marker on every line", () => {
    const source = "> Until *philosophers\n> are kings*, no rest.";

    // The range simply contains the newline; the `>` markers are not in the
    // element's text at all, so they cannot fall inside it.
    const quote = only(source);
    expect(quote.marks).toEqual([{ mark: "italic", start: 6, end: 28 }]);
    expect(quote.text.slice(6, 28)).toBe("philosophers\nare kings");
    roundTrips(source);
  });
});

describe("marks are a set here too", () => {
  it("reads either authored nesting as the same thing", () => {
    const both: { mark: Mark; start: number; end: number }[] = [
      { mark: "bold", start: 0, end: 3 },
      { mark: "italic", start: 0, end: 3 },
    ];

    expect(only("***yes***").marks).toEqual(both);
    expect(only("**_yes_**").marks).toEqual([
      { mark: "bold", start: 0, end: 3 },
      { mark: "italic", start: 0, end: 3, spelling: "_" },
    ]);
  });

  it("writes underline outside bold, which is the declared order", () => {
    expect(serialise(parse("[**yes**]{.underline}"))).toBe("[**yes**]{.underline}");
    expect(serialise(parse("**[yes]{.underline}**"))).toBe("[**yes**]{.underline}");
  });
});

describe("the prose mark census, which a byte comparison cannot make", () => {
  const census = (): [Mark, number][] => {
    const { document } = importProse(readFixtureBytes("Republic-manuscript.md"));
    const counted = new Map<Mark, number>();
    for (const element of document.elements) {
      for (const { mark } of element.marks ?? []) counted.set(mark, (counted.get(mark) ?? 0) + 1);
    }
    return [...counted.entries()].sort();
  };

  it("finds 1 bold, 3 italic, 7 small caps and 1 underline in the Republic", () => {
    expect(census()).toEqual([
      ["bold", 1],
      ["italic", 3],
      ["smallcaps", 7],
      ["underline", 1],
    ]);
  });

  it("puts the seven small caps on the dramatis personae, and nowhere else", () => {
    const { document } = importProse(readFixtureBytes("Republic-manuscript.md"));
    const withSmallCaps = document.elements.filter((element) =>
      element.marks?.some((mark) => mark.mark === "smallcaps"),
    );

    expect(withSmallCaps).toHaveLength(1);
    expect(withSmallCaps[0]?.text).toContain("who is the narrator");
  });
});
