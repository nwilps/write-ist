/**
 * What the import report tells the writer (ADR-0020, ADR-0028, #38).
 *
 * The criterion is *"names every normalisation applied, with its count"*, and
 * the prior art is the existing import-report tests: **measure the count from
 * the file before reading it from the report**, so the report is checked
 * against the screenplay rather than against itself.
 */
import { describe, expect, it } from "vitest";
import { importScreenplay } from "../../src/screenplay/import.ts";
import { describeImportReport } from "../../src/project/report.ts";
import type { NormalisationKind } from "../../src/normalise.ts";
import { readFixtureBytes, readFixtureText } from "../support/files.ts";

const encoder = new TextEncoder();

function reportFor(bytes: Uint8Array) {
  return describeImportReport(importScreenplay(bytes).report);
}

function lineFor(bytes: Uint8Array, kind: NormalisationKind) {
  return reportFor(bytes).find((line) => line.kind === kind);
}

describe("every line of the report", () => {
  it("names what happened in plain words, with a count", () => {
    const lines = reportFor(readFixtureBytes("Big-Fish.fountain"));

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.count).toBeGreaterThan(0);
      expect(line.description).not.toBe("");
      // Nothing the writer reads names the model or the syntax.
      expect(line.description).not.toMatch(/element|delimiter|normalis|UTF-16|NFC/i);
    }
  });

  it("covers every normalisation there is, so none can be applied unnamed", () => {
    const kinds: readonly NormalisationKind[] = [
      "converted-to-utf-8",
      "line-endings-to-lf",
      "unicode-to-nfc",
      "trailing-whitespace-trimmed",
      "blank-line-runs-collapsed",
      "continuations-added",
      "blank-lines-placed",
      "marks-spanning-elements",
      "unmatched-comment-delimiters",
    ];

    for (const kind of kinds) {
      const described = describeImportReport({ applied: [{ kind, count: 1 }] });
      expect(described[0]?.description, kind).toBeTruthy();
    }
  });
});

describe("a count the report gives", () => {
  it("matches the trailing spaces counted in the file itself", () => {
    const source = readFixtureText("Big-Fish.fountain");
    const trailing = [...source.matchAll(/[ \t]+(?=\r?\n|$)/g)].length;

    expect(lineFor(readFixtureBytes("Big-Fish.fountain"), "trailing-whitespace-trimmed")?.count)
      .toBe(trailing);
  });

  it("matches the runs of blank lines counted in the file itself", () => {
    // Written here rather than taken from a fixture: none of the four has a
    // run of blank lines in it, so no fixture can exercise this rule at all.
    const text = "INT. ROOM - DAY\n\n\n\nShe waits.\n\n\nHe does not.\n";
    const runs = [...text.matchAll(/\n{3,}/g)].length;
    expect(runs).toBe(2);

    expect(lineFor(encoder.encode(text), "blank-line-runs-collapsed")?.count).toBe(runs);
  });

  it("matches the Windows line endings counted in the file itself", () => {
    const text = "Title: The Pilot\r\n\r\nINT. ROOM - DAY\r\n\r\nShe waits.\r\n";
    const endings = [...text.matchAll(/\r\n/g)].length;

    expect(lineFor(encoder.encode(text), "line-endings-to-lf")?.count).toBe(endings);
  });
});

describe("a finding that is not a change", () => {
  it("is reported without claiming the screenplay was adjusted", () => {
    // A comment opened and never closed. ADR-0018: every character is kept,
    // the file opens, and the report says so.
    const text = "INT. ROOM - DAY\n\nShe waits. [[c:a1 unfinished thought]]\n";

    const line = lineFor(encoder.encode(text), "unmatched-comment-delimiters");

    expect(line?.count).toBe(1);
    expect(line?.changed).toBe(false);
  });

  it("is the only line of the report that is a finding", () => {
    for (const line of reportFor(readFixtureBytes("Big-Fish.fountain"))) {
      if (line.kind !== "unmatched-comment-delimiters") expect(line.changed).toBe(true);
    }
  });
});

describe("a screenplay Write-ist changed nothing in", () => {
  it("gets an empty report rather than no report", () => {
    // Already ours: LF endings, no trailing spaces, standard spacing.
    const text = "INT. ROOM - DAY\n\nShe waits.\n";
    expect(reportFor(encoder.encode(text))).toEqual([]);
  });
});
