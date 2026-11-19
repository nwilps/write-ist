/**
 * Nothing in the application draws a scrollbar, and everything that scrolled
 * still scrolls. One rule in `app.css` hides every bar, so a scroller added
 * later goes without one too; each scroller below keeps its `overflow`, so the
 * wheel, the trackpad and the keys still move it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
const uncommented = (name: string) => readFileSync(join(style, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const block = (name: string, selector: string) =>
  uncommented(name).match(new RegExp(`(?:^|\\})\\s*${escape(selector)}\\s*\\{([^}]*)\\}`))?.[1];

describe("no scrollbars, anywhere", () => {
  it("are hidden once, for every element, in both kinds of webview", () => {
    expect(block("app.css", "*")).toMatch(/scrollbar-width:\s*none/);
    expect(block("app.css", "::-webkit-scrollbar")).toMatch(/display:\s*none/);
  });

  it("are not drawn back by any stylesheet", () => {
    for (const name of readdirSync(style).filter((f) => f.endsWith(".css"))) {
      const css = uncommented(name);
      expect(css, name).not.toMatch(/scrollbar-width:\s*(auto|thin)/);
      expect(css, name).not.toMatch(/scrollbar-(color|gutter)/);
      expect(css, name).not.toMatch(/::-webkit-scrollbar-(thumb|track|button|corner)/);
    }
  });

  it.each([
    ["the paper", "editor.css", ".shell__view", /overflow:\s*auto/],
    ["the scene list", "panels.css", ".panel__scenes", /overflow-y:\s*auto/],
    ["the title page's fields", "title-page.css", ".title-page__fields", /overflow-y:\s*auto/],
    ["a title page box of lines", "title-page.css", ".title-page .title-page__lines", /overflow-y:\s*auto/],
    ["search results", "search.css", ".search__results", /overflow-y:\s*auto/],
    ["a right-click menu", "menus.css", ".drop-menu--context", /overflow-y:\s*auto/],
    ["the Open Project list", "open-project.css", ".projects", /overflow-y:\s*auto/],
    ["a dialog's drop-down", "home.css", ".dialog-select__list", /overflow-y:\s*auto/],
  ])("leave %s scrolling", (_, name, selector, overflow) => {
    expect(block(name, selector), selector).toMatch(overflow);
  });
});
