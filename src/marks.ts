/**
 * Inline marks: the formatting carried over a run of an element's text.
 *
 * ADR-0019 fixes the model: **marks are a set, not a tree.** `_**x**_` and
 * `**_x_**` are the same thing here, and one order is chosen on the way out.
 * That decision is the whole reason this file is small — there is no nesting
 * to preserve, only a set of marks per character, and the serialiser rebuilds
 * a legal nesting from it.
 *
 * A mark is stored as a **range over the element's plain text**, not as a
 * span-with-marks. The two are equivalent; ranges are chosen because they
 * leave `text` an ordinary string that find, the word count and a cue's
 * `(CONT'D)` can read without knowing marks exist — and because ADR-0018's
 * comment is also a range, with an id. One shape for both.
 *
 * ## What the parser may and may not do
 *
 * ADR-0020: the parser's guess may be wrong about the element, never about the
 * bytes. The same rule governs marks, and here it is sharper, because a mark
 * the parser *invents* moves bytes. So every rule below fails towards literal
 * text: a delimiter that does not pair, pairs across an element boundary, or
 * spells nothing this surface defines stays in the text as the character the
 * writer typed.
 */

/**
 * Every mark the two surfaces can carry between them.
 *
 * `smallcaps` is prose-only: Fountain has no spelling for it. `underline` is
 * spelled `_x_` in Fountain and `[x]{.underline}` in Markdown — the trap
 * ADR-0011 records, since `_x_` in Markdown is *italics*.
 */
export type Mark = "italic" | "bold" | "underline" | "smallcaps";

/**
 * One mark over one run of text.
 *
 * `start` and `end` index the element's plain text — the text with every
 * delimiter already removed — and are half-open, as a string slice is.
 */
export interface MarkRange {
  readonly mark: Mark;
  readonly start: number;
  readonly end: number;
  /**
   * The delimiter the source used, when this surface has more than one
   * spelling for this mark, and absent when it used the surface's default.
   *
   * Markdown spells italics `*x*` or `_x_` and means the same by both.
   * Emitting our favourite would rewrite a file that already said what it
   * meant — the same defect a setext heading's `underline` field exists to
   * prevent, and equally not on ADR-0020's list of permitted changes.
   */
  readonly spelling?: string;
}

/** Text with its marks lifted out of it. */
export interface MarkedText {
  readonly text: string;
  /** Absent rather than empty when the text carries no marks. */
  readonly marks?: readonly MarkRange[];
}

/**
 * The declared emission order, outermost first (ADR-0020's fourth
 * normalisation).
 *
 * Underline outermost because that is what the acceptance corpus writes —
 * `_**THE END**_` — so re-saving an untouched file is byte-identical. A file
 * authored `**_x_**` normalises to this order once, on import, which is the
 * change ADR-0020 permits by name.
 */
export const EMISSION_ORDER: readonly Mark[] = ["smallcaps", "underline", "bold", "italic"];

/** How one surface spells a mark's two ends. */
export interface MarkDelimiters {
  readonly open: (range: MarkRange) => string;
  readonly close: (range: MarkRange) => string;
}

/**
 * Put the delimiters back, in the declared order.
 *
 * The set is turned back into a nesting by walking the text one boundary at a
 * time, holding a stack of what is open. Where two marks cover exactly the
 * same run, `EMISSION_ORDER` decides which wraps which; where one run outlives
 * another, the longer-lived one is outermost, so the nesting is well formed
 * without the model ever having stored a nesting.
 */
export function renderMarked(
  value: MarkedText,
  delimiters: MarkDelimiters,
  inserts: ReadonlyMap<number, string> = new Map(),
): string {
  const marks = value.marks ?? [];
  if (marks.length === 0 && inserts.size === 0) return value.text;

  const boundaries = [
    ...new Set([
      0,
      value.text.length,
      ...marks.flatMap((m) => [m.start, m.end]),
      ...inserts.keys(),
    ]),
  ]
    .filter((at) => at >= 0 && at <= value.text.length)
    .sort((a, b) => a - b);

  const open: MarkRange[] = [];
  let out = "";

  for (let index = 0; index < boundaries.length - 1; index++) {
    const from = boundaries[index]!;
    const to = boundaries[index + 1]!;
    const wanted = marks.filter((m) => m.start <= from && m.end >= to).sort(byNesting);

    let kept = 0;
    while (kept < open.length && kept < wanted.length && open[kept] === wanted[kept]) kept++;
    for (let k = open.length - 1; k >= kept; k--) out += delimiters.close(open[k]!);
    open.length = kept;
    // Between the marks that close here and the marks that open here: a
    // comment delimiter sits outside any mark that begins or ends at the same
    // character (ADR-0018 puts a forcing marker outside both).
    out += inserts.get(from) ?? "";
    for (let k = kept; k < wanted.length; k++) {
      out += delimiters.open(wanted[k]!);
      open.push(wanted[k]!);
    }

    out += value.text.slice(from, to);
  }

  for (let k = open.length - 1; k >= 0; k--) out += delimiters.close(open[k]!);
  out += inserts.get(value.text.length) ?? "";
  return out;
}

/**
 * The order two marks nest in: the one that starts first wraps, then the one
 * that lasts longer, then the declared order for the run they share.
 */
function byNesting(a: MarkRange, b: MarkRange): number {
  return (
    a.start - b.start ||
    b.end - a.end ||
    EMISSION_ORDER.indexOf(a.mark) - EMISSION_ORDER.indexOf(b.mark)
  );
}

/** Marks in the order they will be emitted, with any empty range dropped. */
export function canonicalMarks(marks: readonly MarkRange[]): readonly MarkRange[] {
  return [...marks].filter((m) => m.end > m.start).sort(byNesting);
}

/* ------------------------------------------------------------------ reading */

/** What a run of one delimiter character spells on this surface. */
export interface DelimiterRule {
  /** The mark one of them spells — `*x*`. */
  readonly one: Mark;
  /** The mark two of them spell — `**x**` — or null if two spell nothing. */
  readonly two: Mark | null;
  /**
   * The longest run that may still be a delimiter. A longer one is literal:
   * `****` is four asterisks the writer typed, not two empty marks.
   */
  readonly maxRun: number;
  /**
   * Whether this character may open or close inside a word.
   *
   * `*` may; `_` may not, or `snake_case_name` becomes underlined prose. This
   * is CommonMark's rule and Fountain does not contradict it.
   */
  readonly intraword: boolean;
}

/** A surface's delimiter characters and what each spells. */
export type DelimiterSyntax = Readonly<Record<string, DelimiterRule>>;

/** A region of the raw text that is syntax and does not survive into `text`. */
export interface Removal {
  readonly start: number;
  readonly end: number;
}

/** A mark found by a scanner, still in raw-text coordinates. */
export interface RawMark {
  readonly mark: Mark;
  readonly start: number;
  readonly end: number;
  readonly spelling: string;
}

export interface Scan {
  readonly removals: readonly Removal[];
  readonly found: readonly RawMark[];
}

const WORD = /[\p{L}\p{N}]/u;
const SPACE = /\s/;

/**
 * Find the paired emphasis delimiters in a piece of raw text.
 *
 * Three rules, and each one exists because breaking it moved bytes in the
 * acceptance corpus:
 *
 *   - **A delimiter must touch the text it marks.** An opener has a non-space
 *     after it, a closer has a non-space before it. That is what keeps
 *     `* * *` a scene break, `/*` a boneyard delimiter and `.` after a closer
 *     ordinary punctuation.
 *   - **A delimiter that never pairs is literal.** *Big Fish* sets a four-line
 *     song in italics, opening on one line and closing on another; no element
 *     spans lines (ADR-0019), so that span cannot be held and the asterisks
 *     stay in the text where the writer put them.
 *   - **A backslash in front of a delimiter takes it out of play**, and stays
 *     in the text. Nothing in the corpus escapes a delimiter, so removing the
 *     backslash would mean inventing a spelling to put it back; leaving both
 *     alone is byte-exact and still stops `\*` pairing with a later `*`.
 */
export function scanDelimiters(raw: string, syntax: DelimiterSyntax): Scan {
  const runs = delimiterRuns(raw, syntax);
  const removals: Removal[] = [];
  const found: RawMark[] = [];
  const openers: Run[] = [];

  for (const run of runs) {
    while (run.canClose && run.end > run.start) {
      let at = openers.length - 1;
      while (at >= 0 && openers[at]!.char !== run.char) at--;
      if (at < 0) break;

      const opener = openers[at]!;
      const pair =
        opener.rule.two !== null && opener.end - opener.start >= 2 && run.end - run.start >= 2
          ? 2
          : 1;
      const contentStart = opener.end;
      const contentEnd = run.start;
      if (contentEnd <= contentStart) break;

      opener.end -= pair;
      run.start += pair;
      removals.push(
        { start: opener.end, end: contentStart },
        { start: contentEnd, end: run.start },
      );
      found.push({
        mark: (pair === 2 ? opener.rule.two : opener.rule.one)!,
        start: contentStart,
        end: contentEnd,
        spelling: run.char.repeat(pair),
      });

      // Anything opened between this pair can never close now, so it is text.
      openers.length = at + 1;
      if (opener.end === opener.start) openers.pop();
    }

    if (run.end > run.start && run.canOpen) openers.push(run);
  }

  return { removals, found };
}

/**
 * A delimiter run, with `start` and `end` narrowing as it is consumed.
 *
 * `***x***` is one run of three at each end, spending two on the bold and one
 * on the italic — the opener from its inner edge outwards, the closer from its
 * inner edge outwards — so both marks end up over the same run of text, which
 * is exactly what a set of two marks means.
 */
interface Run {
  readonly char: string;
  readonly rule: DelimiterRule;
  start: number;
  end: number;
  readonly canOpen: boolean;
  readonly canClose: boolean;
}

function delimiterRuns(raw: string, syntax: DelimiterSyntax): Run[] {
  const runs: Run[] = [];

  for (let index = 0; index < raw.length; ) {
    const char = raw[index]!;
    const rule = syntax[char];
    if (rule === undefined) {
      index++;
      continue;
    }

    let end = index;
    while (end < raw.length && raw[end] === char) end++;

    const before = index > 0 ? raw[index - 1]! : "";
    const after = end < raw.length ? raw[end]! : "";

    if (before !== "\\" && end - index <= rule.maxRun) {
      const flanksLeft = after !== "" && !SPACE.test(after);
      const flanksRight = before !== "" && !SPACE.test(before);
      runs.push({
        char,
        rule,
        start: index,
        end,
        canOpen: flanksLeft && (rule.intraword || before === "" || !WORD.test(before)),
        canClose: flanksRight && (rule.intraword || after === "" || !WORD.test(after)),
      });
    }

    index = end;
  }

  return runs;
}

/**
 * Take the syntax out of the raw text and move the marks onto what is left.
 *
 * The offsets a scanner reports are positions in the raw text; the offsets a
 * `MarkRange` holds are positions in the text the writer sees. This is the one
 * place the two are reconciled, so no scanner has to count delimiters it has
 * already removed.
 */
export function buildMarked(
  raw: string,
  removals: readonly Removal[],
  found: readonly RawMark[],
  isDefaultSpelling: (mark: Mark, spelling: string) => boolean,
): MarkedText {
  return buildMarkedMapped(raw, removals, found, isDefaultSpelling).marked;
}

/** Marked text, and where each raw position ended up. */
export interface MappedMarks {
  readonly marked: MarkedText;
  /**
   * `offsets[i]` is the offset in `marked.text` that raw position `i` maps to,
   * for every `i` from 0 to the raw length inclusive. A removed delimiter maps
   * to where the text it touched begins.
   *
   * This is what lets a comment — whose delimiters were cut out of the line
   * before any of this ran — land on the right character once the mark
   * delimiters are gone too.
   */
  readonly offsets: readonly number[];
}

/** `buildMarked`, also reporting where each raw position ended up. */
export function buildMarkedMapped(
  raw: string,
  removals: readonly Removal[],
  found: readonly RawMark[],
  isDefaultSpelling: (mark: Mark, spelling: string) => boolean,
): MappedMarks {
  if (found.length === 0) {
    return { marked: { text: raw }, offsets: Array.from({ length: raw.length + 1 }, (_, i) => i) };
  }

  const removed = new Array<boolean>(raw.length).fill(false);
  for (const { start, end } of removals) {
    for (let at = start; at < end; at++) removed[at] = true;
  }

  // `plain[i]` is how many characters survive before raw position `i`, which
  // is both the mapped offset of a kept character and the mapped offset of a
  // removed one — a delimiter maps to where the text it touched begins.
  const plain = new Array<number>(raw.length + 1);
  let kept = 0;
  let text = "";
  for (let at = 0; at < raw.length; at++) {
    plain[at] = kept;
    if (removed[at] === true) continue;
    text += raw[at];
    kept++;
  }
  plain[raw.length] = kept;

  const marks = found.map((mark) => ({
    mark: mark.mark,
    start: plain[mark.start]!,
    end: plain[mark.end]!,
    ...(isDefaultSpelling(mark.mark, mark.spelling) ? {} : { spelling: mark.spelling }),
  }));

  return { marked: { text, marks: canonicalMarks(marks) }, offsets: plain };
}
