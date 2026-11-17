/**
 * The pills along the foot of the desk (the desk design, §2.3): the project's
 * name, the counts, the save state — and no full-width status bar.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountShell } from "../../app/src/shell/shell.ts";
import type { WorkspaceContext } from "../../app/src/shell/workspace.ts";
import { countsText, wordsIn } from "../../src/screenplay/counts.ts";
import { wordCount } from "../../src/project/ledger.ts";
import { editorStateFor } from "../../src/screenplay/editing.ts";
import { parse } from "../../src/screenplay/parse.ts";

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
const editor = readFileSync(join(style, "editor.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = [...editor.matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "gm"))];
  if (found.length === 0) throw new Error(`no rule for ${selector}`);
  return found.map((match) => match[1]).join("\n");
}

function shell(): { into: HTMLElement; context: () => WorkspaceContext } {
  const into = document.createElement("div");
  const quiet = (): (() => void) => () => {};
  let given: WorkspaceContext | undefined;
  mountShell(into, {
    project: { path: "/p", marker: { name: "Big Fish" } } as never,
    filesystem: {} as never,
    workspaces: [
      {
        id: "x",
        name: "X",
        key: "1",
        icon: [],
        mount: (_host, context) => {
          given = context;
          return { unmount: async () => true };
        },
      },
    ],
    onClose: () => {},
    onHome: () => {},
    whenSwitchedAway: quiet,
    whenSwitchedBack: quiet,
    chooseCopyLocation: async () => undefined,
    choosePdfLocation: async () => undefined,
    ledger: () => undefined,
  });
  return { into, context: () => given! };
}

describe("the bottom pills", () => {
  it("name the project at the left, and there is no status bar", () => {
    const { into } = shell();
    expect(into.querySelector(".statusbar")).toBeNull();
    expect(into.querySelector("footer")).toBeNull();
    expect(into.querySelector(".pills--left .pill--project")?.textContent).toBe("Big Fish");
  });

  it("show the workspace's counts at the right, and hide the pill until there are some", () => {
    const { into, context } = shell();
    const counts = into.querySelector<HTMLElement>(".pills--right .pill--counts")!;
    expect(counts.hidden).toBe(true);
    context().setStatus("Pages: ~3 / 112 | Words: 18,402");
    expect(counts.hidden).toBe(false);
    expect(counts.textContent).toBe("Pages: ~3 / 112 | Words: 18,402");
  });

  it("put the save pill last, saved and green to begin with, and follow the state it is told", () => {
    const { into, context } = shell();
    const right = into.querySelector(".pills--right")!;
    const save = right.lastElementChild as HTMLElement;
    expect(save.classList.contains("pill--save")).toBe(true);
    expect(save.dataset["state"]).toBe("saved");
    expect(save.getAttribute("aria-label")).toBe("Saved");
    expect(save.querySelector("svg")).not.toBeNull();
    const drawn = (): string => save.innerHTML;
    const savedDrawing = drawn();

    context().setSaved("saving");
    expect(save.dataset["state"]).toBe("saving");
    expect(save.getAttribute("aria-label")).toBe("Saving");
    expect(drawn()).not.toBe(savedDrawing);

    context().setSaved("unsaved");
    expect(save.dataset["state"]).toBe("unsaved");
    context().setSaved("saved");
    expect(drawn()).toBe(savedDrawing);
  });

  describe("hold a save that lands at once on its pulse for one pulse", () => {
    const tokens = readFileSync(join(style, "tokens.css"), "utf8");
    const pulse = /--duration-pulse:\s*([^;]+);/.exec(tokens)![1]!.trim();
    const PULSE = Number.parseFloat(pulse);
    afterEach(() => {
      vi.useRealTimers();
      document.documentElement.style.removeProperty("--duration-pulse");
    });

    function saving(): { save: HTMLElement; told: WorkspaceContext["setSaved"] } {
      vi.useFakeTimers();
      document.documentElement.style.setProperty("--duration-pulse", pulse);
      const { into, context } = shell();
      const save = into.querySelector<HTMLElement>(".pill--save")!;
      return { save, told: context().setSaved };
    }

    it("so the pulse is seen, and then says what it was told", () => {
      expect(pulse).toMatch(/^\d+ms$/);
      const { save, told } = saving();
      told("saving");
      told("saved");
      expect(save.dataset["state"]).toBe("saving");
      vi.advanceTimersByTime(PULSE - 1);
      expect(save.dataset["state"]).toBe("saving");
      vi.advanceTimersByTime(1);
      expect(save.dataset["state"]).toBe("saved");
      expect(save.getAttribute("aria-label")).toBe("Saved");
    });

    it("fades bright to dim and back at least three times while it holds, and not under reduced motion", () => {
      // The hold stays 700 ms; the icon's fade is the hold's sixth, so the
      // pulse is three full cycles, bright to dim to bright, ending bright.
      expect(pulse).toBe("700ms");
      const beat = /--duration-pulse-beat:\s*([^;]+);/.exec(tokens)![1]!.trim();
      const divisor = Number(/^calc\(var\(--duration-pulse\) \/ (\d+)\)$/.exec(beat)![1]);
      // `alternate`: one iteration is one fade; a full cycle is two.
      expect(divisor / 2).toBeGreaterThanOrEqual(3);
      expect(Number.isInteger(divisor / 2)).toBe(true);
      const editor = readFileSync(join(style, "editor.css"), "utf8");
      expect(editor).toMatch(
        /\.pill--save\[data-state="saving"\] \{\s*animation: pill-pulse var\(--duration-pulse-beat\) ease-in-out infinite alternate;/,
      );
      expect(editor).toMatch(
        /@media \(prefers-reduced-motion: reduce\) \{\s*\.pill--save\[data-state="saving"\] \{\s*animation: none;/,
      );
    });

    it("does not hold a save that took longer than a pulse", () => {
      const { save, told } = saving();
      told("saving");
      vi.advanceTimersByTime(PULSE * 2);
      told("unsaved");
      expect(save.dataset["state"]).toBe("unsaved");
    });

    it("draws only the last state it was told, and keeps pulsing through a second save", () => {
      const { save, told } = saving();
      told("saving");
      told("saved");
      vi.advanceTimersByTime(PULSE / 2);
      told("saving");
      told("unsaved");
      vi.advanceTimersByTime(PULSE / 2 - 1);
      expect(save.dataset["state"]).toBe("saving");
      vi.advanceTimersByTime(1);
      expect(save.dataset["state"]).toBe("unsaved");
      vi.advanceTimersByTime(PULSE * 2);
      expect(save.dataset["state"]).toBe("unsaved");
    });
  });

  it("are the design's: 32px raised pills, 12px from the edge, 12px apart, a green check and a pulse", () => {
    expect(rule(".pill")).toContain("height: var(--size-pill)");
    expect(rule(".pill")).toContain("background: var(--colour-raised)");
    expect(rule(".pill")).toContain("border-radius: var(--radius-float)");
    expect(rule(".pill")).toContain("padding: 0 var(--space-roomy)");
    expect(rule(".pills")).toContain("bottom: var(--space-desk-edge)");
    expect(rule(".pills")).toContain("gap: var(--space-pill-gap)");
    expect(rule(".pills--left")).toContain("left: var(--space-desk-edge)");
    expect(rule(".pills--right")).toContain("right: var(--space-desk-edge)");
    expect(rule(".pill--save")).toContain("width: var(--size-pill)");
    expect(rule('.pill--save[data-state="saved"]')).toContain("var(--colour-affirm)");
    expect(rule('.pill--save[data-state="saving"]')).toContain("animation: pill-pulse");
  });
});

describe("the counts", () => {
  it("read as the design has them, with thousands separated", () => {
    expect(countsText(3, 112, 18402)).toBe("Pages: ~3 / 112 | Words: 18,402");
    expect(countsText(0, 0, 0)).toBe("Pages: ~0 / 0 | Words: 0");
  });

  it("count the words the ledger counts, from the editor's document", () => {
    const script = "INT. KITCHEN - NIGHT\n\nRain on the glass.\n\nNELL\nSlow, but mine.\n\n/*\nCut words here.\n*/\n\nEXT. HARBOUR - DAWN\n";
    const document = parse(script);
    expect(wordCount(document)).toBeGreaterThan(0);
    expect(wordsIn(editorStateFor(document).doc)).toBe(wordCount(document));
  });
});
