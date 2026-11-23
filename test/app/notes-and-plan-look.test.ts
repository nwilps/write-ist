/**
 * How Notes and Plan are drawn, read from their stylesheets.
 *
 * Notes is a window floating on the desk, shaped like a laptop's screen: seven
 * tenths of the workspace's width, 16:9, centred, scrolling inside itself with
 * no scrollbar, and on a short window shrunk, still 16:9, to stay clear of the
 * bar and the pills. Its bar of pills is exactly the window's width, its tabs
 * scrolling sideways between the folder and +. It is not the Editor's paper.
 *
 * Plan's grid is a dot at each corner of its squares, opaque and quiet, a
 * column of them on every edge, under the lines and under every card. A beat
 * line and the end of the target span exactly a column of dots, so each sits
 * dead centre on one at any display scale; the cards sit over all of it.
 * (That nothing is drawn again mid-drag is `notes-and-plan.test.ts`.)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src");

function sheet(path: string): string {
  return readFileSync(join(app, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

function rule(path: string, selector: string): string {
  // A selector list may be written over several lines.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/, /g, ",\\s*");
  const found = [...sheet(path).matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "gm"))];
  if (found.length === 0) throw new Error(`no rule for ${selector}`);
  return found.map((match) => match[1]).join("\n").replace(/\s+/g, " ");
}

const tokens = sheet("style/tokens.css");
function token(name: string): string {
  const found = new RegExp(`${name}:\\s*([^;]+);`).exec(tokens);
  if (found === null) throw new Error(`no token ${name}`);
  return found[1]!.replace(/\s+/g, " ").trim();
}
/** A token's value in pixels, following `var()`s to a number. */
function pixels(name: string): number {
  const value = token(name);
  const named = /^var\((--[\w-]+)\)$/.exec(value);
  if (named !== null) return pixels(named[1]!);
  const found = /^(\d+(?:\.\d+)?)px$/.exec(value);
  if (found === null) throw new Error(`${name} is not a length: ${value}`);
  return Number(found[1]);
}

const NOTES = "workspaces/notes/notes.css";
const PLAN = "workspaces/plan/plan.css";

describe("Notes, a floating window", () => {
  const notes = rule(NOTES, ".notes");
  const window = rule(NOTES, ".notes-window");

  it("is seven tenths of the workspace's width and 16:9, measured against the Notes desk, the bar above it counted", () => {
    expect(token("--fraction-notes-width")).toBe("0.7");
    expect(token("--ratio-notes")).toBe("16 / 9");
    expect(token("--size-notes-room-width")).toBe("100cqw");
    expect(token("--size-notes-room-height")).toBe("100cqh");
    expect(rule(NOTES, ".notes-desk")).toContain("container-type: size");
    expect(rule(NOTES, ".notes-desk")).toMatch(/align-items: center;.*justify-content: center/);
    expect(window).toContain(
      "width: min( calc(var(--size-notes-room-width) * var(--fraction-notes-width)), " +
        "calc( (var(--size-notes-room-height) - var(--space-notes-inset) * 2 - var(--size-notes-bar) - var(--space-notes-bar-gap)) * var(--ratio-notes) ) )",
    );
    expect(notes).toContain("width: 100%");
    expect(notes).toContain("aspect-ratio: var(--ratio-notes)");
  });

  // The width rule above, worked through for a wide workspace and a short one.
  const drawn = (roomWidth: number, roomHeight: number) => {
    const inset = pixels("--space-notes-inset");
    const bar = pixels("--size-notes-bar") + pixels("--space-notes-bar-gap");
    const width = Math.min(roomWidth * 0.7, (roomHeight - inset * 2 - bar) * (16 / 9));
    const height = width / (16 / 9);
    return { width, height, above: (roomHeight - height - bar) / 2 };
  };

  it("with room, is 70% wide and 16:9", () => {
    const { width, height } = drawn(1200, 900);
    expect(width).toBe(840);
    expect(height).toBeCloseTo(472.5);
  });

  it("on a short window, keeps 16:9 by narrowing, and with its bar stays clear of the workspace bar and the pills", () => {
    // The smallest window Write-ist opens (560 × 420), less the workspace's sides.
    for (const [roomWidth, roomHeight] of [[1200, 400], [528, 420]] as const) {
      const { width, height, above } = drawn(roomWidth, roomHeight);
      expect(width).toBeLessThanOrEqual(roomWidth * 0.7);
      expect(width / height).toBeCloseTo(16 / 9);
      expect(above).toBeGreaterThanOrEqual(pixels("--space-notes-inset") - 0.001);
    }
    expect(drawn(1200, 400).width).toBeLessThan(840);
    expect(pixels("--space-notes-inset")).toBeGreaterThanOrEqual(pixels("--space-desk-foot"));
  });

  it("scrolls inside itself, never growing with the note, and draws no scrollbar", () => {
    expect(notes).toContain("overflow-y: auto");
    expect(notes).toContain("overflow-x: hidden");
    expect(notes).toContain("scrollbar-width: none");
    expect(rule(NOTES, ".notes::-webkit-scrollbar")).toContain("display: none");
    expect(window).toContain("flex: none");
    expect(notes).not.toMatch(/(?:^|[\s;])height:|min-height|flex: 1/);
    expect(rule(NOTES, ".notes-desk")).not.toContain("overflow");
  });

  it("wears what floating surfaces wear, not the paper's width, corners or shadow", () => {
    expect(notes).toContain("background: var(--colour-raised)");
    expect(notes).toContain("border: var(--rule-thin) solid var(--colour-border)");
    expect(notes).toContain("border-radius: var(--radius-float)");
    expect(notes).toContain("box-shadow: var(--shadow-float)");
    expect(sheet(NOTES)).not.toMatch(/--page-width|--paper-zoom|--radius-paper|--shadow-paper|--colour-page/);
  });

  it("says, quietly, when no note is open", () => {
    const empty = rule(NOTES, ".notes__empty");
    expect(empty).toContain("color: var(--colour-faint)");
    expect(empty).not.toMatch(/alarm|accent/);
    expect(rule(NOTES, ".notes__empty[hidden]")).toContain("display: none");
  });
});

describe("Notes' bar of pills", () => {
  const bar = rule(NOTES, ".notes-bar");
  const strip = rule(NOTES, ".notes-tabs");
  const tab = rule(NOTES, ".notes-tab");
  const pill = rule(NOTES, ".notes-bar__pill");

  it("is exactly as wide as the window, and can never be pushed wider by its tabs", () => {
    expect(bar).toContain("width: 100%");
    expect(bar).toContain("min-width: 0");
    expect(bar).toContain("box-sizing: border-box");
    expect(rule(NOTES, ".notes-window")).toContain("min-width: 0");
    // The folder and + keep their size; the tabs between them give way, and scroll.
    expect(pill).toContain("flex: none");
    expect(strip).toContain("flex: 1 1 auto");
    expect(strip).toContain("min-width: 0");
  });

  it("scrolls its tabs sideways with no scrollbar, and never wraps them", () => {
    expect(strip).toContain("overflow-x: auto");
    expect(strip).toContain("overflow-y: hidden");
    expect(strip).toContain("scrollbar-width: none");
    expect(rule(NOTES, ".notes-tabs::-webkit-scrollbar")).toContain("display: none");
    expect(strip).not.toContain("flex-wrap");
    expect(tab).toContain("flex: none");
    expect(tab).toContain("max-width: var(--measure-notes-tab)");
    expect(rule(NOTES, ".notes-tab__name")).toContain("text-overflow: ellipsis");
    // Room for the pills' shadows, taken back so the bar keeps its height.
    expect(strip).toContain("padding: var(--space-notes-tab-shadow) 0");
    expect(strip).toContain("margin: calc(var(--space-notes-tab-shadow) * -1) 0");
  });

  it("draws the folder, the tabs and + as the app's pills, the note in front in the accent", () => {
    for (const each of [pill, tab]) {
      expect(each).toContain("background: var(--colour-raised)");
      expect(each).toContain("border: var(--rule-thin) solid var(--colour-border-strong)");
      expect(each).toContain("border-radius: var(--radius-float)");
      expect(each).toContain("box-shadow: var(--shadow-float)");
      expect(each).toContain("height: var(--size-notes-bar)");
    }
    expect(token("--size-notes-bar")).toBe("var(--size-pill)");
    expect(rule(NOTES, '.notes-tab[aria-selected="true"]')).toContain("color: var(--colour-accent)");
  });
});

describe("Plan's grid, a steady field of dots", () => {
  const grid = rule(PLAN, ".plan__grid");
  const dots = rule(PLAN, ".plan__dots");
  const column = rule(PLAN, ".plan__dot-column");

  it("is drawn as dots at the squares' corners, a column of them on every edge, not as lines", () => {
    expect(grid).not.toContain("gradient");
    expect(dots).toContain("z-index: var(--layer-plan-dots)");
    expect(dots).toContain("pointer-events: none");
    expect(column).toContain("left: calc(var(--dot-cell) * var(--size-plan-cell) - var(--size-plan-dot) / 2)");
    expect(column).toContain("width: var(--size-plan-dot)");
    expect(column).toContain("background-image: var(--image-plan-dot)");
    expect(column).toContain("background-size: 100% var(--size-plan-cell)");
    expect(column).toContain("background-position: 0 calc(var(--size-plan-dot) / -2)");
    expect(token("--image-plan-dot")).toBe(
      "linear-gradient( to bottom, var(--colour-plan-dot) var(--size-plan-dot), transparent var(--size-plan-dot) )",
    );
    expect(tokens).not.toContain("--colour-plan-line");
  });

  it("draws every dot the same: a whole number of pixels, centred by a whole one, in an opaque colour", () => {
    const size = pixels("--size-plan-dot");
    expect(Number.isInteger(size)).toBe(true);
    expect(Number.isInteger(size / 2)).toBe(true);
    expect(Number.isInteger(pixels("--size-plan-cell"))).toBe(true);
    // Mixed with the board's own colour, never with transparent.
    expect(token("--colour-plan-dot")).toMatch(/^color-mix\(in srgb, var\(--colour-[\w-]+\) \d+%, var\(--colour-raised\)\)$/);
  });

  it("is quieter than the beat lines and the end of the target (Noah, 2026-11-23)", () => {
    const share = (name: string) => Number(/ (\d+)%, var\(--colour-raised\)\)$/.exec(token(name))![1]);
    expect(share("--colour-plan-dot")).toBeLessThanOrEqual(25);
    expect(share("--colour-plan-dot")).toBeLessThan(share("--colour-plan-beat"));
    expect(token("--colour-plan-end")).toBe("var(--colour-faint)");
  });

  it("puts every card over the dots and the lines, so nothing of the grid is drawn on one", () => {
    const layer = (name: string) => Number(token(name));
    expect(layer("--layer-plan-dots")).toBeLessThan(layer("--layer-plan-lines"));
    expect(layer("--layer-plan-lines")).toBeLessThan(layer("--layer-plan-cards"));
    expect(layer("--layer-plan-cards")).toBeLessThan(layer("--layer-plan-drag"));
    expect(rule(PLAN, ".plan__card")).toContain("z-index: var(--layer-plan-cards)");
    expect(rule(PLAN, '.plan__card[data-dragging="true"]')).toContain("z-index: var(--layer-plan-drag)");
    // The layers are the board's own, so they share one stacking context: the
    // grid is not one, or the lines beside it could not go between its dots and its cards.
    expect(rule(PLAN, ".plan__surface")).toContain("isolation: isolate");
    expect(grid).not.toMatch(/isolation|z-index/);
    // Opaque: a card's face and edge are mixed from opaque colours only.
    expect(rule(PLAN, ".plan__card")).not.toMatch(/transparent|opacity/);
  });

  it("does not see-through a dragged card, so the grid under it never shows", () => {
    expect(rule(PLAN, '.plan__card[data-dragging="true"]')).not.toContain("opacity");
    expect(tokens).not.toContain("--opacity-plan-drag");
  });

  it("draws the beats and the end of the target over exactly the span of a column of dots, so each is dead centre on it", () => {
    // The one rule that makes it so: a line is a dot wide, and starts half a dot before the edge, as the column does.
    expect(token("--size-plan-line")).toBe("var(--size-plan-dot)");
    const beat = rule(PLAN, ".plan__beat");
    expect(beat).toContain("left: calc(var(--beat-cell) * var(--size-plan-cell) - var(--size-plan-line) / 2)");
    expect(beat).toContain("border-left: var(--size-plan-line) dashed var(--colour-plan-beat)");
    expect(beat).toContain("width: 0");
    expect(beat).toContain("z-index: var(--layer-plan-lines)");
    const end = rule(PLAN, ".plan__end");
    expect(end).toContain("left: calc(var(--plan-length) * var(--size-plan-cell) - var(--size-plan-line) / 2)");
    expect(end).toContain("width: var(--size-plan-line)");
    expect(end).toContain("background: var(--colour-plan-end)");
    expect(end).toContain("z-index: var(--layer-plan-lines)");
    expect(end).not.toContain("border");
    expect(token("--colour-plan-beat")).toContain("var(--colour-raised)");
    expect(token("--colour-plan-beat")).not.toContain("transparent");
  });
});

describe("Plan's card panel, the card itself to write on", () => {
  const panel = rule(PLAN, ".plan__panel");
  const fields = rule(PLAN, ".plan__panel-title, .plan__description");

  it("is compact, and wears the card's own tinted face and edge", () => {
    expect(panel).toContain("width: min(var(--measure-plan-panel), 100%)");
    expect(panel).toContain("padding: var(--space-tight)");
    expect(panel).toContain("background: color-mix(in srgb, var(--card-tint) var(--mix-plan-card), var(--colour-overlay))");
    expect(rule(PLAN, '.plan__panel[data-colour="blue"]')).toContain("--card-tint: var(--colour-plan-blue)");
  });

  it("has a title and description with no box at rest, a hairline under the pointer, and a firmer edge while typed in", () => {
    expect(fields).toContain("background: transparent");
    expect(fields).toContain("border: var(--rule-thin) solid transparent");
    expect(fields).toContain("cursor: text");
    expect(rule(PLAN, ".plan__description")).toContain("resize: none");
    expect(rule(PLAN, ".plan__panel-title:hover, .plan__description:hover")).toContain("border-color: var(--colour-plan-field-edge)");
    expect(rule(PLAN, ".plan__panel-title:focus, .plan__description:focus")).toContain("background: var(--colour-plan-field-focus)");
    expect(rule(PLAN, ".plan__panel-title::placeholder, .plan__description::placeholder")).toContain("color: var(--colour-faint)");
  });
});
