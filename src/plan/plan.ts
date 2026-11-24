/**
 * Plan: a sandbox for the story's overall shape (`GLOSSARY.md`, *Plan card*,
 * *Lane*, *Structure sheet*).
 *
 * Cards on a grid. The grid's sideways axis is the project's **target page
 * count** — the one Edit Project Details and New Project Defaults already set;
 * Plan has no length setting of its own. Up and down are **lanes**, which mean
 * nothing: a lane only keeps two cards from sitting on each other.
 *
 * ## A card stores where it is in the whole, not a cell
 *
 * The review's rule (2026-09-11, §3.3 item 6): *the writer assigns intent,
 * never outcome*. A card is kept as **fractions of the whole** — it starts a
 * quarter of the way in and runs for a twentieth of it — the way structure
 * sheets are (§1.5), so a plan holds its shape at any length. Which cells it
 * covers is worked out from those fractions and the length the grid has now
 * (`layoutPlan`). Change the target from 110 to 90 and every card keeps its
 * place in the story; nothing is rewritten until the writer moves a card.
 *
 * **Nothing is lost or crushed** when the length changes. A card is never less
 * than one cell wide, and two cards that rounding would put on top of each
 * other in a lane are drawn one after the other: the later one moves right,
 * past the end of the target if it must, and the grid grows to hold it — an
 * overrun shows rather than being absorbed. Their stored fractions are not
 * touched by that, so a longer target puts them back.
 *
 * ## Nothing here refers to the manuscript (ADR-0013)
 *
 * A card names no scene, no page of the script, no draft; nothing here reads
 * the manuscript and nothing in the manuscript makes a card. Plan is the same
 * for any kind of project, a novel included.
 */

/**
 * The colours a card may be, by stable name (the stylesheet's to draw), in
 * the order the colour picker lays them out, three to a row: round the wheel
 * from no colour and sand through to green. A name, once written to
 * `plan.md`, is never renamed; aqua and sand joined the first seven.
 */
export const CARD_COLOURS = ["plain", "sand", "yellow", "orange", "red", "purple", "blue", "aqua", "green"] as const;
export type CardColour = (typeof CARD_COLOURS)[number];

export interface PlanCard {
  /** Stable, never shown: `card-7`. */
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly colour: CardColour;
  /** Which lane, from 0 at the top. Carries no meaning. */
  readonly lane: number;
  /** Where it starts, as a fraction of the whole (0 is the beginning, 1 the end). */
  readonly start: number;
  /** How long it runs, as a fraction of the whole. Never 0. */
  readonly length: number;
}

export interface Plan {
  /** The structure sheets drawn under the grid, by id, in order (`structure.ts`). */
  readonly structure: readonly string[];
  readonly cards: readonly PlanCard[];
}

export const EMPTY_PLAN: Plan = { structure: [], cards: [] };

/**
 * The grid's length with no target page count (a target of 0, "none"): a
 * hundred cells, about a feature's length. The writer sets a target in Edit
 * Project Details and the grid takes it.
 */
export const LENGTH_WITHOUT_TARGET = 100;

/** Lanes drawn however few cards there are. One more is drawn under the lowest card past these. */
export const LANES = 12;

/** Room past the end of the grid where a card may still be put: an overrun, drawn as one. */
export const ROOM_PAST_END = 10;

/** How long a new card is, in cells, if it fits; otherwise one. */
export const NEW_CARD_CELLS = 2;

/** The grid's length for a project's target page count. */
export const gridLength = (targetPages: number): number =>
  targetPages > 0 ? Math.round(targetPages) : LENGTH_WITHOUT_TARGET;

/** A card as drawn: the cells it covers at the grid's length now. */
export interface PlacedCard {
  readonly card: PlanCard;
  /** The first cell, from 0. */
  readonly cell: number;
  /** How many cells, at least one. */
  readonly cells: number;
  readonly lane: number;
}

export interface PlanLayout {
  /** The target's length in cells: the grid's end, which cards may run past. */
  readonly length: number;
  /** Cells drawn: the length, or further if a card runs past it, and room after. */
  readonly columns: number;
  readonly lanes: number;
  readonly placed: readonly PlacedCard[];
}

/** Which cell a fraction of the whole falls in, at this length. */
export const cellOf = (fraction: number, length: number): number => Math.max(0, Math.round(fraction * length));

/** How many cells a fraction of the whole covers, at this length: never fewer than one. */
export const cellsOf = (fraction: number, length: number): number => Math.max(1, Math.round(fraction * length));

/** The fraction of the whole a number of cells is, at this length. */
export const fractionOf = (cells: number, length: number): number => cells / length;

/** Lay the cards out on a grid this many cells long. */
export function layoutPlan(plan: Plan, length: number): PlanLayout {
  const byLane = new Map<number, PlanCard[]>();
  for (const card of plan.cards) byLane.set(card.lane, [...(byLane.get(card.lane) ?? []), card]);
  const placed = new Map<PlanCard, PlacedCard>();
  for (const [lane, cards] of byLane) {
    // Earliest first; a tie keeps the order they are in the file.
    const ordered = [...cards].sort((one, other) => one.start - other.start);
    let free = 0;
    for (const card of ordered) {
      // Never on top of the card before it: moved along, never shrunk.
      const cell = Math.max(cellOf(card.start, length), free);
      const cells = cellsOf(card.length, length);
      placed.set(card, { card, cell, cells, lane });
      free = cell + cells;
    }
  }
  const all = plan.cards.map((card) => placed.get(card)!);
  const end = Math.max(length, ...all.map((each) => each.cell + each.cells));
  const lowest = Math.max(-1, ...all.map((each) => each.lane));
  return { length, columns: end + ROOM_PAST_END, lanes: Math.max(LANES, lowest + 2), placed: all };
}

/** Whether `cells` cells from `cell` in `lane` are free of every card but `ignoring`. */
export function fits(layout: PlanLayout, cell: number, lane: number, cells: number, ignoring?: string): boolean {
  if (cell < 0 || lane < 0 || cells < 1 || lane >= layout.lanes || cell + cells > layout.columns) return false;
  return !layout.placed.some(
    (each) => each.card.id !== ignoring && each.lane === lane && cell < each.cell + each.cells && each.cell < cell + cells,
  );
}

/** An id no card in the plan has: `card-` and one more than the highest number used. */
export function freeCardId(plan: Plan): string {
  const used = plan.cards.map((card) => /^card-(\d+)$/.exec(card.id)?.[1]).filter((found) => found !== undefined).map(Number);
  return `card-${Math.max(0, ...used) + 1}`;
}

/** The plan with one card changed. */
export const withCard = (plan: Plan, id: string, change: (card: PlanCard) => PlanCard): Plan => ({
  ...plan,
  cards: plan.cards.map((card) => (card.id === id ? change(card) : card)),
});
