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
import { serialise } from "../../src/screenplay/serialise.ts";
import { ELEMENT_TYPES } from "../../src/screenplay/schema.ts";
import type { Element, ElementType } from "../../src/screenplay/document.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STYLESHEET = join(root, "app", "src", "style", "editor.css");

let rules: readonly CSSStyleRule[];

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = readFileSync(STYLESHEET, "utf8");
  document.head.append(style);
  rules = [...(style.sheet?.cssRules ?? [])].filter(
    (rule): rule is CSSStyleRule => rule instanceof CSSStyleRule,
  );
});

/** One element, as the page draws it. */
function drawn(type: ElementType): HTMLElement {
  const node = document.createElement("div");
  node.setAttribute("data-element", type);
  return node;
}

/** Whether the stylesheet puts no space between two adjacent elements. */
function gluedOnScreen(previous: ElementType, next: ElementType): boolean {
  const page = document.createElement("div");
  page.className = "manuscript";
  page.append(drawn(previous), drawn(next));
  document.body.append(page);

  const second = page.children[1]!;
  // The parser normalises `0` to `0px`; both spell no space at all.
  const glued = rules.some(
    (rule) =>
      /^0(?:px)?$/.test(rule.style.getPropertyValue("margin-top")) &&
      second.matches(rule.selectorText),
  );

  page.remove();
  return glued;
}

/** Whether the serialiser writes a blank line between two adjacent elements. */
function gluedInFile(previous: ElementType, next: ElementType): boolean {
  const element = (type: ElementType): Element => ({
    type,
    text: "x",
    forced: false,
    ...(type === "section" ? { depth: 1 } : {}),
  });

  const written = serialise({
    titlePage: [],
    elements: [element(previous), element(next)],
    comments: [],
    endsWithNewline: false,
  });
  return !written.includes("\n\n");
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

describe("the page's spacing is the serialiser's blank-line table", () => {
  it("agrees on all 196 ordered pairs of element types", () => {
    const disagreements: string[] = [];

    for (const previous of ELEMENT_TYPES) {
      for (const next of ELEMENT_TYPES) {
        const onScreen = gluedOnScreen(previous, next);
        const inFile = gluedInFile(previous, next);
        if (onScreen !== inFile) {
          disagreements.push(
            `${previous} → ${next}: ${inFile ? "no blank line" : "a blank line"} in the file, ` +
              `${onScreen ? "no space" : "a space"} on the page`,
          );
        }
      }
    }

    expect(disagreements).toEqual([]);
    expect(ELEMENT_TYPES.length ** 2).toBe(196);
  });

  it("glues a speech together and spaces two action lines apart", () => {
    // Named cases, so a wholesale failure of the comparison above still reads
    // as something rather than as an empty list.
    expect(gluedOnScreen("character", "dialogue")).toBe(true);
    expect(gluedOnScreen("dialogue", "dialogue")).toBe(true);
    expect(gluedOnScreen("parenthetical", "dialogue")).toBe(true);
    expect(gluedOnScreen("centered", "centered")).toBe(true);
    expect(gluedOnScreen("lyrics", "lyrics")).toBe(true);
    expect(gluedOnScreen("action", "action")).toBe(false);
    expect(gluedOnScreen("dialogue", "action")).toBe(false);
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
