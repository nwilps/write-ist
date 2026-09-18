/**
 * Fountain's marks, on small inputs where the expected answer can be read.
 *
 * Two things are being proved here and they are different.
 *
 * The **rules** say which delimiters pair and which stay in the text. Every
 * one of them below is a line that exists in the acceptance corpus or in one
 * of the three published screenplays, because each is a case where getting it
 * wrong moves bytes.
 *
 * The **census** says the parser actually found marks. That is not the same
 * claim as the byte gate, and it is the claim the byte gate cannot make: a
 * parser that reads `**INT. HOUSE - DAY**` as a heading with two asterisks in
 * its name writes the identical file back. Twice now a parser has been wrong
 * about an element while every byte test passed. A count catches what a byte
 * comparison cannot.
 */
import { describe, expect, it } from "vitest";
import type { Mark } from "../../src/marks.ts";
import type { ScreenplayDocument } from "../../src/screenplay/document.ts";
import { importScreenplay } from "../../src/screenplay/import.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { assertBytesEqual } from "../support/byte-diff.ts";
import { readFixtureBytes } from "../support/files.ts";
import { describeCorpus, readCorpusBytes } from "../support/corpus.ts";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** Parse and serialise, asserting the text comes back exactly as it went in. */
const roundTrips = (source: string): void => {
  assertBytesEqual(utf8(source), utf8(serialise(parse(source))), {
    expectedLabel: "source",
    actualLabel: "output",
  });
};

/** The one element a single-line source parses to. */
const only = (source: string): ScreenplayDocument["elements"][number] => {
  const { elements } = parse(source);
  expect(elements).toHaveLength(1);
  return elements[0]!;
};

describe("what a delimiter spells", () => {
  it("reads the three Fountain marks", () => {
    expect(only("*italic*").marks).toEqual([{ mark: "italic", start: 0, end: 6 }]);
    expect(only("**bold**").marks).toEqual([{ mark: "bold", start: 0, end: 4 }]);
    expect(only("_underline_").marks).toEqual([{ mark: "underline", start: 0, end: 9 }]);
  });

  it("spends a run of three on both asterisk marks at once", () => {
    // Not a fourth mark and not a special case: two asterisks are bold, the
    // third is italic, and a set holds both over the same run.
    expect(only("***x***").marks).toEqual([
      { mark: "bold", start: 0, end: 1 },
      { mark: "italic", start: 0, end: 1 },
    ]);
    roundTrips("***x***");
  });

  it("takes the delimiters out of the text the writer sees", () => {
    expect(only("!This is **MITCHELL BENNETT** (87).").text).toBe(
      "This is MITCHELL BENNETT (87).",
    );
  });
});

describe("marks are a set, so one nesting is chosen on the way out", () => {
  const both: readonly { mark: Mark; start: number; end: number }[] = [
    { mark: "underline", start: 0, end: 7 },
    { mark: "bold", start: 0, end: 7 },
  ];

  it("reads either authored order as the same thing", () => {
    expect(only("_**THE END**_").marks).toEqual(both);
    expect(only("**_THE END_**").marks).toEqual(both);
  });

  it("writes underline outermost, which is the order the corpus uses", () => {
    // ADR-0020's fourth normalisation, and the only one of the seven that can
    // change a file here: the second spelling normalises to the first, once.
    expect(serialise(parse("_**THE END**_"))).toBe("_**THE END**_");
    expect(serialise(parse("**_THE END_**"))).toBe("_**THE END**_");
  });
});

describe("a delimiter that marks nothing stays in the text", () => {
  it("stops the lookahead at a blank line, so a stray delimiter is a character", () => {
    // A blank line ends a speech in Fountain, so an opener that reaches one
    // has no partner (ADR-0027). Without this bound a single stray asterisk
    // would italicise the rest of the script.
    const source = ["!He runs *and runs", "", "!She waits. *Then she goes.*"].join("\n");
    const { elements } = parse(source);

    expect(elements[0]?.marks).toBeUndefined();
    expect(elements[0]?.text).toBe("He runs *and runs");
    // The second speech's own pair is unaffected by the stray one above it.
    expect(elements[1]?.marks).toEqual([{ mark: "italic", start: 11, end: 25 }]);
    expect(elements[1]?.text.slice(11, 25)).toBe("Then she goes.");
    roundTrips(source);
  });

  it("needs the delimiter against the text, so a spaced one is a character", () => {
    expect(only("!a * b * c").marks).toBeUndefined();
    roundTrips("!a * b * c");
  });

  it("keeps the boneyard delimiters, which are made of the same character", () => {
    const source = ["/*", "!Cut for length.", "*/"].join("\n");
    const { elements } = parse(source);

    expect(elements.map((element) => element.type)).toEqual([
      "boneyard-start",
      "action",
      "boneyard-end",
    ]);
    expect(elements.map((element) => element.text)).toEqual(["/*", "Cut for length.", "*/"]);
    roundTrips(source);
  });

  it("does not underline inside a word, so a file name survives", () => {
    expect(only("!Open big_fish_final.fdx now.").marks).toBeUndefined();
    roundTrips("!Open big_fish_final.fdx now.");
  });

  it("takes a backslashed delimiter out of play and leaves the backslash", () => {
    // Nothing in the corpus escapes a delimiter, so there is no spelling to
    // put a removed backslash back with. Both characters stay.
    expect(only("!A five \\*pointed star\\* shape.").marks).toBeUndefined();
    roundTrips("!A five \\*pointed star\\* shape.");
  });

  it("leaves a run longer than the format spells", () => {
    expect(only("!Four asterisks ****here.").marks).toBeUndefined();
    roundTrips("!Four asterisks ****here.");
  });
});

describe("marks live inside every element that holds prose", () => {
  it("marks a forced scene heading, and the dot stays outside the mark", () => {
    // ADR-0019: all 181 headings in the acceptance corpus are written this
    // way, so a model that only marked action and dialogue fails on line one.
    const heading = only(".**INT. HOSPITAL WAITING ROOM - DAY**");

    expect(heading.type).toBe("scene-heading");
    expect(heading.text).toBe("INT. HOSPITAL WAITING ROOM - DAY");
    expect(heading.marks).toEqual([{ mark: "bold", start: 0, end: 32 }]);
    roundTrips(".**INT. HOSPITAL WAITING ROOM - DAY**");
  });

  it("marks a centered line inside its delimiters, not outside them", () => {
    roundTrips("> _**THE END**_ <");
  });

  it("marks a scene number's heading without swallowing the number", () => {
    const heading = only(".**INT. KITCHEN - DAY** #1#");

    expect(heading.sceneNumber).toBe("1");
    expect(heading.text).toBe("INT. KITCHEN - DAY");
    expect(heading.marks).toEqual([{ mark: "bold", start: 0, end: 18 }]);
    roundTrips(".**INT. KITCHEN - DAY** #1#");
  });

  it("nests an italic inside an underline, in action", () => {
    const source = "From INCHES AWAY.  _Steel's face FILLS the *Leupold Mark 4* scope_.";
    const action = only(source);

    expect(action.text).toBe("From INCHES AWAY.  Steel's face FILLS the Leupold Mark 4 scope.");
    expect(action.marks).toEqual([
      { mark: "underline", start: 19, end: 62 },
      { mark: "italic", start: 42, end: 56 },
    ]);
    // Read back as the text each range covers, so the numbers are not taken
    // on trust — an off-by-one in an offset is invisible in a byte gate.
    expect(action.marks?.map((mark) => action.text.slice(mark.start, mark.end))).toEqual([
      "Steel's face FILLS the Leupold Mark 4 scope",
      "Leupold Mark 4",
    ]);
    roundTrips(source);
  });

  it("appends (CONT'D) outside a marked cue rather than inside it", () => {
    const source = ["@**EDWARD**", "One.", "", "!A beat.", "", "@**EDWARD**", "Two."].join("\n");
    const output = serialise(importScreenplay(utf8(source)).document);

    expect(output).toContain("@**EDWARD** (CONT'D)");
  });
});

/** Every mark in a document, including the title page's. */
function markCensus(document: ScreenplayDocument): Map<Mark, number> {
  const census = new Map<Mark, number>();
  const count = (marks: readonly { mark: Mark }[] | undefined): void => {
    for (const { mark } of marks ?? []) census.set(mark, (census.get(mark) ?? 0) + 1);
  };

  for (const field of document.titlePage) {
    count(field.inline.marks);
    for (const line of field.continuations) count(line.marks);
  }
  for (const element of document.elements) count(element.marks);
  return census;
}

const censusOf = (bytes: Uint8Array): [Mark, number][] =>
  [...markCensus(importScreenplay(bytes).document).entries()].sort();

describe("the mark census, which a byte comparison cannot make", () => {
  it("finds 2 bold, 2 italic and 4 underline in Brick & Steel", () => {
    // Two of the underlines and both bolds are on the title page.
    expect(censusOf(readFixtureBytes("Brick-&-Steel.fountain"))).toEqual([
      ["bold", 2],
      ["italic", 2],
      ["underline", 4],
    ]);
  });

  it("finds 3 bold, 15 italic and 14 underline in Big Fish, and the same augmented", () => {
    // The 15 italics are the three sung speeches, one range per element
    // (ADR-0027). Before that decision this file reported none: the asterisks
    // sat in the text as characters.
    const expected: [Mark, number][] = [
      ["bold", 3],
      ["italic", 15],
      ["underline", 14],
    ];

    expect(censusOf(readFixtureBytes("Big-Fish.fountain"))).toEqual(expected);
    expect(censusOf(readFixtureBytes("Big-Fish-augmented.fountain"))).toEqual(expected);
  });
});

describeCorpus("the corpus's mark census", () => {
  it("finds 274 bold, 1 italic and 1 underline", () => {
    expect(censusOf(readCorpusBytes())).toEqual([
      ["bold", 274],
      ["italic", 1],
      ["underline", 1],
    ]);
  });

  it("marks all 181 scene headings, which is the count ADR-0019 names", () => {
    const { document } = importScreenplay(readCorpusBytes());
    const headings = document.elements.filter((element) => element.type === "scene-heading");

    expect(headings).toHaveLength(181);
    // Every one of them, not most of them: the ADR's claim is that a heading
    // carries presentation, and one unmarked heading would mean the parser
    // found the marks by accident somewhere else.
    expect(headings.every((element) => element.marks?.length === 1)).toBe(true);
    expect(headings.every((element) => element.text.startsWith("*"))).toBe(false);
  });
});
