/**
 * The search dialog (the desk design, §2.5): what it shows, how it is driven,
 * and that its look is read off the tokens.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { openSearch } from "../../app/src/workspaces/editor/search-dialog.ts";
import { asksToSearch } from "../../app/src/screens/shortcuts.ts";
import type { ScreenplayDocument } from "../../src/screenplay/document.ts";
import { toEditorDocument } from "../../src/screenplay/editor.ts";

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
const css = readFileSync(join(style, "search.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = readFileSync(join(style, "tokens.css"), "utf8");

const script: ScreenplayDocument = {
  titlePage: [],
  elements: [
    { type: "action", text: "Rain on the glass. MAYA waits.", forced: false },
    { type: "character", text: "MAYA", forced: false },
    { type: "dialogue", text: "Not yet.", forced: false },
  ],
  comments: [],
  endsWithNewline: false,
};
const doc = toEditorDocument(script);

function open() {
  const into = document.createElement("div");
  document.body.replaceChildren(into);
  const jump = vi.fn();
  const closed = vi.fn();
  openSearch(into, { doc: () => doc, pageOf: (i) => (i === 0 ? 1 : i === 1 ? 2 : undefined), jump, closed });
  const field = into.querySelector<HTMLInputElement>(".search__query")!;
  const press = (key: string) =>
    field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  const type = (text: string) => {
    field.value = text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return { into, field, press, type, jump, closed };
}

describe("the search dialog", () => {
  it("opens as just its field, with the Lucide icon and the Esc hint", () => {
    const { into } = open();
    expect(into.querySelector(".search__field svg.search__icon")).not.toBeNull();
    expect(into.querySelector<HTMLInputElement>(".search__query")!.placeholder).toBe("Search…");
    expect(into.querySelector(".search__field .search__hint")!.textContent).toBe("[Esc]");
    expect(into.querySelector<HTMLElement>(".search__count")!.hidden).toBe(true);
    expect(into.querySelector<HTMLElement>(".search__results")!.hidden).toBe(true);
  });

  it("lists matches with the word marked and a page label", () => {
    const { into, type } = open();
    type("maya");
    expect(into.querySelector(".search__count")!.textContent).toBe("2 results");
    const rows = [...into.querySelectorAll(".search__result")];
    expect(rows.map((r) => r.querySelector(".search__match")!.textContent)).toEqual(["MAYA", "MAYA"]);
    expect(rows.map((r) => r.querySelector(".search__page")?.textContent)).toEqual(["p. 1", "p. 2"]);
    expect(rows.map((r) => r.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(into.querySelector(".search__footer")!.textContent).toBe("moveEnter jumpEsc close");
  });

  it("says when nothing was found", () => {
    const { into, type } = open();
    type("zebra");
    expect(into.querySelector(".search__count")!.textContent).toBe("No results");
  });

  it("moves with the arrows, jumps on Enter, and closes", () => {
    const { press, type, jump, closed, into } = open();
    type("maya");
    press("ArrowDown");
    press("Enter");
    expect(jump).toHaveBeenCalledOnce();
    expect(doc.textBetween(jump.mock.calls[0]![0].from, jump.mock.calls[0]![0].to)).toBe("MAYA");
    expect(jump.mock.calls[0]![0].manuscriptElement).toBe(1);
    expect(closed).toHaveBeenCalledOnce();
    expect(into.querySelector(".search")).toBeNull();
  });

  it("closes on Escape without the window hearing it, which would close the project", () => {
    const { press, closed } = open();
    const heard = vi.fn();
    window.addEventListener("keydown", heard);
    press("Escape");
    window.removeEventListener("keydown", heard);
    expect(closed).toHaveBeenCalledOnce();
    expect(heard).not.toHaveBeenCalled();
  });

  it("closes on a click on the veil", () => {
    const { into, closed } = open();
    into.querySelector(".search")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(closed).toHaveBeenCalledOnce();
  });

  it("jumps on a click on a result", () => {
    const { into, type, jump } = open();
    type("maya");
    into.querySelectorAll(".search__result")[1]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(jump.mock.calls[0]![0].manuscriptElement).toBe(1);
  });
});

describe("asking to search", () => {
  const press = { key: "Enter", altKey: true, ctrlKey: false, metaKey: false };
  it("is Alt+Enter and nothing else", () => {
    expect(asksToSearch(press)).toBe(true);
    expect(asksToSearch({ ...press, altKey: false })).toBe(false);
    expect(asksToSearch({ ...press, ctrlKey: true })).toBe(false);
    expect(asksToSearch({ ...press, key: "f" })).toBe(false);
  });
});

describe("its look", () => {
  const dims = (name: string) => Number(new RegExp(`${name}:\\s*(\\d+)px`).exec(tokens)![1]);
  it("is 768px wide, 56px from the top, a 36px field, 28px rows", () => {
    expect(dims("--measure-search")).toBe(768);
    expect(dims("--space-search-top")).toBe(56);
    expect(dims("--size-field")).toBe(36);
    expect(dims("--size-result-row")).toBe(28);
    expect(dims("--space-panel")).toBe(12);
  });
  it("veils the window at 70% of the desk colour", () => {
    expect(tokens).toMatch(/--veil:\s*color-mix\(in srgb, var\(--colour-base\) 70%, transparent\)/);
    expect(css).toMatch(/\.search\s*\{[^}]*background: var\(--veil\)/);
  });
  it("marks the word as an accent block with the desk's text, and focuses on the overlay", () => {
    expect(css).toMatch(/\.search__match\s*\{[^}]*background: var\(--colour-accent\)[^}]*color: var\(--colour-on-accent\)/);
    expect(css).toMatch(/\[aria-selected="true"\]\s*\{[^}]*background: var\(--colour-overlay\)/);
  });
});
