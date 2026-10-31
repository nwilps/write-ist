/**
 * What the import report's counts *mean*, measured against the file (issue #27).
 *
 * ADR-0020 point 3: the report names every normalisation applied, once, at
 * import. And since issue #27 it says what the number is: **every count is
 * occurrences changed, never findings**, and **a normalisation with nothing to
 * report is absent, never zero**.
 *
 * Two defects shipped because nothing asserted that. The mark entry said 3 for
 * a file whose delimiters changed on fifteen lines, and blank-line placement
 * was never reported at all. Every existing test agreed with the code, because
 * every existing test had been written from what the code produced.
 *
 * So every expected number here is taken from the bytes first — the normalised
 * source against what import actually writes, diffed line by line — and only
 * then compared with the report. The diff is `lineEdits`, an ordinary line
 * diff; the report's blank-line count comes from a different walk in
 * `src/screenplay/import.ts`. Two methods, one answer.
 */
import { describe, expect, it } from "vitest";
import { normaliseSource, type Normalisation } from "../src/normalise.ts";
import { exportProse, importProse } from "../src/prose/import.ts";
import { exportScreenplay, importScreenplay } from "../src/screenplay/import.ts";
import { describeCorpus, readCorpusBytes } from "./support/corpus.ts";
import { readFixtureBytes } from "./support/files.ts";
import { lineEdits, type LineEdit } from "./support/line-diff.ts";

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** The normalised source against the written file, as line edits. */
function editsOf(bytes: Uint8Array, options: { maintainContinuations?: boolean } = {}): LineEdit[] {
  const source = normaliseSource(decode(bytes)).text;
  const written = decode(exportScreenplay(importScreenplay(bytes, options).document));
  // Indentation has its own entry and its own test below; here it would read
  // as every indented line being re-spelled. Title-page continuations keep
  // theirs, so only the body is stripped.
  const lines = source.split("\n");
  const body = lines.indexOf("") + 1;
  const bare = lines.map((line, index) => (index < body ? line : line.replace(/^[ \t]+/, "")));
  return lineEdits(bare, written.split("\n"));
}

/**
 * Blank lines placed, measured from the file: every blank line the diff adds
 * or removes. Adding and removing are one rule seen from either end
 * (ADR-0020's seventh entry), so they are one number.
 */
const blankLinesInFile = (bytes: Uint8Array): number =>
  editsOf(bytes).filter((edit) => edit.text === "").length;

/**
 * Lines that gained a mark delimiter pair, measured from the file.
 *
 * With `(CONT'D)` maintenance off, the only lines of text that can change are
 * the ones the mark rule re-spelled, so every changed line of text is counted
 * — and each is checked to differ from its source by asterisks and nothing
 * else, so that nothing else can be miscounted as a mark.
 */
function markLinesInFile(bytes: Uint8Array): number {
  const changed = editsOf(bytes, { maintainContinuations: false }).filter(
    (edit) => edit.text !== "",
  );
  const bare = (edit: LineEdit): string => edit.text.replaceAll("*", "");
  const added = changed.filter((edit) => edit.kind === "added");
  const removed = changed.filter((edit) => edit.kind === "removed");

  expect(added.map(bare)).toEqual(removed.map(bare));
  return added.length;
}

/** The report's entry of this kind, or undefined — which is not zero. */
const entryOf = (
  applied: readonly Normalisation[],
  kind: Normalisation["kind"],
): Normalisation | undefined => applied.find((entry) => entry.kind === kind);

/** Assert the report agrees with the file: the count if non-zero, else absent. */
function expectReported(
  applied: readonly Normalisation[],
  kind: Normalisation["kind"],
  inFile: number,
): void {
  if (inFile === 0) {
    expect(entryOf(applied, kind), `${kind} has nothing to report`).toBeUndefined();
  } else {
    expect(entryOf(applied, kind)).toEqual({ kind, count: inFile });
  }
}

describe("blank lines placed: the report says what the file shows", () => {
  it("Brick & Steel: three blank lines differ, and the report says three", () => {
    const bytes = readFixtureBytes("Brick-&-Steel.fountain");
    const blanks = editsOf(bytes).filter((edit) => edit.text === "");

    // Established from the file before the report is looked at: two blanks
    // gained in the tight action run, one lost between the two title cards.
    expect(blanks.filter((edit) => edit.kind === "added")).toHaveLength(2);
    expect(blanks.filter((edit) => edit.kind === "removed")).toHaveLength(1);
    expect(blankLinesInFile(bytes)).toBe(3);

    // One entry, one number, for both directions.
    const { applied } = importScreenplay(bytes).report;
    expect(entryOf(applied, "blank-lines-placed")).toEqual({
      kind: "blank-lines-placed",
      count: 3,
    });
  });

  it("Big Fish augmented: two differ — one gained in the boneyard, one lost at the cards", () => {
    const bytes = readFixtureBytes("Big-Fish-augmented.fountain");
    const blanks = editsOf(bytes).filter((edit) => edit.text === "");

    expect(blanks.map((edit) => edit.kind).sort()).toEqual(["added", "removed"]);
    expectReported(importScreenplay(bytes).report.applied, "blank-lines-placed", 2);
  });

  it("Big Fish: none differ, so the report has no entry at all", () => {
    const bytes = readFixtureBytes("Big-Fish.fountain");

    expect(blankLinesInFile(bytes)).toBe(0);
    expectReported(importScreenplay(bytes).report.applied, "blank-lines-placed", 0);
  });

  it("counts the same with (CONT'D) maintenance off, which never moves a blank line", () => {
    const bytes = readFixtureBytes("Brick-&-Steel.fountain");
    const { applied } = importScreenplay(bytes, { maintainContinuations: false }).report;

    expect(entryOf(applied, "blank-lines-placed")?.count).toBe(3);
  });
});

describe("marks spanning elements: lines changed, not marks found", () => {
  it("Big Fish: fifteen lines gained a delimiter pair, and the report says fifteen", () => {
    const bytes = readFixtureBytes("Big-Fish.fountain");

    // Three songs is the number of findings. Fifteen is the number of lines
    // that changed, which is what ADR-0020 says the report counts.
    expect(markLinesInFile(bytes)).toBe(15);
    expectReported(importScreenplay(bytes).report.applied, "marks-spanning-elements", 15);
  });

  it("Big Fish augmented: the same fifteen", () => {
    const bytes = readFixtureBytes("Big-Fish-augmented.fountain");

    expect(markLinesInFile(bytes)).toBe(15);
    expectReported(importScreenplay(bytes).report.applied, "marks-spanning-elements", 15);
  });

  it("Brick & Steel: none, so no entry", () => {
    const bytes = readFixtureBytes("Brick-&-Steel.fountain");

    expect(markLinesInFile(bytes)).toBe(0);
    expectReported(importScreenplay(bytes).report.applied, "marks-spanning-elements", 0);
  });
});

describe("leading whitespace dropped: lines changed", () => {
  it("Brick & Steel: seven body lines; the five tabbed title-page lines are already canonical", () => {
    const text = normaliseSource(decode(readFixtureBytes("Brick-&-Steel.fountain"))).text;
    const lines = text.split("\n");
    const body = lines.slice(lines.indexOf("") + 1);

    const indented = body.filter((line) => /^[ \t]/.test(line)).length;
    expect(indented).toBe(7);
    expectReported(
      importScreenplay(readFixtureBytes("Brick-&-Steel.fountain")).report.applied,
      "leading-whitespace-dropped",
      indented,
    );
  });

  it("Big Fish: only title-page tabs, which are what Write-ist writes, so no entry", () => {
    const bytes = readFixtureBytes("Big-Fish.fountain");
    expectReported(importScreenplay(bytes).report.applied, "leading-whitespace-dropped", 0);
  });
});

describe("a normalisation with nothing to report is absent, never zero", () => {
  const fixtures = [
    "Brick-&-Steel.fountain",
    "Big-Fish.fountain",
    "Big-Fish-augmented.fountain",
  ] as const;

  it("puts no zero in any screenplay report", () => {
    for (const fixture of fixtures) {
      const { applied } = importScreenplay(readFixtureBytes(fixture)).report;
      for (const entry of applied) expect(entry.count, `${fixture}: ${entry.kind}`).toBeGreaterThan(0);
    }
  });

  it("gives the prose manuscript neither screenplay-only entry", () => {
    // Prose has no spacing table and keeps a paragraph's wraps inside one
    // element, so neither rule has anything to reach there (ADR-0020).
    const bytes = readFixtureBytes("Republic-manuscript.md");
    const { document, report } = importProse(bytes);

    expect(entryOf(report.applied, "blank-lines-placed")).toBeUndefined();
    expect(entryOf(report.applied, "marks-spanning-elements")).toBeUndefined();
    for (const entry of report.applied) expect(entry.count).toBeGreaterThan(0);

    // And the file bears that out: the diff contains no blank line at all.
    const source = normaliseSource(decode(bytes)).text;
    const written = decode(exportProse(document));
    expect(lineEdits(source.split("\n"), written.split("\n"))).toEqual([]);
  });
});

describeCorpus("the corpus, which has nothing for either rule", () => {
  it("places no blank line and delimits no line, so reports neither", () => {
    const bytes = readCorpusBytes();
    const { applied } = importScreenplay(bytes).report;

    expect(blankLinesInFile(bytes)).toBe(0);
    expect(markLinesInFile(bytes)).toBe(0);
    expectReported(applied, "blank-lines-placed", 0);
    expectReported(applied, "marks-spanning-elements", 0);
    for (const entry of applied) expect(entry.count).toBeGreaterThan(0);
  });
});
