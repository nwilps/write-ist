/**
 * Pagination: how many pages the manuscript is, and which page an element is
 * on (#48, #49, ADR-0001, ADR-0024).
 *
 * The count comes from the model, against Courier Prime's character widths in
 * `geometry.ts`, never from the DOM. The same engine will make the PDF; the
 * webview only draws.
 *
 * Pagination **decorates**. `(MORE)` and a page-break `CONT'D` exist only as
 * lines of the layout where a speech crosses a page — they are never written
 * into the manuscript (ADR-0024, ADR-0026). Where a page may break is
 * ADR-0033's rules, below.
 *
 * **#49 — incremental.** An edit re-packs from the affected page onward via
 * `repaginate`, never walking earlier pages again on each keystroke. A full
 * `paginate` is the reference; after any edits, incremental must equal it.
 */
import type { Element, ScreenplayDocument } from "./document.ts";
import { ELEMENT_GEOMETRY, PAGE } from "./geometry.ts";
import { needsBlankLine } from "./serialise.ts";

/** Fountain marginalia: they do not print, so they take no manuscript space. */
const MARGINALIA: ReadonlySet<Element["type"]> = new Set([
  "section",
  "synopsis",
  "note",
  "boneyard-start",
  "boneyard-end",
  "lyrics",
]);

const SPEECH: ReadonlySet<Element["type"]> = new Set(["character", "parenthetical", "dialogue"]);

/**
 * How the manuscript sits on pages.
 *
 * `totalPages` is the numbered body only: the title page is never counted,
 * and a leading forced page-break (Big Fish's epigraph) leaves that front
 * matter unnumbered, with page 1 at the content after it.
 */
export interface Pagination {
  readonly totalPages: number;
  /**
   * 1-based page for each element index, or `undefined` when the element is
   * unnumbered front matter, marginalia, or omitted. A caret on an unmapped
   * element reads as page 1 when there are pages, else 0.
   */
  readonly pageOfElement: readonly (number | undefined)[];
}

/** Lines used on each numbered page — for investigation and tests, not UI. */
export interface PaginationDetail extends Pagination {
  readonly fill: readonly number[];
  /**
   * 1-based page where the last pack began. `1` means the whole manuscript
   * was packed. Tests use this to assert an edit did not restart earlier.
   */
  readonly resumedFromPage: number;
  /**
   * Where each stretch of each element sits: the one record both outputs read
   * (#87). `paginate` counts from it and `layout` draws from it, so the count
   * and the lines cannot disagree. Ordered by page.
   */
  readonly chunks: readonly Chunk[];
}

/**
 * One element's stretch of lines on one page. An element that splits across a
 * break has a chunk on each page it touches.
 */
export interface Chunk {
  /** 1-based page. */
  readonly page: number;
  readonly elementIndex: number;
  /** Offset into the element's text where this chunk begins; 0 unless it began on an earlier page. */
  readonly start: number;
  /** Offset where the chunk's text ends, trailing spaces excluded. */
  readonly end: number;
  /** Wrapped lines of this chunk's text, wrapped afresh as a paragraph of its own. */
  readonly lines: number;
  /** 0-based row on the sheet of the chunk's first line (any blank line before it is already counted). */
  readonly row: number;
  /** The element carries on onto the next page. */
  readonly continues: boolean;
  /** The page opens with `CHARACTER (CONT'D)` in the top margin, the row above this chunk: a speech resumes here. */
  readonly contd: boolean;
  /** `(MORE)` closes the page on the row after this chunk: the speech goes on over the break. */
  readonly more: boolean;
  /** For a dual-dialogue band, whose first element this chunk is: every member, in both columns. */
  readonly band?: Band;
}

/** A dual-dialogue band: the left and right columns' members and their spacing. */
export interface Band {
  readonly members: readonly BandMember[];
}

export interface BandMember {
  readonly elementIndex: number;
  readonly column: "left" | "right";
  readonly lines: number;
  /** Blank lines before this member within its column (0 for a column's first). */
  readonly blank: number;
}

type Item = {
  readonly elementIndex: number;
  readonly type: Element["type"] | "page-break";
  readonly lines: number;
  readonly blankBefore: number;
  readonly forcedBreak: boolean;
  readonly text: string;
  readonly width: number;
  readonly band?: Band;
};

/**
 * Paginate a screenplay from the model — full recompute.
 *
 * Line wrapping is greedy at spaces and after hyphens against each element's
 * `ELEMENT_GEOMETRY` width (ADR-0024, amended: Final Draft's own wrapping). Vertical packing uses `PAGE.linesPerPage` (55; 54 of
 * text, the last row being `(MORE)`'s), the serialiser's blank-line table,
 * dual-dialogue column stacking, keep-with-next for headings, cues and
 * parentheticals, sentence-end splits of dialogue and action, and a `(MORE)` /
 * `CONT'D` line where a speech crosses a page. Text starts at row 0 of every
 * page (ADR-0033).
 */
export function paginate(document: ScreenplayDocument): PaginationDetail {
  return pack(printableItems(document), document.elements.length, 1, [], [], []);
}

/**
 * Re-paginate after an edit, packing only from the affected page onward (#49).
 *
 * `dirtyElementIndex` is the earliest manuscript element the edit may have
 * changed (typed into, inserted, or deleted at). Earlier pages are kept from
 * `previous`. When `previous` is missing, this is a full `paginate`.
 *
 * After any sequence of edits, the result equals `paginate(document)` for
 * `totalPages`, `pageOfElement`, and `fill`.
 */
export function repaginate(
  document: ScreenplayDocument,
  previous: PaginationDetail | undefined,
  dirtyElementIndex: number | undefined,
): PaginationDetail {
  if (previous === undefined || previous.totalPages === 0 || dirtyElementIndex === undefined) {
    return pack(printableItems(document), document.elements.length, 1, [], [], []);
  }

  const startPage = cleanPageStart(previous, affectedPage(previous, dirtyElementIndex));
  if (startPage <= 1) {
    return pack(printableItems(document), document.elements.length, 1, [], [], []);
  }

  // Only the items from the resume point on are wrapped: the pages before it
  // are kept, so wrapping them again would make every keystroke cost the
  // length of the manuscript rather than the length of what follows the edit.
  const boundary = resumeBoundary(previous, startPage, dirtyElementIndex);
  const items = printableItems(document, boundary);

  const pageOfElement: (number | undefined)[] = Array.from(
    { length: document.elements.length },
    () => undefined,
  );
  const stableUntil = Math.min(dirtyElementIndex, previous.pageOfElement.length);
  for (let i = 0; i < stableUntil; i++) {
    const page = previous.pageOfElement[i];
    if (page !== undefined && page < startPage) pageOfElement[i] = page;
  }

  const fill = previous.fill.slice(0, startPage - 1);
  const chunks = previous.chunks.filter((chunk) => chunk.page < startPage);
  return pack(items, document.elements.length, startPage, fill, pageOfElement, chunks);
}

/**
 * Back `page` up until it opens on the start of an element. A page that opens
 * on the tail of a split speech has state — the lines already placed, or the
 * speech it reopens — that a resume cannot recover, so the pack restarts a page earlier, where the speech
 * begins (#87).
 */
function cleanPageStart(previous: PaginationDetail, page: number): number {
  let start = page;
  while (start > 1) {
    const first = previous.chunks.find((chunk) => chunk.page === start);
    if (first === undefined || (first.start === 0 && !first.contd)) break;
    start -= 1;
  }
  return start;
}

/** Total numbered pages. */
export function pageCount(document: ScreenplayDocument): number {
  return paginate(document).totalPages;
}

/**
 * The 1-based page the caret is on.
 *
 * An element with no mapping (front matter, omitted, empty manuscript) reads
 * as page 1 when there is at least one numbered page, otherwise 0.
 */
export function pageAtElement(pagination: Pagination, elementIndex: number | undefined): number {
  if (pagination.totalPages === 0) return 0;
  if (elementIndex === undefined) return 1;
  return pagination.pageOfElement[elementIndex] ?? 1;
}

/** Status-bar copy a screen reader can read. */
export function pageStatusText(currentPage: number, totalPages: number): string {
  if (totalPages <= 0) return "Page 0 of 0";
  return `Page ${currentPage} of ${totalPages}`;
}

/**
 * Earliest 1-based page an edit at `dirty` can disturb. Looks at the dirty
 * element and its immediate neighbours so a keep-with-next cue just above the
 * caret still pulls the pack back far enough.
 */
function affectedPage(previous: PaginationDetail, dirty: number): number {
  let start = previous.totalPages;
  let found = false;
  for (const index of [dirty, dirty - 1, dirty + 1]) {
    if (index < 0 || index >= previous.pageOfElement.length) continue;
    const page = previous.pageOfElement[index];
    if (page === undefined) continue;
    start = Math.min(start, page);
    found = true;
  }
  if (!found) {
    for (let i = Math.min(dirty, previous.pageOfElement.length - 1); i >= 0; i--) {
      const page = previous.pageOfElement[i];
      if (page !== undefined) {
        start = page;
        found = true;
        break;
      }
    }
  }
  if (!found) return 1;
  // Back up one page so the break *into* the dirty page is recomputed.
  // Orphan keep-with-next captures `blankWithGroup` while still on the prior
  // page; resuming on the dirty page alone would suppress that traveling blank
  // and drift the fill by a line (and, after enough edits, the page map).
  return Math.max(1, start - 1);
}

/**
 * The element the packer resumes at when `startPage` is re-packed: the first
 * one the kept layout put on `startPage`, or the dirty element if that comes
 * first. It is always the start of an item, so nothing before it is needed
 * but the element that precedes it (for the blank line).
 */
function resumeBoundary(
  previous: PaginationDetail,
  startPage: number,
  dirtyElementIndex: number,
): number {
  let boundary = dirtyElementIndex;
  for (let i = 0; i < previous.pageOfElement.length; i++) {
    if (previous.pageOfElement[i] === startPage) {
      boundary = Math.min(boundary, i);
      break;
    }
  }
  return boundary;
}

/**
 * Pack printable items onto pages.
 *
 * When `resumeFromPage` > 1, `fill` and `pageOfElement` already hold the kept
 * prefix; packing starts at `fromItem` as the start of that page.
 */
function pack(
  items: readonly Item[],
  elementCount: number,
  resumeFromPage: number,
  fillIn: readonly number[],
  pageOfElementIn: readonly (number | undefined)[],
  chunksIn: readonly Chunk[],
): PaginationDetail {
  const pageOfElement: (number | undefined)[] = Array.from(
    { length: elementCount },
    (_, i) => pageOfElementIn[i],
  );
  const fill: number[] = [...fillIn];
  const chunks: Chunk[] = [...chunksIn];
  // Full pack starts at page 0 and opens page 1 on the first body item.
  // A resume is already on `resumeFromPage` with an empty line budget — do
  // not push a phantom fill entry for the page we are about to write.
  let pages = resumeFromPage > 1 ? resumeFromPage : 0;
  let line = 0;
  const lpp = BODY_LINES;

  // A page that opens on a speech's continuation carries the CONT'D cue in the
  // top margin, one row above row 0, where it costs the page no line; the next
  // chunk placed takes it as its own (`contd`).
  let pendingContd = false;

  /**
   * Close the page and open the next. When the speech goes on over the break,
   * `(MORE)` takes the last row of the page just closed and the next page opens
   * with the `CHARACTER (CONT'D)` cue in its top margin.
   */
  const newPage = (speechContinues = false): void => {
    if (speechContinues) {
      const last = chunks.length - 1;
      chunks[last] = { ...chunks[last]!, more: true };
    }
    if (pages > 0) fill.push(line);
    pages += 1;
    line = 0;
    pendingContd = speechContinues;
  };

  const mark = (elementIndex: number): void => {
    if (pageOfElement[elementIndex] === undefined) {
      pageOfElement[elementIndex] = pages;
    }
  };

  const place = (
    item: Item,
    start: number,
    end: number,
    count: number,
    row: number,
    continues: boolean,
  ): void => {
    mark(item.elementIndex);
    chunks.push({
      page: pages,
      elementIndex: item.elementIndex,
      start,
      end,
      lines: count,
      row,
      continues,
      contd: pendingContd,
      more: false,
      ...(item.band === undefined ? {} : { band: item.band }),
    });
    pendingContd = false;
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.forcedBreak) {
      if (pages === 0 || line > 0) newPage();
      mark(item.elementIndex);
      continue;
    }
    if (pages === 0) newPage();

    // The blank that precedes this element is part of its keep-with group, and
    // is spent only where the element follows another on the same page: text
    // starts at row 0 of every page, as in Final Draft's PDF (ADR-0033 rule 5).
    let blank = line === 0 ? 0 : item.blankBefore;

    const resumesSpeech = continuesSpeech(items, i);
    let offset = 0;
    let remaining = item.lines;

    while (remaining > 0) {
      const room = lpp - line;

      // Whole, with whatever must keep company with it (see `fitsStart`).
      const whole = blank + remaining;
      const keepsRoom = line === 0 || offset > 0 || fitsAfter(items, i, room - whole);
      if (whole <= room && keepsRoom) {
        place(item, offset, item.text.length, remaining, line + blank, false);
        line += whole;
        remaining = 0;
        break;
      }

      // Split between sentences, leaving at least two lines on each side.
      if (splittable(item)) {
        const cut = splitPoint(item, offset, remaining, room - blank);
        if (cut !== undefined) {
          place(item, offset, cut.end, cut.head, line + blank, true);
          line += blank + cut.head;
          offset = cut.next;
          remaining = cut.tail;
          blank = 0;
          newPage(hasMore(item));
          continue;
        }
      }

      // Neither fits here: carry the element (and its group) to the next page.
      if (line > 0) {
        newPage(resumesSpeech && offset === 0);
        blank = 0;
        continue;
      }
      place(item, offset, item.text.length, remaining, line + blank, false);
      line += whole;
      remaining = 0;
    }
  }
  if (pages > 0) fill.push(line);

  return {
    totalPages: pages,
    pageOfElement,
    fill,
    resumedFromPage: resumeFromPage,
    chunks,
  };
}

/**
 * The rules at a break, after Final Draft's defaults (docs/adr/0033).
 *
 * - A scene heading, a character cue and a parenthetical keep with what follows;
 *   a parenthetical after dialogue does not, and action keeps with a transition after it.
 * - Dialogue and action split between sentences (mid-line ends count; the rest
 *   is wrapped afresh), never leaving fewer than two lines on either side. A split speech is closed
 *   by `(MORE)` and reopened by `CHARACTER (CONT'D)`; a split action is not.
 */
const MIN_BEFORE = 2;

/**
 * Lines of text a page holds: the sheet's last row is `(MORE)`'s alone. In
 * Final Draft's *Big Fish* no line of text reaches row 54 (0-based) except a
 * `(MORE)`, so the engine charges `(MORE)` nothing and text one line less.
 */
const BODY_LINES = PAGE.linesPerPage - 1;
const MIN_AFTER = 2;

const KEEPS_WITH_NEXT: ReadonlySet<Item["type"]> = new Set([
  "scene-heading",
  "character",
  "parenthetical",
]);

const splittable = (item: Item): boolean =>
  item.band === undefined &&
  (item.type === "action" || item.type === "dialogue" || item.type === "centered");

/** Only a speech is closed with `(MORE)`; the engine charges the line only then. */
const hasMore = (item: Item): boolean => item.band === undefined && item.type === "dialogue";

const isSpeechPart = (item: Item | undefined): boolean =>
  item !== undefined &&
  !item.forcedBreak &&
  item.band === undefined &&
  (item.type === "parenthetical" || item.type === "dialogue");

/** The item opens a page the speech before it left: it takes `(MORE)` above and `CONT'D` below. */
function continuesSpeech(items: readonly Item[], i: number): boolean {
  return isSpeechPart(items[i]) && isSpeechPart(items[i - 1]);
}

/**
 * Does what must keep company with item `i` fit in `room` lines after it?
 */
function fitsAfter(items: readonly Item[], i: number, room: number): boolean {
  const type = items[i]!.type;
  if (items[i]!.band !== undefined) return true;
  const keeps =
    KEEPS_WITH_NEXT.has(type) &&
    // A parenthetical that follows dialogue may close a page (`(MORE)` after it).
    !(type === "parenthetical" && items[i - 1]?.type === "dialogue");
  // The action before a transition goes with it: a transition does not open a page.
  const leadsToTransition = type === "action" && items[i + 1]?.type === "transition";
  if (!keeps && !leadsToTransition) return true;
  return fitsStart(items, i + 1, room);
}

/** Can item `i` begin in `room` lines, whole or split, with its own keepers? */
function fitsStart(items: readonly Item[], i: number, room: number): boolean {
  const item = items[i];
  if (item === undefined || item.forcedBreak) return true;
  const whole = item.blankBefore + item.lines;
  if (whole <= room && fitsAfter(items, i, room - whole)) {
    return true;
  }
  return (
    splittable(item) &&
    splitPoint(item, 0, item.lines, room - item.blankBefore) !== undefined
  );
}

const ABBREVIATION = /\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Mt|Lt|Col|Gen|Sgt|Capt|vs)\.["'”’)]*$/;

/** A sentence end: `.`, `?` or `!` with closing quotes or brackets, then spaces, then more text. */
const SENTENCE_BREAK = /[.!?]["'”’)\]]*( +)(?=\S)/g;

/**
 * Where the text from `from` on can be cut between sentences, mid-line or at a
 * line end alike: `end` is where the first part stops, `next` where the rest
 * begins (ADR-0033 rule 1).
 */
function sentenceCuts(text: string, from: number): { end: number; next: number }[] {
  const cuts: { end: number; next: number }[] = [];
  const rest = text.slice(from);
  for (const match of rest.matchAll(SENTENCE_BREAK)) {
    const next = from + match.index + match[0].length;
    const end = next - match[1]!.length;
    if (ABBREVIATION.test(text.slice(from, end))) continue;
    cuts.push({ end, next });
  }
  return cuts;
}

interface Cut {
  /** Lines of the first part, wrapped as a paragraph. */
  readonly head: number;
  /** Lines of the rest, wrapped afresh as a paragraph of its own. */
  readonly tail: number;
  /** Where the first part's text ends. */
  readonly end: number;
  /** Where the rest begins. */
  readonly next: number;
}

/**
 * Where to break the unplaced rest of an item (from text offset `offset`,
 * `remaining` lines) so the first part fits in `avail` lines, or undefined when
 * it should move to the next page instead (ADR-0033):
 *
 * 1. The last sentence end that leaves at least two lines on each side, with
 *    the rest re-wrapped as a fresh paragraph.
 * 2. With none, a piece that fits a page moves whole.
 * 3. A piece too tall for any page splits at the last line break leaving two
 *    and two.
 *
 * Centered text has no sentences: it splits at a line, two and two.
 */
function splitPoint(item: Item, offset: number, remaining: number, avail: number): Cut | undefined {
  if (avail < MIN_BEFORE) return undefined;
  if (item.type !== "centered") {
    const cuts = sentenceCuts(item.text, offset);
    for (let k = cuts.length - 1; k >= 0; k--) {
      const { end, next } = cuts[k]!;
      const head = wrapCount(item.text.slice(offset, end), item.width);
      if (head < MIN_BEFORE || head > avail) continue;
      const tail = wrapCount(item.text.slice(next), item.width);
      if (tail >= MIN_AFTER) return { head, tail, end, next };
    }
    if (remaining <= BODY_LINES) return undefined;
  }
  const head = Math.min(avail, remaining - MIN_AFTER);
  if (head < MIN_BEFORE) return undefined;
  const starts = wrapStarts(item.text.slice(offset), item.width);
  const next = offset + starts[head]!;
  const end = offset + item.text.slice(offset, next).trimEnd().length;
  return { head, tail: remaining - head, end, next };
}

/**
 * Build the printable stream: skip title/front-matter, drop marginalia and
 * omitted elements, collapse dual dialogue to max(left, right).
 */
function printableItems(document: ScreenplayDocument, from = 0): Item[] {
  const { elements } = document;
  let start = 0;
  const firstBreak = elements.findIndex((element) => element.type === "page-break");
  const firstScene = elements.findIndex((element) => element.type === "scene-heading");
  // Leading forced page-break before the first scene heading: Big Fish's
  // epigraph page. Final Draft leaves it unnumbered; page 1 starts after.
  if (firstBreak >= 0 && (firstScene < 0 || firstBreak < firstScene)) {
    start = firstBreak + 1;
  }

  type Raw = {
    elementIndex: number;
    el: Element;
    lines: number;
    blank: number;
    band?: Band;
  };
  const raw: Raw[] = [];
  let previous: Element | undefined;

  // Resuming part-way: the blank line before the first element read depends on
  // the printable element that precedes it, so find that one and begin after.
  if (from > start) {
    for (let i = Math.min(from, elements.length) - 1; i >= start; i--) {
      const el = elements[i]!;
      if (el.omitted === true || MARGINALIA.has(el.type)) continue;
      if (el.type !== "page-break" && wrappedLines(el) !== 0) previous = el;
      break;
    }
    start = from;
  }

  for (let i = start; i < elements.length; i++) {
    const el = elements[i]!;
    if (el.omitted === true || MARGINALIA.has(el.type)) continue;
    if (el.type === "page-break") {
      raw.push({ elementIndex: i, el, lines: -1, blank: 0 });
      previous = undefined;
      continue;
    }
    const lines = wrappedLines(el);
    if (lines === 0) continue;
    raw.push({
      elementIndex: i,
      el,
      lines,
      blank: previous !== undefined && needsBlankLine(previous, el) ? 1 : 0,
    });
    previous = el;
  }

  collapseDualDialogue(raw);

  return raw
    .filter((entry) => entry.lines !== 0)
    .map((entry) =>
      entry.lines === -1
        ? {
            elementIndex: entry.elementIndex,
            type: "page-break" as const,
            lines: 0,
            blankBefore: 0,
            forcedBreak: true,
            text: "",
            width: 0,
          }
        : {
            elementIndex: entry.elementIndex,
            type: entry.el.type,
            lines: entry.lines,
            blankBefore: entry.blank,
            forcedBreak: false,
            text: entry.el.text,
            width: ELEMENT_GEOMETRY[entry.el.type].width,
            ...(entry.band === undefined ? {} : { band: entry.band }),
          },
    );
}

/**
 * Wrapped line counts by width, then text. A keystroke changes one element and
 * the rest of the manuscript wraps exactly as it did the keystroke before, so
 * the count is remembered rather than re-walked (#49). Bounded: when it grows
 * past `WRAP_CACHE_LIMIT` entries it starts afresh.
 */
const wrapCache = new Map<number, Map<string, number>>();
const WRAP_CACHE_LIMIT = 20_000;
let wrapCached = 0;

function wrappedLines(el: Element): number {
  const width = ELEMENT_GEOMETRY[el.type].width;
  let byText = wrapCache.get(width);
  if (byText === undefined) wrapCache.set(width, (byText = new Map()));
  let lines = byText.get(el.text);
  if (lines === undefined) {
    if (wrapCached >= WRAP_CACHE_LIMIT) {
      wrapCache.clear();
      wrapCached = 0;
      wrapCache.set(width, (byText = new Map()));
    }
    lines = wrapCount(el.text, width);
    byText.set(el.text, lines);
    wrapCached += 1;
  }
  return lines;
}

/**
 * Where a line may end, as a split of the text into pieces: after each run of
 * spaces, and after a hyphen between a letter or digit and a letter
 * (`hundred-` / `dollar`), which is where Final Draft wraps a hyphenated word
 * (ADR-0024, amended). The spaces are captured so they stay in the list; the
 * hyphen break is empty, and `split` leaves empty strings for the loops to skip.
 */
const PIECES = /( +|(?<=[A-Za-z0-9]-)(?=[A-Za-z]))/;

/**
 * The column a piece may reach. A piece ending in a hyphen may hang one past the
 * measure: Final Draft ends 62-character action lines and 40-character dialogue
 * lines on a hyphen and never on anything else (ADR-0024, amended).
 */
const room = (part: string, measure: number): number =>
  part.charCodeAt(part.length - 1) === 45 ? measure + 1 : measure;

/**
 * Greedy wrap at spaces and after hyphens; an overlong token hard-breaks. Two
 * spaces after a full stop measure as two, as Final Draft draws and wraps them
 * (ADR-0024, amended).
 */
export function wrapCount(text: string, width: number): number {
  const measure = Math.max(1, Math.floor(width));
  if (text.length === 0) return 1;
  let lines = 1;
  let column = 0;
  for (const part of text.split(PIECES)) {
    if (!part) continue;
    const spaces = part.charCodeAt(0) === 32;
    if (column === 0 && spaces) continue;
    if (column === 0) {
      let rest = part;
      while (rest.length > measure) {
        lines += 1;
        rest = rest.slice(measure);
      }
      column = rest.length;
    } else if (column + part.length <= room(part, measure)) {
      column += part.length;
    } else {
      lines += 1;
      if (spaces) {
        column = 0;
        continue;
      }
      let rest = part;
      while (rest.length > measure) {
        lines += 1;
        rest = rest.slice(measure);
      }
      column = rest.length;
    }
  }
  return lines;
}

/**
 * The same greedy wrap as `wrapCount`, with where each line begins.
 *
 * Returns the offset into `text` at which each line starts, so a line is
 * `text.slice(starts[i], starts[i + 1])` less its trailing spaces. The count
 * is `wrapCount`'s, which a test holds it to (#87): one rule, two shapes.
 */
export function wrapStarts(text: string, width: number): number[] {
  const measure = Math.max(1, Math.floor(width));
  const starts = [0];
  if (text.length === 0) return starts;
  let column = 0;
  let offset = 0;
  for (const part of text.split(PIECES)) {
    if (!part) continue;
    const at = offset;
    offset += part.length;
    const spaces = part.charCodeAt(0) === 32;
    if (column === 0 && spaces) continue;
    if (column === 0) {
      let used = 0;
      while (part.length - used > measure) {
        used += measure;
        starts.push(at + used);
      }
      column = part.length - used;
    } else if (column + part.length <= room(part, measure)) {
      column += part.length;
    } else if (spaces) {
      // The line ends here; the next begins after the spaces that did not fit.
      starts.push(offset);
      column = 0;
    } else {
      starts.push(at);
      let used = 0;
      while (part.length - used > measure) {
        used += measure;
        starts.push(at + used);
      }
      column = part.length - used;
    }
  }
  return starts;
}

/**
 * Dual dialogue (`character` with `dual: true`) shares a vertical band with
 * the preceding speech. Height is `max(left, right)`; the right-hand elements
 * contribute no extra lines of their own.
 */
function collapseDualDialogue(
  raw: {
    el: Element;
    lines: number;
    blank: number;
    elementIndex: number;
    band?: Band;
  }[],
): void {
  for (let i = 0; i < raw.length; i++) {
    if (!(raw[i]!.el.type === "character" && raw[i]!.el.dual === true)) continue;
    let leftCue = i - 1;
    while (
      leftCue >= 0 &&
      SPEECH.has(raw[leftCue]!.el.type) &&
      raw[leftCue]!.el.type !== "character"
    ) {
      leftCue -= 1;
    }
    if (leftCue < 0 || raw[leftCue]!.el.type !== "character") continue;

    let left = raw[leftCue]!.lines;
    for (let k = leftCue + 1; k < i; k++) {
      left += raw[k]!.blank + raw[k]!.lines;
    }
    let right = raw[i]!.lines;
    let rightEnd = i;
    for (let k = i + 1; k < raw.length; k++) {
      if (!SPEECH.has(raw[k]!.el.type) || raw[k]!.el.type === "character") break;
      right += raw[k]!.blank + raw[k]!.lines;
      rightEnd = k;
    }
    const combined = Math.max(left, right);
    const blank = raw[leftCue]!.blank;
    const members: BandMember[] = [];
    for (let k = leftCue; k < i; k++) {
      members.push({
        elementIndex: raw[k]!.elementIndex,
        column: "left",
        lines: raw[k]!.lines,
        blank: k === leftCue ? 0 : raw[k]!.blank,
      });
    }
    for (let k = i; k <= rightEnd; k++) {
      members.push({
        elementIndex: raw[k]!.elementIndex,
        column: "right",
        lines: raw[k]!.lines,
        blank: k === i ? 0 : raw[k]!.blank,
      });
    }
    for (let k = leftCue; k <= rightEnd; k++) {
      raw[k] = { ...raw[k]!, lines: 0, blank: 0 };
    }
    raw[leftCue] = {
      ...raw[leftCue]!,
      lines: combined,
      blank,
      band: { members },
    };
  }
}
