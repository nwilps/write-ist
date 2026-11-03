/**
 * Dual dialogue on the paper: where each speech of a pair is drawn.
 *
 * The layout says which elements share a band and in which column
 * (`layout.ts`, from `paginate.ts`); the paper is a flat run of blocks, so the
 * columns are drawn by marking those blocks. Like the seams between sheets
 * (`sheets.ts`) the marks are **decorations** — attributes on the view's
 * blocks, never on the document — so nothing here reaches the file, and the
 * caret, the `^` and the order of the script are untouched.
 *
 * How a mark looks is the stylesheet's (`app/src/style/editor.css`, columns
 * from the generated `geometry.css`). What this decides is only which block is
 * which, and the heights the stylesheet needs to line two columns up without
 * measuring anything: the number of rows each side takes, from the same wrap
 * the count used.
 *
 *   - `--dual-left-rows` on the right-hand cue: how far to pull it back up to
 *     the left cue's row.
 *   - `--dual-name-left` and `--dual-name-right` on the left cue: the lengths of
 *     the two names, in characters (`--ch`), which the link rule between them is
 *     placed from (each name is centred on its column).
 *   - `--dual-extra` on the band's last block: the rows the right column falls
 *     short by, so what follows clears the left.
 */
import type { Node as EditorNode } from "prosemirror-model";
import { Decoration } from "prosemirror-view";
import type { Band } from "./paginate.ts";
import type { Layout } from "./layout.ts";
import { manuscriptIndex, startOfManuscriptElement } from "./numbering.ts";

/** The decorations that set the pairs of a layout in two columns. */
export function dualDecorations(
  doc: EditorNode,
  laid: Layout,
): Decoration[] {
  const decorations: Decoration[] = [];

  for (const chunk of laid.pagination.chunks) {
    if (chunk.band === undefined) continue;
    decorations.push(...bandDecorations(doc, chunk.band));
  }
  return decorations;
}

function bandDecorations(doc: EditorNode, band: Band): Decoration[] {
  const members = band.members;
  const nodes = members.map((member) => {
    const pos = startOfManuscriptElement(doc, manuscriptIndex(member.elementIndex));
    const node = pos === undefined ? undefined : doc.nodeAt(pos);
    return pos === undefined || node === null || node === undefined ? undefined : { pos, node };
  });

  // The pair is drawn as columns only while its blocks touch. A blank line the
  // writer has just started between them is in the document and not in the
  // file, and the columns would not line up around it; until it is typed in
  // (which ends the pair) or left, the speeches stack.
  for (let i = 0; i < nodes.length; i++) {
    const here = nodes[i];
    if (here === undefined) return [];
    const next = nodes[i + 1];
    if (next !== undefined && next.pos !== here.pos + here.node.nodeSize) return [];
  }

  const heights = { left: 0, right: 0 };
  members.forEach((member) => {
    heights[member.column] += member.blank + member.lines;
  });

  const rightCue = members.findIndex((member) => member.column === "right");
  const nameLength = (i: number): number => nodes[i]?.node.textContent.length ?? 0;

  return members.map((member, i) => {
    const { pos, node } = nodes[i]!;
    const classes = ["dual"];
    const custom: string[] = [];
    const firstOfLeft = i === 0;
    const firstOfRight = member.column === "right" && members[i - 1]?.column === "left";
    const last = i === members.length - 1;
    if (firstOfLeft) {
      classes.push("dual-first");
      if (rightCue > 0) {
        custom.push(`--dual-name-left: calc(${nameLength(0)} * var(--ch))`, `--dual-name-right: calc(${nameLength(rightCue)} * var(--ch))`);
      }
    }
    if (firstOfRight) {
      classes.push("dual-right-first");
      custom.push(`--dual-left-rows: ${heights.left}`);
    }
    if (last && heights.left > heights.right) {
      classes.push("dual-last");
      custom.push(`--dual-extra: ${heights.left - heights.right}`);
    }
    return Decoration.node(pos, pos + node.nodeSize, {
      class: classes.join(" "),
      "data-dual-column": member.column,
      ...(custom.length === 0 ? {} : { style: custom.join("; ") }),
    });
  });
}
