/**
 * What is under a spot in the editor's document, and the scene around it.
 *
 * The numbers themselves — a position, an element on the paper, an element in
 * the manuscript — are `numbering.ts`'s, and this module speaks the paper's.
 */
import type { Node as EditorNode } from "prosemirror-model";
import type { ElementType } from "./document.ts";
import { elementAt, leadingTitleLines, type ElementAt } from "./numbering.ts";
import { beginsScene, type SceneRange } from "./ranges.ts";

/** The element under a spot, with what is in it. */
export interface ElementUnder extends ElementAt {
  readonly text: string;
  readonly omitted: boolean;
}

/**
 * The element containing `position`, with its text: the one answer the
 * Confirm gesture, autocomplete and spellcheck all ask ("what is the caret
 * in?"), so none of them reads the document's depth for itself.
 */
export function elementUnder(doc: EditorNode, position: number): ElementUnder | undefined {
  const place = elementAt(doc, position);
  if (place === undefined) return undefined;
  const node = doc.resolve(position).parent;
  return { ...place, text: node.textContent, omitted: node.attrs["omitted"] === true };
}

/**
 * The scene containing `position`, as a range over the page's elements (blank
 * lines counted). Found by walking out from the spot, so it costs a scene and
 * not the manuscript.
 */
export function sceneAt(doc: EditorNode, position: number): SceneRange | undefined {
  const place = elementAt(doc, position);
  if (place === undefined) return undefined;

  const first = leadingTitleLines(doc);
  const begins = (element: number): boolean => {
    const node = doc.child(first + element);
    return beginsScene({ type: node.attrs["type"] as ElementType, omitted: node.attrs["omitted"] === true });
  };
  const count = doc.childCount - first;

  let start: number = place.element;
  while (start > 0 && !begins(start)) start -= 1;
  let end = place.element + 1;
  while (end < count && !begins(end)) end += 1;
  return { heading: begins(start) ? start : undefined, start, end };
}
