/**
 * How far in from the window's edges the caret is kept while typing or moving
 * with the arrows: clear of the paper fade, then five lines further in. The
 * paper starts to move at that distance and leaves the caret a line inside it.
 */
import { describe, expect, it } from "vitest";
import {
  caretMargin,
  caretScrolling,
  COMFORT_LINES,
  scrollFor,
} from "../../app/src/workspaces/editor/caret-margin.ts";

const FADE = 72;
const LINE = 20;

describe("the caret's margin", () => {
  it("stays clear of the paper fade and five lines further in", () => {
    expect(COMFORT_LINES).toBe(5);
    expect(caretMargin({ fade: FADE, line: LINE, visible: 900 })).toBe(172);
  });

  it("gives way to a third of a short window, but never less than the fade", () => {
    // 200px is too short for fade + five lines (172), and a third is only 66,
    // so the fade itself is the floor: the caret still stays out of it.
    expect(caretMargin({ fade: FADE, line: LINE, visible: 200 })).toBe(FADE);
    // 300px: a third (100) is less than fade + five lines (172) and more than the fade.
    expect(caretMargin({ fade: FADE, line: LINE, visible: 300 })).toBe(100);
  });

  it("starts the paper moving at the margin and leaves the caret a line further in", () => {
    const { scrollMargin, scrollThreshold } = caretScrolling({ fade: FADE, line: LINE, visible: 900 });
    expect(scrollThreshold.top).toBe(172);
    expect(scrollThreshold.bottom).toBe(172);
    expect(scrollMargin.top).toBe(192);
    expect(scrollMargin.bottom).toBe(192);
  });

  it("leaves the sides alone", () => {
    const { scrollMargin, scrollThreshold } = caretScrolling({ fade: FADE, line: LINE, visible: 900 });
    expect(scrollMargin.left).toBe(5);
    expect(scrollMargin.right).toBe(5);
    expect(scrollThreshold.left).toBe(0);
    expect(scrollThreshold.right).toBe(0);
  });
});

describe("how far the paper moves for the caret", () => {
  const window = { start: 0, end: 900 };
  const lineAt = (start: number) => ({ start, end: start + LINE });

  it("does not move while the caret is inside the threshold", () => {
    expect(scrollFor(lineAt(172), window, 172, 192)).toBe(0);
    expect(scrollFor({ start: 708, end: 728 }, window, 172, 192)).toBe(0);
  });

  it("moves once the caret crosses, and leaves it at the margin", () => {
    // The foot of the line is 2px past the trigger at 728.
    expect(scrollFor({ start: 710, end: 730 }, window, 172, 192)).toBe(22);
    expect(scrollFor(lineAt(170), window, 172, 192)).toBe(-22);
  });

  it("does not move again for the same caret, at the top or the foot", () => {
    for (const start of [710, 170]) {
      const move = scrollFor(lineAt(start), window, 172, 192);
      expect(scrollFor(lineAt(start - move), window, 172, 192)).toBe(0);
    }
  });

  it("never answers a move with one the other way, whatever the height of the window", () => {
    for (let visible = 40; visible <= 400; visible += 7) {
      const { scrollThreshold, scrollMargin } = caretScrolling({ fade: FADE, line: LINE, visible });
      const short = { start: 0, end: visible };
      for (let start = -40; start <= visible + 40; start += 3) {
        const move = scrollFor(lineAt(start), short, scrollThreshold.top, scrollMargin.top);
        expect(scrollFor(lineAt(start - move), short, scrollThreshold.top, scrollMargin.top)).toBe(0);
      }
    }
  });
});
