/**
 * The letter beside each menu item, and what it takes to mean it.
 *
 * `#37`'s seam 4 leaves the window itself to the writer, so nothing here
 * touches the DOM. What is checked is the one piece of the screens that is
 * decidable without one: given a key press, which gesture — if any — did the
 * writer ask for. v1 asked only whether the key was one character long, so
 * `Ctrl+O` reached the menu as `o`; a screen that fires on the browser's own
 * shortcuts is the bug this seam exists to keep out.
 */
import { describe, expect, it } from "vitest";
import { chosenBy, shortcutOf, type Gesture } from "../../app/src/screens/shortcuts.ts";

/** A key press as the window reports it, with nothing held down. */
function press(key: string, held: Partial<Record<"alt" | "ctrl" | "meta" | "shift", true>> = {}) {
  return {
    key,
    altKey: held.alt === true,
    ctrlKey: held.ctrl === true,
    metaKey: held.meta === true,
    shiftKey: held.shift === true,
  };
}

describe("the shortcut a key press asks for", () => {
  it("reads a letter as itself", () => {
    expect(shortcutOf(press("o"))).toBe("o");
    expect(shortcutOf(press("q"))).toBe("q");
  });

  it("reads a capital as the same letter, so Caps Lock and Shift both work", () => {
    expect(shortcutOf(press("O", { shift: true }))).toBe("o");
    expect(shortcutOf(press("O"))).toBe("o");
  });

  it("names Escape, which is how a screen is left", () => {
    expect(shortcutOf(press("Escape"))).toBe("escape");
  });

  it("ignores a letter with Ctrl, Meta or Alt held", () => {
    // The writer asked the browser or the window manager for something, not
    // Write-ist. This is the v1 defect named above.
    expect(shortcutOf(press("o", { ctrl: true }))).toBeUndefined();
    expect(shortcutOf(press("o", { meta: true }))).toBeUndefined();
    expect(shortcutOf(press("o", { alt: true }))).toBeUndefined();
  });

  it("ignores the keys that already do something", () => {
    // Enter, Tab and the space bar belong to the focused button, and the
    // arrows to the page. Nothing here may take them away.
    for (const key of ["Enter", "Tab", " ", "ArrowDown", "ArrowUp", "F5"]) {
      expect(shortcutOf(press(key)), key).toBeUndefined();
    }
  });
});

describe("the gesture a key press chooses", () => {
  const noop = (): void => {};
  const gestures: readonly Gesture[] = [
    { key: "o", label: "Open Project", act: noop },
    { key: "q", label: "Quit", act: noop },
  ];

  it("finds the gesture whose letter was pressed", () => {
    expect(chosenBy(gestures, press("q"))?.label).toBe("Quit");
  });

  it("finds nothing for a letter no gesture claims", () => {
    expect(chosenBy(gestures, press("z"))).toBeUndefined();
  });

  it("finds nothing when the press was not a shortcut at all", () => {
    expect(chosenBy(gestures, press("o", { ctrl: true }))).toBeUndefined();
  });

  it("ignores a gesture that is not available", () => {
    // An import already running, say: the button is disabled, and the letter
    // beside it must be disabled with it or the two disagree.
    const halted: readonly Gesture[] = [{ key: "i", label: "Import", act: noop, unavailable: true }];
    expect(chosenBy(halted, press("i"))).toBeUndefined();
  });
});
