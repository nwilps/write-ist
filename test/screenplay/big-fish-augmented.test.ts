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
 * The boneyard is a *range*, not a container (ADR-0021): `/*` and the closing
 * delimiter are an element each, and everything between them is an ordinary
 * element carrying `omitted`. Nothing spans lines, so ADR-0019 keeps its one
 * exception; and because the material inside is ordinary, the ordinary rules
 * reach it — a tight action run in there gains its blank line, and a cue in
 * there has its `(CONT'D)` maintained. What `omitted` governs is what is left
 * out of pagination, the counts and export, not what the model does with it.
 *
 * Scene numbers and the dual-dialogue caret come off the element's text, which
 * means the serialiser has to put them back. It writes one space before each,
 * and the parser only lifts one out when the source wrote one space — so a
 * file spaced otherwise keeps it in the text and still round-trips.
 */
import { describe, expect, it } from "vitest";
import { exportScreenplay, importScreenplay, reopenAndSave } from "../../src/screenplay/import.ts";
import { normaliseSource } from "../../src/normalise.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { assertBytesEqual } from "../support/byte-diff.ts";
import { readFixtureBytes, readFixtureText, writeBytesAndReadBack } from "../support/files.ts";
import { lineEdits } from "../support/line-diff.ts";

const FIXTURE = "Big-Fish-augmented.fountain";

/**
 * The five comment remarks, added to the fixture on 2026-09-19. The fixture
 * predated the decision that a comment's remark lives inside its opening
 * delimiter (ADR-0018), so its five comments had none — a deliberate
 * correction to a fixture of our own making, as 835a4f1 was for prose.
 */
const REMARKS = [
  "is this too on the nose?",
  "tighten",
  "cut superstition?",
  "keep",
  "Edward's voice, not mine",
];
/** Each remark and the space before it: 81 bytes, all ASCII. */
const REMARK_BYTES = REMARKS.reduce((sum, remark) => sum + 1 + remark.length, 0);

const SOURCE_BYTES = 147_206 + REMARK_BYTES;
/** Trailing whitespace trimmed: the same 352 bytes as the unaugmented file. */
const NORMALISED_BYTES = 146_854 + REMARK_BYTES;
/** The blank between two adjacent centered lines, which cannot be stored. */
const BLANKS_LOST = 1;
/** The tight run of two action lines inside the boneyard gains one. */
const BLANKS_ADDED = 1;
const CONTINUATIONS_ADDED = 20;
const EXTENSION = " (CONT'D)";
/**
 * The three sung speeches whose italics open on one line and close several
 * lines later (ADR-0027). Each element gains its own delimiter pair on the way
 * out, which is ADR-0020's eighth normalisation.
 */
const SPANNING_MARKS = 3;
/** 15 elements across the three songs: 6 delimiter characters become 30. */
const SPANNING_ELEMENTS = 15;
const DELIMITERS_ADDED = SPANNING_ELEMENTS * 2 - SPANNING_MARKS * 2;

const IMPORTED_BYTES =
  NORMALISED_BYTES -
  BLANKS_LOST +
  BLANKS_ADDED +
  CONTINUATIONS_ADDED * EXTENSION.length +
  DELIMITERS_ADDED;

const document = (options = {}) =>
  importScreenplay(readFixtureBytes(FIXTURE), options).document;
const imported = (options = {}): Uint8Array => exportScreenplay(document(options));
const output = (options = {}): string => new TextDecoder().decode(imported(options));
const normalisedText = (): string => normaliseSource(readFixtureText(FIXTURE)).text;

const ofType = (type: string, options = {}) =>
  document(options).elements.filter((element) => element.type === type);

describe("the augmented fixture, measured as bytes", () => {
  it("imports to 147,139 bytes", () => {
    const bytes = writeBytesAndReadBack("big-fish-augmented.roundtrip.fountain", imported());

    expect(readFixtureBytes(FIXTURE).length).toBe(SOURCE_BYTES);
    expect(new TextEncoder().encode(normalisedText()).length).toBe(NORMALISED_BYTES);
    expect(bytes.length).toBe(IMPORTED_BYTES);
    // The remarks, and nothing else: source and import both grew by 81.
    expect(REMARK_BYTES).toBe(81);
    expect(SOURCE_BYTES).toBe(147_287);
    expect(IMPORTED_BYTES).toBe(147_139);
    expect(IMPORTED_BYTES - REMARK_BYTES).toBe(147_058);
    // The three songs it shares with the unaugmented cut, and nothing more.
    expect(DELIMITERS_ADDED).toBe(24);
    expect(IMPORTED_BYTES - REMARK_BYTES - DELIMITERS_ADDED).toBe(147_034);
  });

  it("changes two blank lines, 20 cues and 15 song lines, and nothing else", () => {
    const edits = lineEdits(normalisedText().split("\n"), output().split("\n"));

    const blanks = edits.filter((edit) => edit.text === "");
    expect(blanks).toEqual([
      // The tight action run inside the boneyard.
      { kind: "added", line: 73, text: "" },
      // The pair of adjacent centered lines.
      { kind: "removed", line: 105, text: "" },
    ]);

    const changed = edits.filter((edit) => edit.text !== "");
    expect(changed).toHaveLength((CONTINUATIONS_ADDED + SPANNING_ELEMENTS) * 2);

    const added = changed.filter((edit) => edit.kind === "added");
    const cues = added.filter((edit) => edit.text.endsWith(EXTENSION));
    expect(cues).toHaveLength(CONTINUATIONS_ADDED);

    // The rest are the three songs, each line now delimited at both ends
    // (ADR-0027, and ADR-0020's eighth normalisation).
    const songs = added.filter((edit) => !edit.text.endsWith(EXTENSION));
    expect(songs).toHaveLength(SPANNING_ELEMENTS);
    for (const edit of songs) {
      expect(edit.text.startsWith("*") && edit.text.endsWith("*")).toBe(true);
    }
  });

  it("loses only the blank between the two adjacent centered lines", () => {
    // ADR-0019: Centered to Centered takes no blank line, so a pair written as
    // two cards becomes one. The same collapse as Brick & Steel's title cards.
    expect(normalisedText()).toContain("> FADE TO BLACK <\n\n> THE BEAST <");
    expect(output()).toContain("> FADE TO BLACK <\n> THE BEAST <");
  });
});

describe("the boneyard is a range, not a container", () => {
  /** Every element from the opening delimiter to the closing one. */
  const range = () => {
    const elements = document().elements;
    const start = elements.findIndex((element) => element.type === "boneyard-start");
    const end = elements.findIndex((element) => element.type === "boneyard-end");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return elements.slice(start, end + 1);
  };

  it("is delimited by an element each end, with ordinary elements between", () => {
    expect(range().map((element) => [element.type, element.text])).toEqual([
      ["boneyard-start", "/*"],
      ["action", "CUT 2003-04-12: an earlier telling, where the Beast was the size of a man."],
      ["action", "Kept in case the wedding scene needs it back."],
      ["character", "EDWARD (CONT'D)"],
      ["dialogue", "He was longer than the boat and twice as mean."],
      ["boneyard-end", "*/"],
    ]);
  });

  it("marks every element in the range omitted, delimiters included", () => {
    for (const element of range()) expect(element.omitted, element.text).toBe(true);
    // And nothing outside it.
    expect(document().elements.filter((element) => element.omitted === true)).toHaveLength(
      range().length,
    );
  });

  it("keeps the delimiters against the material they delimit", () => {
    // No blank line after `/*` or before `*/`; the blank lines that separate
    // the boneyard from the script are outside the pair.
    expect(output()).toContain("mean.\n*/\n\n= Two fishermen");
    expect(output()).toMatch(/\n\n\/\*\nCUT 2003-04-12/);
  });

  it("spaces its contents by the ordinary rules", () => {
    // The two action lines inside it are a tight run, so they gain a blank
    // between them — ADR-0020's seventh normalisation, applied in here for the
    // same reason it applies anywhere else. The blank before the cue was
    // already there, and comes back from action-to-character.
    expect(normalisedText()).toContain("size of a man.\nKept in case");
    expect(output()).toContain("size of a man.\n\nKept in case");
    expect(output()).toContain("needs it back.\n\nEDWARD");
  });

  it("maintains (CONT'D) on a cue inside it, like any other cue", () => {
    // The material is omitted downstream, not exempt from the model. Edward
    // speaks before the boneyard, the delimiter interrupts him, and he resumes
    // inside it — so the extension is due, and ADR-0026 says the application
    // maintains it wherever the element sequence says so.
    const cue = range().find((element) => element.type === "character");

    expect(cue?.text).toBe("EDWARD (CONT'D)");
    expect(cue?.omitted).toBe(true);
    expect(normalisedText()).toContain("back.\n\nEDWARD\nHe was longer");
    expect(output()).toContain("back.\n\nEDWARD (CONT'D)\nHe was longer");
  });

  it("counts that cue in the import report", () => {
    // 19 in the unaugmented file, plus this one.
    expect(importScreenplay(readFixtureBytes(FIXTURE)).report.applied).toContainEqual({
      kind: "continuations-added",
      count: CONTINUATIONS_ADDED,
    });
    expect(CONTINUATIONS_ADDED).toBe(20);
  });

  it("falls back to ordinary text when nothing closes it", () => {
    // An unclosed `/*` would otherwise mark the rest of the script omitted,
    // dropping it from the page count and the export. The bytes survive either
    // way; that classification is too expensive to get wrong.
    const unterminated = ".INT. KITCHEN - DAY\n\n/*\nCut, but never closed.";
    const parsed = parse(unterminated);

    expect(parsed.elements.map((element) => element.type)).toEqual([
      "scene-heading",
      "action",
      "action",
    ]);
    expect(parsed.elements.some((element) => element.omitted === true)).toBe(false);
    expect(serialise(parsed)).toBe(".INT. KITCHEN - DAY\n\n/*\n\nCut, but never closed.");
  });

  it("treats a delimiter sharing its line with text as text", () => {
    // The delimiter form is a line of its own. Reading an inline `/*` as one
    // would split a paragraph in two.
    const parsed = parse("/* cut */");

    expect(parsed.elements.map((element) => element.type)).toEqual(["action"]);
    expect(parsed.elements[0]?.omitted).toBeUndefined();
    expect(serialise(parsed)).toBe("/* cut */");
  });

  it("round-trips an empty boneyard", () => {
    const parsed = parse(".INT. KITCHEN - DAY\n\n/*\n*/");

    expect(parsed.elements.map((element) => element.type)).toEqual([
      "scene-heading",
      "boneyard-start",
      "boneyard-end",
    ]);
    expect(serialise(parsed)).toBe(".INT. KITCHEN - DAY\n\n/*\n*/");
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

describe("comments are modelled, held once on the document (ADR-0018)", () => {
  // Until 2026-09-19 these were plain text inside the element. They are now
  // lifted out before classification and held as comments, so the element's
  // text is what the writer sees and the comment says what it covers.
  const comments = () => document().comments;
  /** The text a comment covers, when it starts and ends in one element. */
  const covered = (id: string): string => {
    const comment = comments().find((c) => c.id === id)!;
    expect(comment.start.element).toBe(comment.end.element);
    return document().elements[comment.start.element]!.text.slice(
      comment.start.offset,
      comment.end.offset,
    );
  };

  it("finds five, with their ids and remarks exactly as written", () => {
    expect(comments().map((c) => [c.id, c.remark])).toEqual([
      ["a1", "is this too on the nose?"],
      ["b1", "tighten"],
      ["b2", "cut superstition?"],
      ["c1", "keep"],
      ["c2", "Edward's voice, not mine"],
    ]);
  });

  it("puts each one over the words it was written round", () => {
    expect(covered("a1")).toBe("There are some fish that cannot be caught.");
    expect(covered("b1")).toBe("I didn't put any stock into such speculation");
    expect(covered("b2")).toBe("into such speculation or superstition.");
    expect(covered("c1")).toBe(
      "All I knew was I'd been trying to catch that fish since I was a boy no bigger than you.",
    );
    expect(covered("c2")).toBe("I'd been trying to catch that fish");
  });

  it("lets b1 and b2 cross, which marks may not do", () => {
    // b1 opens, b2 opens, b1 closes, b2 closes. A comment carries an id, so
    // its pairing is recorded rather than inferred (ADR-0018, ADR-0019).
    const [b1, b2] = ["b1", "b2"].map((id) => comments().find((c) => c.id === id)!);
    expect(b1!.start.offset).toBeLessThan(b2!.start.offset);
    expect(b2!.start.offset).toBeLessThan(b1!.end.offset);
    expect(b1!.end.offset).toBeLessThan(b2!.end.offset);
  });

  it("holds c2 inside c1", () => {
    const [c1, c2] = ["c1", "c2"].map((id) => comments().find((c) => c.id === id)!);
    expect(c1!.start.offset).toBeLessThan(c2!.start.offset);
    expect(c2!.end.offset).toBeLessThan(c1!.end.offset);
  });

  it("leaves no comment delimiter in any element's text", () => {
    for (const element of document().elements) {
      expect(element.text).not.toMatch(/\[\[\/?c:/);
    }
  });

  it("leaves line 29 one plain note, because it carries no c:", () => {
    expect(normalisedText().split("\n")[28]).toBe(
      "[[Check the catfish is described the same way in the wedding scene]]",
    );
    expect(ofType("note")).toHaveLength(1);
  });

  it("writes both commented lines back exactly as they stand in the file", () => {
    const source = normalisedText().split("\n");
    const written = output();

    expect(source[31]).toMatch(/^\[\[c:a1 is this too on the nose\?\]\]There are some fish/);
    expect(written).toContain(source[31]);
    expect(source[43]).toMatch(/^\[\[c:b1 tighten\]\]I didn't put any stock \[\[c:b2 /);
    expect(written).toContain(source[43]);
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
        ["action", 866],
        ["boneyard-end", 1],
        ["boneyard-start", 1],
        ["centered", 4],
        ["character", 772],
        ["dialogue", 815],
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
