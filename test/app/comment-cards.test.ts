/**
 * The comment cards (ADR-0018, amended 2026-11-25): where they go, how a
 * connector runs round the words, and what writing in a card, leaving it and
 * resolving it do to the file.
 *
 * The placing rules are numbers in and numbers out (`comment-layout.ts`), so
 * they are checked here exactly. The window's own measuring is WebKit's, and
 * is checked by eye in WebKitGTK (the pull request says what was looked at).
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { undo } from "prosemirror-history";
import { TextSelection, type EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { afterEach, describe, expect, it } from "vitest";
import { commentCards } from "../../app/src/workspaces/editor/comment-cards.ts";
import { connectorRoute, preferredSide, stackCards, underPanels, type CardWant } from "../../app/src/workspaces/editor/comment-layout.ts";
import { activeComment, shownComments } from "../../src/screenplay/comment-editing.ts";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { startOfElement } from "../support/editor-positions.ts";

const want = (id: string, at: number, height: number, prefer: "left" | "right" = "right"): CardWant => ({
  id,
  want: { left: at, right: at },
  height,
  prefer,
});

describe("where the cards go", () => {
  it("sits each card level with its words when nothing is in the way", () => {
    expect(stackCards([want("a", 100, 80), want("b", 400, 80)], 12)).toEqual([
      { id: "a", side: "right", top: 100 },
      { id: "b", side: "right", top: 400 },
    ]);
  });

  it("uses the other column where its own has a card in the way", () => {
    // b's words are 20px below a's: the right column is taken, the left is free.
    expect(stackCards([want("a", 100, 80), want("b", 120, 80)], 12)).toEqual([
      { id: "a", side: "right", top: 100 },
      { id: "b", side: "left", top: 120 },
    ]);
  });

  it("stacks and pushes down when both columns are in the way, never overlapping", () => {
    const placed = stackCards([want("a", 100, 80), want("b", 110, 80), want("c", 120, 60), want("d", 130, 40)], 12);
    expect(placed).toEqual([
      { id: "a", side: "right", top: 100 },
      { id: "b", side: "left", top: 110 },
      // Right is free from 192, left from 202: the nearer is right.
      { id: "c", side: "right", top: 192 },
      { id: "d", side: "left", top: 202 },
    ]);
    const heights: Record<string, number> = { a: 80, b: 80, c: 60, d: 40 };
    for (const side of ["left", "right"]) {
      const column = placed.filter((card) => card.side === side);
      for (let index = 1; index < column.length; index++) {
        expect(column[index]!.top).toBeGreaterThanOrEqual(column[index - 1]!.top + heights[column[index - 1]!.id]! + 12);
      }
    }
  });

  it("goes to the side its words are open to, where both have room", () => {
    expect(stackCards([want("a", 100, 80, "left")], 12)).toEqual([{ id: "a", side: "left", top: 100 }]);
    expect(preferredSide({ endsLine: true, startsLine: true, centre: 0, paperCentre: 500 })).toBe("right");
    expect(preferredSide({ endsLine: false, startsLine: true, centre: 900, paperCentre: 500 })).toBe("left");
    // Mid-line: the nearer side.
    expect(preferredSide({ endsLine: false, startsLine: false, centre: 300, paperCentre: 500 })).toBe("left");
    expect(preferredSide({ endsLine: false, startsLine: false, centre: 700, paperCentre: 500 })).toBe("right");
  });

  it("fades a card only while it is under its column's panels, the stack taken as one block", () => {
    const block = { top: 72, bottom: 520 };
    expect(underPanels({ top: 300, bottom: 380 }, block)).toBe(true);
    // In the gap between two panels is still under the block.
    expect(underPanels({ top: 250, bottom: 260 }, block)).toBe(true);
    expect(underPanels({ top: 500, bottom: 600 }, block)).toBe(true);
    expect(underPanels({ top: 520, bottom: 600 }, block)).toBe(false);
    expect(underPanels({ top: 0, bottom: 72 }, block)).toBe(false);
    expect(underPanels({ top: 0, bottom: 72 }, undefined)).toBe(false);
  });
});

describe("how a connector runs", () => {
  // The words end at x 700 on a line whose foot is y 300; the paper's edge is
  // at 1000, the card's at 1012, so the strip of desk between them is 1000–1012.
  const words = { x: 700, y: 300 };

  it("is straight when the card is level with the words", () => {
    expect(connectorRoute(words, { x: 1012, y: 300 }, 1006)).toEqual([words, { x: 1012, y: 300 }]);
  });

  it("bends only in the strip beside the paper when the card was pushed down", () => {
    const route = connectorRoute(words, { x: 1012, y: 460 }, 1006);
    expect(route).toEqual([words, { x: 1006, y: 300 }, { x: 1006, y: 460 }, { x: 1012, y: 460 }]);
    // Along the words' own line foot, then down outside the paper, then in:
    // no part of it runs across a line of text.
    const [, bend, down] = route;
    expect(bend!.y).toBe(words.y);
    expect(bend!.x).toBeGreaterThan(1000);
    expect(down!.x).toBe(bend!.x);
  });

  it("goes the other way to a card on the left", () => {
    const left = { x: 160, y: 300 };
    expect(connectorRoute(left, { x: 88, y: 360 }, 94)).toEqual([left, { x: 94, y: 300 }, { x: 94, y: 360 }, { x: 88, y: 360 }]);
  });
});

/* ------------------------------------------------------------------ the cards */

const SCRIPT = `INT. KITCHEN - NIGHT

Rain against the window.

Maya pushes the door open and steps into the light.
`;

const mounted: { destroy: () => void }[] = [];
afterEach(() => {
  for (const each of mounted.splice(0)) each.destroy();
  document.body.replaceChildren();
});

function desk(text = SCRIPT) {
  const page = document.createElement("div");
  const left = document.createElement("aside");
  const right = document.createElement("aside");
  const cards = commentCards({ page, columns: { left, right } });
  document.body.append(left, page, cards.layer, right);
  const view = new EditorView(page, {
    state: editorStateFor(parse(text)),
    dispatchTransaction: (tr) => {
      view.updateState(view.state.apply(tr));
      cards.update(view.state);
    },
  });
  // No layout in this window: every place is the top-left corner.
  view.coordsAtPos = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
  cards.attach(view);
  mounted.push({ destroy: () => (cards.dispose(), view.destroy()) });
  return { view, cards, layer: cards.layer, file: () => serialise(manuscriptOf(view.state.doc)) };
}

function caretIn(view: EditorView, element: number, offset = 0): void {
  const at = startOfElement(view.state, element) + offset;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
  view.focus();
}

function type(text: HTMLElement, words: string): void {
  text.textContent = words;
  text.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

function key(target: HTMLElement, name: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

const textOf = (layer: HTMLElement): HTMLElement => layer.querySelector<HTMLElement>(".comment-card__text")!;

describe("adding a comment", () => {
  it("opens its card with the keys, ready to type in, over the caret's line", () => {
    const { view, cards, layer } = desk();
    caretIn(view, 2, 4);
    expect(cards.add()).toBe(true);
    expect(document.activeElement).toBe(textOf(layer));
    expect(cards.editing()).toBe(true);
    const [draft] = shownComments(view.state);
    expect(view.state.doc.textBetween(draft!.start, draft!.end)).toBe("Maya pushes the door open and steps into the light.");
    expect(layer.querySelector(".comment-card--active")).not.toBeNull();
    // The words it is about are tinted on the paper.
    expect(view.dom.querySelector(".comment-highlight--active")?.textContent).toBe("Maya pushes the door open and steps into the light.");
  });

  it("is made when the writer types and leaves with Esc, which goes back to the paper and never Home", () => {
    const { view, cards, layer, file } = desk();
    caretIn(view, 2);
    cards.add();
    type(textOf(layer), "Does Maya hesitate first?");
    let heardByWindow = false;
    const window = (): void => void (heardByWindow = true);
    document.addEventListener("keydown", window);
    const esc = key(textOf(layer), "Escape");
    document.removeEventListener("keydown", window);
    expect(esc.defaultPrevented).toBe(true);
    expect(heardByWindow).toBe(false);
    expect(document.activeElement).toBe(view.dom);
    expect(file()).toBe(SCRIPT.replace("Maya pushes", "[[c:1 Does Maya hesitate first?]]Maya pushes").replace("light.", "light.[[/c:1]]"));
    // Still lit, on the same card, now the comment's own.
    expect(activeComment(view.state)).toBe("1");
    expect(layer.querySelectorAll(".comment-card")).toHaveLength(1);
    expect(textOf(layer).textContent).toBe("Does Maya hesitate first?");
  });

  it("is made by Enter too, which never puts a new line in a remark", () => {
    const { view, cards, layer, file } = desk();
    caretIn(view, 1);
    cards.add();
    type(textOf(layer), "Wind?");
    expect(key(textOf(layer), "Enter").defaultPrevented).toBe(true);
    expect(file()).toContain("[[c:1 Wind?]]Rain against the window.[[/c:1]]");
  });

  it("quietly goes when it loses the keys with nothing in it, and leaves nothing to undo", () => {
    const { view, cards, layer, file } = desk();
    caretIn(view, 2);
    const before = view.state;
    cards.add();
    view.focus();
    cards.redraw();
    expect(layer.querySelector(".comment-card")).toBeNull();
    expect(view.dom.querySelector(".comment-highlight")).toBeNull();
    expect(file()).toBe(SCRIPT);
    expect(undo(view.state)).toBe(undo(before));
    expect(document.querySelector(".trouble, .toast")).toBeNull();
  });

  it("opens below the panels when its words are level with them, and goes back level once left", () => {
    const { view, cards, layer } = desk();
    // A panel 300px tall at the top of the right column, as the window would measure it.
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.getBoundingClientRect = () => ({ top: 72, bottom: 300, left: 0, right: 240, width: 240, height: 228, x: 0, y: 72, toJSON: () => ({}) });
    layer.nextElementSibling!.append(panel);
    caretIn(view, 2);
    cards.add();
    const card = layer.querySelector<HTMLElement>(".comment-card")!;
    expect(Number(card.style.getPropertyValue("--comment-y"))).toBeGreaterThanOrEqual(300);
    expect(card.classList.contains("comment-card--under")).toBe(false);
    type(textOf(layer), "Too easy?");
    key(textOf(layer), "Escape");
    cards.redraw();
    // Left, it sits level with its words again, which here are under the panel.
    // (Whether it is then faint is `underPanels`, above: this window has no heights.)
    expect(Number(card.style.getPropertyValue("--comment-y"))).toBeLessThan(300);
  });

  it("leaves the caret at the end of the comment's words, so typing goes on there", () => {
    const { view, cards, layer } = desk();
    caretIn(view, 2, 4);
    cards.add();
    type(textOf(layer), "Too easy?");
    key(textOf(layer), "Enter");
    const [made] = shownComments(view.state);
    expect(view.state.selection.empty).toBe(true);
    expect(view.state.selection.head).toBe(made!.end);
  });

  it("does nothing on a blank line, or while a card has the keys", () => {
    const { view, cards } = desk("Rain.\n\n===\n\nMore rain.\n");
    caretIn(view, 1, 1);
    expect(cards.add()).toBe(false);
    caretIn(view, 0);
    expect(cards.add()).toBe(true);
    expect(cards.add()).toBe(false);
  });
});

describe("a comment's card", () => {
  const COMMENTED = `Rain.\n\n[[c:a1 Crows feel familiar.]]Crows lift off the fence.[[/c:a1]]\n\n[[c:b1 Too quiet?]]Nobody answers.[[/c:b1]]\n`;

  it("draws one card per comment, unlit, with its remark and a Resolve button", () => {
    const { layer, cards } = desk(COMMENTED);
    cards.redraw();
    const drawn = [...layer.querySelectorAll(".comment-card")];
    expect(drawn.map((card) => card.querySelector(".comment-card__text")!.textContent)).toEqual(["Crows feel familiar.", "Too quiet?"]);
    expect(layer.querySelectorAll(".comment-card--active")).toHaveLength(0);
    expect([...layer.querySelectorAll(".comment-card__resolve")].map((button) => button.textContent)).toEqual(["Resolve", "Resolve"]);
    expect(layer.querySelectorAll(".comment-line")).toHaveLength(2);
    expect(layer.querySelectorAll(".comment-dot")).toHaveLength(2);
    // No hover tooltips anywhere on a card.
    expect(layer.querySelector("[title]")).toBeNull();
  });

  it("is lit by a click on it, or on its words", () => {
    const { view, layer, cards } = desk(COMMENTED);
    cards.redraw();
    const second = layer.querySelectorAll<HTMLElement>(".comment-card")[1]!;
    second.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(activeComment(view.state)).toBe("b1");
    cards.redraw();
    expect(second.classList.contains("comment-card--active")).toBe(true);
    expect(document.activeElement).toBe(second.querySelector(".comment-card__text"));

    caretIn(view, 1, 3);
    expect(activeComment(view.state)).toBe("a1");
    cards.redraw();
    expect(layer.querySelectorAll(".comment-card")[0]!.classList.contains("comment-card--active")).toBe(true);
  });

  it("rewords the comment when the writer types in it and leaves", () => {
    const { view, layer, cards, file } = desk(COMMENTED);
    cards.redraw();
    const text = layer.querySelectorAll<HTMLElement>(".comment-card__text")[1]!;
    text.focus();
    type(text, "Too quiet? Maybe a dog.");
    view.focus();
    expect(file()).toContain("[[c:b1 Too quiet? Maybe a dog.]]Nobody answers.[[/c:b1]]");
  });

  it("puts words still being typed into the remark when asked before a save, with the card keeping the keys", () => {
    const { view, layer, cards, file } = desk(COMMENTED);
    cards.redraw();
    const text = layer.querySelectorAll<HTMLElement>(".comment-card__text")[0]!;
    text.focus();
    type(text, "Crows again.");
    cards.flush();
    expect(file()).toContain("[[c:a1 Crows again.]]Crows lift off the fence.[[/c:a1]]");
    expect(document.activeElement).toBe(text);
    // A new comment typed in and saved before leaving its card is made then.
    caretIn(view, 0);
    cards.add();
    type(textOf(layer), "Which rain?");
    cards.flush();
    expect(file()).toContain("[[c:1 Which rain?]]Rain.[[/c:1]]");
  });

  it("is resolved by its button: the comment goes, every word stays, and Ctrl+Z brings it back", () => {
    const { view, layer, cards, file } = desk(COMMENTED);
    cards.redraw();
    const resolve = layer.querySelectorAll<HTMLElement>(".comment-card__resolve")[0]!;
    resolve.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    resolve.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(file()).toBe(`Rain.\n\nCrows lift off the fence.\n\n[[c:b1 Too quiet?]]Nobody answers.[[/c:b1]]\n`);
    // Back on the paper, where the undo key is answered.
    expect(document.activeElement).toBe(view.dom);
    cards.redraw();
    expect(layer.querySelectorAll(".comment-card")).toHaveLength(1);
    expect(document.querySelector("dialog, .trouble")).toBeNull();

    // The caret was put on the words before they were let go, so Undo brings
    // the comment back without moving the paper anywhere else.
    const caret = view.state.selection.head;
    expect(view.state.doc.textBetween(caret - 25, caret)).toBe("Crows lift off the fence.");
    expect(undo(view.state, view.dispatch)).toBe(true);
    expect(view.state.selection.head).toBe(caret);
    expect(file()).toBe(COMMENTED);
    cards.redraw();
    expect([...layer.querySelectorAll(".comment-card__text")].map((text) => text.textContent)).toEqual(["Crows feel familiar.", "Too quiet?"]);
  });
});

describe("the look is the design's, in tokens (ADR-0030)", () => {
  const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
  const tokens = readFileSync(join(style, "tokens.css"), "utf8");
  const sheet = readFileSync(join(style, "comments.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const token = (name: string): string => new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1]?.trim() ?? "";

  it("has the handoff's numbers", () => {
    expect(token("--colour-orange")).toBe("#fe8019");
    expect(token("--colour-comment")).toBe("var(--colour-orange)");
    expect([token("--mix-comment-highlight"), token("--mix-comment-highlight-active")]).toEqual(["16%", "28%"]);
    expect([token("--mix-comment-underline"), token("--mix-comment-underline-active")]).toEqual(["35%", "100%"]);
    expect([token("--opacity-comment-line"), token("--opacity-comment-line-active")]).toEqual(["0.15", "0.9"]);
    expect([token("--opacity-comment-dot"), token("--opacity-comment-dot-active")]).toEqual(["0.2", "1"]);
    expect(token("--size-comment-dot")).toBe("6px");
    expect(token("--size-comment-card")).toBe("var(--size-panel)");
    expect(token("--size-panel")).toBe("240px");
    expect(token("--colour-comment-card")).toBe("var(--colour-overlay)");
    expect(token("--radius-comment-card")).toBe("var(--radius-float)");
    expect(token("--space-comment-card")).toBe("var(--space-panel)");
    expect(token("--size-comment-text")).toBe("var(--size-label)");
    expect(token("--leading-comment")).toBe("1.4");
    expect(token("--opacity-comment-card")).toBe("0.45");
    expect(token("--opacity-comment-under-panel")).toBe("0.15");
    expect(token("--size-comment-resolve")).toBe("var(--size-row)");
    expect(token("--size-comment-resolve-text")).toBe("var(--size-caption)");
    expect(token("--radius-comment-resolve")).toBe("0px");
  });

  it("blurs nothing, and multiplies no min(), max() or clamp() into a place or a width", () => {
    expect(sheet).not.toMatch(/blur|backdrop-filter|filter\s*:/);
    expect(sheet).not.toMatch(/\b(?:min|max|clamp)\(/);
  });
});
