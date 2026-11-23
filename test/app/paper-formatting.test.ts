// @vitest-environment jsdom
/**
 * A project's own formatting on the paper (`paper-formatting.ts`,
 * `editor.css`), and New Project's list of types as Settings shapes it —
 * Settings ▸ New Project Defaults, read (Noah, 2026-11-21).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { projectTypeSelect } from "../../app/src/screens/new-project.ts";
import { formattingAttributes } from "../../app/src/workspaces/editor/paper-formatting.ts";
import { DEFAULT_FORMATTING } from "../../src/screenplay/formatting.ts";

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");

let rules: CSSStyleRule[] = [];
beforeAll(() => {
  const sheet = document.createElement("style");
  sheet.textContent = ["geometry.css", "editor.css", "sheets.css"].map((name) => readFileSync(join(style, name), "utf8")).join("\n");
  document.head.append(sheet);
  rules = [...(sheet.sheet?.cssRules ?? [])].filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule);
});

/**
 * A simple selector's weight, as the cascade weighs it: classes, attributes
 * and pseudo-classes (`:not` by what it holds), then nothing for `*` and `>`.
 * The stylesheets here use no ids and no type selectors on the paper.
 */
const weight = (selector: string): number =>
  (selector.match(/\.[\w-]+|\[[^\]]*\]|:(?!not\()[\w-]+/g) ?? []).length;

/** The value the cascade gives the last of `children` for `property`, on a manuscript with `attributes`. */
function setting(attributes: Record<string, string>, children: readonly HTMLElement[], property: string): string | undefined {
  const paper = document.createElement("div");
  paper.className = "manuscript";
  for (const [name, value] of Object.entries(attributes)) paper.setAttribute(name, value);
  paper.append(...children);
  document.body.append(paper);
  const target = children.at(-1)!;
  let best: { weight: number; value: string } | undefined;
  for (const rule of rules) {
    const value = rule.style.getPropertyValue(property);
    if (value === "") continue;
    for (const branch of rule.selectorText.split(/,(?![^(]*\))/)) {
      if (!target.matches(branch)) continue;
      // Later wins a tie, as in the cascade.
      if (best === undefined || weight(branch) >= best.weight) best = { weight: weight(branch), value };
    }
  }
  paper.remove();
  return best?.value;
}

const line = (type: string): HTMLElement => {
  const node = document.createElement("div");
  node.setAttribute("data-element", type);
  return node;
};
const seam = (): HTMLElement => {
  const node = document.createElement("div");
  node.className = "sheet-break";
  return node;
};

describe("the paper's attributes", () => {
  it("are none for a project that never chose, so it looks as it always did", () => {
    expect(formattingAttributes(DEFAULT_FORMATTING)).toEqual({});
  });

  it("say bold transitions, regular headings, and one line before a heading", () => {
    expect(formattingAttributes({ ...DEFAULT_FORMATTING, boldTransitions: true, blankLinesBeforeSceneHeadings: 1 })).toEqual({
      "data-bold-transitions": "",
      "data-scene-heading-gap": "1",
    });
    // Headings are bold unless the project says otherwise: the paper as it always was.
    expect(DEFAULT_FORMATTING.boldSceneHeadings).toBe(true);
    expect(DEFAULT_FORMATTING.boldTransitions).toBe(false);
    expect(formattingAttributes({ ...DEFAULT_FORMATTING, boldSceneHeadings: false })).toEqual({ "data-regular-scene-headings": "" });
  });
});

describe("the paper, drawn by them", () => {
  it("bolds a transition only where the project says so", () => {
    expect(setting({}, [line("transition")], "font-weight")).toBeUndefined();
    expect(setting({ "data-bold-transitions": "" }, [line("transition")], "font-weight")).toBe("var(--weight-bold)");
  });

  it("bolds a heading unless the project says regular", () => {
    expect(setting({}, [line("scene-heading")], "font-weight")).toBe("var(--weight-bold)");
    expect(setting({ "data-regular-scene-headings": "" }, [line("scene-heading")], "font-weight")).toBe("var(--weight-regular)");
    // Only the heading: a transition beside it is untouched.
    expect(setting({ "data-regular-scene-headings": "" }, [line("transition")], "font-weight")).toBeUndefined();
  });

  it("puts one blank line above a heading where the table puts two, winning over the table", () => {
    expect(setting({}, [line("action"), line("scene-heading")], "margin-top")).toBe("calc(var(--manuscript-blank) * 2)");
    for (const above of ["action", "dialogue", "transition", "centered"])
      expect(setting({ "data-scene-heading-gap": "1" }, [line(above), line("scene-heading")], "margin-top"), above).toBe("var(--manuscript-blank)");
    // Only above a heading: every other gap is the table's.
    expect(setting({ "data-scene-heading-gap": "1" }, [line("action"), line("action")], "margin-top")).toBe("var(--manuscript-blank)");
    expect(setting({ "data-scene-heading-gap": "1" }, [line("character"), line("dialogue")], "margin-top")).toMatch(/^0(px)?$/);
  });

  it("leaves a heading at the head of a sheet, or after a boneyard's opening, with none", () => {
    for (const above of [seam(), line("boneyard-start")]) {
      const found = setting({ "data-scene-heading-gap": "1" }, [line("action"), above, line("scene-heading")], "margin-top");
      expect(found, above.className || above.dataset["element"]).toMatch(/^0(px)?$/);
    }
  });
});

describe("New Project's list of types", () => {
  const listed = (hidden?: readonly string[]) =>
    [...projectTypeSelect("t", hidden).tray.querySelectorAll("[role=option]")].map((option) => option.firstElementChild!.textContent);

  it("leaves out a type Settings says not to show", () => {
    expect(listed(["Episode", "Poem"])).toEqual(["Feature", "Short Film", "Novel", "Short Story", "Novella", "Flash Fiction"]);
  });

  it("is every type by default, and never empty of types it can make", () => {
    expect(listed()).toHaveLength(8);
    expect(listed(["Feature", "Episode", "Short Film"]).slice(0, 3)).toEqual(["Feature", "Episode", "Short Film"]);
  });
});
