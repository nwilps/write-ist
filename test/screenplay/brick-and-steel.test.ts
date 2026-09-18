/**
 * Phase E1 — Brick & Steel.
 *
 * Small enough to read whole, and it exercises everything script.fountain does
 * not: nothing is forced, the line endings are mixed, the title page carries
 * tab-indented continuation lines, elements are indented with tabs, there is a
 * dual-dialogue cue, and it contains both of the two places where ADR-0019's
 * one-element-one-line rule is recorded as costing the writer something.
 *
 * Those two costs are the reason this file does *not* come back byte-identical
 * to its source, and both are written down in advance rather than discovered
 * and excused:
 *
 *   - the tight run of three action lines gains a blank between each
 *     (ADR-0020's seventh normalisation, ADR-0019's measurement),
 *   - the blank line between the two centered title cards is lost, collapsing
 *     them into one four-line card (ADR-0019, recorded "so it is not later
 *     mistaken for a bug").
 */
import { describe, expect, it } from "vitest";
import { exportScreenplay, importScreenplay, reopenAndSave } from "../../src/screenplay/import.ts";
import { normaliseSource } from "../../src/normalise.ts";
import { assertBytesEqual } from "../support/byte-diff.ts";
import { readFixtureBytes, readFixtureText, writeBytesAndReadBack } from "../support/files.ts";
import { lineEdits } from "../support/line-diff.ts";

const FIXTURE = "Brick-&-Steel.fountain";

/** On disk, with CRLF on most lines and LF on a few. */
const SOURCE_BYTES = 3_017;
/** After the line endings are made LF: 144 carriage returns removed. */
const NORMALISED_BYTES = 2_873;
/** ` (CONT'D)` — nine bytes. */
const EXTENSION = " (CONT'D)";
const CONTINUATIONS_ADDED = 3;
/** The tight action run of three lines gains a blank between each. */
const BLANKS_ADDED = 2;
/** The blank between the two centered title cards is not representable. */
const BLANKS_LOST = 1;

const IMPORTED_BYTES =
  NORMALISED_BYTES + CONTINUATIONS_ADDED * EXTENSION.length + BLANKS_ADDED - BLANKS_LOST;

const imported = (options = {}): Uint8Array =>
  exportScreenplay(importScreenplay(readFixtureBytes(FIXTURE), options).document);

const normalisedText = (): string => normaliseSource(readFixtureText(FIXTURE)).text;

describe("Brick & Steel, measured as bytes", () => {
  it("is 3,017 bytes on disk and 2,873 once the line endings are LF", () => {
    expect(readFixtureBytes(FIXTURE).length).toBe(SOURCE_BYTES);
    expect(new TextEncoder().encode(normalisedText()).length).toBe(NORMALISED_BYTES);
    expect(SOURCE_BYTES - NORMALISED_BYTES).toBe(144);
  });

  it("imports to 2,901 bytes, and the arithmetic is the four documented changes", () => {
    const bytes = writeBytesAndReadBack("brick-and-steel.roundtrip.fountain", imported());

    expect(bytes.length).toBe(IMPORTED_BYTES);
    expect(IMPORTED_BYTES).toBe(2_901);
  });

  it("reports the line endings, the extensions and the blank lines, and nothing else", () => {
    const { report } = importScreenplay(readFixtureBytes(FIXTURE));

    expect(report.applied).toEqual([
      { kind: "line-endings-to-lf", count: 144 },
      { kind: "continuations-added", count: CONTINUATIONS_ADDED },
      // The two blanks the tight action run gains and the one the title cards
      // lose — one rule, one count. Absent until issue #27, which is the
      // defect: the file changed on three lines and the report was silent.
      { kind: "blank-lines-placed", count: BLANKS_ADDED + BLANKS_LOST },
    ]);
  });
});

describe("every line the round-trip changed is one the ADRs allow", () => {
  // The guard against offsetting errors: a byte total can be right while two
  // mistakes cancel. This names each edit.
  const edits = (): ReturnType<typeof lineEdits> =>
    lineEdits(normalisedText().split("\n"), new TextDecoder().decode(imported()).split("\n"));

  it("makes exactly six edits", () => {
    // Three cues rewritten (a removal and an addition each is counted once
    // here because the removal and addition pair up), two blanks added, one
    // blank removed.
    expect(edits()).toHaveLength(3 * 2 + BLANKS_ADDED + BLANKS_LOST);
  });

  it("changes three character cues, by appending an extension to each", () => {
    const rewritten = edits().filter((edit) => edit.text !== "");
    const removed = rewritten.filter((edit) => edit.kind === "removed").map((e) => e.text);
    const added = rewritten.filter((edit) => edit.kind === "added").map((e) => e.text);

    expect(removed).toEqual(["STEEL", "STEEL", "COGNITO"]);
    expect(added).toEqual(["STEEL (CONT'D)", "STEEL (CONT'D)", "COGNITO (CONT'D)"]);
  });

  it("adds two blank lines, and they are the tight action run", () => {
    const added = edits().filter((edit) => edit.kind === "added" && edit.text === "");
    expect(added).toHaveLength(BLANKS_ADDED);

    const output = new TextDecoder().decode(imported());
    expect(output).toContain(
      "And then there's a long beat.\n\nLonger than is funny.\n\nLong enough to be depressing.",
    );
    // The one genuine multi-line action block in three produced screenplays.
    expect(normalisedText()).toContain(
      "And then there's a long beat.\nLonger than is funny.\nLong enough to be depressing.",
    );
  });

  it("loses one blank line, and it is the one between the two title cards", () => {
    const removed = edits().filter((edit) => edit.kind === "removed" && edit.text === "");
    expect(removed).toHaveLength(BLANKS_LOST);

    const output = new TextDecoder().decode(imported());
    expect(output).toContain(
      "> BRICK BRADDOCK <\n> & DICK STEEL IN <\n> BRICK & STEEL <\n> FULL RETIRED <",
    );
  });
});

describe("what this fixture exercises that the corpus does not", () => {
  const document = (): ReturnType<typeof importScreenplay>["document"] =>
    importScreenplay(readFixtureBytes(FIXTURE)).document;

  it("reads a title page whose values are tab-indented continuation lines", () => {
    const fields = document().titlePage;

    expect(fields.map((field) => field.key)).toEqual([
      "Title",
      "Credit",
      "Author",
      "Source",
      "Draft date",
      "Contact",
    ]);
    // The title page carries marks like anything else, and they come out of
    // it the same way: the tab is text and the offsets are measured over it.
    // ADR-0019 fixes the emission order as underline outermost, which is what
    // this file is written in and what goes back on the way out.
    expect(fields[0]).toEqual({
      key: "Title",
      inline: { text: "" },
      continuations: [
        {
          text: "\tBRICK & STEEL",
          marks: [
            { mark: "underline", start: 1, end: 14 },
            { mark: "bold", start: 1, end: 14 },
          ],
        },
        {
          text: "\tFULL RETIRED",
          marks: [
            { mark: "underline", start: 1, end: 13 },
            { mark: "bold", start: 1, end: 13 },
          ],
        },
      ],
    });
    expect(fields[5]?.continuations).toEqual([
      { text: "\tNext Level Productions" },
      { text: "\t1588 Mission Dr." },
      { text: "\tSolvang, CA 93463" },
    ]);
  });

  it("classifies every element with no forcing marker to help it", () => {
    const census = new Map<string, number>();
    for (const element of document().elements) {
      census.set(element.type, (census.get(element.type) ?? 0) + 1);
    }

    expect([...census.entries()].sort()).toEqual(
      [
        ["action", 22],
        ["centered", 5],
        ["character", 20],
        ["dialogue", 23],
        ["parenthetical", 6],
        ["scene-heading", 8],
        ["transition", 7],
      ].sort(),
    );
  });

  it("keeps tab indentation on the elements that carry it", () => {
    const indented = document().elements.filter((element) => element.indent !== "");

    expect(indented.map((element) => [element.type, element.indent, element.text])).toEqual([
      ["character", "\t\t\t", "JACK"],
      ["parenthetical", "\t\t", "(in Vietnamese, subtitled)"],
      ["dialogue", "\t", "Did you know Brick and Steel are retired?"],
      ["character", "\t\t\t", "DAN"],
      ["dialogue", "\t", "Then let's retire them."],
      ["dialogue", "\t", "Permanently."],
      ["transition", "\t\t\t\t", "CUT TO:"],
    ]);
  });

  it("keeps the dual-dialogue caret on the cue that carries it", () => {
    // The caret is a property of the cue, not part of the character's name,
    // so it comes off the text and goes back on the way out.
    const dual = document().elements.filter(
      (element) => element.type === "character" && element.dual === true,
    );

    expect(dual.map((element) => element.text)).toEqual(["BRICK"]);
    expect(new TextDecoder().decode(imported())).toContain("BRICK ^\nScrew retirement.");
  });

  it("reads a forced heading, a forced transition and a centered line correctly", () => {
    const elements = document().elements;
    const byText = (text: string) => elements.find((element) => element.text === text);

    expect(byText("SNIPER SCOPE POV")?.type).toBe("scene-heading");
    expect(byText("SNIPER SCOPE POV")?.forced).toBe(true);
    expect(byText("EXT. BRICK'S PATIO - DAY")?.forced).toBe(false);
    expect(byText(" BURN TO PINK.")?.type).toBe("transition");
    expect(byText(" THE END ")?.type).toBe("centered");
  });

  it("does not mistake an action line ending in a colon for a transition", () => {
    const elements = document().elements;
    const minion = elements.find((element) =>
      element.text.startsWith("His minion approaches"),
    );

    expect(minion?.type).toBe("action");
  });
});

describe("idempotence on Brick & Steel", () => {
  it("is byte-identical when opened and saved without typing", () => {
    const ours = writeBytesAndReadBack("brick-and-steel.ours.fountain", imported());
    const resaved = writeBytesAndReadBack("brick-and-steel.resaved.fountain", reopenAndSave(ours));

    assertBytesEqual(ours, resaved, {
      expectedLabel: "as written",
      actualLabel: "after reopen and save",
      message: "opening and saving without typing changed the file",
    });
  });

  it("is imported a second time with nothing left to change", () => {
    const once = imported();
    const { document, report } = importScreenplay(once);

    expect(report.applied).toEqual([]);
    assertBytesEqual(once, exportScreenplay(document), {
      expectedLabel: "first import",
      actualLabel: "second import",
    });
  });

  it("holds with (CONT'D) maintenance switched off too", () => {
    const options = { maintainContinuations: false } as const;
    const ours = imported(options);

    assertBytesEqual(ours, reopenAndSave(ours, options), {
      expectedLabel: "as written",
      actualLabel: "after reopen and save",
    });
    // Only the spacing changes remain: +2 blanks, -1 blank.
    expect(ours.length).toBe(NORMALISED_BYTES + BLANKS_ADDED - BLANKS_LOST);
  });
});
