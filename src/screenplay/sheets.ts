/**
 * Where the paper breaks into sheets (ADR-0033, ADR-0024, ADR-0026).
 *
 * The layout says what is on each page; this says where, in the editor's
 * document, one sheet ends and the next begins, and what is drawn across the
 * seam: the rows of the sheet left empty, `(MORE)`, the next page's number and
 * `CHARACTER (CONT'D)`. The seam is a **decoration** — a widget the view draws
 * between two spots, never a character of the document — so copy, cut and
 * Select All cannot take it and the serialiser never sees it.
 *
 * Nothing here touches the DOM. How a seam looks is the app's: it hands in
 * `draw`, and this file decides only where each one goes.
 */
import type { Node as EditorNode } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";
import { PAGE } from "./geometry.ts";
import type { Layout } from "./layout.ts";

/** One seam: the foot of one sheet, and the head of the next. */
export interface SheetBreak {
  /** The 1-based page that begins after the seam. */
  readonly page: number;
  /** The manuscript element the seam falls in, or before. Blank lines are not counted. */
  readonly elementIndex: number;
  /** Offset into that element's text where the next sheet's text begins; 0 between elements. */
  readonly offset: number;
  /** Rows of the sheet below its last line — what the seam fills to reach the sheet's foot. */
  readonly rowsLeft: number;
  /** The speech is closed with `(MORE)` at the foot. */
  readonly more: boolean;
  /** `CHARACTER (CONT'D)` reopening the speech, when the next sheet begins mid-speech. */
  readonly contd?: string;
}

/** The seams of a layout, one before each page after the first. */
export function sheetBreaks(laid: Layout): SheetBreak[] {
  const breaks: SheetBreak[] = [];
  for (let n = 1; n < laid.pages.length; n++) {
    const before = laid.pages[n - 1]!.lines;
    const after = laid.pages[n]!.lines;
    const first = after.find((line) => line.kind === "text");
    if (first === undefined) continue;
    const contd = after.find((line) => line.kind === "contd");
    const last = before[before.length - 1];
    breaks.push({
      page: n + 1,
      elementIndex: first.elementIndex,
      offset: first.start ?? 0,
      rowsLeft: Math.max(0, PAGE.linesPerPage - (last === undefined ? 0 : last.row + 1)),
      more: last?.kind === "more",
      ...(contd === undefined ? {} : { contd: contd.text }),
    });
  }
  return breaks;
}

/**
 * The document position each manuscript element begins at (before its node).
 * Blank lines the writer is standing on are not manuscript elements, and the
 * title page is not an element; the numbering is `manuscriptOf`'s.
 */
export function manuscriptStarts(doc: EditorNode): number[] {
  const starts: number[] = [];
  let at = 0;
  doc.forEach((child) => {
    if (child.type.name === "element" && child.content.size > 0) starts.push(at);
    at += child.nodeSize;
  });
  return starts;
}

/**
 * The seams as decorations. `draw` makes the seam's DOM when the view first
 * needs it; a seam that has not changed keeps the DOM it had, by its key.
 */
export function sheetDecorations(
  doc: EditorNode,
  laid: Layout,
  draw: (seam: SheetBreak) => HTMLElement,
): DecorationSet {
  const breaks = sheetBreaks(laid);
  if (breaks.length === 0) return DecorationSet.empty;
  const starts = manuscriptStarts(doc);
  const widgets: Decoration[] = [];
  for (const seam of breaks) {
    const start = starts[seam.elementIndex];
    if (start === undefined) continue;
    // Between elements the seam is before the node; inside one it is that far
    // into its text (the node's own opening takes one position).
    const position = seam.offset === 0 ? start : start + 1 + seam.offset;
    widgets.push(
      Decoration.widget(position, () => draw(seam), {
        side: -1,
        key: `${seam.page}|${seam.rowsLeft}|${seam.more}|${seam.contd ?? ""}|${seam.offset === 0}`,
        ignoreSelection: true,
        stopEvent: () => true,
      }),
    );
  }
  return DecorationSet.create(doc, widgets);
}
