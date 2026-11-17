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

  describe("show a save for three seconds, three pulses, before the green check", () => {
    const tokens = readFileSync(join(style, "tokens.css"), "utf8");
    const token = (name: string): string =>
      new RegExp(`--${name}:\\s*([^;]+);`).exec(tokens)![1]!.trim();
    const look = token("duration-saving");
    const LOOK = 3000;
    afterEach(() => {
      vi.useRealTimers();
      document.documentElement.style.removeProperty("--duration-saving");
    });

    function saving(): { save: HTMLElement; told: WorkspaceContext["setSaved"] } {
      vi.useFakeTimers();
      document.documentElement.style.setProperty("--duration-saving", look);
      const { into, context } = shell();
      const save = into.querySelector<HTMLElement>(".pill--save")!;
      return { save, told: context().setSaved };
    }

    it("lasts three seconds, pulsing once a second, and not at all under reduced motion", () => {
      expect(look).toBe("3s");
      // One pulse is bright, dim, bright; three of them fill the three seconds.
      expect(token("duration-save-pulse")).toBe("calc(var(--duration-saving) / 3)");
      expect(rule('.pill--save[data-state="saving"]')).toContain(
        "animation: pill-pulse var(--duration-save-pulse) ease-in-out infinite",
      );
      expect(rule('.pill--save[data-state="saving"]')).not.toContain("alternate");
      expect(editor).toMatch(
        /@keyframes pill-pulse \{\s*0%,\s*100% \{\s*opacity: 1;\s*\}\s*50% \{\s*opacity: var\(--opacity-save-dim\);\s*\}\s*\}/,
      );
      expect(editor).toMatch(
        /@media \(prefers-reduced-motion: reduce\) \{\s*\.pill--save\[data-state="saving"\] \{\s*animation: none;/,
      );
    });

    it("dims the save icon while there is unsaved work", () => {
      expect(rule('.pill--save[data-state="unsaved"]')).toContain("opacity: var(--opacity-save-dim)");
      expect(Number.parseFloat(token("opacity-save-dim"))).toBeLessThan(1);
      const { save, told } = saving();
      told("unsaved");
      expect(save.dataset["state"]).toBe("unsaved");
      expect(save.getAttribute("aria-label")).toBe("Not yet saved");
    });

    it("turns green only when the three seconds are up, for a save that landed at once", () => {
      const { save, told } = saving();
      told("unsaved");
      told("saving");
      told("saved");
      expect(save.dataset["state"]).toBe("saving");
      vi.advanceTimersByTime(LOOK - 1);
      expect(save.dataset["state"]).toBe("saving");
      vi.advanceTimersByTime(1);
      expect(save.dataset["state"]).toBe("saved");
      expect(save.getAttribute("aria-label")).toBe("Saved");
      // And it stays green until the work changes.
      vi.advanceTimersByTime(LOOK * 10);
      expect(save.dataset["state"]).toBe("saved");
      told("unsaved");
      expect(save.dataset["state"]).toBe("unsaved");
    });

    it("keeps pulsing for a save that takes longer, and turns green when it lands", () => {
      const { save, told } = saving();
      told("saving");
      vi.advanceTimersByTime(LOOK * 2);
      expect(save.dataset["state"]).toBe("saving");
      told("saved");
      expect(save.dataset["state"]).toBe("saved");
    });

    it("goes back to dim at once when the work changes mid-pulse, and never shows the green check", () => {
      const { save, told } = saving();
      // Every state the pill passes through, from the value each change replaced.
      const changes = new MutationObserver(() => {});
      changes.observe(save, { attributeFilter: ["data-state"], attributeOldValue: true });
      told("saving");
      told("saved");
      vi.advanceTimersByTime(LOOK / 2);
      told("unsaved");
      expect(save.dataset["state"]).toBe("unsaved");
      vi.advanceTimersByTime(LOOK * 2);
      expect(save.dataset["state"]).toBe("unsaved");

      // The next save pulses again, from the start, and this one is let finish.
      told("saving");
      expect(save.dataset["state"]).toBe("saving");
      told("saved");
      vi.advanceTimersByTime(LOOK - 1);
      expect(save.dataset["state"]).toBe("saving");
      vi.advanceTimersByTime(1);
      expect(save.dataset["state"]).toBe("saved");
      const seen = [...changes.takeRecords().map((change) => change.oldValue), save.dataset["state"]];
      expect(seen).toEqual(["saved", "saving", "unsaved", "saving", "saved"]);
    });

    it("never turns green after a save that left work unsaved, or that failed", () => {
      // The session reports `unsaved` when the save fails, or when words were
      // typed while it ran; the error itself is said elsewhere.
      const { save, told } = saving();
      told("saving");
      told("unsaved");
      expect(save.dataset["state"]).toBe("unsaved");
      vi.advanceTimersByTime(LOOK * 2);
      expect(save.dataset["state"]).toBe("unsaved");
    });

    it("keeps one saving look through a second save started during it", () => {
      const { save, told } = saving();
      told("saving");
      told("saved");
      vi.advanceTimersByTime(LOOK / 2);
      told("saving");
      vi.advanceTimersByTime(LOOK / 2);
      // The second save has not landed: still saving.
      expect(save.dataset["state"]).toBe("saving");
      told("saved");
      expect(save.dataset["state"]).toBe("saved");
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
