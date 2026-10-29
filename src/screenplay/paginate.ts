/**
 * Pagination: how many pages the manuscript is, and which page an element is
 * on (#48, #49, ADR-0001, ADR-0024).
 *
 * The count comes from the model, against Courier Prime's character widths in
 * `geometry.ts`, never from the DOM. The same engine will make the PDF; the
 * webview only draws.
 *
 * Pagination **decorates**. `(MORE)` and a page-break `CONT'D` exist only as
 * line-budget costs when a speech is split across a page — they are never
 * written into the manuscript (ADR-0024, ADR-0026).
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

const SPEECH: ReadonlySet<Element["type"]> = new Set([
  "character",
  "parenthetical",
  "dialogue",
]);

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
}

type Item = {
  readonly elementIndex: number;
  readonly type: Element["type"] | "page-break";
  readonly lines: number;
  readonly blankBefore: number;
  readonly forcedBreak: boolean;
};

/**
 * Paginate a screenplay from the model — full recompute.
 *
 * Line wrapping is greedy at spaces against each element's
 * `ELEMENT_GEOMETRY` width (ADR-0024 measured zero page drift vs browser-style
 * breaks on the corpus). Vertical packing uses `PAGE.linesPerPage` (55), the
 * serialiser's blank-line table, dual-dialogue column stacking, keep-with-next
 * orphans for scene headings and character cues, and a `(MORE)` / `CONT'D`
 * line when a speech splits across a page.
 */
export function paginate(document: ScreenplayDocument): PaginationDetail {
  return pack(printableItems(document), document.elements.length, 1, [], []);
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
  const items = printableItems(document);
  if (previous === undefined || previous.totalPages === 0 || dirtyElementIndex === undefined) {
    return pack(items, document.elements.length, 1, [], []);
  }

  const startPage = affectedPage(previous, dirtyElementIndex);
  if (startPage <= 1) {
    return pack(items, document.elements.length, 1, [], []);
  }

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
  const resumeItem = resumeItemIndex(items, previous, startPage, dirtyElementIndex);
  return pack(items, document.elements.length, startPage, fill, pageOfElement, resumeItem);
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
export function pageAtElement(
  pagination: Pagination,
  elementIndex: number | undefined,
): number {
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
 * First printable item to feed the packer when resuming at `startPage`.
 * Prefers the first item whose prior page was `startPage`; falls back to the
 * first item at or after the dirty element.
 */
function resumeItemIndex(
  items: readonly Item[],
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
  const at = items.findIndex((item) => item.elementIndex >= boundary);
  return at < 0 ? items.length : at;
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
  fromItem = 0,
): PaginationDetail {
  const pageOfElement: (number | undefined)[] = Array.from(
    { length: elementCount },
    (_, i) => pageOfElementIn[i],
  );
  const fill: number[] = [...fillIn];
  // Full pack starts at page 0 and opens page 1 on the first body item.
  // A resume is already on `resumeFromPage` with an empty line budget — do
  // not push a phantom fill entry for the page we are about to write.
  let pages = resumeFromPage > 1 ? resumeFromPage : 0;
  let line = 0;
  const lpp = PAGE.linesPerPage;

  const newPage = (contdLines = 0): void => {
    if (pages > 0) fill.push(line);
    pages += 1;
    line = contdLines;
  };

  const mark = (elementIndex: number): void => {
    if (pageOfElement[elementIndex] === undefined) {
      pageOfElement[elementIndex] = pages;
    }
  };

  for (let i = fromItem; i < items.length; i++) {
    const item = items[i]!;
    if (item.forcedBreak) {
      if (pages === 0 || line > 0) newPage(0);
      mark(item.elementIndex);
      continue;
    }
    if (pages === 0) newPage(0);

    // Keep-with-next: a scene heading or character cue must bring the blank
    // and at least two lines of what follows (or whatever remains). That is
    // the orphan rule that lands Brick & Steel at Final Draft's 4 pages and
    // Big Fish within one of 120 — see the recorded note in
    // `test/screenplay/paginate.test.ts`.
    let nextKeep = 0;
    if (item.type === "scene-heading" || item.type === "character") {
      for (let k = i + 1; k < items.length; k++) {
        if (items[k]!.forcedBreak) break;
        nextKeep = items[k]!.blankBefore + Math.min(2, items[k]!.lines);
        break;
      }
    }

    // The blank that precedes this element is part of its keep-with group.
    // Captured once when the group is first offered to a page: if an orphan
    // rule pushes the group onto the next page, the blank travels with it
    // (rather than being suppressed at the top of the new page). Suppressing
    // that leading blank undershoots Final Draft's published counts by about
    // two pages on Big Fish and one on Brick & Steel; keeping it matches both
    // targets against the measured geometry table without changing widths or
    // `linesPerPage`. Recorded, not tuned. Continuation chunks after a split
    // take no blank — only the group's first placement does.
    //
    // On an incremental resume we open the page with `line === 0` without
    // having attempted the prior page, so a keep-with-next cue that was
    // orphan-pushed would lose its traveling blank. Recover it when the kept
    // fill of the previous page still had leftover room that this group
    // could not have fit into — the same condition that fired `newPage` in a
    // full pack.
    let blankWithGroup = line === 0 ? 0 : item.blankBefore;
    if (
      blankWithGroup === 0 &&
      item.blankBefore > 0 &&
      line === 0 &&
      pages === resumeFromPage &&
      resumeFromPage > 1 &&
      fill.length === resumeFromPage - 1 &&
      (item.type === "scene-heading" || item.type === "character")
    ) {
      const roomOnPrev = lpp - (fill[fill.length - 1] ?? lpp);
      if (roomOnPrev > 0 && item.blankBefore + item.lines + nextKeep > roomOnPrev) {
        blankWithGroup = item.blankBefore;
      }
    }

    let remaining = item.lines;
    let placed = 0;

    while (remaining > 0) {
      const blank = placed === 0 ? blankWithGroup : 0;
      const room = lpp - line;

      if (placed === 0 && line > 0) {
        const need =
          blank +
          remaining +
          (item.type === "scene-heading" || item.type === "character" ? nextKeep : 0);
        if (need > room && blank + remaining <= lpp) {
          newPage(0);
          continue;
        }
      }

      if (blank + remaining <= room) {
        line += blank + remaining;
        mark(item.elementIndex);
        remaining = 0;
        break;
      }

      const canSplit =
        item.type === "action" || item.type === "dialogue" || item.type === "centered";
      if (!canSplit) {
        if (line > 0) {
          newPage(0);
          continue;
        }
        line += blank + remaining;
        mark(item.elementIndex);
        remaining = 0;
        break;
      }

      // Reserve one line for (MORE) when this chunk continues on the next page.
      const moreReserve =
        (item.type === "dialogue" || item.type === "action") && remaining > room - blank
          ? 1
          : 0;
      let take = room - blank - moreReserve;
      if (take <= 0) {
        newPage(item.type === "dialogue" && placed > 0 ? 1 : 0);
        continue;
      }
      // Widow: do not leave a single line of a multi-line element at the foot.
      if (take === 1 && remaining > 1 && line > 0) {
        newPage(item.type === "dialogue" && placed > 0 ? 1 : 0);
        continue;
      }

      line += blank + take + moreReserve;
      mark(item.elementIndex);
      remaining -= take;
      placed += take;
      if (remaining > 0) {
        // Next page opens with CHARACTER (CONT'D) when a speech continues.
        newPage(item.type === "dialogue" ? 1 : 0);
      }
    }
  }
  if (pages > 0) fill.push(line);

  return {
    totalPages: pages,
    pageOfElement,
    fill,
    resumedFromPage: resumeFromPage,
  };
}

/**
 * Build the printable stream: skip title/front-matter, drop marginalia and
 * omitted elements, collapse dual dialogue to max(left, right).
 */
function printableItems(document: ScreenplayDocument): Item[] {
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
  };
  const raw: Raw[] = [];
  let previous: Element | undefined;

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
          }
        : {
            elementIndex: entry.elementIndex,
            type: entry.el.type,
            lines: entry.lines,
            blankBefore: entry.blank,
            forcedBreak: false,
          },
    );
}

function wrappedLines(el: Element): number {
  return wrapCount(el.text, ELEMENT_GEOMETRY[el.type].width);
}

/**
 * Greedy wrap at spaces; an overlong token hard-breaks. ADR-0024: space-only
 * vs browser-style breaks differ by zero pages on the acceptance corpus.
 */
export function wrapCount(text: string, width: number): number {
  const measure = Math.max(1, Math.floor(width));
  if (text.length === 0) return 1;
  let lines = 1;
  let column = 0;
  for (const part of text.split(/( +)/)) {
    if (!part) continue;
    if (column === 0 && /^ +$/.test(part)) continue;
    if (column === 0) {
      let rest = part;
      while (rest.length > measure) {
        lines += 1;
        rest = rest.slice(measure);
      }
      column = rest.length;
    } else if (column + part.length <= measure) {
      column += part.length;
    } else {
      lines += 1;
      if (/^ +$/.test(part)) {
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
 * Dual dialogue (`character` with `dual: true`) shares a vertical band with
 * the preceding speech. Height is `max(left, right)`; the right-hand elements
 * contribute no extra lines of their own.
 */
function collapseDualDialogue(
  raw: { el: Element; lines: number; blank: number; elementIndex: number }[],
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
    for (let k = leftCue; k <= rightEnd; k++) {
      raw[k] = { ...raw[k]!, lines: 0, blank: 0 };
    }
    raw[leftCue] = { ...raw[leftCue]!, lines: combined, blank };
  }
}
