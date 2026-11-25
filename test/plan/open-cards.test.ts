/**
 * Up to three Plan cards open under the grid (`src/plan/open-cards.ts`): a new
 * one comes in first and pushes the others along, the third pushed out; one
 * already open stays put; a dragged one is inserted, never swapped.
 */
import { describe, expect, it } from "vitest";
import { MOST_OPEN_CARDS, closeCard, moveCard, openCard, placeUnder } from "../../src/plan/open-cards.ts";

describe("open Plan cards", () => {
  it("is three at the most", () => {
    expect(MOST_OPEN_CARDS).toBe(3);
  });

  it("opens a card in the first place and moves the others one place along", () => {
    let open: string[] = [];
    for (const id of ["a", "b", "c"]) {
      const opened = openCard(open, id);
      expect(opened.out).toBeUndefined();
      open = opened.open;
    }
    expect(open).toEqual(["c", "b", "a"]);
  });

  it("pushes the third out when a fourth is opened", () => {
    expect(openCard(["c", "b", "a"], "d")).toEqual({ open: ["d", "c", "b"], out: "a" });
  });

  it("leaves a card that is already open where it is", () => {
    for (const id of ["c", "b", "a"]) expect(openCard(["c", "b", "a"], id)).toEqual({ open: ["c", "b", "a"], out: undefined });
  });

  it("closes a card, the ones after it moving up", () => {
    expect(closeCard(["c", "b", "a"], "c")).toEqual(["b", "a"]);
    expect(closeCard(["c", "b", "a"], "b")).toEqual(["c", "a"]);
    expect(closeCard(["c", "b", "a"], "z")).toEqual(["c", "b", "a"]);
  });

  it("inserts a dragged card at the place it is dropped on, and does not swap it", () => {
    // The first to the third: the other two move up, not the third to the first.
    expect(moveCard(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(moveCard(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(moveCard(["a", "b", "c"], "a", 1)).toEqual(["b", "a", "c"]);
    expect(moveCard(["a", "b", "c"], "b", 1)).toEqual(["a", "b", "c"]);
    // Past either end, the end.
    expect(moveCard(["a", "b", "c"], "b", 9)).toEqual(["a", "c", "b"]);
    expect(moveCard(["a", "b", "c"], "b", -4)).toEqual(["b", "a", "c"]);
    expect(moveCard(["a", "b"], "z", 0)).toEqual(["a", "b"]);
  });

  it("finds the nearest place under a dragged card", () => {
    expect(placeUnder(0, 0, 300, 3)).toBe(0);
    expect(placeUnder(0, 140, 300, 3)).toBe(0);
    expect(placeUnder(0, 160, 300, 3)).toBe(1);
    expect(placeUnder(0, 620, 300, 3)).toBe(2);
    expect(placeUnder(0, 2000, 300, 3)).toBe(2);
    expect(placeUnder(2, -2000, 300, 3)).toBe(0);
    expect(placeUnder(1, 400, 300, 2)).toBe(1);
    // Nothing to measure by: where it was.
    expect(placeUnder(1, 400, 0, 3)).toBe(1);
  });

  it("does not change the list it is given", () => {
    const open = ["a", "b", "c"];
    openCard(open, "d");
    closeCard(open, "a");
    moveCard(open, "a", 2);
    expect(open).toEqual(["a", "b", "c"]);
  });
});
