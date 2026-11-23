/**
 * How Notes and Plan are drawn, read from their stylesheets.
 *
 * Notes is a window floating on the desk, shaped like a laptop's screen: three
 * quarters of the workspace's width, 16:9, centred, scrolling inside itself,
 * and on a short window shrunk, still 16:9, to stay clear of the bar and the
 * pills. It is not the Editor's paper.
 *
 * Plan's grid is a dot at each corner of its squares, opaque, on a layer over
 * the cards and their shadows, so that nothing a card does — a drag included —
 * changes how a dot looks. The beats and the end of the target stay lines.
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
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  it("is three quarters of the workspace's width and 16:9, measured against the Notes desk", () => {
    expect(token("--fraction-notes-width")).toBe("0.75");
    expect(token("--ratio-notes")).toBe("16 / 9");
    expect(token("--size-notes-room-width")).toBe("100cqw");
    expect(token("--size-notes-room-height")).toBe("100cqh");
    expect(rule(NOTES, ".notes-desk")).toContain("container-type: size");
    expect(rule(NOTES, ".notes-desk")).toMatch(/align-items: center;.*justify-content: center/);
    expect(notes).toContain("aspect-ratio: var(--ratio-notes)");
    expect(notes).toContain(
      "width: min( calc(var(--size-notes-room-width) * var(--fraction-notes-width)), " +
        "calc((var(--size-notes-room-height) - var(--space-notes-inset) * 2) * var(--ratio-notes)) )",
    );
  });

  // The width rule above, worked through for a wide workspace and a short one.
  const drawn = (roomWidth: number, roomHeight: number) => {
    const inset = pixels("--space-notes-inset");
    const width = Math.min(roomWidth * 0.75, (roomHeight - inset * 2) * (16 / 9));
    return { width, height: width / (16 / 9), above: (roomHeight - width / (16 / 9)) / 2 };
  };

  it("with room, is 75% wide and 16:9", () => {
    const { width, height } = drawn(1200, 900);
    expect(width).toBe(900);
    expect(height).toBeCloseTo(506.25);
  });

  it("on a short window, keeps 16:9 by narrowing, and stays clear of the bar and the pills", () => {
    // The smallest window Write-ist opens (560 × 420), less the workspace's sides.
    for (const [roomWidth, roomHeight] of [[1200, 400], [528, 420]] as const) {
      const { width, height, above } = drawn(roomWidth, roomHeight);
      expect(width).toBeLessThanOrEqual(roomWidth * 0.75);
      expect(width / height).toBeCloseTo(16 / 9);
      expect(above).toBeGreaterThanOrEqual(pixels("--space-notes-inset"));
    }
    expect(drawn(1200, 400).width).toBeLessThan(900);
    expect(pixels("--space-notes-inset")).toBeGreaterThanOrEqual(pixels("--space-desk-foot"));
  });

  it("scrolls inside itself, never growing with the notes", () => {
    expect(notes).toContain("overflow-y: auto");
    expect(notes).toContain("overflow-x: hidden");
    expect(notes).toContain("flex: none");
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
});

describe("Plan's grid, a steady field of dots", () => {
  const grid = rule(PLAN, ".plan__grid");
  const dots = rule(PLAN, ".plan__grid::after");

  it("is drawn as dots at the squares' corners, not as lines", () => {
    expect(grid).not.toContain("gradient");
    expect(grid).toContain("isolation: isolate");
    expect(dots).toContain("background-image: var(--image-plan-dot)");
    expect(dots).toContain("background-size: var(--size-plan-cell) var(--size-plan-cell)");
    expect(dots).toContain("background-position: calc(var(--size-plan-dot) / -2) calc(var(--size-plan-dot) / -2)");
    expect(dots).toContain("pointer-events: none");
    expect(token("--image-plan-dot")).toBe(
      "conic-gradient( at var(--size-plan-dot) var(--size-plan-dot), transparent 75%, var(--colour-plan-dot) 0 )",
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

  it("is over every card and its shadow, and a dot never falls on a card", () => {
    expect(dots).toContain("z-index: var(--layer-plan-dots)");
    expect(Number(token("--layer-plan-dots"))).toBeGreaterThan(Number(token("--layer-plan-drag")));
    // Half a dot either side of a corner; a card sits this far inside its squares.
    expect(pixels("--size-plan-dot") / 2).toBeLessThan(pixels("--space-plan-card"));
  });

  it("does not see-through a dragged card, so the grid under it never shows", () => {
    expect(rule(PLAN, '.plan__card[data-dragging="true"]')).not.toContain("opacity");
    expect(tokens).not.toContain("--opacity-plan-drag");
  });

  it("keeps the beats and the end of the target as lines, in opaque colours, clear of the cards' shadows", () => {
    expect(rule(PLAN, ".plan__beat")).toContain("border-left: var(--rule-thin) dashed var(--colour-plan-beat)");
    expect(token("--colour-plan-beat")).toContain("var(--colour-raised)");
    expect(token("--colour-plan-beat")).not.toContain("transparent");
    const end = rule(PLAN, ".plan__end");
    expect(end).toContain("border-left: var(--rule-thin) solid var(--colour-plan-end)");
    expect(end).toContain("z-index: var(--layer-plan-dots)");
    expect(token("--colour-plan-end")).toBe("var(--colour-faint)");
  });
});
