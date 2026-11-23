// @vitest-environment jsdom
/**
 * Where the autocomplete list goes (Noah, 2026-11-21): **its left edge on the
 * left edge of the character name** it finishes, at every zoom, below the line
 * and on the window. `placeList` is the arithmetic; `placeOffer` measures and
 * hands the shift to the stylesheet in the paper's own pixels; the plugin says
 * where the name starts, for a cue and only for a cue.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import { drawOffer, placeList, placeOffer } from "../../app/src/workspaces/editor/autocomplete-draw.ts";
import type { Coords } from "../../src/screenplay/autocomplete.ts";
import { editorStateFor } from "../../src/screenplay/editing.ts";
import { namesOf } from "../../src/screenplay/names-sync.ts";
import type { NameLists } from "../../src/screenplay/names.ts";
import { parse } from "../../src/screenplay/parse.ts";

const WINDOW = { width: 1000, height: 800 };
const LIST = { width: 120, height: 90 };

describe("placing the list", () => {
  it("puts its left edge where the name starts, under the line", () => {
    expect(placeList({ left: 300, below: 400, line: 380 }, LIST, WINDOW)).toEqual({ left: 300, top: 400, scroll: 0 });
  });

  it("moves along only as far as it must to stay on the window", () => {
    expect(placeList({ left: 950, below: 400, line: 380 }, LIST, WINDOW).left).toBe(880);
    expect(placeList({ left: -20, below: 400, line: 380 }, LIST, WINDOW).left).toBe(0);
  });

  it("stays below the line where there is no room, by scrolling the paper up by what it lacks", () => {
    // 750 + 90 is 40 past the window's foot: the paper moves up 40 and the list with it.
    expect(placeList({ left: 300, below: 750, line: 730 }, LIST, WINDOW, 1000)).toEqual({ left: 300, top: 710, scroll: 40 });
  });

  it("goes above the line, not over it, only when the paper cannot scroll far enough", () => {
    expect(placeList({ left: 300, below: 750, line: 730 }, LIST, WINDOW, 10)).toEqual({ left: 300, top: 640, scroll: 0 });
    expect(placeList({ left: 300, below: 750, line: 730 }, LIST, WINDOW)).toEqual({ left: 300, top: 640, scroll: 0 });
  });
});

/** A drawn list with the boxes a laid-out window would give it. */
function laidOut(zoom: number, hung: { left: number; top: number }, line: { top: number }): HTMLElement {
  const drawn = drawOffer({ ghost: "WARD", choices: ["EDWARD", "EDNA"], selected: 0 });
  document.body.append(drawn);
  const list = drawn.querySelector<HTMLElement>(".autocomplete__list")!;
  // The paper is laid out once and drawn `zoom` times as large: the window sees the larger.
  Object.defineProperty(list, "offsetWidth", { value: LIST.width });
  list.getBoundingClientRect = () =>
    ({ left: hung.left, top: hung.top, width: LIST.width * zoom, height: LIST.height * zoom }) as DOMRect;
  drawn.getBoundingClientRect = () => ({ left: hung.left, top: line.top }) as DOMRect;
  return drawn;
}

describe("lining the drawn list up", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });
  const now = (): void => {
    vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => (run(0), 0));
  };

  for (const zoom of [0.75, 1, 1.5, 2]) {
    it(`moves it from the caret to the name's left edge at zoom ${zoom}, in the paper's pixels`, () => {
      now();
      // Hung from the caret 200 window pixels right of where the name begins.
      const drawn = laidOut(zoom, { left: 500, top: 420 }, { top: 400 });
      placeOffer(drawn, () => ({ left: 300, top: 400, bottom: 420 }));
      const list = drawn.querySelector<HTMLElement>(".autocomplete__list")!;
      expect(Number(list.style.getPropertyValue("--offer-x"))).toBeCloseTo(-200 / zoom);
      // Below the line: not moved up or down.
      expect(Number(list.style.getPropertyValue("--offer-y"))).toBe(0);
    });
  }

  it("leaves it hanging from the caret when nothing says where it starts (a heading's piece)", () => {
    now();
    const drawn = laidOut(1, { left: 500, top: 420 }, { top: 400 });
    placeOffer(drawn, () => undefined);
    expect(Number(drawn.querySelector<HTMLElement>(".autocomplete__list")!.style.getPropertyValue("--offer-x"))).toBe(0);
  });

  it("scrolls the paper rather than lift the list over the line, and leaves it under the line", () => {
    now();
    const scroller = document.createElement("div");
    scroller.style.setProperty("overflow-y", "auto");
    Object.defineProperties(scroller, { scrollHeight: { value: 5000 }, clientHeight: { value: 700 } });
    document.body.append(scroller);
    const drawn = laidOut(1, { left: 300, top: window.innerHeight - 30 }, { top: window.innerHeight - 50 });
    scroller.append(drawn);
    placeOffer(drawn, () => ({ left: 300, top: 0, bottom: 0 }));
    expect(scroller.scrollTop).toBe(LIST.height - 30);
    expect(Number(drawn.querySelector<HTMLElement>(".autocomplete__list")!.style.getPropertyValue("--offer-y"))).toBe(0);
  });

  it("sets its shift only as numbers for the stylesheet, never a look", () => {
    now();
    const drawn = laidOut(1.5, { left: 500, top: 420 }, { top: 400 });
    placeOffer(drawn, () => ({ left: 300, top: 400, bottom: 420 }));
    const list = drawn.querySelector<HTMLElement>(".autocomplete__list")!;
    expect([...list.style].sort()).toEqual(["--offer-x", "--offer-y"]);
  });
});

describe("where the plugin says the name starts", () => {
  const SCRIPT = ["@EDWARD", "One.", "", "@EDWARD", "Two.", "", "@EDWARD", "Three.", "", "INT. KITCHEN - DAY", "", "INT. KITCHEN - NIGHT", "", "INT. KITCHEN - DAY", "", "@ED"].join("\n");

  function viewWith(caretAfter: string, script = SCRIPT): { asked: (Coords | undefined)[]; lineStart: number } {
    const holder: { names?: NameLists } = {};
    const asked: (Coords | undefined)[] = [];
    let state = editorStateFor(parse(script), {
      autocomplete: {
        names: () => holder.names!,
        draw: (drawing) => drawOffer(drawing),
        place: (_drawn, start) => asked.push(start()),
      },
    });
    holder.names = namesOf(state.doc);
    let end = -1;
    let lineStart = -1;
    state.doc.descendants((node, pos) => {
      if (node.type.name === "element" && node.textContent === caretAfter) [lineStart, end] = [pos + 1, pos + 1 + node.content.size];
    });
    const view = new EditorView(document.body.appendChild(document.createElement("div")), { state });
    // Where a place is drawn stands in for the place itself.
    view.coordsAtPos = (pos: number) => ({ left: pos, right: pos, top: 0, bottom: 0 });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, end)));
    view.updateState(state);
    view.destroy();
    return { asked, lineStart };
  }

  it("is where a cue's typed name begins", () => {
    const { asked, lineStart } = viewWith("ED");
    expect(asked.length).toBeGreaterThan(0);
    // The start of the line, not the caret after the typed letters.
    expect(asked.at(-1)?.left).toBe(lineStart);
  });

  it("is nothing for a heading's piece, which hangs from the caret as before", () => {
    const { asked } = viewWith("INT. KIT", SCRIPT.replace(/@ED$/, "INT. KIT"));
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.at(-1)).toBeUndefined();
  });
});
