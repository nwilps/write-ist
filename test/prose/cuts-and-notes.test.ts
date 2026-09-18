/**
 * Phase E4, stage 3 — cut prose, footnotes, and the comment that is a block.
 *
 * What was left after structure and quotes: three constructs the parser was
 * calling paragraphs. Each round-tripped correctly as a paragraph, which is
 * exactly why only a census could find them — the bytes were never wrong, only
 * the element was.
 *
 *   `<!--cut-->` … `<!--/cut-->`   prose's counterpart to the boneyard
 *   `[^id]: …`                     a footnote definition
 *   `<!-- … -->` alone             an HTML comment standing as its own block
 */
import { describe, expect, it } from "vitest";
import { exportProse, importProse } from "../../src/prose/import.ts";
import { parse } from "../../src/prose/parse.ts";
import { serialise } from "../../src/prose/serialise.ts";
import { readFixtureBytes } from "../support/files.ts";

const FIXTURE = "Republic-manuscript.md";
const document = () => importProse(readFixtureBytes(FIXTURE)).document;
const output = (): string => new TextDecoder().decode(exportProse(document()));
const ofType = (type: string) => document().elements.filter((element) => element.type === type);

const roundTrips = (source: string): void => {
  expect(serialise(parse(source))).toBe(source);
};

describe("cut prose is a range, not a container", () => {
  /** Every element from the opening delimiter to the closing one. */
  const range = () => {
    const elements = document().elements;
    const start = elements.findIndex((element) => element.type === "cut-start");
    const end = elements.findIndex((element) => element.type === "cut-end");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return elements.slice(start, end + 1);
  };

  it("is delimited by an element each end, with an ordinary element between", () => {
    // The same shape as the screenplay boneyard (ADR-0021): delimiters and a
    // flag, never a container. Nothing here spans lines that would not anyway.
    expect(range().map((element) => [element.type, element.text])).toEqual([
      ["cut-start", "<!--cut-->"],
      [
        "paragraph",
        "An earlier draft of this afterword opened with a long complaint about\n" +
          "Jowett's habit of smoothing Plato's rougher edges. Removed, kept.",
      ],
      ["cut-end", "<!--/cut-->"],
    ]);
  });

  it("marks every element in the range omitted, delimiters included", () => {
    for (const element of range()) expect(element.omitted, element.text).toBe(true);
    expect(document().elements.filter((element) => element.omitted === true)).toHaveLength(3);
  });

  it("carries no id", () => {
    // ADR-0022: the only id v2 writes is a comment's. The delimiters are bare.
    expect(output()).toContain("<!--cut-->");
    expect(output()).not.toMatch(/<!--cut:[^>]*-->/);
  });

  it("keeps the delimiters against the material they delimit", () => {
    expect(output()).toContain("<!--cut-->\nAn earlier draft");
    expect(output()).toContain("Removed, kept.\n<!--/cut-->\n\nThe word at issue");
  });

  it("leaves an unclosed cut as ordinary text", () => {
    // An unclosed delimiter would mark the rest of the manuscript omitted and
    // drop it from the page count and the export. The bytes survive either
    // way; that classification is too expensive to get wrong.
    const parsed = parse("A paragraph.\n\n<!--cut-->\nNever closed.");

    expect(parsed.elements.map((e) => e.type)).toEqual(["paragraph", "paragraph"]);
    expect(parsed.elements.some((e) => e.omitted === true)).toBe(false);
    roundTrips("A paragraph.\n\n<!--cut-->\nNever closed.");
    // And with a blank line after it, where it is a block of its own.
    roundTrips("A paragraph.\n\n<!--cut-->\n\nNever closed.");
  });

  it("round-trips an empty cut", () => {
    const parsed = parse("Before.\n\n<!--cut-->\n<!--/cut-->\n\nAfter.");

    expect(parsed.elements.map((e) => e.type)).toEqual([
      "paragraph",
      "cut-start",
      "cut-end",
      "paragraph",
    ]);
    roundTrips("Before.\n\n<!--cut-->\n<!--/cut-->\n\nAfter.");
  });

  it("keeps a heading or a quote inside a cut as what it is", () => {
    const source = "<!--cut-->\n## A cut chapter\n\n> and a cut quote\n<!--/cut-->";
    const parsed = parse(source);

    expect(parsed.elements.map((e) => [e.type, e.omitted])).toEqual([
      ["cut-start", true],
      ["heading", true],
      ["block-quote", true],
      ["cut-end", true],
    ]);
    roundTrips(source);
  });
});

describe("footnotes", () => {
  it("reads the definition as its own element", () => {
    // ADR-0023 keeps the syntax in the subset although the authoring feature
    // is deferred, so that a file carrying one is never destroyed.
    expect(ofType("footnote")).toEqual([
      {
        type: "footnote",
        text:
          "[^jowett]: Footnote syntax is in the Markdown subset so a file carrying\n" +
          "one round-trips. The authoring feature is deferred (ADR-0023).",
      },
    ]);
  });

  it("keeps the reference in the paragraph that carries it", () => {
    // The marker is inline, so it stays in the text like any other mark.
    expect(output()).toContain("Jowett than Plato]{.underline}.[^jowett]");
  });

  it("holds a definition's continuation lines", () => {
    const source = "[^a]: First line\nand its continuation.";
    expect(parse(source).elements.map((e) => e.type)).toEqual(["footnote"]);
    roundTrips(source);
  });
});

describe("an HTML comment standing as its own block", () => {
  it("is a passthrough, not a paragraph", () => {
    // ADR-0023: an HTML comment carrying our id prefix is a Write-ist comment,
    // and everything else is a passthrough.
    const passthroughs = ofType("passthrough").map((element) => element.text);

    expect(passthroughs).toHaveLength(2);
    expect(passthroughs[0]).toBe(
      "<!-- Fixture note: front matter, an epigraph as a block quote, and a\n" +
        "     dramatis personae list. Not part of the work; exercises ADR-0023's\n" +
        '     "typed front and back matter". -->',
    );
  });

  it("keeps its five-space indentation, which Markdown would call code", () => {
    // Four or more leading spaces is a code block in Pandoc. Inside the
    // comment it is nothing of the kind, and it must survive either way.
    expect(output()).toContain("\n     dramatis personae list.");
  });

  it("is told from a paragraph by whether anything follows the comment", () => {
    // `<!--c:a1 …-->She left.` is prose with a comment in it. A comment with
    // nothing after it is a block of its own.
    expect(parse("<!-- a note -->").elements.map((e) => e.type)).toEqual(["passthrough"]);
    expect(parse("<!--c:1 remark-->She left.<!--/c:1-->").elements.map((e) => e.type)).toEqual([
      "paragraph",
    ]);
  });

  it("does not mistake the fixture's inline comments for blocks", () => {
    // Three paragraphs in the fixture open with a comment, and one of them
    // ends with `-->` as well. All three are prose.
    const paragraphs = ofType("paragraph").filter((element) =>
      element.text.startsWith("<!--"),
    );

    expect(paragraphs).toHaveLength(3);
    for (const paragraph of paragraphs) {
      expect(paragraph.text.startsWith("<!--c:")).toBe(true);
    }
  });

  it("round-trips a comment block spanning several lines", () => {
    roundTrips("<!-- one\ntwo\nthree -->");
  });
});

describe("stage 3 changes no bytes", () => {
  it("still returns the fixture unchanged at 645,702 bytes", () => {
    // Three constructs moved out of `paragraph` and not one byte moved with
    // them, which is the whole reason the census exists.
    expect(exportProse(document()).length).toBe(645_702);
  });
});
