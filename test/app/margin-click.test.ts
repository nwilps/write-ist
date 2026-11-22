/**
 * A click in the paper's left or right margin (`margin-click.ts`): the caret to
 * the start or the end of the line beside it, at any zoom.
 *
 * jsdom lays nothing out, so the paper's geometry is drawn here: each element is
 * one line, `LINE` pixels tall, inside a writing area that the zoom scales — as
 * `zoom` on `.page` scales everything the window measures. ProseMirror's
 * `posAtCoords` is answered from the same drawing, so what is checked is that a
 * margin click asks about the right point and puts the caret where the answer
 * says. A click on the writing is left alone.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { EditorView } from "prosemirror-view";
import { caretFromMargins, marginAt, pointInside } from "../../app/src/workspaces/editor/margin-click.ts";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { startOfElement } from "../support/editor-positions.ts";

const FOUNTAIN = "EXT. CANAL - DAWN\n\nMara kneels at the water.\n\nMARA\nGo on, little boat.\n";
const LINE = 20;
/** The writing at 100%, inside a paper whose left inset is 150 pixels. */
const WRITING = { left: 150, right: 600, top: 100 };

const live: EditorView[] = [];
afterEach(() => {
  live.splice(0).forEach((view) => view.destroy());
  document.body.replaceChildren();
});

function paperAt(zoom: number) {
  const page = document.createElement("div");
  page.className = "page";
  document.body.append(page);
  // jsdom cannot measure a caret to scroll to; the Editor's own scrolling is `caret-margin.ts`'s.
  const view = new EditorView(page, { state: editorStateFor(parse(FOUNTAIN)), handleScrollToSelection: () => true });
  live.push(view);
  const elements = view.state.doc.childCount;
  const box = {
    left: WRITING.left * zoom,
    right: WRITING.right * zoom,
    top: WRITING.top * zoom,
    bottom: (WRITING.top + elements * LINE) * zoom,
  };
  view.dom.getBoundingClientRect = () => ({ ...box, width: box.right - box.left, height: box.bottom - box.top, x: box.left, y: box.top, toJSON: () => box });
  const asked: { left: number; top: number }[] = [];
  // The line at `top`: its start at the left edge, its end at the right.
  view.posAtCoords = ({ left, top }) => {
    asked.push({ left, top });
    const line = Math.min(elements - 1, Math.max(0, Math.floor((top - box.top) / (LINE * zoom))));
    const start = startOfElement(view.state, line);
    const end = start + view.state.doc.child(line).content.size;
    const pos = left <= box.left + 2 ? start : left >= box.right - 2 ? end : start + 1;
    return { pos, inside: -1 };
  };
  const stop = caretFromMargins(page, () => view);
  /** Press at a point of the window, on whatever is there. */
  const press = (x: number, y: number, on: Element = page, held: MouseEventInit = {}): MouseEvent => {
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y, ...held });
    on.dispatchEvent(event);
    return event;
  };
  /** The middle of line `line`, in window pixels. */
  const lineY = (line: number): number => box.top + (line + 0.5) * LINE * zoom;
  return { page, view, box, asked, press, lineY, stop };
}

const textOf = (view: EditorView, line: number): string => view.state.doc.child(line).textContent;

describe("which margin a point is in", () => {
  it("is the left of the writing, the right of it, or neither", () => {
    const writing = { left: 150, right: 600 };
    expect(marginAt(20, writing)).toBe("start");
    expect(marginAt(700, writing)).toBe("end");
    expect(marginAt(300, writing)).toBeUndefined();
    expect(marginAt(150, writing)).toBeUndefined();
  });

  it("asks about a point just inside the writing, on the clicked line, held inside it top to bottom", () => {
    const writing = { left: 150, right: 600, top: 100, bottom: 400 };
    expect(pointInside("start", 250, writing)).toEqual({ left: 151, top: 250 });
    expect(pointInside("end", 250, writing)).toEqual({ left: 599, top: 250 });
    expect(pointInside("start", 20, writing)).toEqual({ left: 151, top: 101 });
    expect(pointInside("end", 900, writing)).toEqual({ left: 599, top: 399 });
  });
});

describe.each([0.5, 1, 1.6, 2.4])("a click in the paper's margin at %sx zoom", (zoom) => {
  it("in the left margin puts the caret at the start of that line", () => {
    const { view, box, press, lineY } = paperAt(zoom);
    const event = press(box.left / 2, lineY(1));
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.selection.empty).toBe(true);
    expect(view.state.selection.head).toBe(startOfElement(view.state, 1));
    expect(textOf(view, 1)).toBe("Mara kneels at the water.");
  });

  it("in the right margin puts the caret at the end of that line", () => {
    const { view, box, press, lineY } = paperAt(zoom);
    press(box.right + 30 * zoom, lineY(3));
    const line = view.state.doc.child(3);
    expect(line.textContent).toBe("Go on, little boat.");
    expect(view.state.selection.head).toBe(startOfElement(view.state, 3) + line.content.size);
  });

  it("with Shift held, carries the selection from where it was to the line's end", () => {
    const { view, box, press, lineY } = paperAt(zoom);
    press(box.left / 2, lineY(1));
    press(box.right + 10, lineY(1), undefined, { shiftKey: true });
    const { from, to } = view.state.selection;
    expect(view.state.doc.textBetween(from, to)).toBe("Mara kneels at the water.");
  });
});

describe("a click that is not in a margin", () => {
  it("on anything but the paper's own inset is not this one's to answer", () => {
    const { page, view, box, press, lineY, asked } = paperAt(1);
    // Something drawn on the paper that is not its inset, as the "Reading…" line is.
    const drawn = page.appendChild(document.createElement("p"));
    const before = view.state.selection.head;
    const event = press(box.left / 2, lineY(1), drawn);
    expect(event.defaultPrevented).toBe(false);
    expect(asked).toEqual([]);
    expect(view.state.selection.head).toBe(before);
  });

  it("in the paper's top inset, above the writing and not beside it, does nothing", () => {
    const { view, box, press, asked } = paperAt(1);
    const before = view.state.selection.head;
    const event = press((box.left + box.right) / 2, box.top / 2);
    expect(event.defaultPrevented).toBe(false);
    expect(asked).toEqual([]);
    expect(view.state.selection.head).toBe(before);
  });

  it("with another button, or after the paper stops listening, does nothing", () => {
    const { view, box, press, lineY, stop } = paperAt(1);
    const before = view.state.selection.head;
    press(box.left / 2, lineY(2), undefined, { button: 2 });
    expect(view.state.selection.head).toBe(before);
    stop();
    press(box.left / 2, lineY(2));
    expect(view.state.selection.head).toBe(before);
    // The script is as it was: a margin click never types.
    expect(manuscriptOf(view.state.doc).elements).toHaveLength(4);
  });
});
