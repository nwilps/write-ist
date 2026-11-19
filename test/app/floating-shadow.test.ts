/**
 * Everything that floats over the app wears one shadow, the workspace bar's:
 * the menus, the dialogs, the search panel and the autocomplete list. The
 * veil behind a dialog does not, and no rule brings a shadow of its own.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");

function sheet(name: string): string {
  return readFileSync(join(style, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

function rule(file: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = [...sheet(file).matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "gm"))];
  if (found.length === 0) throw new Error(`no rule for ${selector}`);
  return found.map((match) => match[1]).join("\n");
}

describe("the shadow on floating surfaces", () => {
  it.each([
    ["menus.css", ".drop-menu"],
    ["home.css", ".new-project-dialog"],
    ["search.css", ".search__panel"],
    ["autocomplete.css", ".autocomplete__list"],
  ])("%s gives %s the shared shadow", (file, selector) => {
    expect(rule(file, selector)).toContain("box-shadow: var(--shadow-float)");
  });

  it("leaves it off the search veil, and the right-click menu inherits it", () => {
    expect(rule("search.css", ".search")).not.toContain("box-shadow");
    expect(rule("menus.css", ".drop-menu--context")).not.toContain("box-shadow");
  });

  it("is the only shadow in the styles", () => {
    const shadows = readdirSync(style)
      .filter((name) => name.endsWith(".css"))
      .flatMap((name) => [...sheet(name).matchAll(/box-shadow:\s*([^;]+);/g)].map((match) => match[1]));
    expect(new Set(shadows)).toEqual(new Set(["var(--shadow-float)"]));
  });
});
