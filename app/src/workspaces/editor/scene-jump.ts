/**
 * Previous Scene and Next Scene: the caret to the start of a scene heading.
 *
 * The headings are the ones the Scenes list shows (`panels.ts` reads them from
 * here), so the keys and the list cannot disagree about where the scenes are.
 *
 * Previous goes to the start of the heading of the scene the caret is in, and
 * from the start of that heading to the one before it. Next goes to the first
 * heading after the caret. Neither goes round: at the first heading Previous
 * does nothing, and past the last heading Next does nothing.
 */
import type { Node } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { centreCaretLine } from "./caret-centre.ts";

/** A scene heading in the document: where its text starts, and what it says. */
export interface SceneHeading {
  readonly start: number;
  readonly text: string;
}

/** The scene headings, in order, read off the top level of the model: the flat sequence, not the DOM. */
export function sceneHeadings(doc: Node): readonly SceneHeading[] {
  const headings: SceneHeading[] = [];
  doc.forEach((node, offset) => {
    if (node.type.name === "element" && node.attrs["type"] === "scene-heading") {
      headings.push({ start: offset + 1, text: node.textContent });
    }
  });
  return headings;
}

/** Where Previous (`-1`) or Next (`1`) Scene would put the caret from `head`, or `undefined` if nowhere. */
export function sceneJumpTarget(doc: Node, head: number, direction: -1 | 1): number | undefined {
  const starts = sceneHeadings(doc).map((heading) => heading.start);
  return direction === 1 ? starts.find((start) => start > head) : starts.findLast((start) => start < head);
}

/** Move the caret there, with its line in the middle of the window; nothing at all if there is nowhere to go. */
export function jumpToScene(view: EditorView, direction: -1 | 1): void {
  const target = sceneJumpTarget(view.state.doc, view.state.selection.head, direction);
  if (target !== undefined) jumpToHeading(view, target);
}

/**
 * The caret to the start of a scene heading, its line in the middle of the
 * window (`caret-centre.ts`): Previous and Next Scene, and a scene chosen in the
 * Scenes panel.
 */
export function jumpToHeading(view: EditorView, start: number): void {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start)));
  view.focus();
  centreCaretLine(view);
}
