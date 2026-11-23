// @vitest-environment jsdom
/**
 * The autocomplete offer as the view draws it (slice 2, step 9): ghost text
 * for the first choice, a list only when there is more than one, the chosen
 * row marked, and all of it kept out of the writer's own text.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { drawOffer } from "../../app/src/workspaces/editor/autocomplete-draw.ts";

describe("the drawn offer", () => {
  it("is ghost text alone for a single choice", () => {
    const drawn = drawOffer({ ghost: "WARD", choices: ["EDWARD"], selected: 0 });
    expect(drawn.querySelector(".autocomplete__ghost")?.textContent).toBe("WARD");
    expect(drawn.querySelector(".autocomplete__list")).toBeNull();
  });

  it("is a list for several, with the one Tab would take marked", () => {
    const drawn = drawOffer({ ghost: "AWN", choices: ["DAY", "DAWN", "DUSK"], selected: 1 });
    const rows = [...drawn.querySelectorAll(".autocomplete__choice")];
    expect(rows.map((row) => row.textContent)).toEqual(["DAY", "DAWN", "DUSK"]);
    expect(rows.map((row) => row.classList.contains("autocomplete__choice--selected"))).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("is not the writer's text: not editable, not announced", () => {
    const drawn = drawOffer({ ghost: "X", choices: ["X"], selected: 0 });
    expect(drawn.contentEditable).toBe("false");
    expect(drawn.getAttribute("aria-hidden")).toBe("true");
  });
});

/**
 * The list looks like the app's other menus because it *is* one of them: it
 * wears `drop-menu` and each row `drop-menu__item`, as the dialog select's tray
 * does. So the surface, the border, the corner, the shadow, the type and the
 * rows come from `menus.css`, and the list's own rule may not set any of them
 * again, where they would drift.
 */
describe("the drawn list's look", () => {
  const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
  const sheet = (name: string): string => readFileSync(join(style, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (file: string, selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const found = [...sheet(file).matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "gm"))];
    if (found.length === 0) throw new Error(`no rule for ${selector}`);
    return found.map((match) => match[1]).join("\n");
  };

  it("is a menu, and each row a menu's row", () => {
    const drawn = drawOffer({ ghost: "AWN", choices: ["DAY", "DAWN"], selected: 0 });
    expect(drawn.querySelector(".autocomplete__list")!.classList.contains("drop-menu")).toBe(true);
    for (const row of drawn.querySelectorAll(".autocomplete__choice")) expect(row.classList.contains("drop-menu__item")).toBe(true);
  });

  it("takes the menus' surface, border, corner, shadow, type and spacing", () => {
    const menu = rule("menus.css", ".drop-menu");
    for (const declaration of [
      "background: var(--colour-raised)",
      "border: var(--rule-menu) solid var(--colour-base)",
      "border-radius: var(--radius-float)",
      "box-shadow: var(--shadow-float)",
      "font-size: var(--size-label)",
      "line-height: var(--leading-label)",
      "color: var(--colour-muted)",
      "padding: var(--space-panel)",
      "gap: var(--space-row-gap)",
    ])
      expect(menu).toContain(declaration);
    const row = rule("menus.css", ".drop-menu__item");
    for (const declaration of ["height: var(--size-row)", "padding: 0 var(--space-row-label)", "border-radius: var(--radius-slight)"])
      expect(row).toContain(declaration);
  });

  it("sets none of them again, so it cannot drift from the menus", () => {
    const own = `${rule("autocomplete.css", ".drop-menu.autocomplete__list")}\n${rule("autocomplete.css", ".autocomplete__choice")}`;
    expect(own).not.toMatch(/\b(background|border|border-radius|box-shadow|padding|gap|height|font-size|line-height|color)\s*:/);
  });

  it("is the interface's face, not the manuscript's", () => {
    const own = rule("autocomplete.css", ".drop-menu.autocomplete__list");
    expect(own).toContain("font-family: var(--face-interface)");
    expect(own).toContain("font-weight: var(--weight-regular)");
  });

  it("lights the one Tab or Enter would take as a menu lights its focused row, and a dialog select its active one", () => {
    const lit = rule("autocomplete.css", ".autocomplete__list .autocomplete__choice--selected");
    const focused = rule("menus.css", ".drop-menu__item:hover:not(:disabled),\n.drop-menu__item:focus");
    const active = rule("home.css", ".dialog-select__tray .dialog-select__option--active");
    for (const declaration of ["background: var(--colour-overlay)", "color: var(--colour-accent)"]) {
      expect(lit).toContain(declaration);
      expect(focused).toContain(declaration);
      expect(active).toContain(declaration);
    }
  });
});
