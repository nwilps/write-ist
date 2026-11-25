/**
 * How many notes may be open in tabs at once, and which to open again when an
 * older session left more (Noah, 2026-11-23).
 *
 * Five tabs, at the most. With five open, + is greyed and the closed notes in
 * the folder menu with it, until a tab is closed — quietly, with nothing said.
 * A session kept before there was a limit may have left more than five open:
 * the first five are opened again, but never without the one that was in
 * front, which takes the fifth place if it was further along.
 */

/** The most notes open in tabs at once. */
export const MOST_OPEN_NOTES = 5;

/**
 * Which of the tabs kept from last time to open again, in order: at most
 * `MOST_OPEN_NOTES`, the one in front (`front`) always among them.
 */
export function tabsToReopen(tabs: readonly string[], front: string | undefined): string[] {
  if (tabs.length <= MOST_OPEN_NOTES) return [...tabs];
  const first = tabs.slice(0, MOST_OPEN_NOTES);
  if (front === undefined || first.includes(front) || !tabs.includes(front)) return first;
  return [...first.slice(0, MOST_OPEN_NOTES - 1), front];
}
