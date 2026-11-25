/**
 * Which Plan cards are open, larger, under the grid, and in which of the three
 * places beside the Structure button (Noah, 2026-11-25).
 *
 * Three at the most. A card opened comes in at the first place, beside the
 * button, and the rest move one place along; with three open already, the one
 * in the third place is pushed out and closes. A card already open stays where
 * it is. An open card dragged to another place is put in there, and the cards
 * between move over to make room: it is not swapped with the one it lands on.
 *
 * The places are a list of card ids, the first place first. Nothing here
 * changes the list it is given.
 */

/** The most cards open at once. `--count-plan-open-cards` in `tokens.css` says the same. */
export const MOST_OPEN_CARDS = 3;

/** The places after opening `id`, and the card pushed out to make room for it, if one was. */
export function openCard(open: readonly string[], id: string): { open: string[]; out: string | undefined } {
  if (open.includes(id)) return { open: [...open], out: undefined };
  const next = [id, ...open];
  return { open: next.slice(0, MOST_OPEN_CARDS), out: next[MOST_OPEN_CARDS] };
}

/** The places after closing `id`: the cards after it move up one. */
export function closeCard(open: readonly string[], id: string): string[] {
  return open.filter((each) => each !== id);
}

/** The places after putting `id` in at place `to` (from 0): inserted there, the others moved over. */
export function moveCard(open: readonly string[], id: string, to: number): string[] {
  if (!open.includes(id)) return [...open];
  const rest = open.filter((each) => each !== id);
  const at = Math.max(0, Math.min(rest.length, Math.round(to)));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/**
 * How far past halfway to the next place, as a share of a place, a dragged
 * card must go before that place is the one it is over. Without it, a pointer
 * resting near halfway — as a hand does, slowing to drop — flipped the place
 * back and forth with every pixel of tremor, and the other cards started for
 * one place and turned back for the other, over and over: the jitter Noah saw
 * (2026-11-25, Plan round 2).
 */
export const PLACE_HOLD = 0.2;

/**
 * Which place a card dragged from place `from` by `dx` pixels is over, when
 * the places are `step` pixels apart and `count` are open. It stays `now`, the
 * place it was last over (where it started, unless said), until it is
 * `PLACE_HOLD` past halfway to another; then it is the nearest.
 */
export function placeUnder(from: number, dx: number, step: number, count: number, now: number = from): number {
  if (!(step > 0) || count <= 0) return from;
  const at = from + dx / step;
  if (Math.abs(at - now) < 0.5 + PLACE_HOLD) return Math.max(0, Math.min(count - 1, now));
  return Math.max(0, Math.min(count - 1, Math.round(at)));
}
