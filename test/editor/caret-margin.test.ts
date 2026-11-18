/**
 * How far in from the window's edges the caret is kept while typing or moving
 * with the arrows: clear of the paper fade, then a few lines further in.
 */
import { describe, expect, it } from "vitest";
import { caretMargin, caretScrolling, COMFORT_LINES } from "../../app/src/workspaces/editor/caret-margin.ts";

const FADE = 72;
const LINE = 20;

describe("the caret's margin", () => {
  it("stays clear of the paper fade and a few lines further in", () => {
    const margin = caretMargin({ fade: FADE, line: LINE, visible: 900 });
    expect(margin).toBe(FADE + COMFORT_LINES * LINE);
    expect(margin).toBeGreaterThan(FADE);
  });

  it("gives way to a third of a short window, but never less than the fade", () => {
    // 200px is too short for fade + three lines (132), and a third is only 66,
    // so the fade itself is the floor: the caret still stays out of it.
    expect(caretMargin({ fade: FADE, line: LINE, visible: 200 })).toBe(FADE);
    // 300px: a third (100) is less than fade + three lines (132) and more than the fade.
    expect(caretMargin({ fade: FADE, line: LINE, visible: 300 })).toBe(100);
  });

  it("hands ProseMirror the same distance as margin and threshold, and leaves the sides alone", () => {
    const { scrollMargin, scrollThreshold } = caretScrolling({ fade: FADE, line: LINE, visible: 900 });
    const vertical = FADE + COMFORT_LINES * LINE;
    expect(scrollMargin.top).toBe(vertical);
    expect(scrollMargin.bottom).toBe(vertical);
    expect(scrollThreshold.top).toBe(vertical);
    expect(scrollThreshold.bottom).toBe(vertical);
    expect(scrollMargin.left).toBe(5);
    expect(scrollMargin.right).toBe(5);
    expect(scrollThreshold.left).toBe(0);
    expect(scrollThreshold.right).toBe(0);
  });
});
