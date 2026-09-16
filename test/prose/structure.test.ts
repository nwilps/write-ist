/**
 * Phase E4, stage 1 — prose structure: headings, paragraphs, scene breaks.
 *
 * Prose classifies more easily than screenplay. A screenplay parser has to
 * infer whether an upper-case line is a cue or a shot heading; here `#` is a
 * heading and `* * *` a scene break, and there is very little to guess.
 *
 * What prose is genuinely worse at, and the whole reason ADR-0011 says no
 * Markdown tool round-trips byte for byte, is that **the same element has
 * several spellings**. A scene break is `* * *` or `---` or `***` or `___`. A
 * chapter heading is `## Book X` or `Book X` underlined with `------`. Read
 * those into one type, emit your favourite, and you have rewritten the
 * writer's file without changing a word of it.
 *
 * So the census below counts scene breaks *by spelling*, and the tests assert
 * that each comes back as it went in. A byte total alone would not catch a
 * parser that swapped two spellings of equal length.
 */
import { describe, expect, it } from "vitest";
import type { ProseElementType } from "../../src/prose/document.ts";
import { exportProse, importProse, reopenAndSave } from "../../src/prose/import.ts";
import { parse } from "../../src/prose/parse.ts";
import { serialise } from "../../src/prose/serialise.ts";
import { normaliseSource } from "../../src/normalise.ts";
import { assertBytesEqual } from "../support/byte-diff.ts";
import { readFixtureBytes, readFixtureText, writeBytesAndReadBack } from "../support/files.ts";
import { lineEdits } from "../support/line-diff.ts";

const FIXTURE = "Republic-manuscript.md";

const SOURCE_BYTES = 661_745;
const NORMALISED_BYTES = 645_702;

const document = () => importProse(readFixtureBytes(FIXTURE)).document;
const imported = (): Uint8Array => exportProse(document());
const normalisedText = (): string => normaliseSource(readFixtureText(FIXTURE)).text;
const ofType = (type: ProseElementType) =>
  document().elements.filter((element) => element.type === type);

describe("the prose fixture, measured as bytes", () => {
  it("normalises to 645,702 bytes by the four text rules", () => {
    expect(readFixtureBytes(FIXTURE).length).toBe(SOURCE_BYTES);
    expect(new TextEncoder().encode(normalisedText()).length).toBe(NORMALISED_BYTES);
  });

  it("reports all four, and is the first fixture to exercise the Unicode rule", () => {
    // All four screenplay fixtures are already NFC, so nothing before this
    // could show that the rule runs — or that its count is right.
    expect(importProse(readFixtureBytes(FIXTURE)).report.applied).toEqual([
      { kind: "line-endings-to-lf", count: 15_990 },
      { kind: "unicode-to-nfc", count: 1 },
      { kind: "trailing-whitespace-trimmed", count: 1 },
      { kind: "blank-line-runs-collapsed", count: 21 },
    ]);
  });

  it("comes back byte-identical to the normalised source", () => {
    const expected = new TextEncoder().encode(normalisedText());
    const actual = writeBytesAndReadBack("republic.roundtrip.md", imported());

    expect(lineEdits(normalisedText().split("\n"), new TextDecoder().decode(actual).split("\n")))
      .toEqual([]);
    assertBytesEqual(expected, actual, {
      expectedLabel: "normalised source",
      actualLabel: "round-tripped",
      message: "the prose round-trip changed the file",
    });
    expect(actual.length).toBe(NORMALISED_BYTES);
  });
});

describe("the census", () => {
  // A misclassification here moves a count even when it moves no bytes, which
  // is the lesson E2 taught: two sluglines were read as action and every byte
  // test passed, because an unforced heading and an action line are the same
  // characters.
  it("counts 4,341 elements", () => {
    const census = new Map<ProseElementType, number>();
    for (const element of document().elements) {
      census.set(element.type, (census.get(element.type) ?? 0) + 1);
    }

    expect([...census.entries()].sort()).toEqual(
      (
        [
          ["heading", 16],
          ["paragraph", 4_322],
          ["scene-break", 3],
        ] as Array<[ProseElementType, number]>
      ).sort(),
    );
  });

  it("counts headings by level", () => {
    const levels = ofType("heading").map((element) => element.level);

    // Five at level 1 — the book's title, three parts and the afterword — and
    // eleven at level 2. Which of those *are* parts and chapters is a range
    // computed over the sequence, not a property of the element.
    expect(levels.filter((level) => level === 1)).toHaveLength(5);
    expect(levels.filter((level) => level === 2)).toHaveLength(11);
  });

  it("counts scene breaks by spelling, not just by number", () => {
    expect(ofType("scene-break").map((element) => element.text)).toEqual([
      "* * *",
      "---",
      "***",
    ]);
  });

  it("counts how many paragraphs are hard-wrapped", () => {
    const paragraphs = ofType("paragraph");
    const wrapped = paragraphs.filter((element) => element.text.includes("\n"));

    expect(paragraphs).toHaveLength(4_322);
    expect(wrapped).toHaveLength(2_140);
    // The longest is 72 lines. Rewrapping it would change 72 line endings and
    // not one word, which is exactly the kind of silent rewrite ADR-0020 bans.
    expect(Math.max(...paragraphs.map((p) => p.text.split("\n").length))).toBe(72);
  });
});

describe("a spelling is remembered, never canonicalised", () => {
  it("writes each scene break back as the writer spelled it", () => {
    const output = new TextDecoder().decode(imported());

    expect(output).toContain("\n* * *\n");
    expect(output).toContain("\n---\n");
    expect(output).toContain("\n***\n");
  });

  it("keeps four spellings of one element distinct through a round-trip", () => {
    const source = ["One.", "", "* * *", "", "Two.", "", "---", "", "Three.", "", "***", "", "Four.", "", "___", "", "Five."].join("\n");
    const parsed = parse(source);

    expect(parsed.elements.filter((e) => e.type === "scene-break").map((e) => e.text)).toEqual([
      "* * *",
      "---",
      "***",
      "___",
    ]);
    expect(serialise(parsed)).toBe(source);
  });

  it("writes a setext heading back as setext and an ATX heading as ATX", () => {
    const source = "Book X\n------\n\n## Book XI\n\nText.";
    const parsed = parse(source);

    expect(parsed.elements.map((e) => [e.type, e.level, e.underline, e.text])).toEqual([
      ["heading", 2, "------", "Book X"],
      ["heading", 2, undefined, "Book XI"],
      ["paragraph", undefined, undefined, "Text."],
    ]);
    // Both are level-2 headings. Emitting one spelling for both would rewrite
    // half of them.
    expect(serialise(parsed)).toBe(source);
  });

  it("keeps the underline exactly as long as it was written", () => {
    for (const underline of ["-", "--", "------", "-".repeat(40), "=", "==="]) {
      if (underline === "-") continue; // a lone `-` is not an underline here
      const source = `Book X\n${underline}`;
      expect(serialise(parse(source)), underline).toBe(source);
    }
  });
});

describe("the dash that means two different things", () => {
  // `---` after a blank line is a scene break. The same characters directly
  // under a line of text are a heading underline. Only the preceding line
  // tells them apart, and the fixture now contains both.
  it("reads --- after a blank line as a scene break", () => {
    const parsed = parse("A paragraph.\n\n---\n\nAnother.");

    expect(parsed.elements.map((e) => e.type)).toEqual([
      "paragraph",
      "scene-break",
      "paragraph",
    ]);
    expect(serialise(parsed)).toBe("A paragraph.\n\n---\n\nAnother.");
  });

  it("reads --- directly under text as a heading underline", () => {
    const parsed = parse("Book X\n---\n\nAnother.");

    expect(parsed.elements.map((e) => [e.type, e.level])).toEqual([
      ["heading", 2],
      ["paragraph", undefined],
    ]);
    expect(serialise(parsed)).toBe("Book X\n---\n\nAnother.");
  });

  it("makes the whole preceding run the heading, as Markdown does", () => {
    const parsed = parse("Book X\nand its subtitle\n------");

    expect(parsed.elements).toEqual([
      { type: "heading", text: "Book X\nand its subtitle", level: 2, underline: "------" },
    ]);
  });

  it("reads *** and ___ under text as breaks, because only - and = underline", () => {
    expect(parse("Text.\n***").elements.map((e) => e.type)).toEqual([
      "paragraph",
      "scene-break",
    ]);
    expect(serialise(parse("Text.\n***"))).toBe("Text.\n\n***");
  });

  it("reads === under text as a level-1 underline", () => {
    const parsed = parse("The Republic\n============");

    expect(parsed.elements.map((e) => [e.type, e.level])).toEqual([["heading", 1]]);
    expect(serialise(parsed)).toBe("The Republic\n============");
  });
});

describe("paragraphs", () => {
  it("holds the writer's line wraps rather than rewrapping them", () => {
    const source = "One line,\nand a second,\nand a third.";
    const parsed = parse(source);

    expect(parsed.elements).toEqual([{ type: "paragraph", text: source }]);
    expect(serialise(parsed)).toBe(source);
  });

  it("keeps two paragraphs apart, because running them together is one paragraph", () => {
    const parsed = parse("First.\n\nSecond.");

    expect(parsed.elements).toHaveLength(2);
    // The blank line here is Markdown syntax, not spacing. Losing it would
    // change what the document says.
    expect(serialise(parsed)).toBe("First.\n\nSecond.");
  });

  it("keeps leading whitespace, which the fixture's quoted verse relies on", () => {
    const source = " ‘To bear acorns at their summit, and bees in the middle;\nAnd the sheep are bowed down.’";
    expect(serialise(parse(source))).toBe(source);
  });

  it("is the catch-all, so nothing the parser does not know is lost", () => {
    // The prose counterpart of Fountain making action the catch-all. A block
    // quote, a table and a multi-line HTML comment all still round-trip at
    // this stage; they are simply called paragraphs until later stages.
    const source = "> Until philosophers are kings,\n> cities will never have rest.";
    expect(parse(source).elements.map((e) => e.type)).toEqual(["paragraph"]);
    expect(serialise(parse(source))).toBe(source);
  });
});

describe("what stays opaque until Phase F", () => {
  it("keeps a chapter id in the heading text", () => {
    // ADR-0022: v2 writes no chapter ids, and a file arriving with them
    // round-trips untouched.
    const headings = ofType("heading").map((element) => element.text);

    expect(headings).toContain("Book III {#bk-3}");
    expect(headings).toContain("Book VII {#bk-7}");
    expect(new TextDecoder().decode(imported())).toContain("## Book VII {#bk-7}");
  });

  it("keeps comments, marks and small caps as plain text", () => {
    const output = new TextDecoder().decode(imported());

    expect(output).toContain('<!--c:a1 does "went down" carry the descent to Piraeus?-->');
    expect(output).toContain("[Socrates]{.smallcaps}");
    expect(output).toContain("*a new thing*");
    expect(output).toContain("[occasionally more");
  });

  it("keeps a crossing comment pair in the order it was written", () => {
    expect(new TextDecoder().decode(imported())).toContain(
      '<!--c:b1 is "turned round" too casual for Socrates?-->I turned round, ' +
        "<!--c:b2 whose master, Polemarchus or Cephalus?-->and asked him<!--/c:b1-->" +
        " where his master was.<!--/c:b2-->",
    );
  });

  it("keeps an escaped closing delimiter inside a remark", () => {
    // Unescaped, the comment would end early and spill ` ironic"-->` into the
    // prose as visible text — the one case where this syntax corrupts rather
    // than misparses.
    const output = new TextDecoder().decode(imported());

    expect(output).toContain('<!--c:c1 Jowett glosses this "concessive --&gt; ironic"-->');
    // The escape, not the thing it escapes.
    expect(output).not.toContain('"concessive --> ironic"');
  });

  it("keeps the table exactly, as a passthrough would", () => {
    expect(new TextDecoder().decode(imported())).toContain(
      "| Dialogue     | Approximate date | Length |\n" +
        "|--------------|------------------|--------|\n" +
        "| Republic     | c. 375 BC        | long   |",
    );
  });
});

describe("end of file and idempotence", () => {
  it("does not add a trailing newline to a file that had none", () => {
    expect(serialise(parse("Text."))).toBe("Text.");
    expect(serialise(parse("Text.\n"))).toBe("Text.\n");
  });

  it("is byte-identical when opened and saved without typing", () => {
    const ours = writeBytesAndReadBack("republic.ours.md", imported());
    const resaved = writeBytesAndReadBack("republic.resaved.md", reopenAndSave(ours));

    assertBytesEqual(ours, resaved, {
      expectedLabel: "as written",
      actualLabel: "after reopen and save",
      message: "opening and saving without typing changed the file",
    });
  });

  it("is imported a second time with nothing left to change", () => {
    const once = imported();
    const { document: twice, report } = importProse(once);

    expect(report.applied).toEqual([]);
    assertBytesEqual(once, exportProse(twice), {
      expectedLabel: "first import",
      actualLabel: "second import",
    });
  });
});
