/**
 * Phase E1 — Brick & Steel.
 *
 * Small enough to read whole, and it exercises everything script.fountain does
 * not: nothing is forced, the line endings are mixed, the title page carries
 * tab-indented continuation lines, elements are indented with tabs, there is a
 * dual-dialogue cue, and it contains both of the two places where ADR-0019's
 * one-element-one-line rule is recorded as costing the writer something.
 *
 * Those two costs used to be the reason this file did *not* come back
 * byte-identical to its source: the tight run of three action lines gained a
 * blank between each (ADR-0020's seventh normalisation) and the blank between
 * the two centered title cards was lost. ADR-0038 ended both. A tight pair of
 * action or centered lines is a *squished gap*, and a blank line between two
 * of them is the default gap; both are kept as written, so the spacing no
 * longer costs this file a byte.
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
/** The tight action run of three lines is two squished gaps, kept as they are (ADR-0038). */
const BLANKS_ADDED = 0;
/** The blank between the two centered title cards is a gap, kept (ADR-0038). */
const BLANKS_LOST = 0;

/**
 * Leading whitespace on the twelve indented lines is 20 bytes. Five of those
 * lines are title-page continuations, one tab each, which are written back as
 * the same one tab; the other seven are elements, 15 bytes, and are dropped
 * (issue #15, ADR-0020's tenth entry). Counted from the file, not the code.
 */
const INDENTED_LINES_DROPPED = 7;
const INDENT_BYTES_DROPPED = 15;

const IMPORTED_BYTES =
  NORMALISED_BYTES +
  CONTINUATIONS_ADDED * EXTENSION.length +
  BLANKS_ADDED -
  BLANKS_LOST -
  INDENT_BYTES_DROPPED;

const imported = (options = {}): Uint8Array =>
  exportScreenplay(importScreenplay(readFixtureBytes(FIXTURE), options).document);

const normalisedText = (): string => normaliseSource(readFixtureText(FIXTURE)).text;

describe("Brick & Steel, measured as bytes", () => {
  it("is 3,017 bytes on disk and 2,873 once the line endings are LF", () => {
    expect(readFixtureBytes(FIXTURE).length).toBe(SOURCE_BYTES);
    expect(new TextEncoder().encode(normalisedText()).length).toBe(NORMALISED_BYTES);
    expect(SOURCE_BYTES - NORMALISED_BYTES).toBe(144);
  });

  it("imports to 2,885 bytes, and the arithmetic is the three documented changes", () => {
    const bytes = writeBytesAndReadBack("brick-and-steel.roundtrip.fountain", imported());

    expect(bytes.length).toBe(IMPORTED_BYTES);
    expect(IMPORTED_BYTES).toBe(2_885);
  });

  it("reports the line endings, the indentation and the extensions, and nothing else", () => {
    const { report } = importScreenplay(readFixtureBytes(FIXTURE));

    expect(report.applied).toEqual([
      { kind: "line-endings-to-lf", count: 144 },
      { kind: "leading-whitespace-dropped", count: INDENTED_LINES_DROPPED },
      { kind: "continuations-added", count: CONTINUATIONS_ADDED },
      // No blank line moves any more (ADR-0038): the tight action run and the
      // gap between the title cards are kept, so there is nothing to report.
      // (Issue #27 is why the report counts blank lines at all: it must say so
      // whenever one does move, and `import-report.test.ts` holds that.)
    ]);
  });
});

/** The normalised source minus the indentation the body loses, which has its own test. */
const withoutBodyIndent = (text: string): string[] => {
  const lines = text.split("\n");
  const bodyStart = lines.indexOf("") + 1;
  return lines.map((line, index) => (index < bodyStart ? line : line.replace(/^[ \t]+/, "")));
};

describe("every line the round-trip changed is one the ADRs allow", () => {
  // The guard against offsetting errors: a byte total can be right while two
  // mistakes cancel. This names each edit.
  const edits = (): ReturnType<typeof lineEdits> =>
    lineEdits(withoutBodyIndent(normalisedText()), new TextDecoder().decode(imported()).split("\n"));

  it("makes exactly six edits", () => {
    // Three cues rewritten: a removal and an addition each.
    expect(edits()).toHaveLength(3 * 2);
  });

  it("changes three character cues, by appending an extension to each", () => {
    const rewritten = edits().filter((edit) => edit.text !== "");
    const removed = rewritten.filter((edit) => edit.kind === "removed").map((e) => e.text);
    const added = rewritten.filter((edit) => edit.kind === "added").map((e) => e.text);

    expect(removed).toEqual(["STEEL", "STEEL", "COGNITO"]);
    expect(added).toEqual(["STEEL (CONT'D)", "STEEL (CONT'D)", "COGNITO (CONT'D)"]);
  });

  it("keeps the tight action run as it is: two squished gaps, no blank line added", () => {
    const output = new TextDecoder().decode(imported());
    expect(output).toContain(
      "And then there's a long beat.\nLonger than is funny.\nLong enough to be depressing.",
    );
    const run = importScreenplay(readFixtureBytes(FIXTURE)).document.elements.filter((e) =>
      e.text.startsWith("Longer than is funny") || e.text.startsWith("Long enough"),
    );
    expect(run.map((e) => e.squished)).toEqual([true, true]);
  });

  it("keeps the blank between the two title cards: two cards, one default gap", () => {
    const output = new TextDecoder().decode(imported());
    expect(output).toContain(
      "> BRICK BRADDOCK <\n> & DICK STEEL IN <\n\n> BRICK & STEEL <\n> FULL RETIRED <",
    );
    const cards = importScreenplay(readFixtureBytes(FIXTURE)).document.elements.filter(
      (e) => e.type === "centered",
    );
    expect(cards.map((e) => e.squished === true)).toEqual([false, true, false, true, false]);
  });
});

describe("what this fixture exercises that the corpus does not", () => {
  const document = (): ReturnType<typeof importScreenplay>["document"] =>
    importScreenplay(readFixtureBytes(FIXTURE)).document;

  it("reads a title page whose values are tab-indented continuation lines, and writes them back as one tab", () => {
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
    // it the same way: the indentation is dropped, so offsets start at the first character.
    // ADR-0019 fixes the emission order as underline outermost, which is what
    // this file is written in and what goes back on the way out.
    expect(fields[0]).toEqual({
      key: "Title",
      inline: { text: "" },
      continuations: [
        {
          text: "BRICK & STEEL",
          marks: [
            { mark: "underline", start: 0, end: 13 },
            { mark: "bold", start: 0, end: 13 },
          ],
        },
        {
          text: "FULL RETIRED",
          marks: [
            { mark: "underline", start: 0, end: 12 },
            { mark: "bold", start: 0, end: 12 },
          ],
        },
      ],
    });
    expect(fields[5]?.continuations).toEqual([
      { text: "Next Level Productions" },
      { text: "1588 Mission Dr." },
      { text: "Solvang, CA 93463" },
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

  it("drops the tab indentation from the elements that carried it", () => {
    const { document: imported, report } = importScreenplay(readFixtureBytes(FIXTURE));
    const text = normalisedText();
    const indentedSource = text.split("\n").slice(text.split("\n").indexOf("") + 1);
    const carried = indentedSource.filter((line) => /^[ \t]/.test(line)).map((l) => l.trim());

    // The census: the same seven elements, now without the tabs, and the
    // report counts the seven lines it changed.
    expect(carried).toEqual([
      "JACK",
      "(in Vietnamese, subtitled)",
      "*Did you know Brick and Steel are retired?*",
      "DAN",
      "Then let's retire them.",
      "_Permanently_.",
      "CUT TO:",
    ]);
    const typeOf = (text: string): string[] =>
      imported.elements.filter((element) => element.text === text).map((element) => element.type);
    expect(typeOf("JACK")).toEqual(["character"]);
    expect(typeOf("DAN")).toEqual(["character"]);
    expect(typeOf("(in Vietnamese, subtitled)")).toEqual(["parenthetical"]);
    expect(report.applied).toContainEqual({
      kind: "leading-whitespace-dropped",
      count: INDENTED_LINES_DROPPED,
    });
    const out = new TextDecoder().decode(exportScreenplay(imported)).split("\n");
    expect(out.slice(out.indexOf("") + 1).filter((line) => /^[ \t]/.test(line))).toEqual([]);
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
    expect(ours.length).toBe(
      NORMALISED_BYTES + BLANKS_ADDED - BLANKS_LOST - INDENT_BYTES_DROPPED,
    );
  });
});
