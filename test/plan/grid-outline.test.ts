/**
 * The golden outline on the Plan grid (`src/plan/grid-outline.ts`): the arrows
 * move it a square at a time, kept on the grid — never past its last lane,
 * where the open cards are — and a card is one stop however long it is.
 */
import { describe, expect, it } from "vitest";
import { cardAt, outlineStep, squareOnGrid } from "../../src/plan/grid-outline.ts";
import type { PlacedCard, PlanLayout } from "../../src/plan/plan.ts";

/** A grid twenty squares long and four lanes deep, with one card three squares long at 5–7 in the second lane. */
const card = { card: { id: "a" }, cell: 5, lane: 1, cells: 3 } as unknown as PlacedCard;
const layout: PlanLayout = { length: 18, columns: 20, lanes: 4, placed: [card] };

describe("the golden outline", () => {
  it("finds the card on a square, on any of the squares it covers, and none beside it", () => {
    expect(cardAt(layout, { cell: 5, lane: 1 })).toBe(card);
    expect(cardAt(layout, { cell: 7, lane: 1 })).toBe(card);
    expect(cardAt(layout, { cell: 8, lane: 1 })).toBeUndefined();
    expect(cardAt(layout, { cell: 4, lane: 1 })).toBeUndefined();
    expect(cardAt(layout, { cell: 6, lane: 0 })).toBeUndefined();
  });

  it("moves one square at a time on empty squares", () => {
    expect(outlineStep(layout, { cell: 2, lane: 0 }, 1, 0)).toEqual({ cell: 3, lane: 0 });
    expect(outlineStep(layout, { cell: 2, lane: 0 }, -1, 0)).toEqual({ cell: 1, lane: 0 });
    expect(outlineStep(layout, { cell: 2, lane: 0 }, 0, 1)).toEqual({ cell: 2, lane: 1 });
    expect(outlineStep(layout, { cell: 2, lane: 2 }, 0, -1)).toEqual({ cell: 2, lane: 1 });
  });

  it("steps on to a card, and off it to the square either side of it, never through it a square at a time", () => {
    expect(outlineStep(layout, { cell: 4, lane: 1 }, 1, 0)).toEqual({ cell: 5, lane: 1 });
    expect(outlineStep(layout, { cell: 5, lane: 1 }, 1, 0)).toEqual({ cell: 8, lane: 1 });
    expect(outlineStep(layout, { cell: 7, lane: 1 }, 1, 0)).toEqual({ cell: 8, lane: 1 });
    expect(outlineStep(layout, { cell: 6, lane: 1 }, -1, 0)).toEqual({ cell: 4, lane: 1 });
    // Up and Down from a card keep the square it is at.
    expect(outlineStep(layout, { cell: 6, lane: 1 }, 0, 1)).toEqual({ cell: 6, lane: 2 });
  });

  it("stays on the grid: never before its first square or past its last, above its first lane or below its last", () => {
    expect(outlineStep(layout, { cell: 0, lane: 0 }, -1, 0)).toEqual({ cell: 0, lane: 0 });
    expect(outlineStep(layout, { cell: 0, lane: 0 }, 0, -1)).toEqual({ cell: 0, lane: 0 });
    expect(outlineStep(layout, { cell: 19, lane: 3 }, 1, 0)).toEqual({ cell: 19, lane: 3 });
    // Below the last lane are the open cards: Down there does nothing.
    expect(outlineStep(layout, { cell: 9, lane: 3 }, 0, 1)).toEqual({ cell: 9, lane: 3 });
  });

  it("brings a place kept from a longer grid back on to this one", () => {
    expect(squareOnGrid(layout, { cell: 140, lane: 9 })).toEqual({ cell: 19, lane: 3 });
    expect(squareOnGrid(layout, { cell: -3, lane: -1 })).toEqual({ cell: 0, lane: 0 });
  });
});
