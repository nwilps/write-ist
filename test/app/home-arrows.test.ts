/**
 * The home menu moves with Up and Down, wraps, and Enter acts on the highlight.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHome } from "../../app/src/screens/home.ts";
import { answerKey, stepped, type Gesture } from "../../app/src/screens/shortcuts.ts";

const press = (key: string, held: { ctrl?: true } = {}) => ({
  key,
  altKey: false,
  ctrlKey: held.ctrl === true,
  metaKey: false,
});

function home() {
  const into = document.createElement("div");
  document.body.append(into);
  const calls = { n: vi.fn(), o: vi.fn(), q: vi.fn() };
  const drawn = renderHome(into, { onNewProject: calls.n, onOpenProject: calls.o, onQuit: calls.q });
  const buttons = [...into.querySelectorAll<HTMLButtonElement>("button.gesture")];
  const selected = () => buttons.findIndex((b) => b.classList.contains("gesture--selected"));
  const screen = (dialogOpen = false) => ({ dialogOpen, gestures: drawn.gestures, navigate: drawn.navigate });
  return { into, calls, buttons, selected, screen };
}

describe("Home, arrow keys", () => {
  it("starts on the first row, and exactly one row is highlighted", () => {
    const h = home();
    expect(h.selected()).toBe(0);
    expect(h.buttons.filter((b) => b.classList.contains("gesture--selected"))).toHaveLength(1);
  });

  it("Down and Up step through the rows and wrap at both ends", () => {
    const h = home();
    for (const expected of [1, 2, 3, 4, 0]) {
      expect(answerKey(press("ArrowDown"), h.screen())).toBe(true);
      expect(h.selected()).toBe(expected);
    }
    expect(answerKey(press("ArrowUp"), h.screen())).toBe(true);
    expect(h.selected()).toBe(4);
    expect(document.activeElement).toBe(h.buttons[4]);
  });

  it("Enter activates the highlighted row, once", () => {
    const h = home();
    answerKey(press("ArrowDown"), h.screen());
    expect(answerKey(press("Enter"), h.screen())).toBe(true);
    expect(h.calls.o).toHaveBeenCalledTimes(1);
    expect(h.calls.n).not.toHaveBeenCalled();
  });

  it("Enter on the first row, untouched, is New Project", () => {
    const h = home();
    answerKey(press("Enter"), h.screen());
    expect(h.calls.n).toHaveBeenCalledTimes(1);
  });

  it("hovering moves the highlight, and the arrows go on from there", () => {
    const h = home();
    h.buttons[3]!.dispatchEvent(new MouseEvent("mouseenter"));
    expect(h.selected()).toBe(3);
    answerKey(press("ArrowDown"), h.screen());
    expect(h.selected()).toBe(4);
  });

  it("clicking and the letter shortcuts still work", () => {
    const h = home();
    h.buttons[1]!.click();
    expect(h.calls.o).toHaveBeenCalledTimes(1);
    expect(answerKey(press("q"), h.screen())).toBe(true);
    expect(h.calls.q).toHaveBeenCalledTimes(1);
  });

  it("does nothing while a dialog is open", () => {
    const h = home();
    expect(answerKey(press("ArrowDown"), h.screen(true))).toBe(false);
    expect(answerKey(press("Enter"), h.screen(true))).toBe(false);
    expect(answerKey(press("n"), h.screen(true))).toBe(false);
    expect(h.selected()).toBe(0);
    expect(h.calls.n).not.toHaveBeenCalled();
  });

  it("leaves modified arrows and other keys alone", () => {
    const h = home();
    expect(answerKey(press("ArrowDown", { ctrl: true }), h.screen())).toBe(false);
    expect(answerKey(press("z"), h.screen())).toBe(false);
    expect(h.selected()).toBe(0);
  });
});

describe("stepped", () => {
  const noop = (): void => {};
  const gestures: readonly Gesture[] = [
    { key: "a", label: "A", act: noop },
    { key: "b", label: "B", act: noop, unavailable: true },
    { key: "c", label: "C", act: noop },
  ];

  it("skips what is unavailable", () => {
    expect(stepped(gestures, 0, press("ArrowDown"))).toBe(2);
    expect(stepped(gestures, 0, press("ArrowUp"))).toBe(2);
    expect(stepped(gestures, 2, press("ArrowUp"))).toBe(0);
  });

  it("is undefined for a key that is not an arrow", () => {
    expect(stepped(gestures, 0, press("a"))).toBeUndefined();
  });
});
