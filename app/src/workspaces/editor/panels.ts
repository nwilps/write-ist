/**
 * The Editor's side panels (the desk design, §2.2).
 *
 * Two columns beside the paper: formats and menus with the scene list on the
 * left, element types and the search button on the right. They are the
 * Editor's rather than the shell's because what they list — scene headings,
 * the seven element types — is the screenplay's vocabulary, which the shell
 * is not allowed to know (ADR-0005).
 *
 * **What is wired and what is not.** Bold, italic and underline run the marks
 * the keyboard already runs; an element row sets the type the way Tab does,
 * and Ctrl+1…7 say the same thing from the keyboard. File, Edit, View, Add
 * comment and Search are drawn and do nothing yet — the menus, the comment
 * UI and the search dialog are later work, and a button that pretended would
 * be worse than one that is plainly waiting.
 */
import { Bold, createElement, Italic, MessageSquareText, Search, Underline, type IconNode } from "lucide";
import { toggleMark } from "prosemirror-commands";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { NUMBERED_TYPES, setElementType } from "../../../../src/screenplay/element-keys.ts";
import type { ElementType } from "../../../../src/screenplay/document.ts";
import { screenplaySchema } from "../../../../src/screenplay/schema.ts";
import { element } from "../../screens/element.ts";

/** What the panel calls each type it can set. */
const ELEMENT_LABELS: Readonly<Record<string, string>> = {
  "scene-heading": "Scene Heading",
  action: "Action",
  character: "Character",
  dialogue: "Dialogue",
  parenthetical: "Parenthetical",
  transition: "Transition",
  centered: "Centered Text",
};

const MENUS: readonly (readonly [string, string])[] = [
  ["File", "[Alt + F]"],
  ["Edit", "[Alt + E]"],
  ["View", "[Alt + V]"],
];

export interface Panels {
  readonly left: HTMLElement;
  readonly right: HTMLElement;
  /** Give the buttons an editor to act on. */
  readonly attach: (view: EditorView) => void;
  /** The manuscript or the selection moved: bring the lists up to date. */
  readonly update: (state: EditorState) => void;
}

function icon(node: IconNode): SVGElement {
  const drawn = createElement(node, { class: "panel__icon" });
  drawn.setAttribute("aria-hidden", "true");
  return drawn;
}

function row(label: string, hint: string, extra: Partial<HTMLButtonElement> = {}): HTMLButtonElement {
  return element("button", { type: "button", className: "panel__row", ...extra }, [
    element("span", { textContent: label }),
    element("span", { className: "panel__hint", textContent: hint }),
  ]);
}

export function sidePanels(openSearch: () => void = () => {}): Panels {
  let view: EditorView | undefined;
  // A click must not take focus from the page: the selection is what the
  // button acts on.
  const acts = (button: HTMLElement, act: (view: EditorView) => void): void => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      if (view === undefined) return;
      act(view);
      view.focus();
    });
  };

  const format = (label: string, node: IconNode, mark?: string): HTMLButtonElement => {
    const button = element("button", { type: "button", className: "panel__format", ariaLabel: label }, [icon(node)]);
    if (mark === undefined) {
      // Add comment: the slot is here, the feature is not.
      button.setAttribute("aria-disabled", "true");
    } else {
      const command = toggleMark(screenplaySchema.marks[mark]!);
      acts(button, (editor) => void command(editor.state, editor.dispatch));
    }
    return button;
  };

  const formats = element("section", { className: "panel", ariaLabel: "Formats and menus" }, [
    element("div", { className: "panel__formats" }, [
      format("Bold", Bold, "bold"),
      format("Italic", Italic, "italic"),
      format("Underline", Underline, "underline"),
      format("Add comment", MessageSquareText),
    ]),
    ...MENUS.map(([label, hint]) => row(label, hint)),
  ]);

  const sceneList = element("ul", { className: "panel__scenes" });
  const scenes = element("section", { className: "panel panel--scenes", ariaLabel: "Scenes" }, [
    element("h2", { className: "panel__heading", textContent: "Scenes" }),
    sceneList,
  ]);

  const typeRows = new Map<ElementType, HTMLButtonElement>();
  const types = element(
    "section",
    { className: "panel", ariaLabel: "Element types" },
    NUMBERED_TYPES.map((type, at) => {
      const button = row(ELEMENT_LABELS[type]!, `[Ctrl + ${at + 1}]`);
      const command = setElementType(type);
      acts(button, (editor) => void command(editor.state, editor.dispatch));
      typeRows.set(type, button);
      return button;
    }),
  );

  const search = row("Search", "[Alt + Enter]");
  search.prepend(icon(Search));
  search.classList.add("panel__row--search");
  // The dialog takes focus itself, so unlike `acts` this hands it back nothing.
  search.addEventListener("mousedown", (event) => event.preventDefault());
  search.addEventListener("click", openSearch);
  const searchPanel = element("section", { className: "panel", ariaLabel: "Search" }, [search]);

  let listed = "";
  let current: HTMLElement | undefined;
  const update = (state: EditorState): void => {
    // The scene headings, read off the top level of the model — the flat
    // sequence, not the DOM. Redrawn only when the list is not the one drawn.
    const headings: string[] = [];
    state.doc.forEach((node) => {
      if (node.type.name === "element" && node.attrs["type"] === "scene-heading") {
        headings.push(node.textContent);
      }
    });
    const key = JSON.stringify(headings);
    if (key !== listed) {
      listed = key;
      sceneList.replaceChildren(
        ...headings.map((text) => element("li", { className: "panel__scene", textContent: text, title: text })),
      );
    }

    const parent = state.selection.$head.parent;
    const type = parent.type.name === "element" ? (parent.attrs["type"] as ElementType) : undefined;
    const next = type === undefined ? undefined : typeRows.get(type);
    if (next !== current) {
      current?.removeAttribute("aria-current");
      next?.setAttribute("aria-current", "true");
      current = next;
    }
  };

  return {
    left: element("aside", { className: "desk__column desk__column--left" }, [formats, scenes]),
    right: element("aside", { className: "desk__column desk__column--right" }, [types, searchPanel]),
    attach: (editor) => {
      view = editor;
    },
    update,
  };
}
