/**
 * Phase E2 — Big Fish. The guessing test.
 *
 * Nothing in this file is forced, so every one of its 192 scene headings, 768
 * character cues and 862 action lines is a decision the parser makes from the
 * text alone. Hundreds of those lines are entirely upper case, and which
 * element they are depends on what surrounds them: `A RIVER.` and
 * `ON WILL AND SANDRA` are action, `WILL` and `SANDRA` are usually cues and
 * occasionally shot headings.
 *
 * The byte gate cannot help here. An action line misread as a cue serialises
 * byte for byte the same either way, so this file round-tripped perfectly
 * while two sluglines were being read as action. Everything below the byte
 * arithmetic exists because of that: these are assertions about the *guess*,
 * which is the one thing ADR-0020 allows to be wrong and this fixture exists
 * to get right.
 */
import { describe, expect, it } from "vitest";
import type { ElementType } from "../../src/screenplay/document.ts";
import { characterName } from "../../src/screenplay/continuations.ts";
import { exportScreenplay, importScreenplay, reopenAndSave } from "../../src/screenplay/import.ts";
import { normaliseSource } from "../../src/normalise.ts";
import { assertBytesEqual } from "../support/byte-diff.ts";
import { readFixtureBytes, readFixtureText, writeBytesAndReadBack } from "../support/files.ts";
import { lineEdits } from "../support/line-diff.ts";

const FIXTURE = "Big-Fish.fountain";

/** On disk. LF throughout, three non-ASCII characters, already NFC. */
const SOURCE_BYTES = 146_254;
/** After trailing whitespace is trimmed: 352 bytes across 210 lines. */
const NORMALISED_BYTES = 145_902;
const CONTINUATIONS_ADDED = 19;
const EXTENSION = " (CONT'D)";
const IMPORTED_BYTES = NORMALISED_BYTES + CONTINUATIONS_ADDED * EXTENSION.length;

const document = (options = {}) =>
  importScreenplay(readFixtureBytes(FIXTURE), options).document;

const imported = (options = {}): Uint8Array => exportScreenplay(document(options));

const normalisedText = (): string => normaliseSource(readFixtureText(FIXTURE)).text;

/** Every element whose rendered line is exactly this text. */
const withText = (text: string) =>
  document({ maintainContinuations: false }).elements.filter(
    (element) => element.indent + element.text === text,
  );

/** The single element with this text, asserted to be unique. */
const only = (text: string) => {
  const found = withText(text);
  expect(found, `expected exactly one element reading ${JSON.stringify(text)}`).toHaveLength(1);
  return found[0]!;
};

/** Assert how many elements read exactly this text, and that all share a type. */
const allRead = (text: string, count: number, type: ElementType): void => {
  const found = withText(text);
  expect(found, text).toHaveLength(count);
  expect(
    found.map((element) => element.type),
    text,
  ).toEqual(Array.from({ length: count }, () => type));
};

describe("Big Fish, measured as bytes", () => {
  it("normalises to 145,902 bytes, losing 352 to trailing whitespace", () => {
    expect(readFixtureBytes(FIXTURE).length).toBe(SOURCE_BYTES);
    expect(new TextEncoder().encode(normalisedText()).length).toBe(NORMALISED_BYTES);
    expect(SOURCE_BYTES - NORMALISED_BYTES).toBe(352);
  });

  it("imports to 146,073 bytes: the normalised file plus 19 extensions", () => {
    const bytes = writeBytesAndReadBack("big-fish.roundtrip.fountain", imported());

    expect(bytes.length).toBe(IMPORTED_BYTES);
    expect(IMPORTED_BYTES).toBe(146_073);
  });

  it("reports trailing whitespace and the extensions, and nothing else", () => {
    expect(importScreenplay(readFixtureBytes(FIXTURE)).report.applied).toEqual([
      { kind: "trailing-whitespace-trimmed", count: 210 },
      { kind: "continuations-added", count: CONTINUATIONS_ADDED },
    ]);
  });

  it("returns the normalised source untouched when maintenance is off", () => {
    // No tight action runs and no adjacent centered lines, so with the
    // extensions set aside this file has nothing the model cannot hold.
    const options = { maintainContinuations: false } as const;
    const output = imported(options);

    expect(lineEdits(normalisedText().split("\n"), new TextDecoder().decode(output).split("\n")))
      .toEqual([]);
    assertBytesEqual(new TextEncoder().encode(normalisedText()), output, {
      expectedLabel: "normalised source",
      actualLabel: "round-tripped",
    });
  });

  it("changes only cue lines when maintenance is on", () => {
    const edits = lineEdits(
      normalisedText().split("\n"),
      new TextDecoder().decode(imported()).split("\n"),
    );

    // A rewritten line is one removal and one addition.
    expect(edits).toHaveLength(CONTINUATIONS_ADDED * 2);
    for (const edit of edits) expect(edit.text).not.toBe("");
    const added = edits.filter((edit) => edit.kind === "added");
    for (const edit of added) expect(edit.text.endsWith(EXTENSION)).toBe(true);
  });
});

describe("the guess: what every line was read as", () => {
  it("classifies 2,767 elements", () => {
    const census = new Map<ElementType, number>();
    for (const element of document({ maintainContinuations: false }).elements) {
      census.set(element.type, (census.get(element.type) ?? 0) + 1);
    }

    expect([...census.entries()].sort()).toEqual(
      (
        [
          ["action", 861],
          ["centered", 2],
          ["character", 768],
          ["dialogue", 811],
          ["page-break", 1],
          ["parenthetical", 97],
          ["scene-heading", 192],
          // 34 ending in TO:, plus the file's one CUT TO BLACK.
          ["transition", 35],
        ] as Array<[ElementType, number]>
      ).sort(),
    );
  });

  it("reads an all-caps line followed by a blank as action, not as a cue", () => {
    // This is the whole disambiguation. A cue is followed immediately by its
    // dialogue; a shot heading is followed by a blank line.
    for (const text of [
      "A RIVER.",
      "ON WILL AND SANDRA",
      "THE BEAST.",
      "UNDERWATER.",
      "ON HIS SHOES",
      "TWO OVERSIZED HANDS",
      "TEN THOUSAND DAFFODILS.",
      "A FAT CATFISH",
    ]) {
      expect(only(text).type, text).toBe("action");
    }
  });

  it("reads a character's own name as a shot heading where it stands alone", () => {
    // `KARL` is a cue thirteen times and a shot heading once; the shot heading
    // is the one with a blank line after it. Both read as the same text once
    // its trailing space is trimmed, so only the surroundings tell them apart.
    const karl = withText("KARL");
    expect(karl.filter((element) => element.type === "character")).toHaveLength(13);
    expect(karl.filter((element) => element.type === "action")).toHaveLength(1);

    // 56 bare `SANDRA` cues; the other three of her 59 carry an extension.
    const sandra = withText("SANDRA");
    expect(sandra.filter((element) => element.type === "character")).toHaveLength(56);
    expect(sandra.filter((element) => element.type === "action")).toHaveLength(1);

    const byName = document({ maintainContinuations: false }).elements.filter(
      (element) => element.type === "character" && characterName(element.text) === "SANDRA",
    );
    expect(byName).toHaveLength(59);
  });

  it("reads EXT/INT. as a scene heading", () => {
    // Not in the Fountain spec's list, which names INT, EXT, EST, INT./EXT and
    // I/E. Big Fish uses it twice, and both were read as action until this
    // fixture was audited by hand — the byte gate saw nothing, because an
    // unforced heading and an action line serialise identically.
    expect(only("EXT/INT. SORORITY HOUSE - THE DOORWAY").type).toBe("scene-heading");
    expect(only("EXT/INT.  SWAMP SHACK - DAY").type).toBe("scene-heading");
  });

  it("reads a heading with non-ASCII in it, and returns the bytes unchanged", () => {
    const heading = only("INT.  TINY PARIS RESTAURANT (LA RUE 14°) - NIGHT (1998)");

    expect(heading.type).toBe("scene-heading");
    expect(heading.forced).toBe(false);
    expect(new TextDecoder().decode(imported())).toContain("LA RUE 14°");
  });

  it("reads a transition where the line ends in TO:, or is one of the three", () => {
    allRead("MATCH CUT TO:", 4, "transition");
    allRead("BACK TO:", 4, "transition");

    // ADR-0021's three unforced transitions do not end in TO:. This file has
    // one of them, as its last line before the end title.
    expect(only("CUT TO BLACK.").type).toBe("transition");

    // `FADE IN:` is not on that list and does not end in TO:, so it is action.
    expect(only("FADE IN:").type).toBe("action");
  });

  it("reads an all-caps line inside a speech as dialogue, not as a new cue", () => {
    for (const text of ["GO AWAY!", "GO!  GO!  GO!", "GUARD!"]) {
      expect(only(text).type, text).toBe("dialogue");
    }
  });

  it("reads the page break and the two centered lines", () => {
    expect(only("====").type).toBe("page-break");

    // A centered element's text is what sits between the delimiters.
    const centered = document({ maintainContinuations: false }).elements.filter(
      (element) => element.type === "centered",
    );
    expect(centered.map((element) => element.text)).toEqual([" BIG FISH ", " THE END "]);
    // One underline on the first, underline over bold on the second — and the
    // delimiters go back between the `>` and the `<`, not outside them.
    expect(centered.map((element) => element.marks)).toEqual([
      [{ mark: "underline", start: 1, end: 9 }],
      [
        { mark: "underline", start: 1, end: 8 },
        { mark: "bold", start: 1, end: 8 },
      ],
    ]);
    expect(new TextDecoder().decode(imported())).toContain("> _BIG FISH_ <");
  });

  it("names 48 distinct characters", () => {
    const names = new Set(
      document({ maintainContinuations: false })
        .elements.filter((element) => element.type === "character")
        .map((element) => characterName(element.text)),
    );

    expect(names.size).toBe(48);
    // Every one reads as a person, not as a stray line of action.
    expect(names).toContain("EDWARD");
    expect(names).toContain("A DEEP VOICE");
    expect(names).toContain("VARIOUS TOWNFOLK");
    expect(names).not.toContain("ON WILL AND SANDRA");
  });

  it("reads the title page, whose Notes field carries three indented lines", () => {
    const fields = document({ maintainContinuations: false }).titlePage;

    expect(fields.map((field) => field.key)).toEqual([
      "Title",
      "Credit",
      "Author",
      "Source",
      "Notes",
      "Copyright",
    ]);
    // `Notes:` is written with a trailing tab, which is trailing whitespace.
    expect(fields[4]).toEqual({
      key: "Notes",
      inline: { text: "" },
      continuations: [
        { text: "\tFINAL PRODUCTION DRAFT" },
        { text: "\tincludes post-production dialogue" },
        { text: "\tand omitted scenes" },
      ],
    });
  });
});

describe("extensions are opaque text, never a value from a list", () => {
  const cueExtensions = (): Map<string, number> => {
    const census = new Map<string, number>();
    for (const element of document({ maintainContinuations: false }).elements) {
      if (element.type !== "character") continue;
      for (const match of element.text.match(/\([^)]*\)/g) ?? []) {
        census.set(match, (census.get(match) ?? 0) + 1);
      }
    }
    return census;
  };

  it("carries the 102 (CONT'D) and 96 (V.O.)/(O.S.) that ADR-0026 counts", () => {
    const census = cueExtensions();

    expect(census.get("(CONT'D)")).toBe(102);
    expect(census.get("(V.O.)")).toBe(86);
    expect(census.get("(O.S.)")).toBe(10);
  });

  it("keeps extensions that are in no enumeration anywhere", () => {
    const census = cueExtensions();

    expect(census.get("(ON PHONE)")).toBe(1);
    expect(census.get("(O.S., PRELAP)")).toBe(1);
    expect(census.get("(VARIOUS)")).toBe(1);
  });

  it("never corrects the (V.0.) typed with a zero", () => {
    // Correcting it would be Write-ist changing the writer's characters.
    expect(cueExtensions().get("(V.0.)")).toBe(1);
    expect(new TextDecoder().decode(imported())).toContain("(V.0.)");
  });

  it("reads a cue carrying two extensions with no space between them", () => {
    allRead("EDWARD (V.O.)(CONT'D)", 6, "character");
    expect(characterName("EDWARD (V.O.)(CONT'D)")).toBe("EDWARD");

    // They already have a continuation, so maintenance must not add a second.
    expect(new TextDecoder().decode(imported())).not.toContain("(V.O.)(CONT'D) (CONT'D)");
  });

  it("keeps the two spaces in PING  (CONT'D) exactly as written", () => {
    allRead("PING  (CONT'D)", 2, "character");
    expect(new TextDecoder().decode(imported())).toContain("PING  (CONT'D)");
  });
});

describe("the four continuations the rule would not have written", () => {
  // ADR-0026 says `(CONT'D)` does not carry across a scene heading. Big Fish
  // carries it across one three times, all for narration bridging a cut, and
  // marks a fourth where only more dialogue intervened. Maintenance adds only,
  // so all four survive exactly as John August wrote them.
  it("leaves all of them in place", () => {
    const output = new TextDecoder().decode(imported());

    expect(output).toContain("EDWARD (V.O.)(CONT'D)");
    expect(output).toContain("JENNY (V.O.)(CONT'D)");
    expect(output).toContain("PING  (CONT'D)");
  });

  it("adds 19, not 23, because it never re-marks a cue that is already marked", () => {
    expect(importScreenplay(readFixtureBytes(FIXTURE)).report.applied).toContainEqual({
      kind: "continuations-added",
      count: 19,
    });
  });
});

describe("idempotence on Big Fish", () => {
  it("is byte-identical when opened and saved without typing", () => {
    const ours = writeBytesAndReadBack("big-fish.ours.fountain", imported());
    const resaved = writeBytesAndReadBack("big-fish.resaved.fountain", reopenAndSave(ours));

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
