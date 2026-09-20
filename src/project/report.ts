/**
 * The import report, in the words the writer reads (ADR-0020, ADR-0028).
 *
 * *"This is imported; here is what was adjusted so it can be edited here;
 * dismiss when satisfied."* The report is the one moment Write-ist tells the
 * writer what it changed in their screenplay, so it says what happened to the
 * file rather than what the code did to a model. No line here names an
 * element, a delimiter kind or a normalisation's internal name.
 *
 * It is here rather than in the window because it is checkable here. #37's
 * testing decision is *only external behaviour* — and what the report says is
 * external behaviour, where a `<li>` in a DOM is not.
 */
import type { Normalisation, NormalisationKind } from "../normalise.ts";
import type { ImportReport } from "../screenplay/import.ts";

export interface ImportReportLine {
  readonly kind: NormalisationKind;
  /** Occurrences changed, never findings (ADR-0020). */
  readonly count: number;
  /** What happened, in plain words, reading after the count. */
  readonly description: string;
  /**
   * Whether anything in the screenplay actually changed.
   *
   * One entry on the list is a *finding* rather than a change: a comment
   * delimiter with no partner is kept exactly as the writer typed it
   * (ADR-0018). Telling the writer it was "adjusted" would be a lie about
   * their file, so the report distinguishes the two.
   */
  readonly changed: boolean;
}

const DESCRIPTIONS: Readonly<Record<NormalisationKind, string>> = {
  "converted-to-utf-8": "characters re-saved so every one is kept",
  "line-endings-to-lf": "Windows line endings changed to plain ones",
  "unicode-to-nfc": "accented characters written as one character instead of two",
  "trailing-whitespace-trimmed": "lines had spaces trimmed off the end",
  "blank-line-runs-collapsed": "runs of blank lines reduced to a single one",
  "continuations-added": "(CONT'D) added where a character resumed speaking",
  "blank-lines-placed": "blank lines moved to standard screenplay spacing",
  "marks-spanning-elements":
    "lines where bold, italic or underline now opens and closes on the line itself",
  "unmatched-comment-delimiters":
    "comment marks with no closing partner, left exactly as they are",
};

/** The one entry that reports a finding rather than a change. */
const FINDINGS: ReadonlySet<NormalisationKind> = new Set(["unmatched-comment-delimiters"]);

/**
 * Every normalisation applied, with its count, in the order it was applied.
 *
 * Empty when nothing was adjusted — and an empty report is still shown, saying
 * so. A writer who imports a file Write-ist changed nothing in has been told
 * something worth knowing.
 */
export function describeImportReport(report: ImportReport): readonly ImportReportLine[] {
  return report.applied.map((normalisation: Normalisation) => ({
    kind: normalisation.kind,
    count: normalisation.count,
    description: DESCRIPTIONS[normalisation.kind],
    changed: !FINDINGS.has(normalisation.kind),
  }));
}
