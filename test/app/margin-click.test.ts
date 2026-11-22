/**
 * A click in the paper's left or right margin (`margin-click.ts`): the caret to
 * the start or the end of the **line as drawn** beside it, at any zoom — on a
 * wrapped line, the start or the end of that line and not of the whole element.
 *
 * jsdom lays nothing out, so the paper is drawn here the way the stylesheet
 * draws it: a monospaced face, each element indented and as wide as its type
 * (dialogue narrower and further in than action), words wrapped onto the next
 * line with the space at a wrap left hanging at the end of the line before, and
 * the whole scaled by the zoom. The Editor's own measures, `nodeDOM` and
 * `coordsAtPos`, are answered from that drawing. What is checked is where the
 * caret lands, by the words either side of it.
 *
 * The same clicks were made in real WebKit and Chromium over Big Fish, at 70%,
 * 100% and 164%, while this was written (PR #162).
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { EditorView } from "prosemirror-view";
import {
  caretFromMargins,
  elementBeside,
  lineBeside,
  marginAt,
  type Box,
} from "../../app/src/workspaces/editor/margin-click.ts";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { startOfElement } from "../support/editor-positions.ts";

/** An invented scene: a heading, action that wraps to three lines, a cue, and dialogue that wraps to three. */
const FOUNTAIN = [
  "EXT. CANAL - DAWN",
  "",
  "Mara kneels at the water with a paper boat folded from an old ticket and sets it down on the grey canal.",
  "",
  "MARA",
  "Go on, little boat. Past the lock and the bridge and all the way out to the sea.",
  "",
].join("\n");

/** One character's width and one line's height, in pixels at 100%. */
const CHAR = 10;
const LINE = 20;
/** The writing at 100%: its left edge, and the top of its first line. */
const WRITING = { left: 150, top: 100 };
/** Where each element is drawn, in characters from the writing's left edge, and how many fit across. */
const SHAPE: Record<string, { indent: number; width: number }> = {
  "scene-heading": { indent: 0, width: 60 },
  action: { indent: 0, width: 40 },
  character: { indent: 22, width: 30 },
  dialogue: { indent: 10, width: 25 },
};
/** The blank line between elements. */
const GAP = LINE;

/** Break `text` into lines of at most `width` characters at spaces, each space left at the end of its line. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/(?<= )/)) {
    if (line !== "" && line.length + word.trimEnd().length > width) {
      lines.push(line);
      line = "";
    }
    line += word;
  }
  lines.push(line);
  return lines;
}

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
  const { doc } = view.state;

  // Draw every element: its box, and each of its lines with the positions on it.
  const elements: { offset: number; from: number; box: Box; lines: { first: number; text: string }[] }[] = [];
  let top = WRITING.top;
  doc.forEach((node, offset) => {
    const shape = SHAPE[node.attrs["type"] as string]!;
    const from = offset + 1;
    let first = from;
    const lines = wrap(node.textContent, shape.width).map((text) => {
      const line = { first, text };
      first += text.length;
      return line;
    });
    const left = WRITING.left + shape.indent * CHAR;
    const box = { left: left * zoom, right: (left + shape.width * CHAR) * zoom, top: top * zoom, bottom: (top + lines.length * LINE) * zoom };
    elements.push({ offset, from, box, lines });
    top += lines.length * LINE + GAP;
  });
  const bottom = top - GAP;
  const writing = { left: WRITING.left * zoom, right: (WRITING.left + 60 * CHAR) * zoom, top: WRITING.top * zoom, bottom: bottom * zoom };

  const rect = (box: Box) => ({ ...box, width: box.right - box.left, height: box.bottom - box.top, x: box.left, y: box.top, toJSON: () => box });
  view.dom.getBoundingClientRect = () => rect(writing);
  const drawnElements = new Map(
    elements.map(({ offset, box }) => {
      const drawn = document.createElement("div");
      drawn.getBoundingClientRect = () => rect(box);
      return [offset, drawn];
    }),
  );
  view.nodeDOM = (offset) => drawnElements.get(offset) ?? null;
  // The character after `pos` (side 1), or before it (side -1), as drawn.
  view.coordsAtPos = (pos, side = 1) => {
    const element = elements.findLast((each) => each.from <= pos)!;
    const char = side < 0 ? pos - 1 : pos;
    const index = element.lines.findLastIndex((line) => line.first <= char);
    const line = element.lines[Math.max(0, index)]!;
    const column = Math.max(0, char - line.first) + (side < 0 ? 1 : 0);
    const left = element.box.left + column * CHAR * zoom;
    const lineTop = element.box.top + Math.max(0, index) * LINE * zoom;
    return { left, right: left, top: lineTop, bottom: lineTop + LINE * zoom };
  };

  const stop = caretFromMargins(page, () => view);
  /** Press at a point of the window, on whatever is there. */
  const press = (x: number, y: number, on: Element = page, held: MouseEventInit = {}): MouseEvent => {
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y, ...held });
    on.dispatchEvent(event);
    return event;
  };
  /** The middle of line `line` of element `element`, in window pixels. */
  const lineY = (element: number, line: number): number => elements[element]!.box.top + (line + 0.5) * LINE * zoom;
  const lines = (element: number): string[] => elements[element]!.lines.map((line) => line.text);
  const left = writing.left / 2;
  const right = writing.right + 30 * zoom;
  return { page, view, writing, press, lineY, lines, left, right, stop };
}

/** The words either side of the caret, with `|` for the caret. */
function around(view: EditorView): string {
  const { $head } = view.state.selection;
  const text = $head.parent.textContent;
  return `${text.slice(Math.max(0, $head.parentOffset - 8), $head.parentOffset)}|${text.slice($head.parentOffset, $head.parentOffset + 8)}`;
}

describe("the drawing these tests click on", () => {
  it("wraps the action to three lines and the dialogue to four, as the paper would", () => {
    const { lines } = paperAt(1);
    expect(lines(1)).toEqual([
      "Mara kneels at the water with a paper ",
      "boat folded from an old ticket and sets ",
      "it down on the grey canal.",
    ]);
    expect(lines(3)).toEqual(["Go on, little boat. Past ", "the lock and the bridge ", "and all the way out to ", "the sea."]);
  });
});

describe("which margin a point is in", () => {
  it("is the left of the writing, the right of it, or neither", () => {
    const writing = { left: 150, right: 600 };
    expect(marginAt(20, writing)).toBe("start");
    expect(marginAt(700, writing)).toBe("end");
    expect(marginAt(300, writing)).toBeUndefined();
    expect(marginAt(150, writing)).toBeUndefined();
  });
});

describe("the element beside a click", () => {
  const box = (left: number, right: number, top: number, bottom: number): Box => ({ left, right, top, bottom });
  it("is the one at that height, skipping what is not drawn, or the nearer between two", () => {
    const boxes = [undefined, box(0, 100, 0, 40), undefined, box(50, 100, 60, 100)];
    const beside = (y: number) => elementBeside((at) => boxes[at], boxes.length, y, "start");
    expect(beside(20)).toBe(1);
    expect(beside(80)).toBe(3);
    expect(beside(45)).toBe(1);
    expect(beside(57)).toBe(3);
    expect(beside(500)).toBe(3);
  });

  it("is the left speech from the left margin and the right one from the right, in dual dialogue", () => {
    const boxes = [box(0, 40, 0, 60), box(50, 90, 0, 40)];
    expect(elementBeside((at) => boxes[at], 2, 20, "start")).toBe(0);
    expect(elementBeside((at) => boxes[at], 2, 20, "end")).toBe(1);
  });
});

describe("the line beside a click", () => {
  // "ab cd ef" wrapped as "ab " / "cd " / "ef", from position 10.
  const rowOf = (pos: number): number => (pos < 13 ? 0 : pos < 16 ? 1 : 2);
  const drawn = (pos: number): Box => ({ left: 0, right: 0, top: rowOf(pos) * 20, bottom: rowOf(pos) * 20 + 20 });
  it("runs from the first position on it to the one before the wrap", () => {
    expect(lineBeside(drawn, 10, 18, 5)).toEqual({ start: 10, end: 12 });
    expect(lineBeside(drawn, 10, 18, 30)).toEqual({ start: 13, end: 15 });
    expect(lineBeside(drawn, 10, 18, 50)).toEqual({ start: 16, end: 18 });
  });

  it("is the first or last line for a height above or below the element, and the one place in an empty one", () => {
    expect(lineBeside(drawn, 10, 18, -40)).toEqual({ start: 10, end: 12 });
    expect(lineBeside(drawn, 10, 18, 400)).toEqual({ start: 16, end: 18 });
    expect(lineBeside(drawn, 10, 10, 5)).toEqual({ start: 10, end: 10 });
  });
});

describe.each([0.5, 1, 1.6, 2.4])("a click in the paper's margin at %sx zoom", (zoom) => {
  it("beside a line that does not wrap, goes to its start or its end", () => {
    const { view, press, lineY, left, right } = paperAt(zoom);
    const event = press(left, lineY(0, 0));
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.selection.empty).toBe(true);
    expect(view.state.selection.head).toBe(startOfElement(view.state, 0));
    press(right, lineY(2, 0));
    expect(around(view)).toBe("MARA|");
  });

  it.each([
    ["action", 1, 3],
    ["dialogue, indented,", 3, 4],
  ])("beside each line of wrapped %s goes to the start or the end of that line as drawn", (_kind, element, count) => {
    const { view, press, lineY, lines, left, right } = paperAt(zoom);
    const drawn = lines(element);
    expect(drawn).toHaveLength(count);
    let lineStart = 0;
    drawn.forEach((text, line) => {
      press(left, lineY(element, line));
      expect(view.state.selection.$head.parentOffset, `start of line ${line}`).toBe(lineStart);
      press(right, lineY(element, line));
      // Before the space the line wrapped at: the caret drawn after the line's last word.
      expect(view.state.selection.$head.parentOffset, `end of line ${line}`).toBe(lineStart + text.trimEnd().length);
      lineStart += text.length;
    });
  });

  it("puts the caret beside the words a writer would expect", () => {
    const { view, press, lineY, left, right } = paperAt(zoom);
    press(right, lineY(1, 0));
    expect(around(view)).toMatch(/a paper\| boat fo$/);
    press(left, lineY(1, 1));
    expect(around(view)).toMatch(/paper \|boat fol$/);
    press(right, lineY(3, 1));
    expect(around(view)).toMatch(/bridge\| and all$/);
    press(left, lineY(3, 2));
    expect(around(view)).toMatch(/bridge \|and all $/);
  });

  it("with Shift held, carries the selection from where it was to the end of the line clicked", () => {
    const { view, press, lineY, left, right } = paperAt(zoom);
    press(left, lineY(1, 1));
    press(right, lineY(1, 1), undefined, { shiftKey: true });
    const { from, to } = view.state.selection;
    expect(view.state.doc.textBetween(from, to)).toBe("boat folded from an old ticket and sets");
    // And back up to the start of the line above, from the same anchor.
    press(left, lineY(1, 0), undefined, { shiftKey: true });
    expect(view.state.selection.anchor).toBe(from);
    expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to)).toBe("Mara kneels at the water with a paper ");
  });
});

describe("a click that is not in a margin", () => {
  it("on anything but the paper's own inset is not this one's to answer", () => {
    const { page, view, press, lineY, left } = paperAt(1);
    // Something drawn on the paper that is not its inset, as the "Reading…" line is.
    const drawn = page.appendChild(document.createElement("p"));
    const before = view.state.selection.head;
    const event = press(left, lineY(1, 1), drawn);
    expect(event.defaultPrevented).toBe(false);
    expect(view.state.selection.head).toBe(before);
  });

  it("in the paper's top inset, above the writing and not beside it, does nothing", () => {
    const { view, writing, press } = paperAt(1);
    const before = view.state.selection.head;
    const event = press((writing.left + writing.right) / 2, writing.top / 2);
    expect(event.defaultPrevented).toBe(false);
    expect(view.state.selection.head).toBe(before);
  });

  it("with another button, or after the paper stops listening, does nothing", () => {
    const { view, press, lineY, left, stop } = paperAt(1);
    const before = view.state.selection.head;
    press(left, lineY(1, 1), undefined, { button: 2 });
    expect(view.state.selection.head).toBe(before);
    stop();
    press(left, lineY(1, 1));
    expect(view.state.selection.head).toBe(before);
    // The script is as it was: a margin click never types.
    expect(manuscriptOf(view.state.doc).elements).toHaveLength(4);
  });
});
