/**
 * The faithfulness check (Phase D).
 *
 * Phase C asked the program to agree with itself. This asks the harder
 * question: does rebuilding produce the file we started with?
 *
 * Two claims, both from ADR-0020, and both compared as bytes read back off the
 * disk rather than as strings held in memory:
 *
 *   Fidelity    — on a file Write-ist has never seen, the output equals the
 *                 source after the enumerated normalisations and nothing else.
 *   Idempotence — on a file Write-ist itself wrote, the output is identical,
 *                 always.
 *
 * All seven normalisations are in force on import, `(CONT'D)` maintenance
 * included: it is the sixth entry on the list, so it is part of what import
 * does. The switch turns it off (ADR-0026), and the off case is pinned too.
 *
 * Every number below is a byte count of a real file. The v1-era gate printed
 * `b.length`, a JavaScript character count, and called it bytes; that is the
 * whole of the 170,679 / 170,682 confusion, and nothing here is permitted to
 * repeat it.
 */
import { describe, expect, it } from "vitest";
import {
  exportScreenplay,
  importScreenplay,
  reopenAndSave,
} from "../../src/screenplay/import.ts";
import { normaliseSource } from "../../src/screenplay/normalise.ts";
import { assertBytesEqual, firstByteDifference } from "../support/byte-diff.ts";
import {
  readFixtureBytes,
  readFixtureText,
  writeAndReadBack,
  writeBytesAndReadBack,
} from "../support/files.ts";

/** The corpus as it sits on disk, untouched. */
const SOURCE_BYTES = 170_682;

/**
 * After the four text normalisations: 38 lines carrying one trailing space and
 * 2 stray blank lines removed. Not what import produces — see below.
 */
const NORMALISED_BYTES = 170_642;

/** How many cues the corpus is missing a `(CONT'D)` on. */
const CONTINUATIONS_ADDED = 201;

/** ` (CONT'D)` — nine bytes, appended after any extension already present. */
const EXTENSION = " (CONT'D)";

/** What import actually produces: the normalised corpus plus the extensions. */
const IMPORTED_BYTES = NORMALISED_BYTES + CONTINUATIONS_ADDED * EXTENSION.length;

const importedBytes = (): Uint8Array =>
  exportScreenplay(importScreenplay(readFixtureBytes("script.fountain")).document);

const normalisedText = (): string =>
  normaliseSource(readFixtureText("script.fountain")).text;

describe("the corpus, measured as bytes", () => {
  it("is the file ADR-0004 pins, and its character count is not its byte count", () => {
    const bytes = readFixtureBytes("script.fountain");
    const characters = readFixtureText("script.fountain").length;

    expect(bytes.length).toBe(SOURCE_BYTES);
    // One `é` costs two bytes and one character. Conflating the two is the
    // mistake ADR-0020 records; this asserts the gap rather than ignoring it.
    expect(characters).toBe(170_681);
    expect(bytes.length - characters).toBe(1);
  });

  it("loses exactly 40 bytes to the four text normalisations", () => {
    const bytes = new TextEncoder().encode(normalisedText());

    // 38 lines carrying one trailing space, plus 2 stray blank lines.
    expect(bytes.length).toBe(NORMALISED_BYTES);
    expect(SOURCE_BYTES - NORMALISED_BYTES).toBe(40);
  });
});

describe("fidelity: a file Write-ist has never seen", () => {
  it("comes back as the source plus the enumerated normalisations, and nothing else", () => {
    const { report } = importScreenplay(readFixtureBytes("script.fountain"));
    const actual = writeBytesAndReadBack("script.roundtrip.fountain", importedBytes());

    expect(actual.length).toBe(IMPORTED_BYTES);
    expect(IMPORTED_BYTES).toBe(172_451);

    // Nothing was applied that ADR-0020 does not enumerate.
    expect(report.applied).toEqual([
      { kind: "trailing-whitespace-trimmed", count: 38 },
      { kind: "blank-line-runs-collapsed", count: 2 },
      { kind: "continuations-added", count: CONTINUATIONS_ADDED },
    ]);
  });

  it("changes nothing but the 201 cues, line for line", () => {
    // The guard against a tautology. Asserting a byte count only says the file
    // is the right size; this says every line is either untouched or a
    // character cue with an extension appended, and counts them. It is built
    // from the normalised source by hand, not from the parser.
    const before = normalisedText().split("\n");
    const after = new TextDecoder().decode(importedBytes()).split("\n");

    expect(after).toHaveLength(before.length);

    const changed: number[] = [];
    before.forEach((line, index) => {
      const written = after[index]!;
      if (written === line) return;
      expect(written).toBe(line + EXTENSION);
      // Every changed line is a character cue and nothing else.
      expect(line.trimStart().startsWith("@")).toBe(true);
      changed.push(index + 1);
    });

    expect(changed).toHaveLength(CONTINUATIONS_ADDED);
  });

  it("differs from the raw source, so the comparison is not a file against itself", () => {
    const source = readFixtureBytes("script.fountain");
    const difference = firstByteDifference(source, importedBytes());

    expect(difference).not.toBeNull();
    // The first divergence is line 25, `@NURSE` resuming after an action line:
    // the source ends the cue there, the import opens an extension.
    expect(difference?.line).toBe(25);
    expect(difference?.expectedByte).toBe(0x0a);
    expect(difference?.actualByte).toBe(0x20);
    expect(importedBytes().length - source.length).toBe(IMPORTED_BYTES - SOURCE_BYTES);
  });

  it("writes a file whose bytes on disk are what the exporter produced", () => {
    // Guards the one thing an in-memory comparison cannot see: that what
    // reaches the disk is what we meant to write.
    const exported = importedBytes();
    const onDisk = writeBytesAndReadBack("script.exported.fountain", exported);

    assertBytesEqual(exported, onDisk, {
      expectedLabel: "in memory",
      actualLabel: "on disk",
    });
  });
});

describe("fidelity with (CONT'D) maintenance switched off", () => {
  // ADR-0026's one switch, for the writer or house style that does not use the
  // convention. With it off, the corpus is returned exactly as written.
  const options = { maintainContinuations: false } as const;

  it("returns the normalised source byte for byte", () => {
    const { document, report } = importScreenplay(readFixtureBytes("script.fountain"), options);

    const expected = writeAndReadBack("script.normalised.fountain", normalisedText());
    const actual = writeBytesAndReadBack("script.no-contd.fountain", exportScreenplay(document));

    assertBytesEqual(expected, actual, {
      expectedLabel: "normalised source",
      actualLabel: "round-tripped",
      message: "the round-trip changed the file beyond the declared normalisations",
    });
    expect(actual.length).toBe(NORMALISED_BYTES);
    expect(report.applied).toEqual([
      { kind: "trailing-whitespace-trimmed", count: 38 },
      { kind: "blank-line-runs-collapsed", count: 2 },
    ]);
  });

  it("leaves the three extensions the writer did author exactly as written", () => {
    const { document } = importScreenplay(readFixtureBytes("script.fountain"), options);
    const authored = document.elements.filter(
      (element) => element.type === "character" && element.text.includes("(CONT'D)"),
    );

    expect(authored).toHaveLength(3);
  });

  it("changes the raw source first at line 142, the first trailing space", () => {
    // With the extensions out of the way, the earliest thing the four text
    // normalisations touch is the first of the 38 lines ending in a space.
    const source = readFixtureBytes("script.fountain");
    const { document } = importScreenplay(source, options);
    const difference = firstByteDifference(source, exportScreenplay(document));

    expect(difference?.line).toBe(142);
    expect(difference?.expectedByte).toBe(0x20);
    expect(difference?.actualByte).toBe(0x0a);
  });
});

describe("idempotence: a file Write-ist itself wrote", () => {
  it("is byte-identical when opened and saved without typing", () => {
    const ours = writeBytesAndReadBack("script.ours.fountain", importedBytes());
    const resaved = writeBytesAndReadBack("script.resaved.fountain", reopenAndSave(ours));

    assertBytesEqual(ours, resaved, {
      expectedLabel: "as written",
      actualLabel: "after reopen and save",
      message: "opening and saving without typing changed the file",
    });
    expect(resaved.length).toBe(IMPORTED_BYTES);
  });

  it("needs no normalisation, because the file is already ours", () => {
    const ours = new TextDecoder().decode(importedBytes());

    expect(normaliseSource(ours).applied).toEqual([]);
  });

  it("is imported a second time with nothing left to change", () => {
    const once = importedBytes();
    const { document, report } = importScreenplay(once);

    expect(report.applied).toEqual([]);
    assertBytesEqual(once, exportScreenplay(document), {
      expectedLabel: "first import",
      actualLabel: "second import",
    });
  });

  it("holds with the switch off too", () => {
    const options = { maintainContinuations: false } as const;
    const ours = exportScreenplay(
      importScreenplay(readFixtureBytes("script.fountain"), options).document,
    );

    assertBytesEqual(ours, reopenAndSave(ours, options), {
      expectedLabel: "as written",
      actualLabel: "after reopen and save",
    });
  });
});

describe("what (CONT'D) maintenance may and may not touch", () => {
  it("appends only to a cue where the same character resumes after an interruption", () => {
    const { document } = importScreenplay(readFixtureBytes("script.fountain"));
    const cues = document.elements.filter((element) => element.type === "character");

    const withContinuation = cues.filter((cue) => cue.text.includes("(CONT'D)"));
    // The 3 the writer authored, plus the 201 added.
    expect(withContinuation).toHaveLength(3 + CONTINUATIONS_ADDED);
  });

  it("never adds, removes or alters an authored (O.S.) extension", () => {
    const untouched = importScreenplay(readFixtureBytes("script.fountain"), {
      maintainContinuations: false,
    }).document;
    const maintained = importScreenplay(readFixtureBytes("script.fountain")).document;

    const offScreen = (document: typeof untouched): string[] =>
      document.elements
        .filter((element) => element.type === "character" && element.text.includes("O.S."))
        .map((element) => element.text.replace(EXTENSION, ""));

    expect(offScreen(maintained)).toEqual(offScreen(untouched));
    // Including one that is in no enumeration of extensions anywhere.
    expect(offScreen(untouched)).toContain("VINNIE (HALF O.S.)");
  });
});
