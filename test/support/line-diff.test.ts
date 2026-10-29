import { describe, expect, it } from "vitest";
import { lineEdits } from "./line-diff.ts";

describe("lineEdits", () => {
  it("reports nothing for identical input", () => {
    expect(lineEdits(["a", "b"], ["a", "b"])).toEqual([]);
  });

  it("reports an inserted line at its position in the new text", () => {
    expect(lineEdits(["a", "c"], ["a", "b", "c"])).toEqual([
      { kind: "added", line: 2, text: "b" },
    ]);
  });

  it("reports a deleted line at its position in the old text", () => {
    expect(lineEdits(["a", "b", "c"], ["a", "c"])).toEqual([
      { kind: "removed", line: 2, text: "b" },
    ]);
  });

  it("reports a changed line as a removal and an addition", () => {
    expect(lineEdits(["STEEL"], ["STEEL (CONT'D)"])).toEqual([
      { kind: "removed", line: 1, text: "STEEL" },
      { kind: "added", line: 1, text: "STEEL (CONT'D)" },
    ]);
  });

  it("does not mistake a move for an unrelated pair of edits", () => {
    // A shortest edit script keeps the common run rather than rewriting it.
    expect(lineEdits(["x", "a", "b"], ["a", "b", "x"])).toEqual([
      { kind: "removed", line: 1, text: "x" },
      { kind: "added", line: 3, text: "x" },
    ]);
  });

  it("handles one side being empty", () => {
    expect(lineEdits([], ["a"])).toEqual([{ kind: "added", line: 1, text: "a" }]);
    expect(lineEdits(["a"], [])).toEqual([{ kind: "removed", line: 1, text: "a" }]);
  });

  it("reports nothing for large identical input without building the table", () => {
    // 100k x 100k Int32 entries would be ~40 GB; this only passes by taking the fast path.
    const lines = Array.from({ length: 100_000 }, (_, i) => `line ${i}`);
    expect(lineEdits(lines, [...lines])).toEqual([]);
  });

  it("still reports a single difference in input of equal length", () => {
    expect(lineEdits(["a", "b", "c"], ["a", "x", "c"])).toEqual([
      { kind: "removed", line: 2, text: "b" },
      { kind: "added", line: 2, text: "x" },
    ]);
  });
});
