/**
 * @vitest-environment jsdom
 *
 * The page's spacing, against the serialiser's blank-line table (ADR-0019).
 *
 * Blank lines are not elements: where one falls on the way out is a lookup on
 * the pair of element types either side of it. The space between two elements
 * on screen is the same lookup, written in CSS — and the spike left a warning
 * beside its own copy of it: *"the sibling rules below mirror the serializer's
 * speech-continuation rule exactly. If these two ever disagree, the file will
 * not round-trip."*
 *
 * In v2 the file still round-trips, because the model is canonical and nothing
 * is read back off the screen (ADR-0024). What a disagreement costs instead is
 * a page that is lying about the file — a speech drawn with a gap Fountain says
 * ends it. So the two are compared here, for **every ordered pair of element
 * types**, against the serialiser's actual output rather than against a copy of
 * its rule.
 *
 * And it is checked with the browser's own CSS parser, because
 * `docs/STANDARDS.md` names this exactly: *"JS fails loudly; CSS does not. One
 * unclosed rule in a stylesheet silently kills every rule after it, and the page
 * still renders — just wrong."*
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { gapBetween, gapLines, stylesheet, type SpacingRule } from "../../src/screenplay/geometry.ts";
import { ELEMENT_TYPES } from "../../src/screenplay/schema.ts";
import type { ElementType } from "../../src/screenplay/document.ts";
import { withSpacing } from "../support/spacing.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STYLESHEETS = ["geometry.css", "editor.css"].map((name) => join(root, "app", "src", "style", name));

let rules: readonly CSSStyleRule[];

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = STYLESHEETS.map((path) => readFileSync(path, "utf8")).join("\n");
  document.head.append(style);
  rules = [...(style.sheet?.cssRules ?? [])].filter(
    (rule): rule is CSSStyleRule => rule instanceof CSSStyleRule,
  );
});

/** One element, as the page draws it. */
function drawn(type: ElementType, squished = false): HTMLElement {
  const node = document.createElement("div");
  node.setAttribute("data-element", type);
  if (squished) node.setAttribute("data-squished", "true");
  return node;
}

/**
 * How many blank lines the stylesheet leaves between two adjacent elements.
 *
 * Of the rules that match the lower element, the most specific wins; every
 * rule here is built from attribute selectors, so the longest selector is the
 * most specific one. The value is read back as the multiple of one blank line
 * it spells: `0`, `var(--manuscript-blank)` or `calc(var(--manuscript-blank) * N)`.
 */
function blankOnScreen(previous: ElementType, next: ElementType, squished = false): number {
  const page = document.createElement("div");
  page.className = "manuscript";
  page.append(drawn(previous), drawn(next, squished));
  document.body.append(page);

  const second = page.children[1]!;
  const matching = rules
    .filter(
      (rule) =>
        rule.selectorText.includes("+") &&
        rule.style.getPropertyValue("margin-top") !== "" &&
        second.matches(rule.selectorText),
    )
    .sort((a, b) => b.selectorText.length - a.selectorText.length);
  page.remove();

  const value = matching[0]?.style.getPropertyValue("margin-top") ?? "";
  if (/^0(?:px)?$/.test(value)) return 0;
  if (value === "var(--manuscript-blank)") return 1;
  const multiple = /^calc\(var\(--manuscript-blank\) \* (\d+)\)$/.exec(value);
  if (multiple === null) throw new Error(`${previous} → ${next}: unreadable margin-top "${value}"`);
  return Number(multiple[1]);
}

describe("the stylesheet parses at all", () => {
  it("holds rules, so nothing below it was killed by a missing brace", () => {
    expect(rules.length).toBeGreaterThan(10);
    // Every rule that parsed has a selector and at least one declaration; a
    // rule that came out empty is a rule the browser gave up on.
    for (const rule of rules) {
      expect(rule.selectorText, rule.cssText).not.toBe("");
      expect(rule.style.length, rule.cssText).toBeGreaterThan(0);
    }
  });
});

describe("the page's spacing is the spacing table (ADR-0038)", () => {
  it("agrees on all 196 ordered pairs of element types", () => {
    const disagreements: string[] = [];

    for (const previous of ELEMENT_TYPES) {
      for (const next of ELEMENT_TYPES) {
        const onScreen = blankOnScreen(previous, next);
        const inTable = gapBetween(previous, next).blank;
        if (onScreen !== inTable) {
          disagreements.push(`${previous} → ${next}: ${inTable} blank lines in the table, ${onScreen} on the page`);
        }
      }
    }

    expect(disagreements).toEqual([]);
    expect(ELEMENT_TYPES.length ** 2).toBe(196);
  });

  it("agrees on a squished gap, and ignores the flag where the table does not allow it", () => {
    for (const previous of ELEMENT_TYPES) {
      for (const next of ELEMENT_TYPES) {
        expect(blankOnScreen(previous, next, true), `${previous} → ${next}`).toBe(
          gapLines(previous, next, true),
        );
      }
    }
    expect(blankOnScreen("action", "action", true)).toBe(0);
    expect(blankOnScreen("action", "dialogue", true)).toBe(1);
  });

  it("spaces a scene heading two lines and glues a speech", () => {
    // Named cases, so a wholesale failure of the comparison above still reads
    // as something rather than as an empty list.
    expect(blankOnScreen("action", "scene-heading")).toBe(2);
    expect(blankOnScreen("character", "dialogue")).toBe(0);
    expect(blankOnScreen("dialogue", "dialogue")).toBe(0);
    expect(blankOnScreen("lyrics", "lyrics")).toBe(0);
    expect(blankOnScreen("action", "action")).toBe(1);
    expect(blankOnScreen("dialogue", "action")).toBe(1);
  });

  it("draws any whole number of blank lines, not only 0 and 1", () => {
    const row: SpacingRule = { above: "action", below: "action", blank: 4, squishable: true };
    const sheet = withSpacing([row], () => stylesheet());
    expect(sheet).toContain("calc(var(--manuscript-blank) * 4)");
  });
});

describe("cut material is visibly cut, and still there (ADR-0021)", () => {
  it("strikes it through and does not hide it", () => {
    const cut = drawn("action");
    cut.setAttribute("data-omitted", "true");
    const page = document.createElement("div");
    page.className = "manuscript";
    page.append(cut);
    document.body.append(page);

    const matching = rules.filter((rule) => cut.matches(rule.selectorText));

    expect(matching.some((rule) => rule.style.getPropertyValue("text-decoration") !== "")).toBe(
      true,
    );
    // Collapsing it comes later; hiding it never does. The writer must be able
    // to read what they cut.
    expect(matching.some((rule) => rule.style.getPropertyValue("display") === "none")).toBe(false);

    page.remove();
  });

  it("marks nothing that is not cut", () => {
    const live = drawn("action");
    document.body.append(live);
    expect(live.matches("[data-omitted]")).toBe(false);
    live.remove();
  });
});
