/**
 * The pills along the foot of the desk (the desk design, §2.3): the project's
 * name, the counts, the save state — and no full-width status bar.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mountShell } from "../../app/src/shell/shell.ts";
import type { WorkspaceContext } from "../../app/src/shell/workspace.ts";
import { countsText, wordsIn } from "../../app/src/workspaces/editor/counts.ts";
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
    whenSwitchedAway: quiet,
    whenSwitchedBack: quiet,
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

  it("are the design's: 32px raised pills, 12px from the edge, 8px apart, a green check and a pulse", () => {
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
