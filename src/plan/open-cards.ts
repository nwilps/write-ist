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
 * Which place a card dragged from place `from` by `dx` pixels is over, when
 * the places are `step` pixels apart and `count` are open: the nearest.
 */
export function placeUnder(from: number, dx: number, step: number, count: number): number {
  if (!(step > 0) || count <= 0) return from;
  return Math.max(0, Math.min(count - 1, Math.round(from + dx / step)));
}
