/**
 * Opening and saving a prose manuscript: bytes in, bytes out.
 *
 * The same contract as the screenplay surface (ADR-0020): the enumerated
 * normalisations on first import, nothing else ever, and a byte-identical file
 * thereafter. Two of the seven do not apply here — `(CONT'D)` and the tight
 * action run are screenplay-only, and prose has no character cues.
 */
import type { ProseDocument } from "./document.ts";
import { decodeFile } from "../decode.ts";
import { normaliseSource, type Normalisation } from "../normalise.ts";
import { parse } from "./parse.ts";
import { serialise } from "./serialise.ts";

export interface ProseImportReport {
  readonly applied: readonly Normalisation[];
}

export interface ImportedProse {
  readonly document: ProseDocument;
  readonly report: ProseImportReport;
}

const encoder = new TextEncoder();

/** Open a file Write-ist has never seen, reporting what it normalised. */
export function importProse(bytes: Uint8Array): ImportedProse {
  // The same decoder as the screenplay surface: never refuses, never
  // replaces a character. Its conversion is reported first, as it happens first.
  const decoded = decodeFile(bytes);
  const { text, applied: textApplied } = normaliseSource(decoded.text);
  const applied: readonly Normalisation[] =
    decoded.converted > 0
      ? [{ kind: "converted-to-utf-8", count: decoded.converted }, ...textApplied]
      : textApplied;
  return { document: parse(text), report: { applied } };
}

/** Save a document. The result is the file, byte for byte. */
export function exportProse(document: ProseDocument): Uint8Array {
  return encoder.encode(serialise(document));
}

/** Open and save without typing. ADR-0020 point 2: byte-identical, forever. */
export function reopenAndSave(bytes: Uint8Array): Uint8Array {
  return exportProse(parse(decodeFile(bytes).text));
}
