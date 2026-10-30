/**
 * Opening and saving a screenplay: bytes in, bytes out.
 *
 * ADR-0020's contract, in three parts:
 *
 *   1. On first opening a file Write-ist has never seen, it may apply the
 *      enumerated normalisations, and nothing else, ever.
 *   2. Thereafter the file is ours. Opening it and saving it without typing
 *      produces a byte-identical file on disk, forever.
 *   3. The import report names every normalisation applied, once, at import.
 *
 * The boundary is bytes deliberately. The v1-era gate compared two in-memory
 * strings and reported a character count as a byte count; a pipeline whose
 * ends are `Uint8Array` cannot make either mistake.
 */
import type { ScreenplayDocument } from "./document.ts";
import { maintainContinuations } from "./continuations.ts";
import { decodeFile } from "../decode.ts";
import { normaliseSource, type Normalisation } from "../normalise.ts";
import { parseReporting } from "./parse.ts";
import { serialise } from "./serialise.ts";

export interface ImportOptions {
  /**
   * Maintain the `(CONT'D)` extension (ADR-0026). **On by default**: it is the
   * sixth entry on ADR-0020's enumerated list, so it is part of what import
   * does, not an opt-in. The switch turns the behaviour off, for the writer or
   * house style that does not use the convention — one switch, never a
   * per-instance choice.
   */
  readonly maintainContinuations?: boolean;
}

export interface ImportReport {
  /** Every normalisation applied, in the order applied. Never includes a zero. */
  readonly applied: readonly Normalisation[];
}

export interface ImportedScreenplay {
  readonly document: ScreenplayDocument;
  readonly report: ImportReport;
}

const encoder = new TextEncoder();

/**
 * Open a file Write-ist has never seen. Applies the enumerated normalisations
 * and reports them.
 */
export function importScreenplay(
  bytes: Uint8Array,
  options: ImportOptions = {},
): ImportedScreenplay {
  const applied: Normalisation[] = [];
  // A normalisation with nothing to report is absent, never zero (ADR-0020),
  // as it already is for the four text rules.
  const report = (kind: Normalisation["kind"], count: number): void => {
    if (count > 0) applied.push({ kind, count });
  };

  // First, because everything after it works on text rather than bytes.
  const decoded = decodeFile(bytes);
  report("converted-to-utf-8", decoded.converted);

  const { text, applied: textApplied } = normaliseSource(decoded.text);
  applied.push(...textApplied);

  // ADR-0020's eighth entry. Applied by the parser rather than by
  // `normaliseSource`, because it is a property of the element sequence and
  // not of the text — so it is reported here, where the two meet.
  const { document: parsed, markDelimitedLines, leadingWhitespaceLines, unmatchedCommentDelimiters } =
    parseReporting(text);
  report("leading-whitespace-dropped", leadingWhitespaceLines);
  report("marks-spanning-elements", markDelimitedLines);
  report("unmatched-comment-delimiters", unmatchedCommentDelimiters);

  let document = parsed;
  if (options.maintainContinuations !== false) {
    const maintained = maintainContinuations(parsed);
    document = maintained.document;
    report("continuations-added", maintained.added);
  }

  // ADR-0020's seventh entry, which is applied last of all — on the way out,
  // by the serialiser — and so is the one the code doing it cannot count.
  const placed = blankLinesPlaced(text, serialise(document));
  if (placed !== undefined) report("blank-lines-placed", placed);

  return { document, report: { applied } };
}

/**
 * How many blank lines the spacing table placed differently from the source.
 *
 * Taken **by comparison**, as ADR-0020 records it must be: the serialiser
 * places blank lines after the report is assembled and never consults the
 * source, so the only place both answers exist is here. Counting from the
 * spacing table itself would restate the rule rather than measure the file,
 * and a count that restates the rule cannot catch the rule being wrong.
 *
 * Both texts are walked gap by gap — for each pair of consecutive lines of
 * text, is there a blank line between them? — and every gap where the answer
 * differs is one placement. That is one number for both directions, because
 * a blank added between two action lines and a blank removed between two
 * title cards are the same rule seen from either end (ADR-0020, PR #28).
 *
 * `source` is the *normalised* source. Runs of blank lines were collapsed to
 * one there and reported as their own entry, so a gap here is only ever
 * "blank" or "not", and nothing is counted twice.
 */
function blankLinesPlaced(source: string, output: string): number | undefined {
  const before = gaps(source);
  const after = gaps(output);

  // Every line of text in the source is one line of text in the output — one
  // element per line (ADR-0019), title-page lines kept as lines — and nothing
  // the enumerated list permits adds or removes one. If that ever stops being
  // true the gaps no longer line up and cannot be counted. The entry is then
  // left out and the file opens normally: Write-ist never refuses to open a
  // writer's file over its own bug. The suite, which pins every byte of the
  // five manuscripts, is what catches that bug — not the writer.
  if (before.length !== after.length) return undefined;

  let placed = 0;
  for (let index = 0; index < before.length; index++) {
    if (before[index] !== after[index]) placed++;
  }
  return placed;
}

/** For each pair of consecutive non-blank lines, whether a blank lies between. */
function gaps(text: string): boolean[] {
  const result: boolean[] = [];
  let seenText = false;
  let blankSince = false;

  for (const line of text.split("\n")) {
    if (line === "") {
      blankSince = true;
      continue;
    }
    if (seenText) result.push(blankSince);
    seenText = true;
    blankSince = false;
  }
  return result;
}

/** Save a document. The result is the file, byte for byte. */
export function exportScreenplay(document: ScreenplayDocument): Uint8Array {
  return encoder.encode(serialise(document));
}

/**
 * Open and save without typing — the operation ADR-0020 point 2 promises is
 * byte-identical.
 *
 * None of the text normalisations run: the file is already ours, so there is
 * nothing for them to find. `(CONT'D)` maintenance does run, because ADR-0026
 * has the application maintaining it continuously rather than only at import.
 * On a file we wrote it adds nothing, and that it adds nothing is the point.
 */
export function reopenAndSave(bytes: Uint8Array, options: ImportOptions = {}): Uint8Array {
  // The shared decoder, so that this cannot refuse a file either. On a file
  // Write-ist wrote it is plain UTF-8 and nothing is converted.
  const parsed = parseReporting(decodeFile(bytes).text).document;
  if (options.maintainContinuations === false) return exportScreenplay(parsed);
  return exportScreenplay(maintainContinuations(parsed).document);
}
