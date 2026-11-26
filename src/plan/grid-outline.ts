/**
 * The golden outline on the Plan grid: the square the keys are at (Noah,
 * 2026-11-25, Plan round 3).
 *
 * The arrows move it square by square, on the grid and only on it: never down
 * into the open cards under the grid. On an empty square it is drawn as a
 * square of its own; on a card, the card is lit. It is the writer's place, so
 * it is kept with the rest of it (`toolbox.memory`) and Plan opens with it
 * where it was left.
 *
 * Nothing here changes what it is given.
 */
import type { PlacedCard, PlanLayout } from "./plan.ts";

/** A square on the grid: its column (a page) and its lane, both counted from 0. */
export interface Square {
  readonly cell: number;
  readonly lane: number;
}

/** The card covering a square, if one does. */
export function cardAt(layout: PlanLayout, at: Square): PlacedCard | undefined {
  return layout.placed.find((placed) => placed.lane === at.lane && at.cell >= placed.cell && at.cell < placed.cell + placed.cells);
}

/** A square kept on the grid: one past its end or below its last lane comes back to the edge. */
export function squareOnGrid(layout: PlanLayout, at: Square): Square {
  return {
    cell: Math.max(0, Math.min(layout.columns - 1, Math.round(at.cell))),
    lane: Math.max(0, Math.min(layout.lanes - 1, Math.round(at.lane))),
  };
}

/**
 * Where an arrow takes the outline from a square: one square along or across,
 * kept on the grid. A card is one stop, however long it is: from a card, Left
 * and Right go to the squares either side of it, so no press is spent going
 * through it unseen.
 */
export function outlineStep(layout: PlanLayout, from: Square, dx: number, dy: number): Square {
  const on = dx === 0 ? undefined : cardAt(layout, from);
  const cell = on === undefined ? from.cell + dx : dx > 0 ? on.cell + on.cells : on.cell - 1;
  return squareOnGrid(layout, { cell, lane: from.lane + dy });
}
