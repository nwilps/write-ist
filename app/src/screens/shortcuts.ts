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
 * A key that does something while a modifier is held, as data.
 *
 * `mod` is Ctrl, or Cmd on a Mac. A chord is never a bare letter: a bare
 * letter is the writer typing, which is why `shortcutOf` cannot answer for
 * one. The one exception is Escape, which is how a screen is left.
 */
export interface Chord {
  /** The key, as `KeyboardEvent.key` names it: `s`, `;`, `Enter`, `Escape`. */
  readonly key: string;
  /** Ctrl or Cmd. */
  readonly mod?: true;
  readonly alt?: true;
}

/**
 * Whether a key press is exactly this chord: the key, in either case, with the
 * modifiers the chord names and no others. Shift is never counted, so a
 * capital still finds its command. Ctrl or Cmd together with Alt is the window
 * manager's, and matches nothing.
 */
export function chordMatches(chord: Chord, press: KeyPress): boolean {
  if (chord.mod === true) {
    if (press.altKey || (!press.ctrlKey && !press.metaKey)) return false;
  } else if (chord.alt === true) {
    if (!press.altKey || press.ctrlKey || press.metaKey) return false;
  } else if (press.altKey || press.ctrlKey || press.metaKey) {
    return false;
  }
  return press.key.toLowerCase() === chord.key.toLowerCase();
}

/** A chord as the desk shows it: `[Ctrl + S]`, `[Alt + Enter]`, `[Esc]`. */
export function chordHint(chord: Chord): string {
  const key = chord.key === "Escape" ? "Esc" : chord.key.length === 1 ? chord.key.toUpperCase() : chord.key;
  const modifier = chord.mod === true ? "Ctrl + " : chord.alt === true ? "Alt + " : "";
  return `[${modifier}${key}]`;
}

/**
 * Whether a key press opens a menu: Alt and the menu's letter, as the desk
 * shows it (`[Alt + F]`). Ctrl and Meta are somebody else's.
 */
export function asksForMenu(press: KeyPress, letter: string): boolean {
  return chordMatches({ key: letter, alt: true }, press);
}

/** The gesture a key press chooses, if it chooses one. */
export function chosenBy(gestures: readonly Gesture[], press: KeyPress): Gesture | undefined {
  const shortcut = shortcutOf(press);
  if (shortcut === undefined) return undefined;
  return gestures.find((gesture) => gesture.key === shortcut && gesture.unavailable !== true);
}

/**
 * Where the highlight goes when an arrow key is pressed, or `undefined` for any
 * other key. Up and Down step to the next gesture that is available and wrap at
 * the ends; with nothing available the highlight stays where it is. Held
 * modifiers mean the writer is talking to the window, not the menu.
 */
export function stepped(
  gestures: readonly Gesture[],
  from: number,
  press: KeyPress,
): number | undefined {
  if (press.ctrlKey || press.metaKey || press.altKey) return undefined;
  const direction = press.key === "ArrowDown" ? 1 : press.key === "ArrowUp" ? -1 : 0;
  if (direction === 0) return undefined;
  const count = gestures.length;
  for (let step = 1; step <= count; step += 1) {
    const index = (((from + direction * step) % count) + count) % count;
    if (gestures[index]?.unavailable !== true) return index;
  }
  return from;
}

/**
 * What the window does with a key press: nothing while a modal dialog is up
 * (it is the writer's whole attention), else the screen's arrow keys and Enter,
 * else the letter beside a gesture. True when the press was used, and the
 * window should keep it from the browser.
 */
export function answerKey(
  press: KeyPress,
  screen: {
    readonly dialogOpen: boolean;
    readonly gestures: readonly Gesture[];
    readonly navigate?: ((press: KeyPress) => boolean) | undefined;
  },
): boolean {
  if (screen.dialogOpen) return false;
  if (screen.navigate?.(press) === true) return true;
  const gesture = chosenBy(screen.gestures, press);
  if (gesture === undefined) return false;
  gesture.act();
  return true;
}
