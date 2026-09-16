/**
 * Phase E3 — Big Fish, augmented with the rarer constructs.
 *
 * The same screenplay with 952 bytes added in one region: sections, synopses,
 * a standalone note, inline comments, scene numbers, a boneyard, lyrics, dual
 * dialogue, centered lines, a page break and forced markers. Between them they
 * are most of ADR-0021's element vocabulary, and none of them appears in any
 * other fixture.
 *
 * Two of them cost a decision rather than a regex.
 *
 * The boneyard spans lines and holds a blank one, so it cannot be one element
 * per line and cannot be several elements either — blank lines are not stored.
 * It is therefore a second exception to ADR-0019, after the title page, and
 * the exception is forced by ADR-0021's requirement that the boneyard be
 * "preserved exactly in the file".
 *
 * Scene numbers and the dual-dialogue caret come off the element's text, which
 * means the serialiser has to put them back. It writes one space before each,
 * and the parser only lifts one out when the source wrote one space — so a
 * file spaced otherwise keeps it in the text and still round-trips.
 */
import { describe, expect, it } from "vitest";
import { exportScreenplay, importScreenplay, reopenAndSave } from "../../src/screenplay/import.ts";
import { normaliseSource } from "../../src/screenplay/normalise.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { assertBytesEqual } from "../support/byte-diff.ts";
import { readFixtureBytes, readFixtureText, writeBytesAndReadBack } from "../support/files.ts";
import { lineEdits } from "../support/line-diff.ts";

const FIXTURE = "Big-Fish-augmented.fountain";

const SOURCE_BYTES = 147_206;
/** Trailing whitespace trimmed: the same 352 bytes as the unaugmented file. */
const NORMALISED_BYTES = 146_854;
/** The blank between two adjacent centered lines, which cannot be stored. */
const BLANKS_LOST = 1;
const CONTINUATIONS_ADDED = 19;
const EXTENSION = " (CONT'D)";
const IMPORTED_BYTES =
  NORMALISED_BYTES - BLANKS_LOST + CONTINUATIONS_ADDED * EXTENSION.length;

const document = (options = {}) =>
  importScreenplay(readFixtureBytes(FIXTURE), options).document;
const imported = (options = {}): Uint8Array => exportScreenplay(document(options));
const output = (options = {}): string => new TextDecoder().decode(imported(options));
const normalisedText = (): string => normaliseSource(readFixtureText(FIXTURE)).text;

const ofType = (type: string, options = {}) =>
  document(options).elements.filter((element) => element.type === type);

describe("the augmented fixture, measured as bytes", () => {
  it("imports to 147,024 bytes", () => {
    const bytes = writeBytesAndReadBack("big-fish-augmented.roundtrip.fountain", imported());

    expect(readFixtureBytes(FIXTURE).length).toBe(SOURCE_BYTES);
    expect(new TextEncoder().encode(normalisedText()).length).toBe(NORMALISED_BYTES);
    expect(bytes.length).toBe(IMPORTED_BYTES);
    expect(IMPORTED_BYTES).toBe(147_024);
  });

  it("changes one blank line and 19 cues, and nothing else", () => {
    const edits = lineEdits(normalisedText().split("\n"), output().split("\n"));

    const blanks = edits.filter((edit) => edit.text === "");
    expect(blanks).toEqual([{ kind: "removed", line: 105, text: "" }]);

    const cues = edits.filter((edit) => edit.text !== "");
    expect(cues).toHaveLength(CONTINUATIONS_ADDED * 2);
    for (const edit of cues.filter((edit) => edit.kind === "added")) {
      expect(edit.text.endsWith(EXTENSION)).toBe(true);
    }
  });

  it("loses only the blank between the two adjacent centered lines", () => {
    // ADR-0019: Centered to Centered takes no blank line, so a pair written as
    // two cards becomes one. The same collapse as Brick & Steel's title cards.
    expect(normalisedText()).toContain("> FADE TO BLACK <\n\n> THE BEAST <");
    expect(output()).toContain("> FADE TO BLACK <\n> THE BEAST <");
  });
});

describe("the boneyard", () => {
  const boneyard = () => {
    const found = ofType("boneyard");
    expect(found).toHaveLength(1);
    return found[0]!;
  };

  it("is one element holding every line between the delimiters", () => {
    expect(boneyard().text).toBe(
      [
        "/*",
        "CUT 2003-04-12: an earlier telling, where the Beast was the size of a man.",
        "Kept in case the wedding scene needs it back.",
        "",
        "EDWARD",
        "He was longer than the boat and twice as mean.",
        "*/",
      ].join("\n"),
    );
  });

  it("keeps the blank line inside it, which no other element can do", () => {
    expect(boneyard().text).toContain("back.\n\nEDWARD");
    expect(output()).toContain("back.\n\nEDWARD\nHe was longer");
  });

  it("does not let its contents become elements", () => {
    // Before the boneyard was read as a block, the `EDWARD` inside it became a
    // character cue: a phantom speaker in the scene's cast.
    const cues = ofType("character").filter(
      (element) => element.text.startsWith("EDWARD") && element.indent === "",
    );
    for (const cue of cues) {
      expect(cue.text).not.toBe("He was longer than the boat and twice as mean.");
    }
    expect(ofType("dialogue").map((element) => element.text)).not.toContain("*/");
  });

  it("is never handed a (CONT'D), because cut material is not dialogue", () => {
    // The cue inside the boneyard was being maintained — Write-ist writing
    // words into a block ADR-0021 requires preserved exactly.
    expect(output()).toContain("EDWARD\nHe was longer than the boat and twice as mean.");
    expect(output()).not.toContain("EDWARD (CONT'D)\nHe was longer");
    // And the count matches the unaugmented file: no extra cue was found.
    expect(importScreenplay(readFixtureBytes(FIXTURE)).report.applied).toContainEqual({
      kind: "continuations-added",
      count: CONTINUATIONS_ADDED,
    });
  });

  it("falls back to ordinary text when nothing closes it", () => {
    const unterminated = ".INT. KITCHEN - DAY\n\n/*\nCut, but never closed.";
    const parsed = parse(unterminated);

    expect(parsed.elements.map((element) => element.type)).toEqual([
      "scene-heading",
      "action",
      "action",
    ]);
    expect(serialise(parsed)).toBe(".INT. KITCHEN - DAY\n\n/*\n\nCut, but never closed.");
  });

  it("reads a boneyard that opens and closes on one line", () => {
    const parsed = parse("/* cut */");
    expect(parsed.elements.map((element) => element.type)).toEqual(["boneyard"]);
    expect(serialise(parsed)).toBe("/* cut */");
  });
});

describe("sections, synopses, lyrics and notes", () => {
  it("reads two sections and keeps their depth", () => {
    expect(ofType("section").map((element) => [element.depth, element.text])).toEqual([
      [1, " ACT ONE"],
      [2, " The Beast"],
    ]);
    expect(output()).toContain("# ACT ONE");
    expect(output()).toContain("## The Beast");
  });

  it("reads both synopses", () => {
    expect(ofType("synopsis").map((element) => element.text)).toEqual([
      " Edward tells the story of the uncatchable fish. Will has heard it before.",
      " Two fishermen keep watch. Nothing happens, which is the point.",
    ]);
  });

  it("reads two lyric lines and writes them with no blank between", () => {
    expect(ofType("lyrics").map((element) => element.text)).toEqual([
      "Oh the Beast of the river, he swims where he please",
      "And no man alive ever brought him to his knees",
    ]);
    expect(output()).toContain(
      "~Oh the Beast of the river, he swims where he please\n~And no man alive",
    );
  });

  it("reads a note standing alone on its line", () => {
    expect(ofType("note").map((element) => element.text)).toEqual([
      "[[Check the catfish is described the same way in the wedding scene]]",
    ]);
  });
});

describe("comments stay in the text they are about", () => {
  // ADR-0018 stores a comment inline, delimited in band and matched by id, so
  // it cannot come adrift from the span it was left on. Until Phase F they are
  // plain text inside the element, and they must survive as written.
  it("keeps a comment that wraps part of a line", () => {
    const line = ofType("dialogue").find((element) => element.text.startsWith("[[c:a1]]"));

    expect(line?.text).toBe(
      "[[c:a1]]There are some fish that cannot be caught.[[/c:a1]]  It's not that they're" +
        " faster or stronger than other fish.  They're just touched by something extra.  Call" +
        " it luck.  Call it grace.  One such fish was The Beast.",
    );
  });

  it("keeps a pair of comments that cross rather than nest", () => {
    // b1 opens, b2 opens, b1 closes, b2 closes. Marks are a set and may not do
    // this; a comment carries an id, so its pairing is recorded rather than
    // inferred, and crossing is allowed (ADR-0018, ADR-0019).
    expect(output()).toContain(
      "[[c:b1]]I didn't put any stock [[c:b2]]into such speculation[[/c:b1]] or superstition.[[/c:b2]]",
    );
  });

  it("keeps nested comments", () => {
    expect(output()).toContain(
      "[[c:c1]]All I knew was [[c:c2]]I'd been trying to catch that fish[[/c:c2]] since I was a boy no bigger than you.[[/c:c1]]",
    );
  });
});

describe("scene numbers", () => {
  const numbered = () =>
    ofType("scene-heading").filter((element) => element.sceneNumber !== undefined);

  it("lifts the number out of the heading text", () => {
    expect(numbered().map((element) => [element.sceneNumber, element.text])).toEqual([
      ["1", "INT.  WILL'S BEDROOM - NIGHT (1973)"],
      ["2", "EXT.  CAMPFIRE - NIGHT (1977)"],
      ["2A", "THE RIVER - LATER"],
      ["3", "INT.  BLOOM FRONT HALL - NIGHT (1987)"],
    ]);
  });

  it("writes it back exactly where it was", () => {
    expect(output()).toContain("INT.  WILL'S BEDROOM - NIGHT (1973) #1#");
    expect(output()).toContain(".THE RIVER - LATER #2A#");
  });

  it("mints none of its own", () => {
    // ADR-0021: a file arriving with scene numbers round-trips; Write-ist does
    // not create them. 194 headings, 4 numbers.
    expect(ofType("scene-heading")).toHaveLength(194);
    expect(numbered()).toHaveLength(4);
  });

  it("leaves a number in the text when the spacing is not a single space", () => {
    // Wrong about the element, right about the bytes — the trade ADR-0020
    // permits. Canonicalising the gap would be an eighth normalisation.
    const parsed = parse(".INT. KITCHEN - DAY  #7#");
    expect(parsed.elements[0]?.sceneNumber).toBeUndefined();
    expect(parsed.elements[0]?.text).toBe("INT. KITCHEN - DAY  #7#");
    expect(serialise(parsed)).toBe(".INT. KITCHEN - DAY  #7#");
  });
});

describe("dual dialogue", () => {
  it("lifts the caret off the cue and puts it back last", () => {
    const dual = ofType("character").filter((element) => element.dual === true);

    expect(dual.map((element) => element.text)).toEqual(["BILL"]);
    expect(output()).toContain("@BILL ^\n(not looking up)");
  });

  it("marks only the second cue of the pair", () => {
    const joe = ofType("character").find((element) => element.text === "JOE");
    expect(joe?.dual).toBeUndefined();
  });
});

describe("the whole element vocabulary is exercised", () => {
  it("reads every construct the augmented file adds", () => {
    const census = new Map<string, number>();
    for (const element of document().elements) {
      census.set(element.type, (census.get(element.type) ?? 0) + 1);
    }

    expect([...census.entries()].sort()).toEqual(
      [
        ["action", 864],
        ["boneyard", 1],
        ["centered", 4],
        ["character", 771],
        ["dialogue", 814],
        ["lyrics", 2],
        ["note", 1],
        ["page-break", 2],
        ["parenthetical", 98],
        ["scene-heading", 194],
        ["section", 2],
        ["synopsis", 2],
        ["transition", 36],
      ].sort(),
    );
  });

  it("reads both page breaks, of different lengths", () => {
    expect(ofType("page-break").map((element) => element.text)).toEqual(["====", "==="]);
  });
});

describe("idempotence on the augmented fixture", () => {
  it("is byte-identical when opened and saved without typing", () => {
    const ours = writeBytesAndReadBack("big-fish-augmented.ours.fountain", imported());
    const resaved = writeBytesAndReadBack(
      "big-fish-augmented.resaved.fountain",
      reopenAndSave(ours),
    );

    assertBytesEqual(ours, resaved, {
      expectedLabel: "as written",
      actualLabel: "after reopen and save",
      message: "opening and saving without typing changed the file",
    });
  });

  it("is imported a second time with nothing left to change", () => {
    const once = imported();
    const { document: twice, report } = importScreenplay(once);

    expect(report.applied).toEqual([]);
    assertBytesEqual(once, exportScreenplay(twice), {
      expectedLabel: "first import",
      actualLabel: "second import",
    });
  });
});
