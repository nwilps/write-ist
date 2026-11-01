/**
 * A gesture, its letter, and what counts as asking for it.
 *
 * Every screen is a short menu of things the writer can do, each drawn as a
 * button with its letter shown beside it — v1's shape. One list per screen
 * holds all three facts about a gesture (its label, its letter, what it does),
 * so the letter on the page and the letter the window answers to cannot drift
 * apart.
 *
 * `#37`'s seam 4 leaves the window to the writer, so nothing here touches the
 * DOM: `test/app/shortcuts.test.ts` reaches the decision directly.
 */

/** One thing the writer can do on a screen. */
export interface Gesture {
  /** What the button says, without its letter. */
  readonly label: string;
  /** The letter shown beside it, lowercase. */
  readonly key: string;
  readonly act: () => void;
  /**
   * Drawn, and doing nothing — an import already running, say. Disabling the
   * button without disabling its letter would make the two disagree.
   */
  readonly unavailable?: boolean;
}

/** A key press, as much of one as any decision here needs. */
export interface KeyPress {
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

/** How leaving a screen is asked for, everywhere. */
export const LEAVE = "escape";

/**
 * What the writer asked for, or nothing.
 *
 * A letter only counts with no modifier held: with Ctrl, Meta or Alt down the
 * writer is talking to the browser or the window manager. v1 asked only
 * whether the key was one character long, so `Ctrl+O` arrived as `o`.
 *
 * Enter, Tab and the space bar belong to whatever button has focus, and are
 * never a shortcut — real buttons already do the right thing with them, which
 * is also what keeps a screen reader working.
 */
export function shortcutOf(press: KeyPress): string | undefined {
  if (press.ctrlKey || press.metaKey || press.altKey) return undefined;
  if (press.key === "Escape") return LEAVE;
  if (press.key.length !== 1) return undefined;
  if (press.key === " ") return undefined;
  return press.key.toLowerCase();
}

/**
 * Whether a key press is the writer asking for a save.
 *
 * ADR-0028 makes autosave and an explicit save **one routine**, and this is
 * the explicit one: the reflex every writer already has. It is here rather
 * than in the Editor for the same reason every other key decision is — so it
 * can be decided without a window, and so there is one file to read to know
 * what Write-ist answers to.
 *
 * It needs a modifier, which is why `shortcutOf` cannot answer it: a bare `s`
 * is the letter `s`, and the writer is typing.
 */
export function asksToSave(press: KeyPress): boolean {
  if (press.altKey) return false;
  if (!press.ctrlKey && !press.metaKey) return false;
  return press.key.toLowerCase() === "s";
}

/** Whether a key press is the writer asking to search: Alt+Enter, as the desk shows it. */
export function asksToSearch(press: KeyPress): boolean {
  return press.altKey && !press.ctrlKey && !press.metaKey && press.key === "Enter";
}

/**
 * Whether a key press opens a menu: Alt and the menu's letter, as the desk
 * shows it (`[Alt + F]`). Ctrl and Meta are somebody else's.
 */
export function asksForMenu(press: KeyPress, letter: string): boolean {
  if (!press.altKey || press.ctrlKey || press.metaKey) return false;
  return press.key.toLowerCase() === letter;
}

/** The gesture a key press chooses, if it chooses one. */
export function chosenBy(gestures: readonly Gesture[], press: KeyPress): Gesture | undefined {
  const shortcut = shortcutOf(press);
  if (shortcut === undefined) return undefined;
  return gestures.find((gesture) => gesture.key === shortcut && gesture.unavailable !== true);
}
