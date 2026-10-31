/**
 * The search dialog (the desk design, §2.5): a field over the paper, the
 * matches listed under it, Enter to jump.
 *
 * This file draws and listens; what a match *is* comes from
 * `src/screenplay/search.ts`, and where the caret goes is the Editor's — it is
 * handed `jump`. Nothing here is on the keystroke path of writing: a search
 * runs when the writer types in *this* field.
 *
 * **Every key stays inside the dialog.** The window answers Escape by closing
 * the project (`main.ts`), so an Escape that reached it would throw the writer
 * out of their screenplay for dismissing a search.
 */
import { createElement, ArrowUpDown, Search } from "lucide";
import type { Node as EditorNode } from "prosemirror-model";
import { findInManuscript, type Match } from "../../../../src/screenplay/search.ts";
import { element } from "../../screens/element.ts";

export interface SearchDialog {
  readonly close: () => void;
}

export interface SearchDialogOptions {
  /** The manuscript as it is now, read when the query changes. */
  readonly doc: () => EditorNode;
  /** The 1-based page of a manuscript element, if it is on one. */
  readonly pageOf: (manuscriptElement: number) => number | undefined;
  /** Put the caret on a match. The dialog closes itself afterwards. */
  readonly jump: (match: Match) => void;
  /** The dialog is gone, however it went. */
  readonly closed: () => void;
}

/** How much of a long line is kept before the match, so the match is on screen. */
const LEAD = 36;

export function openSearch(into: HTMLElement, options: SearchDialogOptions): SearchDialog {
  const query = element("input", {
    className: "search__query",
    type: "text",
    placeholder: "Search…",
    spellcheck: false,
    autocomplete: "off",
    ariaLabel: "Search the screenplay",
  });
  query.setAttribute("role", "combobox");
  query.setAttribute("aria-controls", "search-results");
  query.setAttribute("aria-expanded", "false");

  const count = element("p", { className: "search__count" });
  const list = element("ul", { className: "search__results", id: "search-results", role: "listbox" });
  const footer = element("p", { className: "search__footer" }, [
    element("span", { className: "search__footer-item" }, [
      icon(ArrowUpDown),
      element("span", { textContent: "move" }),
    ]),
    element("span", { className: "search__footer-item", textContent: "Enter jump" }),
    element("span", { className: "search__footer-item", textContent: "Esc close" }),
  ]);
  count.hidden = list.hidden = footer.hidden = true;

  const panel = element("div", { className: "search__panel" }, [
    element("div", { className: "search__field" }, [
      icon(Search),
      query,
      element("span", { className: "search__hint", textContent: "[Esc]" }),
    ]),
    count,
    list,
    footer,
  ]);
  const backdrop = element("div", { className: "search", role: "dialog", ariaModal: "true", ariaLabel: "Search" }, [
    panel,
  ]);

  let matches: readonly Match[] = [];
  let chosen = 0;
  let done = false;

  const close = (): void => {
    if (done) return;
    done = true;
    backdrop.remove();
    options.closed();
  };

  const choose = (next: number): void => {
    if (matches.length === 0) return;
    chosen = (next + matches.length) % matches.length;
    list.querySelectorAll("li").forEach((row, index) => {
      row.setAttribute("aria-selected", String(index === chosen));
      if (index === chosen) {
        query.setAttribute("aria-activedescendant", row.id);
        row.scrollIntoView?.({ block: "nearest" });
      }
    });
  };

  const jump = (index: number): void => {
    const match = matches[index];
    if (match === undefined) return;
    close();
    options.jump(match);
  };

  const show = (): void => {
    const text = query.value;
    const found = findInManuscript(options.doc(), text);
    matches = found.matches;
    chosen = 0;

    const searching = text !== "";
    count.hidden = list.hidden = footer.hidden = !searching;
    query.setAttribute("aria-expanded", String(found.total > 0));
    query.removeAttribute("aria-activedescendant");
    if (!searching) {
      list.replaceChildren();
      return;
    }
    count.textContent = countLine(found.total, matches.length);
    list.replaceChildren(
      ...matches.map((match, index) => {
        const page = options.pageOf(match.manuscriptElement);
        const row = element("li", { className: "search__result", id: `search-result-${index}`, role: "option" }, [
          line(match),
          ...(page === undefined ? [] : [element("span", { className: "search__page", textContent: `p. ${page}` })]),
        ]);
        // mousedown rather than click, so the field never loses focus first.
        row.addEventListener("mousedown", (event) => {
          event.preventDefault();
          jump(index);
        });
        return row;
      }),
    );
    footer.hidden = matches.length === 0;
    choose(0);
  };

  query.addEventListener("input", show);
  backdrop.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter") {
      event.preventDefault();
      jump(chosen);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      choose(chosen + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      choose(chosen - 1);
    }
  });
  // A click on the veil, not on the panel, dismisses it.
  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) close();
  });

  into.append(backdrop);
  query.focus();
  return { close };
}

/** "7 results", and honest when the list is shorter than the count. */
function countLine(total: number, shown: number): string {
  if (total === 0) return "No results";
  if (total === 1) return "1 result";
  return shown < total ? `${shown} of ${total} results` : `${total} results`;
}

/** The match in its line, the word found marked, a long line cut to fit. */
function line(match: Match): HTMLElement {
  const cut = match.offset > LEAD ? match.offset - LEAD : 0;
  const from = match.offset - cut;
  const text = (cut > 0 ? "…" : "") + match.text.slice(cut);
  const start = from + (cut > 0 ? 1 : 0);
  return element("span", { className: "search__line" }, [
    document.createTextNode(text.slice(0, start)),
    element("mark", { className: "search__match", textContent: text.slice(start, start + match.length) }),
    document.createTextNode(text.slice(start + match.length)),
  ]);
}

function icon(node: Parameters<typeof createElement>[0]): SVGElement {
  const drawn = createElement(node, { class: "search__icon" });
  drawn.setAttribute("aria-hidden", "true");
  return drawn;
}
