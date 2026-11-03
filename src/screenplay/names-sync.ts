/**
 * Keeping the name lists up to date as the editor's document changes (slice 2,
 * step 8).
 *
 * ProseMirror documents share structure: an edit makes new nodes along the
 * path to the change and leaves every other element the very same object. So
 * `findDiffStart` / `findDiffEnd` skip the unchanged run at either end by
 * identity, and what is left is the handful of elements the edit replaced —
 * which is all `NameLists.apply` is given. A keystroke costs the walk past the
 * untouched elements (pointer comparisons) plus the elements it changed, and
 * never a re-read of every cue's text.
 *
 * Elements are read in the page's numbering (`place.ts`): title lines are not
 * elements and are not looked at.
 */
import type { Node as EditorNode } from "prosemirror-model";
import type { ElementType } from "./document.ts";
import { NameLists, type NameLine, type NameListOptions } from "./names.ts";

/** The element lines of a document, in order. */
export function nameLinesOf(doc: EditorNode): NameLine[] {
  const lines: NameLine[] = [];
  doc.forEach((node) => {
    const line = lineOf(node);
    if (line !== undefined) lines.push(line);
  });
  return lines;
}

/** The lists for a whole document, counted once. */
export function namesOf(doc: EditorNode, options: NameListOptions = {}): NameLists {
  return NameLists.of(nameLinesOf(doc), options);
}

/**
 * Bring `lists` from `before` to `after`. Returns whether any count moved.
 * `before` must be the document the lists were last made or synced from.
 */
export function syncNames(lists: NameLists, before: EditorNode, after: EditorNode): boolean {
  if (before === after) return false;
  const start = before.content.findDiffStart(after.content);
  if (start === null) return false;
  const end = before.content.findDiffEnd(after.content);
  if (end === null) return false;

  let endBefore = end.a;
  let endAfter = end.b;
  // The two ends can cross when the change is a repeat of what was there
  // (inserting "aa" beside an "a"): slide both back to the start.
  const overlap = start - Math.min(endBefore, endAfter);
  if (overlap > 0) {
    endBefore += overlap;
    endAfter += overlap;
  }
  return lists.apply(linesBetween(before, start, endBefore), linesBetween(after, start, endAfter));
}

/** The elements overlapping `[from, to)`, or containing `from` when the range is empty. */
function linesBetween(doc: EditorNode, from: number, to: number): NameLine[] {
  const lines: NameLine[] = [];
  let at = 0;
  for (let i = 0; i < doc.childCount && at < to; i++) {
    const node = doc.child(i);
    const next = at + node.nodeSize;
    // Overlapping the range; for an empty one that is the element it falls
    // inside, never the one that begins exactly where it does.
    if (next > from) {
      const line = lineOf(node);
      if (line !== undefined) lines.push(line);
    }
    at = next;
  }
  return lines;
}

function lineOf(node: EditorNode): NameLine | undefined {
  if (node.type.name !== "element") return undefined;
  return {
    type: node.attrs["type"] as ElementType,
    text: node.textContent,
    omitted: node.attrs["omitted"] === true,
  };
}
