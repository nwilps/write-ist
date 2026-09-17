/**
 * The stability check (Phase C).
 *
 * Parse, serialise, parse that, serialise again — and require the two outputs
 * to be identical. It asks the program only to agree with itself, so it can be
 * written before anyone knows what the right answer looks like, and it still
 * catches a parser that loses something, because a loss that is not a fixed
 * point shows up on the second pass.
 *
 * Stability on its own is weak: a parser that discarded the screenplay and
 * serialised nothing would satisfy it. The census below is what stops this
 * file from passing vacuously. The stronger claim — that the output equals the
 * source — is Phase D.
 */
import { expect, it } from "vitest";
import type { ElementType } from "../../src/screenplay/document.ts";
import { normaliseSource } from "../../src/normalise.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { assertBytesEqual } from "../support/byte-diff.ts";
import { writeAndReadBack } from "../support/files.ts";
import { describeCorpus, readCorpusText } from "../support/corpus.ts";

const normalisedCorpus = (): string =>
  normaliseSource(readCorpusText()).text;

describeCorpus("screenplay round-trip is stable", () => {
  it("serialising twice produces the same bytes for script.fountain", () => {
    const firstPass = serialise(parse(normalisedCorpus()));
    const secondPass = serialise(parse(firstPass));

    // Real files, compared as bytes. Some differences exist only on disk.
    const firstBytes = writeAndReadBack("script.pass1.fountain", firstPass);
    const secondBytes = writeAndReadBack("script.pass2.fountain", secondPass);

    assertBytesEqual(firstBytes, secondBytes, {
      expectedLabel: "pass 1",
      actualLabel: "pass 2",
      message: "serialising a second time changed the file",
    });
  });

  it("parsing its own output yields the same elements", () => {
    const once = parse(normalisedCorpus());
    const twice = parse(serialise(once));

    expect(twice.titlePage).toEqual(once.titlePage);
    expect(twice.elements).toEqual(once.elements);
    expect(twice.endsWithNewline).toBe(once.endsWithNewline);
  });
});

describeCorpus("the corpus is fully accounted for", () => {
  // Every line of script.fountain is either blank, a title-page field, or
  // exactly one element. These numbers are the file, counted directly; if the
  // parser starts dropping or inventing lines, one of them moves.
  const CORPUS_LINES = 5_788;
  const CORPUS_BLANK_LINES = 2_328;
  const CORPUS_TITLE_PAGE_LINES = 3;
  const CENSUS: ReadonlyArray<readonly [ElementType, number]> = [
    ["dialogue", 1_100],
    ["character", 1_088],
    ["action", 1_036],
    ["scene-heading", 181],
    ["parenthetical", 31],
    ["transition", 20],
    ["centered", 1],
  ];

  it("parses one element per non-blank, non-title-page line", () => {
    const document = parse(normalisedCorpus());
    const expectedElements =
      CORPUS_LINES - CORPUS_BLANK_LINES - CORPUS_TITLE_PAGE_LINES;

    // 3,457 — the same count the editor-shape spike reported (ADR-0019).
    expect(expectedElements).toBe(3_457);
    expect(document.elements.length).toBe(expectedElements);
  });

  it("classifies every element as the file says it should be", () => {
    const document = parse(normalisedCorpus());
    const census = new Map<ElementType, number>();
    for (const element of document.elements) {
      census.set(element.type, (census.get(element.type) ?? 0) + 1);
    }

    expect([...census.entries()].sort()).toEqual([...CENSUS].sort());
  });

  it("reads the title page as fields rather than as text", () => {
    const document = parse(normalisedCorpus());

    expect(document.titlePage).toEqual([
      { key: "Title", inline: { text: " IN THE WAKE OF AUGUST" }, continuations: [] },
      { key: "Credit", inline: { text: " Written by:" }, continuations: [] },
      { key: "Author", inline: { text: " Noah Wilps" }, continuations: [] },
    ]);
  });

  it("keeps the four leading spaces on every parenthetical", () => {
    const document = parse(normalisedCorpus());
    const parentheticals = document.elements.filter((e) => e.type === "parenthetical");

    expect(parentheticals).toHaveLength(31);
    for (const element of parentheticals) {
      expect(element.indent).toBe("    ");
    }
  });

  it("records that the file does not end with a newline", () => {
    expect(parse(normalisedCorpus()).endsWithNewline).toBe(false);
    expect(serialise(parse(normalisedCorpus())).endsWith("<")).toBe(true);
  });
});

describeCorpus("normalising the corpus", () => {
  it("applies exactly the two changes ADR-0020 permits on this file", () => {
    const { applied } = normaliseSource(readCorpusText());

    expect(applied).toEqual([
      { kind: "trailing-whitespace-trimmed", count: 38 },
      { kind: "blank-line-runs-collapsed", count: 2 },
    ]);
  });

  it("is itself a fixed point", () => {
    const once = normaliseSource(readCorpusText()).text;
    expect(normaliseSource(once).applied).toEqual([]);
  });
});
