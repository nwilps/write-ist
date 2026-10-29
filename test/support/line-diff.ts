/**
 * A line-level diff, for saying exactly which lines a round-trip changed.
 *
 * The byte gate says whether a file came back intact. When it did not, the
 * question is always "what changed, and is every change one the ADRs allow?".
 * A byte count alone cannot answer that: two mistakes of opposite sign add up
 * to the right total. This lists the edits so a test can name them.
 */

export type LineEdit =
  | { readonly kind: "removed"; readonly line: number; readonly text: string }
  | { readonly kind: "added"; readonly line: number; readonly text: string };

/**
 * The edits taking `before` to `after`, as a shortest edit script.
 *
 * Line numbers are 1-based and refer to the side the edit belongs to: a
 * `removed` line numbers into `before`, an `added` line into `after`.
 */
export function lineEdits(before: readonly string[], after: readonly string[]): LineEdit[] {
  // The common case is no difference at all. The LCS table is O(n·m) — over a
  // gigabyte for a 16k-line manuscript — so don't build it unless something differs.
  if (sameLines(before, after)) return [];

  const lengths = longestCommonSubsequence(before, after);

  const edits: LineEdit[] = [];
  let i = 0;
  let j = 0;

  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      edits.push({ kind: "removed", line: i + 1, text: before[i]! });
      i++;
    } else {
      edits.push({ kind: "added", line: j + 1, text: after[j]! });
      j++;
    }
  }
  while (i < before.length) edits.push({ kind: "removed", line: ++i, text: before[i - 1]! });
  while (j < after.length) edits.push({ kind: "added", line: ++j, text: after[j - 1]! });

  return edits;
}

function sameLines(before: readonly string[], after: readonly string[]): boolean {
  return before.length === after.length && before.every((line, i) => line === after[i]);
}

/** `lengths[i][j]` is the length of the LCS of `before[i..]` and `after[j..]`. */
function longestCommonSubsequence(
  before: readonly string[],
  after: readonly string[],
): Int32Array[] {
  const lengths = Array.from(
    { length: before.length + 1 },
    () => new Int32Array(after.length + 1),
  );
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      lengths[i]![j] =
        before[i] === after[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  return lengths;
}
