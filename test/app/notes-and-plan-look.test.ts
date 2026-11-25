/**
 * How Notes and Plan are drawn, read from their stylesheets.
 *
 * Notes is a window floating on the desk, shaped like a laptop's screen: seven
 * tenths of the workspace's width, 16:9, centred, scrolling inside itself with
 * no scrollbar, and on a short window shrunk, still 16:9, to stay clear of the
 * bar and the pills. Its bar of pills is never wider than the window: the
 * folder, tabs all of one width, and + beside the last, the bottom pills' gap
 * between each and under the bar, the tabs scrolling sideways on a window too
 * narrow for them. It is not the Editor's paper.
 *
 * Plan's grid is a dot at each corner of its squares, opaque and quiet, a
 * column of them on every edge, under the lines and under every card. A beat
 * line and the end of the target span exactly a column of dots, so each sits
 * dead centre on one at any display scale; the cards sit over all of it.
 * (That nothing is drawn again mid-drag is `notes-and-plan.test.ts`.)
 *
 * Plan's grid panel is as far below the workspace bar as it is from the
 * window's sides; under it, the Structure button and up to three open cards beside
 * it, the card growing down to the bottom pills' margin and no further, with
 * its colours in a three-by-three picker of nine.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MOST_OPEN_NOTES } from "../../src/notes/tabs.ts";
import { MOST_OPEN_CARDS } from "../../src/plan/open-cards.ts";

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
    expect(window).toContain("width: var(--size-notes-window-width)");
    expect(token("--size-notes-window-width")).toBe(
      "min( calc(var(--size-notes-room-width) * var(--fraction-notes-width)), " +
        "calc( (var(--size-notes-room-height) - var(--space-notes-inset) * 2 - var(--size-notes-bar) - var(--space-pill-gap)) * var(--ratio-notes) ) )",
    );
    expect(notes).toContain("width: 100%");
    expect(notes).toContain("aspect-ratio: var(--ratio-notes)");
  });

  // The width rule above, worked through for a wide workspace and a short one.
  const drawn = (roomWidth: number, roomHeight: number) => {
    const inset = pixels("--space-notes-inset");
    const bar = pixels("--size-notes-bar") + pixels("--space-pill-gap");
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

  it("is never wider than the window, and can never be pushed wider by its tabs", () => {
    expect(bar).toContain("width: 100%");
    expect(bar).toContain("min-width: 0");
    expect(bar).toContain("box-sizing: border-box");
    expect(rule(NOTES, ".notes-window")).toContain("min-width: 0");
    // The folder and + keep their size; the tabs give way, and scroll, only when there is no room.
    expect(pill).toContain("flex: none");
    expect(strip).toContain("flex: 0 1 auto");
    expect(strip).toContain("min-width: 0");
  });

  it("puts + right beside the last tab, and beside the folder when no tab is open", () => {
    // In the bar's order: folder, the strip of tabs, +. The strip is as wide as
    // its tabs (it does not grow), so + follows the last one.
    expect(strip).not.toMatch(/flex: 1|flex-grow: [1-9]/);
    expect(bar).not.toContain("justify-content: space-between");
    expect(pill).not.toMatch(/margin-left: auto|margin-inline-start: auto/);
    // Empty, it is not drawn, so there is one gap between the folder and +, not two.
    expect(rule(NOTES, ".notes-tabs:empty")).toContain("display: none");
  });

  it("keeps the bottom pills' gap between every pill, and between the bar and the window", () => {
    expect(token("--space-pill-gap")).toBe("var(--space-panel)");
    expect(bar).toContain("gap: var(--space-pill-gap)");
    expect(strip).toContain("gap: var(--space-pill-gap)");
    expect(rule(NOTES, ".notes-window")).toContain("gap: var(--space-pill-gap)");
    // The foot's own pills use the same token, so the two can never drift apart.
    expect(rule("style/editor.css", ".pills")).toContain("gap: var(--space-pill-gap)");
    // No gap of Notes' own is left to drift.
    expect(tokens).not.toMatch(/--space-notes-(bar|tab)-gap/);
    expect(sheet(NOTES)).not.toMatch(/--space-notes-(bar|tab)-gap/);
  });

  it("draws every tab the same width, its name centred on the whole tab and cut short with …, the × at its right", () => {
    expect(tab).toContain("width: var(--measure-notes-tab)");
    expect(tab).not.toMatch(/(?:^|[\s;])(max|min)-width/);
    expect(tab).toContain("flex: none");
    const name = rule(NOTES, ".notes-tab__name");
    expect(name).toContain("text-align: center");
    expect(name).toContain("flex: 1 1 auto");
    expect(name).toContain("text-overflow: ellipsis");
    expect(name).toContain("overflow: hidden");
    expect(tab).toContain("white-space: nowrap");
    // The left padding is the ×, and the gaps either side of it, so the name sits in the middle of the tab.
    expect(tab).toContain("gap: var(--space-hair)");
    expect(tab).toContain("padding: 0 var(--space-hair) 0 calc(var(--space-hair) * 2 + var(--size-notes-tab-close))");
    expect(rule(NOTES, ".notes-tab__rename")).toContain("text-align: center");
  });

  it("measures the tabs so six of them, the folder, + and their gaps are exactly the window's width, at any window", () => {
    // Six, as many as may be open, in the stylesheet and in the code.
    expect(token("--count-notes-tabs")).toBe(String(MOST_OPEN_NOTES));
    expect(MOST_OPEN_NOTES).toBe(6);
    // From the window's own width token, the one the window is drawn at, so the two cannot drift.
    expect(token("--measure-notes-tab-fit")).toBe(
      "calc( (var(--size-notes-window-width) - var(--size-notes-bar) * 2 - var(--space-pill-gap) * (var(--count-notes-tabs) + 1)) / var(--count-notes-tabs) )",
    );
    expect(token("--measure-notes-tab")).toBe("max(var(--measure-notes-tab-least), var(--measure-notes-tab-fit))");
    expect(rule(NOTES, ".notes-tab")).toContain("font-size: var(--size-label)");
    // Worked through: the window as drawn, the tab as measured from it, and the bar they make.
    const gap = pixels("--space-pill-gap");
    const pill = pixels("--size-notes-bar");
    const least = 12 * 0.6 * pixels("--size-label");
    expect(token("--measure-notes-tab-least")).toBe("12ch");
    const windowAt = (width: number, height: number) => {
      const room = { width: width - pixels("--space-roomy") * 2, height };
      return Math.min(room.width * 0.7, (room.height - pixels("--space-notes-inset") * 2 - pill - gap) * (16 / 9));
    };
    const tabAt = (window: number) => Math.max(least, (window - pill * 2 - gap * 7) / 6);
    const barAt = (window: number, tabs: number) => pill * 2 + tabs * tabAt(window) + (tabs + 1) * gap;
    // 1920 × 1080, 1440 × 900, 1280 × 800 and a short 1600 × 600: six tabs fill the window to the pixel.
    for (const [width, height] of [[1920, 1040], [1440, 860], [1280, 760], [1600, 600]] as const) {
      const window = windowAt(width, height);
      expect(barAt(window, 6)).toBeCloseTo(window, 9);
      expect(tabAt(window)).toBeGreaterThan(least);
    }
    // Fewer open: the same width each, + beside the last, short of the window's edge.
    expect(tabAt(windowAt(1920, 1040))).toBeCloseTo((windowAt(1920, 1040) - pill * 2 - gap * 7) / 6, 9);
    expect(barAt(windowAt(1920, 1040), 3)).toBeLessThan(windowAt(1920, 1040));
    // The smallest window Write-ist opens: the tabs stop at their least width, and the strip scrolls inside the window.
    const smallest = windowAt(560, 420);
    expect(tabAt(smallest)).toBe(least);
    expect(barAt(smallest, 6)).toBeGreaterThan(smallest);
    expect(strip).toContain("overflow-x: auto");
    expect(rule(NOTES, ".notes-tab")).toContain("flex: none");
  });

  it("scrolls its tabs sideways with no scrollbar, and never wraps them", () => {
    expect(strip).toContain("overflow-x: auto");
    expect(strip).toContain("overflow-y: hidden");
    expect(strip).toContain("scrollbar-width: none");
    expect(rule(NOTES, ".notes-tabs::-webkit-scrollbar")).toContain("display: none");
    expect(strip).not.toContain("flex-wrap");
    expect(tab).toContain("flex: none");
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

  it("greys + while six tabs are open, as an unavailable button is greyed elsewhere", () => {
    expect(rule(NOTES, ".notes-bar__pill:disabled")).toContain("opacity: var(--opacity-unavailable)");
    expect(rule(NOTES, ".notes-bar__pill:hover:not(:disabled), .notes-bar__pill:focus-visible, .notes-bar__pill[aria-expanded=\"true\"]")).toContain(
      "color: var(--colour-text)",
    );
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

describe("Plan's grid panel, placed", () => {
  it("is as far below the workspace bar as it is from the window's left and right, by one token", () => {
    // The sides: Plan's host is held to the room, and nothing inside adds to it.
    expect(rule(PLAN, '.workspace[data-workspace="plan"]')).toContain("padding: 0 var(--space-plan-edge)");
    expect(rule(PLAN, ".plan__board")).not.toMatch(/margin/);
    // The top: the bar's top margin, the bar, then the same room.
    expect(rule(PLAN, ".plan-desk")).toContain("padding: var(--space-plan-top) 0 var(--space-desk-edge)");
    expect(token("--space-plan-top")).toBe("calc(var(--space-desk-edge) + var(--size-pill) + var(--space-plan-edge))");
    expect(rule("style/editor.css", ".workspace-bar")).toContain("top: var(--space-desk-edge)");
    expect(rule("style/editor.css", ".workspace-bar__pill")).toContain("height: var(--size-pill)");
    // Worked through: the bar's foot is at 44px, the panel's top at 60px; 16px, as at each side.
    const barFoot = pixels("--space-desk-edge") + pixels("--size-pill");
    const top = barFoot + pixels("--space-plan-edge");
    expect(top - barFoot).toBe(pixels("--space-plan-edge"));
    expect(pixels("--space-plan-edge")).toBe(16);
  });
});

describe("Plan's open cards, beside the Structure button", () => {
  const panel = rule(PLAN, ".plan__panel");
  const under = rule(PLAN, ".plan__under");
  const desk = rule(PLAN, ".plan-desk");

  it("sits right of the Structure button, as far from it as the button is from the window's edge, and as far under the grid", () => {
    // Side by side, the gap between them the window's edge's room.
    expect(under).toContain("display: flex");
    expect(under).toContain("gap: var(--space-plan-edge)");
    expect(rule(PLAN, '.workspace[data-workspace="plan"]')).toContain("padding: 0 var(--space-plan-edge)");
    // Both hang from the top of the row, so both are the desk's gap under the grid.
    expect(desk).toContain("gap: var(--space-plan-edge)");
    expect(rule(PLAN, ".plan__controls")).toContain("align-self: flex-start");
    expect(panel).toContain("top: 0");
    expect(panel).toContain("left: 0");
    expect(rule(PLAN, ".plan__card-slot")).toContain("position: relative");
  });

  it("grows down with its description to the bottom pills' margin and no further, and then scrolls inside, with no scrollbar", () => {
    // The desk fills the workspace and its content never sizes it: its foot is the bottom pills' margin.
    expect(desk).toContain("container-type: size");
    expect(desk).toMatch(/padding: [^;]* var\(--space-desk-edge\)/);
    expect(rule("style/editor.css", ".pills")).toContain("bottom: var(--space-desk-edge)");
    // The row takes what the grid leaves, and the card is at most as tall as the row.
    expect(under).toContain("flex: 1 1 0");
    expect(under).toContain("min-height: 0");
    expect(panel).toContain("max-height: 100%");
    expect(panel).toContain("position: absolute");
    // As tall as what is written: the field and an unseen copy of its text share one cell.
    const box = rule(PLAN, ".plan__description-box");
    expect(box).toContain("display: grid");
    expect(box).toContain("flex: 0 1 auto");
    expect(box).toContain("min-height: 0");
    const shared = rule(PLAN, ".plan__description, .plan__description-box::after");
    expect(shared).toContain("grid-area: 1 / 1");
    expect(shared).toContain("min-height: var(--size-plan-description)");
    expect(shared).toContain("white-space: pre-wrap");
    expect(rule(PLAN, ".plan__description-box::after")).toContain('content: attr(data-value) " "');
    expect(rule(PLAN, ".plan__description-box::after")).toContain("visibility: hidden");
    expect(rule(PLAN, ".plan__description")).toContain("resize: none");
  });

  it("scrolls the description in the field itself, the one scroller the wheel and the caret share, to its start and its end (round 2)", () => {
    // In round 1 the box scrolled, with the field shrunk to the visible height inside it: the wheel
    // slid the field away over blank room, and the caret scrolled the field where the wheel never reached.
    const box = rule(PLAN, ".plan__description-box");
    // The box only clips; its one row gives way to it, so the field is the visible height and holds the rest.
    expect(box).toContain("grid-template-rows: minmax(0, 1fr)");
    expect(box).toContain("overflow: clip");
    expect(box).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
    const field = rule(PLAN, ".plan__description");
    expect(field).toContain("height: 100%");
    expect(field).toContain("overflow-y: auto");
    expect(field).not.toMatch(/overflow(-y)?:\s*hidden/);
    // No scrollbar drawn.
    expect(field).toContain("scrollbar-width: none");
    expect(rule(PLAN, ".plan__description::-webkit-scrollbar")).toContain("display: none");
    // Nothing in code scrolls the box behind the field's back.
    expect(readFileSync(join(app, "workspaces", "plan", "plan.ts"), "utf8")).not.toMatch(/descriptionBox\.scroll/);
  });

  it("is compact, and wears the card's own tinted face and edge", () => {
    expect(panel).toContain("padding: var(--space-tight)");
    expect(panel).toContain("background: color-mix(in srgb, var(--card-tint) var(--mix-plan-card), var(--colour-overlay))");
    expect(rule(PLAN, '.plan__panel[data-colour="blue"]')).toContain("--card-tint: var(--colour-plan-blue)");
  });

  it("has three places side by side, each card compact, all three always fitting beside the Structure button", () => {
    expect(token("--count-plan-open-cards")).toBe(String(MOST_OPEN_CARDS));
    expect(MOST_OPEN_CARDS).toBe(3);
    expect(token("--space-plan-panels")).toBe("var(--space-plan-edge)");
    expect(panel).toContain(
      "width: min( var(--measure-plan-panel), calc((100% - var(--space-plan-panels) * (var(--count-plan-open-cards) - 1)) / var(--count-plan-open-cards)) )",
    );
    // A place is the card's own width and a gap along.
    expect(panel).toContain("transform: translateX(calc(var(--plan-position) * (100% + var(--space-plan-panels))))");
    // Worked through: the slot is the workspace less its sides, the Structure button and the gap beside it.
    const gap = pixels("--space-plan-edge");
    const compact = 46 * 0.6 * pixels("--size-body");
    const button = 130;
    for (const window of [1920, 1440, 1280, 1024, 800, 560]) {
      const room = window - gap * 2 - button - gap;
      const width = Math.min(compact, (room - gap * 2) / 3);
      expect(width * 3 + gap * 2).toBeLessThanOrEqual(room + 1e-9);
      if (window >= 1920) expect(width).toBe(compact);
      else expect(width).toBeGreaterThan(0);
    }
  });

  it("slides a card to its new place, eased, and the pushed-out card off the window to the right, fading", () => {
    expect(panel).toContain(
      "transition: transform var(--duration-plan-panel) var(--ease-plan-panel), opacity var(--duration-plan-panel) var(--ease-plan-panel)",
    );
    expect(token("--duration-plan-panel")).toBe("240ms");
    expect(token("--ease-plan-panel")).toMatch(/^cubic-bezier\(/);
    const leaving = rule(PLAN, '.plan__panel[data-leaving="true"]');
    expect(leaving).toContain(
      "transform: translateX(calc(var(--plan-position) * (100% + var(--space-plan-panels)) + var(--size-plan-room-width)))",
    );
    expect(token("--size-plan-room-width")).toBe("100cqw");
    expect(leaving).toContain("opacity: var(--opacity-plan-panel-gone)");
    expect(token("--opacity-plan-panel-gone")).toBe("0");
    expect(leaving).toContain("pointer-events: none");
    // While dragged it follows the pointer at once, over the others; let go, it slides into its place.
    const dragging = rule(PLAN, '.plan__panel[data-dragging="true"]');
    expect(dragging).toContain("transform: translateX(calc(var(--plan-position) * (100% + var(--space-plan-panels)) + var(--plan-drag-x)))");
    // It always has an offset, so that rule is never left without one: nothing at rest (round 2's snap to the first place).
    expect(panel).toContain("--plan-drag-x: var(--size-plan-panel-still)");
    expect(token("--size-plan-panel-still")).toBe("0px");
    expect(dragging).not.toMatch(/transition:[^;]*transform/);
    expect(dragging).toContain("z-index: var(--layer-plan-panel-drag)");
    expect(sheet(PLAN)).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.plan__panel \{\s*transition: none;/);
  });

  it("has a grip on its top edge, centred and faint, brighter under the pointer", () => {
    const grip = rule(PLAN, ".plan__panel-grip");
    expect(grip).toContain("justify-content: center");
    expect(grip).toContain("margin-top: calc(var(--space-tight) * -1)");
    expect(grip).toContain("color: var(--colour-plan-panel-grip)");
    expect(grip).toContain("cursor: grab");
    expect(token("--colour-plan-panel-grip")).toBe("var(--colour-faint)");
    expect(rule(PLAN, ".plan__panel-grip:hover")).toContain("color: var(--colour-plan-panel-grip-hover)");
    expect(token("--colour-plan-panel-grip-hover")).toBe("var(--colour-muted)");
  });

  it("draws the description a step quieter than the title", () => {
    expect(rule(PLAN, ".plan__panel-title, .plan__description")).toContain("color: var(--colour-text)");
    expect(rule(PLAN, ".plan__description")).toContain("color: var(--colour-plan-description)");
    expect(token("--colour-plan-description")).toBe("var(--colour-muted)");
    expect(rule(PLAN, ".plan__panel-title::placeholder, .plan__description::placeholder")).toContain("color: var(--colour-faint)");
  });

  it("has a title and description with no box at rest, a hairline under the pointer, and a firmer edge while typed in", () => {
    const fields = rule(PLAN, ".plan__panel-title, .plan__description-box");
    expect(fields).toContain("background: transparent");
    expect(fields).toContain("border: var(--rule-thin) solid transparent");
    expect(rule(PLAN, ".plan__panel-title, .plan__description")).toContain("cursor: text");
    expect(rule(PLAN, ".plan__panel-title:hover, .plan__description-box:hover")).toContain("border-color: var(--colour-plan-field-edge)");
    expect(rule(PLAN, ".plan__panel-title:focus, .plan__description-box:focus-within")).toContain("background: var(--colour-plan-field-focus)");
    expect(rule(PLAN, ".plan__panel-title::placeholder, .plan__description::placeholder")).toContain("color: var(--colour-faint)");
  });

  it("has along its foot the palette at the left, the pages centred, and the trash at the right", () => {
    const foot = rule(PLAN, ".plan__panel-foot");
    expect(foot).toContain("display: grid");
    expect(foot).toContain("grid-template-columns: 1fr auto 1fr");
    expect(rule(PLAN, ".plan__palette")).toContain("justify-self: start");
    expect(rule(PLAN, ".plan__stepper")).toContain("justify-self: center");
    expect(rule(PLAN, ".plan__delete")).toContain("justify-self: end");
    expect(rule(PLAN, ".plan__delete:hover, .plan__delete:focus-visible")).toContain("color: var(--colour-alarm)");
  });

  it("offers nine colours, three by three, in a picker of Write-ist's own, each a token", () => {
    const menu = rule(PLAN, ".plan__palette-menu");
    expect(menu).toContain("display: grid");
    expect(menu).toContain("grid-template-columns: repeat(var(--count-plan-palette-columns), var(--size-plan-swatch))");
    expect(token("--count-plan-palette-columns")).toBe("3");
    expect(menu).toContain("position: absolute");
    expect(menu).toContain("z-index: var(--layer-menu)");
    // The menus' look: their ground, their edge, the float corner and shadow.
    expect(menu).toContain("background: var(--colour-raised)");
    expect(menu).toContain("border: var(--rule-menu) solid var(--colour-base)");
    expect(menu).toContain("box-shadow: var(--shadow-float)");
    expect(rule(PLAN, ".plan__palette-menu[hidden]")).toContain("display: none");
    // The same round swatch as before.
    const swatch = rule(PLAN, ".plan__swatch");
    expect(swatch).toContain("width: var(--size-plan-swatch)");
    expect(swatch).toContain("height: var(--size-plan-swatch)");
    expect(swatch).toContain("border-radius: var(--radius-round)");
    expect(pixels("--radius-round") * 2).toBeGreaterThanOrEqual(pixels("--size-plan-swatch"));
    // Nine named colours, each a token, each drawn on a card, the card panel and a swatch.
    const names = ["plain", "sand", "yellow", "orange", "red", "purple", "blue", "aqua", "green"];
    for (const name of names) {
      expect(token(`--colour-plan-${name}`)).not.toBe("");
      if (name === "plain") continue;
      for (const kind of ["card", "panel", "swatch"]) {
        expect(rule(PLAN, `.plan__${kind}[data-colour="${name}"]`)).toContain(`--card-tint: var(--colour-plan-${name})`);
      }
    }
    expect(tokens.match(/--colour-plan-(?!field|dot|past|end|beat|description|panel)[\w]+:/g)).toHaveLength(9);
  });
});
