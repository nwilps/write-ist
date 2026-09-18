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

const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();

/**
 * Open a file Write-ist has never seen. Applies the enumerated normalisations
 * and reports them.
 */
export function importScreenplay(
  bytes: Uint8Array,
  options: ImportOptions = {},
): ImportedScreenplay {
  const { text, applied } = normaliseSource(decoder.decode(bytes));
  const { document: parsed, spanningMarks } = parseReporting(text);

  // ADR-0020's eighth entry. Applied by the parser rather than by
  // `normaliseSource`, because it is a property of the element sequence and
  // not of the text — so it is reported here, where the two meet.
  const parseApplied: readonly Normalisation[] =
    spanningMarks > 0
      ? [...applied, { kind: "marks-spanning-elements", count: spanningMarks }]
      : applied;

  if (options.maintainContinuations === false) {
    return { document: parsed, report: { applied: parseApplied } };
  }

  const { document, added } = maintainContinuations(parsed);
  return {
    document,
    report: {
      applied:
        added > 0
          ? [...parseApplied, { kind: "continuations-added", count: added }]
          : parseApplied,
    },
  };
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
  const parsed = parseReporting(decoder.decode(bytes)).document;
  if (options.maintainContinuations === false) return exportScreenplay(parsed);
  return exportScreenplay(maintainContinuations(parsed).document);
}
