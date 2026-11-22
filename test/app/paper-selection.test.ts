/**
 * A selection on the paper is the paper inverted (Noah, 2026-11-21): the ink
 * is the highlight and the selected text is the paper's colour, for every
 * element on it — the dim ones too — and a search result's jump is the same
 * native selection.
 *
 * There is no browser here to paint a `::selection`, so the colours are
 * resolved from the tokens the way the webview resolves them: the rule's
 * `var()`s, followed through `tokens.css`. Then again with the ink and the
 * paper swapped as a white paper would swap them, which must swap the
 * selection with them.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
const sheet = (name: string): string => readFileSync(join(style, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const editor = sheet("editor.css");

/** The declarations of the rule whose selector list is exactly this. */
function rule(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  const found = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m").exec(editor);
  if (found === null) throw new Error(`no rule for ${selector}`);
  return Object.fromEntries(
    found[1]!
      .split(";")
      .map((declaration) => declaration.split(":").map((part) => part.trim()))
      .filter((pair) => pair.length === 2 && pair[0] !== "")
      .map(([name, value]) => [name!, value!]),
  );
}

/** Every custom property `:root` gives, as written. */
const rootTokens = (): Map<string, string> =>
  new Map([...sheet("tokens.css").matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1]!, match[2]!.trim()]));

/** A value with its `var()`s followed to the end, as the webview would. */
function resolve(value: string, tokens: ReadonlyMap<string, string>, depth = 0): string {
  if (depth > 20) throw new Error(`a token refers round in a circle: ${value}`);
  return value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
    const found = tokens.get(name);
    if (found === undefined) throw new Error(`no token ${name}`);
    return resolve(found, tokens, depth + 1);
  });
}

const hex = (value: string): [number, number, number] => {
  const found = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (found === null) throw new Error(`not a plain colour: ${value}`);
  return [found[1]!, found[2]!, found[3]!].map((part) => parseInt(part, 16)) as [number, number, number];
};

/** WCAG's contrast ratio between two plain colours. */
function contrast(one: string, other: string): number {
  const luminance = (colour: string): number => {
    const [r, g, b] = hex(colour).map((channel) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(one), luminance(other)].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const SELECTION = ".manuscript::selection, .manuscript ::selection";

describe("a selection on the paper", () => {
  it("is the ink behind and the paper's colour in front, by token", () => {
    const selected = rule(SELECTION);
    expect(selected["background"]).toBe("var(--colour-text)");
    expect(selected["color"]).toBe("var(--colour-page)");
  });

  it("resolves, on today's dark paper, to the paper inverted", () => {
    const tokens = rootTokens();
    const selected = rule(SELECTION);
    const ink = resolve("var(--colour-text)", tokens);
    const paper = resolve("var(--colour-page)", tokens);
    expect(resolve(selected["background"]!, tokens)).toBe(ink);
    expect(resolve(selected["color"]!, tokens)).toBe(paper);
    expect(contrast(ink, paper)).toBeGreaterThanOrEqual(4.5);
  });

  it("inverts with them on a white paper: dark highlight, white text", () => {
    const tokens = rootTokens();
    const darkInk = resolve("var(--colour-page)", tokens);
    // A white paper remakes the paper as white and the ink as dark.
    const white = new Map(tokens).set("--colour-page", "#ffffff").set("--colour-text", darkInk);
    const selected = rule(SELECTION);
    expect(resolve(selected["background"]!, white)).toBe(darkInk);
    expect(resolve(selected["color"]!, white)).toBe("#ffffff");
    expect(contrast(darkInk, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("is every element's on the paper, so dim text turns the paper's colour too and stays readable", () => {
    // The descendant form reaches a cue's blue, a heading's gold, faint and cut text alike.
    expect(SELECTION).toContain(".manuscript ::selection");
    // Faint on the ink would be hard to read; the paper's colour on it is not.
    const tokens = rootTokens();
    const highlight = resolve("var(--colour-text)", tokens);
    expect(contrast(highlight, resolve("var(--colour-faint)", tokens))).toBeLessThan(4.5);
    expect(contrast(highlight, resolve("var(--colour-page)", tokens))).toBeGreaterThanOrEqual(4.5);
  });

  it("is the only selection look on the paper: nothing gives a part of it its own", () => {
    const others = readdirSync(style)
      .filter((name) => name.endsWith(".css"))
      .flatMap((name) => [...sheet(name).matchAll(/([^{}]*::selection[^{}]*)\{/g)].map((match) => `${name}: ${match[1]!.trim()}`));
    expect(others).toEqual([`editor.css: ${SELECTION.replace(", ", ",\n")}`]);
  });
});
