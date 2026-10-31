/**
 * The side panels (the desk design, §2.2): what they list, what their rows do,
 * and that Ctrl+1…7 say the same thing as clicking them.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { describe, expect, it } from "vitest";
import { sidePanels } from "../../app/src/workspaces/editor/panels.ts";
import { editorStateFor } from "../../src/screenplay/editing.ts";
import { NUMBERED_TYPES, setElementType } from "../../src/screenplay/element-keys.ts";
import { parse } from "../../src/screenplay/parse.ts";

const SCRIPT = `INT. KITCHEN - NIGHT

Rain on the glass.

NELL
Slow, but mine.

EXT. HARBOUR - DAWN

A grey boat.
`;

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
const css = readFileSync(join(style, "panels.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function mounted() {
  const panels = sidePanels();
  let state = editorStateFor(parse(SCRIPT));
  const view = new EditorView(document.createElement("div"), {
    state,
    dispatchTransaction: (tr) => {
      state = state.apply(tr);
      view.updateState(state);
      panels.update(state);
    },
  });
  panels.attach(view);
  panels.update(state);
  return { panels, view, state: () => state };
}

const types = (state: ReturnType<ReturnType<typeof mounted>["state"]>): string[] => {
  const found: string[] = [];
  state.doc.forEach((node) => found.push(node.attrs["type"] as string));
  return found;
};

describe("the side panels", () => {
  it("list the scene headings, in order, read from the model", () => {
    const { panels } = mounted();
    const scenes = [...panels.left.querySelectorAll(".panel__scene")].map((li) => li.textContent);
    expect(scenes).toEqual(["INT. KITCHEN - NIGHT", "EXT. HARBOUR - DAWN"]);
  });

  it("keep the scene list up to date when a heading is added", () => {
    const { panels, view, state } = mounted();
    // Put the caret in the first action, and make it a scene heading.
    const at = state().doc.child(0).nodeSize + 1;
    view.dispatch(state().tr.setSelection(TextSelection.create(state().doc, at)));
    setElementType("scene-heading")(state(), view.dispatch);
    const scenes = [...panels.left.querySelectorAll(".panel__scene")].map((li) => li.textContent);
    expect(scenes).toEqual(["INT. KITCHEN - NIGHT", "RAIN ON THE GLASS.", "EXT. HARBOUR - DAWN"]);
  });

  it("have the design's rows: formats, three menus, seven types, search", () => {
    const { panels } = mounted();
    expect([...panels.left.querySelectorAll(".panel__format")].map((b) => b.getAttribute("aria-label"))).toEqual([
      "Bold", "Italic", "Underline", "Add comment",
    ]);
    expect([...panels.left.querySelectorAll(".panel__row")].map((r) => r.textContent)).toEqual([
      "File[Alt + F]", "Edit[Alt + E]", "View[Alt + V]",
    ]);
    const rows = [...panels.right.querySelectorAll(".panel__row")].map((r) => r.textContent);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toBe("Scene Heading[Ctrl + 1]");
    expect(rows[6]).toBe("Centered Text[Ctrl + 7]");
    expect(rows[7]).toBe("Search[Alt + Enter]");
    for (const icon of panels.left.querySelectorAll(".panel__format svg")) expect(icon).not.toBeNull();
    expect(panels.right.querySelector(".panel__row--search svg")).not.toBeNull();
  });

  it("marks the row of the element the caret is in", () => {
    const { panels } = mounted();
    const current = panels.right.querySelector('[aria-current="true"]');
    expect(current?.textContent).toBe("Scene Heading[Ctrl + 1]");
  });

  it("sets the type of the selected element when a row is clicked", () => {
    const { panels, state } = mounted();
    const action = panels.right.querySelectorAll<HTMLElement>(".panel__row")[1]!;
    action.dispatchEvent(new MouseEvent("click"));
    expect(types(state())[0]).toBe("action");
    expect(panels.right.querySelector('[aria-current="true"]')?.textContent).toBe("Action[Ctrl + 2]");
  });

  it("leaves the add-comment slot waiting", () => {
    const { panels } = mounted();
    expect(panels.left.querySelector('[aria-label="Add comment"]')?.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("Ctrl+1…7", () => {
  it("name the seven types in the panel's order", () => {
    expect(NUMBERED_TYPES).toEqual([
      "scene-heading", "action", "character", "dialogue", "parenthetical", "transition", "centered",
    ]);
  });

  it("set the selected element's type", () => {
    const state = editorStateFor(parse(SCRIPT));
    let next = state;
    setElementType("transition")(state, (tr) => (next = state.apply(tr)));
    expect(types(next)[0]).toBe("transition");
  });
});

describe("the panels' look", () => {
  it("is in tokens, with the design's row and column geometry", () => {
    expect(css).toContain("grid-template-columns: 0 var(--page-width) 0");
    expect(css).toContain("width: var(--size-panel)");
    expect(css).toContain("background: var(--colour-raised)");
    expect(css).toContain("border-radius: var(--radius-float)");
    expect(css).toContain("height: var(--size-row)");
    expect(css).toContain("background: var(--colour-overlay)");
    expect(css).toContain("color: var(--colour-accent)");
  });
});
