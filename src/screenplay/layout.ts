/**
 * The page layout: the pages of the manuscript as lines on a sheet (#87,
 * ADR-0001, ADR-0024, ADR-0026).
 *
 * `paginate` answers *how many* and *which page*. This answers *what is on
 * each page*: every line, with its element, its text, the marks over it and
 * its row on the sheet, and for an element that splits across a break, the
 * character offset where the split falls. The paper draws its breaks from it
 * and the PDF prints from it, so the two cannot disagree with the count.
 *
 * It is not a second engine. It reads the chunks `pack` records as it counts,
 * and adds the wrapped lines, so `totalPages` here *is* `paginate`'s. No DOM,
 * no `measureText`, no `getClientRects` (ADR-0024).
 *
 * `(MORE)` and `CHARACTER (CONT'D)` are lines of the layout and never of the
 * manuscript: they are drawn and printed, not written (ADR-0024, ADR-0026).
 */
import type { MarkRange } from "../marks.ts";
import { appendContinuation, hasContinuation } from "./continuations.ts";
import type { Element, ScreenplayDocument } from "./document.ts";
import { ELEMENT_GEOMETRY } from "./geometry.ts";
import { paginate, repaginate, wrapStarts, type Chunk, type PaginationDetail } from "./paginate.ts";

/** The text of the line that closes a speech at a break. */
export const MORE_TEXT = "(MORE)";

export type LayoutLineKind =
  /** A stretch of an element's own text. */
  | "text"
  /** `(MORE)`, drawn as the last line of the page a speech leaves. */
  | "more"
  /** `CHARACTER (CONT'D)`, drawn as the first line of the page a speech resumes on. */
  | "contd";

export interface LayoutLine {
  /** 0-based row on the sheet, counted in lines from the top margin. */
  readonly row: number;
  /** Dual dialogue sets two columns side by side; everything else is `full`. */
  readonly column: "full" | "left" | "right";
  readonly kind: LayoutLineKind;
  /** The element the line belongs to. For `more` and `contd`, the speech's own element. */
  readonly elementIndex: number;
  /** The line as printed, without the trailing space a wrap leaves. */
  readonly text: string;
  /**
   * Offset into the element's `text` where this line begins. Absent on
   * `more` and `contd`, which are not in the element.
   */
  readonly start?: number;
  /** Marks over this line, offsets relative to the line's own `text`. */
  readonly marks?: readonly MarkRange[];
}

export interface LayoutPage {
  /** 1-based, as the writer counts. */
  readonly number: number;
  /** In reading order: by row, then column. */
  readonly lines: readonly LayoutLine[];
}

/** Where an element breaks across a page. */
export interface Split {
  readonly elementIndex: number;
  /** Offset into the element's `text` where the second part begins. */
  readonly offset: number;
  /** The 1-based page the second part is on. */
  readonly page: number;
}

export interface Layout {
  readonly totalPages: number;
  readonly pages: readonly LayoutPage[];
  readonly splits: readonly Split[];
  /** The count, which is the layout's own source. */
  readonly pagination: PaginationDetail;
}

/**
 * Lay a screenplay out on pages.
 *
 * Pass the previous layout and the earliest element the edit may have changed
 * and only the pages from there on are rebuilt; earlier pages are the same
 * objects as before. After any sequence of edits the result equals a full
 * `layout(document)` — the property test holds it to that.
 */
export function layout(
  document: ScreenplayDocument,
  previous?: Layout,
  dirtyElementIndex?: number,
): Layout {
  const pagination =
    previous === undefined
      ? paginate(document)
      : repaginate(document, previous.pagination, dirtyElementIndex);

  const keep =
    previous === undefined ? 0 : Math.min(pagination.resumedFromPage - 1, previous.pages.length);
  const byPage = chunksByPage(pagination.chunks, pagination.totalPages);
  const pages: LayoutPage[] = previous === undefined ? [] : previous.pages.slice(0, keep);
  for (let page = keep + 1; page <= pagination.totalPages; page++) {
    pages.push({ number: page, lines: pageLines(document, byPage[page - 1]!) });
  }

  const splits: Split[] = [];
  for (const chunk of pagination.chunks) {
    if (chunk.start === 0) continue;
    splits.push({ elementIndex: chunk.elementIndex, offset: chunk.start, page: chunk.page });
  }

  return { totalPages: pagination.totalPages, pages, splits, pagination };
}

function chunksByPage(chunks: readonly Chunk[], totalPages: number): Chunk[][] {
  const byPage: Chunk[][] = Array.from({ length: totalPages }, () => []);
  for (const chunk of chunks) byPage[chunk.page - 1]!.push(chunk);
  return byPage;
}

function pageLines(document: ScreenplayDocument, chunks: readonly Chunk[]): LayoutLine[] {
  const lines: LayoutLine[] = [];
  const { elements } = document;

  for (const chunk of chunks) {
    const el = elements[chunk.elementIndex]!;

    if (chunk.band !== undefined) {
      // A band is never split (dual dialogue moves whole), so it is one chunk.
      const offsets = { left: 0, right: 0 };
      for (const member of chunk.band.members) {
        offsets[member.column] += member.blank;
        const row = chunk.row + offsets[member.column];
        const memberChunk: Chunk = {
          page: chunk.page,
          elementIndex: member.elementIndex,
          start: 0,
          end: elements[member.elementIndex]!.text.length,
          lines: member.lines,
          row,
          continues: false,
          contd: false,
          more: false,
        };
        textLines(lines, elements[member.elementIndex]!, memberChunk, member.column);
        offsets[member.column] += member.lines;
      }
      continue;
    }

    if (chunk.contd) {
      lines.push({
        row: chunk.row - 1,
        column: "full",
        kind: "contd",
        elementIndex: chunk.elementIndex,
        text: continuedCue(elements, chunk.elementIndex),
      });
    }
    textLines(lines, el, chunk, "full");
    if (chunk.more) {
      lines.push({
        row: chunk.row + chunk.lines,
        column: "full",
        kind: "more",
        elementIndex: chunk.elementIndex,
        text: MORE_TEXT,
      });
    }
  }

  return lines.sort((a, b) => a.row - b.row || columnOrder(a.column) - columnOrder(b.column));
}

const columnOrder = (column: LayoutLine["column"]): number => (column === "right" ? 1 : 0);

/**
 * `CHARACTER (CONT'D)` for a speech element: the cue that opened the speech,
 * with the extension added unless the writer's cue already carries one
 * (ADR-0026: not doubled). `(V.O.)` stays: `EDWARD (V.O.) (CONT'D)`.
 */
function continuedCue(elements: readonly Element[], dialogueIndex: number): string {
  for (let i = dialogueIndex - 1; i >= 0; i--) {
    const el = elements[i]!;
    if (el.type === "character") {
      return hasContinuation(el.text) ? el.text : appendContinuation(el.text);
    }
    if (el.type !== "parenthetical" && el.type !== "dialogue") break;
  }
  return "(CONT'D)";
}

function textLines(
  into: LayoutLine[],
  el: Element,
  chunk: Chunk,
  column: LayoutLine["column"],
): void {
  // The chunk is wrapped as a paragraph of its own: a part that begins
  // mid-line re-wraps from its first word (ADR-0033).
  const part = el.text.slice(chunk.start, chunk.end);
  const starts = wrapStarts(part, ELEMENT_GEOMETRY[el.type].width);
  for (let j = 0; j < starts.length; j++) {
    const start = chunk.start + starts[j]!;
    const text = part.slice(starts[j]!, starts[j + 1] ?? part.length).trimEnd();
    const marks = marksOver(el.marks, start, start + text.length);
    into.push({
      row: chunk.row + j,
      column,
      kind: "text",
      elementIndex: chunk.elementIndex,
      text,
      start,
      ...(marks === undefined ? {} : { marks }),
    });
  }
}

/** The marks over `[start, end)`, clipped to it and re-based to `start`. */
function marksOver(
  marks: readonly MarkRange[] | undefined,
  start: number,
  end: number,
): MarkRange[] | undefined {
  if (marks === undefined) return undefined;
  const over: MarkRange[] = [];
  for (const range of marks) {
    const from = Math.max(range.start, start);
    const to = Math.min(range.end, end);
    if (from < to) over.push({ ...range, start: from - start, end: to - start });
  }
  return over.length === 0 ? undefined : over;
}
