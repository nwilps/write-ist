/**
 * The normalisations Write-ist is permitted to apply on first opening a file
 * it has never seen (ADR-0020), and nothing else, ever.
 *
 * Four of ADR-0020's seven live here, because they are properties of the text
 * rather than of the element sequence. The other three belong further along
 * the pipeline: mark ordering to the serialiser, missing `(CONT'D)` to a
 * separate maintenance pass over the parsed elements (ADR-0026), and spacing a
 * run of action lines to the serialiser's spacing table.
 *
 * Each returns a count, because ADR-0020 requires an import report that names
 * every normalisation applied.
 */

export type NormalisationKind =
  | "line-endings-to-lf"
  | "unicode-to-nfc"
  | "trailing-whitespace-trimmed"
  | "blank-line-runs-collapsed";

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

/** How many characters change spelling under NFC — the size of the report. */
function countDecomposed(text: string): number {
  let changed = 0;
  for (const character of text) {
    if (character.normalize("NFC") !== character) changed++;
  }
  return changed;
}
