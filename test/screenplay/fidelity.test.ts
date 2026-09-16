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
/** The corpus after ADR-0020's four text normalisations: 38 trailing spaces
 *  and 2 stray blank lines removed. */
const NORMALISED_BYTES = 170_642;

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

  it("loses exactly 40 bytes to the enumerated normalisations", () => {
    const normalised = normaliseSource(readFixtureText("script.fountain")).text;
    const normalisedBytes = new TextEncoder().encode(normalised);

    // 38 lines carrying one trailing space, plus 2 stray blank lines.
    expect(normalisedBytes.length).toBe(NORMALISED_BYTES);
    expect(SOURCE_BYTES - NORMALISED_BYTES).toBe(40);
  });
});

describe("fidelity: a file Write-ist has never seen", () => {
  it("comes back byte-identical to the source, after the normalisations and nothing else", () => {
    const source = readFixtureBytes("script.fountain");
    const { document, report } = importScreenplay(source);

    // The expected side is a real file too: the source with exactly the
    // declared normalisations applied, written out and read back.
    const expected = writeAndReadBack(
      "script.normalised.fountain",
      normaliseSource(readFixtureText("script.fountain")).text,
    );
    const actual = writeBytesAndReadBack(
      "script.roundtrip.fountain",
      exportScreenplay(document),
    );

    assertBytesEqual(expected, actual, {
      expectedLabel: "normalised source",
      actualLabel: "round-tripped",
      message: "the round-trip changed the file beyond the declared normalisations",
    });
    expect(actual.length).toBe(NORMALISED_BYTES);

    // Nothing was applied that ADR-0020 does not enumerate.
    expect(report.applied).toEqual([
      { kind: "trailing-whitespace-trimmed", count: 38 },
      { kind: "blank-line-runs-collapsed", count: 2 },
    ]);
  });

  it("differs from the raw source, and only where a normalisation says so", () => {
    // Non-vacuity. The gate compares the output against the *normalised*
    // source; if that were the same thing as the raw source, the test above
    // would be comparing a file to itself and could never fail.
    const source = readFixtureBytes("script.fountain");
    const { document } = importScreenplay(source);
    const output = exportScreenplay(document);

    const difference = firstByteDifference(source, output);
    expect(difference).not.toBeNull();
    expect(source.length - output.length).toBe(40);

    // The first divergence is line 142's trailing space — the first of the 38.
    expect(difference?.line).toBe(142);
    expect(difference?.expectedByte).toBe(0x20);
    expect(difference?.actualByte).toBe(0x0a);
  });

  it("writes a file whose bytes on disk are what the exporter produced", () => {
    // Guards the one thing an in-memory comparison cannot see: that what
    // reaches the disk is what we meant to write.
    const { document } = importScreenplay(readFixtureBytes("script.fountain"));
    const exported = exportScreenplay(document);
    const onDisk = writeBytesAndReadBack("script.exported.fountain", exported);

    assertBytesEqual(exported, onDisk, {
      expectedLabel: "in memory",
      actualLabel: "on disk",
    });
  });
});

describe("idempotence: a file Write-ist itself wrote", () => {
  it("is byte-identical when opened and saved without typing", () => {
    const { document } = importScreenplay(readFixtureBytes("script.fountain"));
    const ours = writeBytesAndReadBack("script.ours.fountain", exportScreenplay(document));
    const resaved = writeBytesAndReadBack("script.resaved.fountain", reopenAndSave(ours));

    assertBytesEqual(ours, resaved, {
      expectedLabel: "as written",
      actualLabel: "after reopen and save",
      message: "opening and saving without typing changed the file",
    });
  });

  it("needs no normalisation, because the file is already ours", () => {
    const { document } = importScreenplay(readFixtureBytes("script.fountain"));
    const ours = new TextDecoder().decode(exportScreenplay(document));

    expect(normaliseSource(ours).applied).toEqual([]);
  });
});

describe("maintaining (CONT'D) on this corpus", () => {
  // ADR-0020's sixth normalisation, and the only one that puts visible words
  // into the script. Pinned here rather than assumed, because the number
  // decides whether it is the right default for this writer.
  const MISSING_CONTINUATIONS = 201;
  const BYTES_PER_EXTENSION = " (CONT'D)".length;

  it("would add 201 extensions, which the corpus does not use", () => {
    const { report } = importScreenplay(readFixtureBytes("script.fountain"), {
      maintainContinuations: true,
    });

    expect(report.applied).toContainEqual({
      kind: "continuations-added",
      count: MISSING_CONTINUATIONS,
    });
  });

  it("grows the file by exactly the extensions it adds", () => {
    const { document } = importScreenplay(readFixtureBytes("script.fountain"), {
      maintainContinuations: true,
    });
    const withContinuations = writeBytesAndReadBack(
      "script.contd.fountain",
      exportScreenplay(document),
    );

    expect(withContinuations.length).toBe(
      NORMALISED_BYTES + MISSING_CONTINUATIONS * BYTES_PER_EXTENSION,
    );
  });

  it("is itself idempotent — a second import adds nothing", () => {
    const { document } = importScreenplay(readFixtureBytes("script.fountain"), {
      maintainContinuations: true,
    });
    const once = exportScreenplay(document);

    const { document: twice, report } = importScreenplay(once, {
      maintainContinuations: true,
    });

    expect(report.applied).toEqual([]);
    assertBytesEqual(once, exportScreenplay(twice), {
      expectedLabel: "first import",
      actualLabel: "second import",
    });
  });

  it("leaves the three extensions the writer did author exactly as written", () => {
    const { document } = importScreenplay(readFixtureBytes("script.fountain"));
    const authored = document.elements.filter(
      (element) => element.type === "character" && element.text.includes("(CONT'D)"),
    );

    expect(authored).toHaveLength(3);
  });

  it("never touches an authored (O.S.) extension", () => {
    const before = importScreenplay(readFixtureBytes("script.fountain")).document;
    const after = importScreenplay(readFixtureBytes("script.fountain"), {
      maintainContinuations: true,
    }).document;

    const offScreen = (document: typeof before): string[] =>
      document.elements
        .filter((element) => element.type === "character" && element.text.includes("O.S."))
        .map((element) => element.text.replace(/ \(CONT'D\)/, ""));

    expect(offScreen(after)).toEqual(offScreen(before));
    expect(offScreen(before)).toContain("VINNIE (HALF O.S.)");
  });
});
