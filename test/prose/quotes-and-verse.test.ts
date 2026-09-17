/**
 * Phase E4, stage 2 — block quotes, verse, and the table that looks like both.
 *
 * **The blank line is the block boundary.** Two quote lines with nothing
 * between them are one quote and one element; two separated by a blank line
 * are two quotes and two elements. So the spacing rule needs no exception: a
 * blank line falls between every pair of elements, and the only place two
 * quote elements ever meet is a real boundary, where Markdown requires one.
 *
 * That is why a quote holds its whole block. Reading it line by line loses the
 * boundary — the lines are identical either way, and the blank between two
 * quotes is the only thing saying they are two.
 *
 * The collision worth knowing about is that Pandoc's line block and a pipe
 * table both begin with `|`. The fixture contains one of each, four lines
 * apart, and the delimiter row on a table's second line is all that separates
 * them.
 *
 * *Epigraph* is deliberately not an element type. The fixture's epigraph is a
 * block quote and nothing distinguishes it from any other block quote except
 * that it stands before the first part — so it is a range over the sequence,
 * like a part, a chapter or a scene (`CONTEXT.md`), and the same is true of
 * front and back matter.
 */
import { describe, expect, it } from "vitest";
import { exportProse, importProse } from "../../src/prose/import.ts";
import { parse } from "../../src/prose/parse.ts";
import { serialise } from "../../src/prose/serialise.ts";
import { normaliseSource } from "../../src/normalise.ts";
import { readFixtureBytes } from "../support/files.ts";

const FIXTURE = "Republic-manuscript.md";
const document = () => importProse(readFixtureBytes(FIXTURE)).document;
const output = (): string => new TextDecoder().decode(exportProse(document()));
const ofType = (type: string) => document().elements.filter((element) => element.type === type);

/** Parse and serialise, asserting the text comes back exactly as it went in. */
const roundTrips = (source: string): void => {
  expect(serialise(parse(source))).toBe(source);
};

describe("a blank line is the boundary between two blocks", () => {
  it("merges quote lines with no blank between them into one element", () => {
    const parsed = parse("> One\n> Two\n> Three");

    expect(parsed.elements).toEqual([{ type: "block-quote", text: "One\nTwo\nThree" }]);
    roundTrips("> One\n> Two\n> Three");
  });

  it("keeps two quotes separated by a blank line as two elements", () => {
    const parsed = parse("> One\n\n> Two");

    expect(parsed.elements).toHaveLength(2);
    // Losing this blank line would merge two quotes into one, which changes
    // what the document says rather than how it looks.
    roundTrips("> One\n\n> Two");
  });

  it("does the same for two line blocks", () => {
    expect(parse("| One\n| Two").elements).toHaveLength(1);
    expect(parse("| One\n\n| Two").elements).toHaveLength(2);
    roundTrips("| One\n| Two");
    roundTrips("| One\n\n| Two");
  });

  it("writes an empty line inside a block with the bare marker", () => {
    // `>` and `|` alone are how a blank line *inside* a block is spelled, and
    // they are part of the block rather than a boundary.
    expect(parse("> One\n>\n> Two").elements).toEqual([
      { type: "block-quote", text: "One\n\nTwo" },
    ]);
    roundTrips("> One\n>\n> Two");
    roundTrips("| One\n|\n| Two");
  });
});

describe("block quotes", () => {
  it("reads the fixture's epigraph as one quote", () => {
    expect(ofType("block-quote")).toEqual([
      {
        type: "block-quote",
        text: [
          "Until philosophers are kings, or the kings and princes of this world",
          "have the spirit and power of philosophy, cities will never have rest",
          "from their evils.",
          "",
          "--- Book V",
        ].join("\n"),
      },
    ]);
  });

  it("does not read --- inside a quote as a scene break", () => {
    // `> --- Book V` is an attribution. Outside a quote the same characters
    // after a blank line are a scene break.
    expect(ofType("scene-break")).toHaveLength(3);
    expect(output()).toContain("> from their evils.\n>\n> --- Book V");
  });

  it("leaves a quote spelled without a space as a paragraph", () => {
    // Accepting `>text` would mean writing back `> text` and adding a byte the
    // writer did not type. Wrong about the element, right about the bytes.
    expect(parse(">text").elements.map((e) => e.type)).toEqual(["paragraph"]);
    roundTrips(">text");
    roundTrips("> spaced\n>unspaced");
  });

  it("interrupts a paragraph, as Markdown says it does", () => {
    const parsed = parse("A paragraph.\n> A quote.");

    expect(parsed.elements.map((e) => e.type)).toEqual(["paragraph", "block-quote"]);
    // The blank line the serialiser adds is required: without it the quote
    // would be a continuation line of the paragraph.
    expect(serialise(parsed)).toBe("A paragraph.\n\n> A quote.");
  });
});

describe("verse", () => {
  it("reads the fixture's verse as one line block, indentation intact", () => {
    expect(ofType("verse")).toEqual([
      {
        type: "verse",
        text: [
          "Not to be born is best",
          "    when all is reckoned in,",
          "but once a man has seen the light",
          "    the next best thing by far",
          "        is to go back where he came from.",
        ].join("\n"),
      },
    ]);
  });

  it("keeps the authored indentation, which is the point of a line block", () => {
    // ADR-0023: literal leading whitespace is preserved only inside verse,
    // where it is authored and meaningful — the mechanism poetry runs on.
    expect(output()).toContain("|     when all is reckoned in,");
    expect(output()).toContain("|         is to go back where he came from.");
  });
});

describe("the pipe table, which begins like verse and is not", () => {
  it("reads it as one passthrough, kept exactly", () => {
    expect(ofType("passthrough")).toEqual([
      {
        type: "passthrough",
        text: [
          "| Dialogue     | Approximate date | Length |",
          "|--------------|------------------|--------|",
          "| Republic     | c. 375 BC        | long   |",
          "| Symposium    | c. 385 BC        | medium |",
        ].join("\n"),
      },
    ]);
  });

  it("is told from verse by the delimiter row, and by nothing else", () => {
    const table = "| a | b |\n|---|---|\n| 1 | 2 |";
    const verse = "| a | b |\n| c | d |\n| 1 | 2 |";

    expect(parse(table).elements.map((e) => e.type)).toEqual(["passthrough"]);
    expect(parse(verse).elements.map((e) => e.type)).toEqual(["verse"]);
    roundTrips(table);
    roundTrips(verse);
  });

  it("is never reinterpreted, only copied", () => {
    // ADR-0020: a construct outside the subset is kept as an exact, untouched
    // copy of its own text and written back byte-for-byte. The alignment
    // spaces inside it carry no meaning to us and must survive anyway.
    expect(output()).toContain("| Republic     | c. 375 BC        | long   |");
  });

  it("does not mistake a one-line pipe run for a table", () => {
    expect(parse("| just one line").elements.map((e) => e.type)).toEqual(["verse"]);
  });
});

describe("the epigraph is a range, not an element", () => {
  it("is an ordinary block quote standing before the first part", () => {
    const elements = document().elements;
    const firstPart = elements.findIndex(
      (element) => element.type === "heading" && element.text.startsWith("Part One"),
    );
    const quotesBeforeIt = elements
      .slice(0, firstPart)
      .filter((element) => element.type === "block-quote");

    // The only block quote in the file is the epigraph, and it is before the
    // first part. Nothing in the syntax says "epigraph"; the position does.
    expect(firstPart).toBeGreaterThan(0);
    expect(quotesBeforeIt).toHaveLength(1);
    expect(ofType("block-quote")).toHaveLength(1);
  });
});

describe("stage 2 changes no bytes", () => {
  it("still returns the fixture unchanged", () => {
    // Reading a quote, a line block and a table out of what were paragraphs
    // must move counts and nothing else.
    const normalised = normaliseSource(
      new TextDecoder().decode(readFixtureBytes(FIXTURE)),
    ).text;

    expect(output()).toBe(normalised);
    expect(exportProse(document()).length).toBe(645_702);
  });
});
