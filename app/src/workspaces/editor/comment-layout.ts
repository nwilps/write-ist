/**
 * Where the comment cards go, and how each one's connector runs to its words:
 * numbers in, numbers out, so the rules are tested without a window
 * (`comment-cards.ts` measures and draws).
 *
 * **Both columns** (Noah, 2026-11-25). A card goes in whichever side column has
 * room nearest its words; where both have, the side its words are open to — a
 * comment ending its line goes right, one starting its line goes left, as the
 * design's cards do.
 *
 * **Cards never overlap.** Taken in the order their words come, each sits level
 * with its words unless the card above it in that column is in the way, and
 * then it sits just below that one: cards stack and push each other down.
 *
 * **A connector never crosses words.** It leaves the words along the gap under
 * their line — where their own underline is — runs out to the strip of desk
 * between the paper and the column, bends there to the card's height if the
 * card was pushed down, and goes in to the card. Only that strip holds the
 * bend, and nothing is ever written there.
 */

export type Side = "left" | "right";

/** One card, before it is placed. */
export interface CardWant {
  readonly id: string;
  /** Where its top would be in each column, to sit level with its words. */
  readonly want: { readonly left: number; readonly right: number };
  readonly height: number;
  /** The side its words are open to, taken where both columns have room. */
  readonly prefer: Side;
}

export interface CardPlace {
  readonly id: string;
  readonly side: Side;
  readonly top: number;
}

/**
 * Place every card, in the order given (the order the comments' words come
 * in), `gap` apart where they stack.
 */
export function stackCards(wants: readonly CardWant[], gap: number): readonly CardPlace[] {
  const free: Record<Side, number> = { left: -Infinity, right: -Infinity };
  return wants.map((card) => {
    const top = (side: Side): number => Math.max(card.want[side], free[side]);
    const push = (side: Side): number => top(side) - card.want[side];
    const other: Side = card.prefer === "left" ? "right" : "left";
    // The side that keeps it nearest its words; on a tie, the one it prefers.
    const side = push(other) < push(card.prefer) ? other : card.prefer;
    const placed = { id: card.id, side, top: top(side) };
    free[side] = placed.top + card.height + gap;
    return placed;
  });
}

/** The side a comment's words are open to on the paper. */
export function preferredSide(words: {
  /** Nothing after them on their last line. */
  readonly endsLine: boolean;
  /** Nothing before them on their first line. */
  readonly startsLine: boolean;
  /** Across the window: the middle of the words, and the middle of the paper. */
  readonly centre: number;
  readonly paperCentre: number;
}): Side {
  if (words.endsLine) return "right";
  if (words.startsLine) return "left";
  return words.centre < words.paperCentre ? "left" : "right";
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * The connector's corners: out from the words along their line's foot to
 * `bendX`, down (or up) to the card's dot, and in to it. Straight when the
 * card is level with the words.
 */
export function connectorRoute(from: Point, to: Point, bendX: number): readonly Point[] {
  if (Math.abs(from.y - to.y) < 1) return [from, { x: to.x, y: from.y }];
  return [from, { x: bendX, y: from.y }, { x: bendX, y: to.y }, to];
}

/** Whether a card is under the fixed panels of its column, the stack of them taken as one block. */
export function underPanels(
  card: { readonly top: number; readonly bottom: number },
  block: { readonly top: number; readonly bottom: number } | undefined,
): boolean {
  return block !== undefined && card.top < block.bottom && card.bottom > block.top;
}
