/**
 * The normalisations Write-ist is permitted to apply on first opening a file
 * it has never seen (ADR-0020), and nothing else, ever.
 *
 * Four of ADR-0020's nine live here, because they are properties of the text
 * rather than of the element sequence. The other five belong elsewhere in
 * the pipeline: reading a file not in UTF-8 to `decodeFile`, before any of
 * this; mark ordering to the serialiser; missing `(CONT'D)` to a separate
 * maintenance pass over the parsed elements (ADR-0026); blank-line placement
 * to the serialiser's spacing table; and a mark spanning several elements to
 * the parser (ADR-0027).
 *
 * Each returns a count, because ADR-0020 requires an import report that names
 * every normalisation applied. **Every count is occurrences changed, never
 * findings** (ADR-0020): 38 trailing spaces trimmed is 38, and a mark that
 * runs across four lines is four lines, not one mark.
 */

export type NormalisationKind =
  /**
   * Applied by `decodeFile`, not here: a file saved in UTF-16 or windows-1252
   * is read in that encoding and saved as UTF-8. Counted per character whose
   * bytes changed — every character of a UTF-16 file, and every character
   * above 0x7F of a windows-1252 one.
   */
  | "converted-to-utf-8"
  | "line-endings-to-lf"
  | "unicode-to-nfc"
  | "trailing-whitespace-trimmed"
  | "blank-line-runs-collapsed"
  /** Applied by `maintainContinuations`, not here (ADR-0026). */
  | "continuations-added"
  /**
   * Applied by the serialiser's spacing table, not here, and counted by
   * comparison at import (ADR-0020's seventh entry).
   *
   * One count for both directions. The table *places* blank lines from the
   * pair of element types either side and never consults the source, so a
   * blank added between two action lines and a blank removed between two
   * title cards are the same rule seen from either end — the number of places
   * where the output's blank lines differ from the source's.
   *
   * Formerly `tight-action-run-spaced`, a name for half the rule. It was
   * declared and never emitted.
   */
  | "blank-lines-placed"
  /**
   * Applied by the parser, not here: a mark read across several elements is
   * stored inside each of them, so each writes its own delimiter pair
   * (ADR-0027). Counted per **line changed** — every element a spanning mark
   * reached — not per mark: Big Fish is 15, not 3.
   */
  | "marks-spanning-elements"
  /**
   * Not a normalisation — nothing changes — but a finding the report must
   * carry (ADR-0018, ADR-0008 rule 4): a comment delimiter with no partner,
   * kept in the text as the characters the writer has. Counted per delimiter.
   * The file opens regardless; "loudly" means the report says so.
   */
  | "unmatched-comment-delimiters";

export interface Normalisation {
  readonly kind: NormalisationKind;
  /** How many occurrences were changed. Never reported when zero. */
  readonly count: number;
}

export interface NormalisedSource {
  readonly text: string;
  /** What was changed, for the import report. Empty when nothing was. */
  readonly applied: readonly Normalisation[];
}

/**
 * Apply the text-level normalisations from ADR-0020's enumerated list.
 *
 * Order matters. Line endings come first so that later rules see one
 * convention. Trailing whitespace is trimmed before blank-line runs are
 * collapsed, so that a "blank" line made of spaces counts as blank.
 */
export function normaliseSource(source: string): NormalisedSource {
  const applied: Normalisation[] = [];
  let text = source;

  const carriageReturns = count(text, /\r\n?/g);
  if (carriageReturns > 0) {
    text = text.replace(/\r\n?/g, "\n");
    applied.push({ kind: "line-endings-to-lf", count: carriageReturns });
  }

  // NFC, never NFKC: the compatibility forms rewrite the writer's characters.
  const composed = text.normalize("NFC");
  if (composed !== text) {
    applied.push({ kind: "unicode-to-nfc", count: countDecomposed(text) });
    text = composed;
  }

  const trailing = count(text, /[ \t]+$/gm);
  if (trailing > 0) {
    text = text.replace(/[ \t]+$/gm, "");
    applied.push({ kind: "trailing-whitespace-trimmed", count: trailing });
  }

  const runs = count(text, /\n{3,}/g);
  if (runs > 0) {
    text = text.replace(/\n{3,}/g, "\n\n");
    applied.push({ kind: "blank-line-runs-collapsed", count: runs });
  }

  return { text, applied };
}

/** True when the text is already exactly what `normaliseSource` would produce. */
export function isNormalised(source: string): boolean {
  return normaliseSource(source).applied.length === 0;
}

function count(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

/**
 * How many characters change spelling under NFC — the size of the report.
 *
 * Counted per *grapheme*, not per code point. A decomposed `é` is `U+0065`
 * followed by `U+0301`, and each of those is already NFC on its own, because
 * composition happens across code points rather than within one. Walking code
 * points therefore reports zero for the one case the rule exists for, which is
 * what it did until the first fixture that was not already NFC arrived.
 */
function countDecomposed(text: string): number {
  let changed = 0;
  for (const { segment } of graphemes.segment(text)) {
    if (segment.normalize("NFC") !== segment) changed++;
  }
  return changed;
}
