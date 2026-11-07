/**
 * The Open Project screen's search: the desk's search dialog (the desk design,
 * §2.5), finding projects instead of lines (the Open Project design, ADR-0043).
 *
 * **Not a second design.** The markup and the classes are the Editor's
 * (`workspaces/editor/search-dialog.ts`, `style/search.css`) — the veil, the
 * raised panel that is only its field until there is something to list, the
 * count, the rows, the footer — and the keys are the same: Up and Down move,
 * Enter opens, Escape closes. Only two things differ: a result is a project,
 * its format where the Editor puts a page, and the panel is centred on the
 * screen rather than over a paper this screen does not have.
 *
 * Nothing on the screen opens it. Alt+Enter does, which is the Editor's chord
 * for its search too; the design keeps it a shortcut for people who go looking.
 *
 * **Every key stays inside the dialog.** The window answers Escape on this
 * screen by going Home (`main.ts`), so an Escape that reached it would leave
 * the screen for dismissing a search.
 */
import { createElement, ArrowUpDown, Search } from "lucide";
import type { Project } from "../../../src/project/bundle.ts";
import { element } from "./element.ts";

export interface ProjectSearch {
  readonly close: () => void;
}

export interface ProjectSearchOptions {
  /** The projects as they are now, read when the query changes. */
  readonly projects: () => readonly Project[];
  /** Open one. The dialog closes itself first. */
  readonly open: (project: Project) => void;
  /** The dialog is gone, however it went. */
  readonly closed?: () => void;
}

/** A project the query found, and where in its name. */
export interface ProjectMatch {
  readonly project: Project;
  readonly offset: number;
  readonly length: number;
}

/**
 * The projects whose name holds the query, ignoring case, in the list's order.
 * An empty query finds nothing: the panel is just its field until the writer
 * types.
 */
export function findProjects(projects: readonly Project[], query: string): readonly ProjectMatch[] {
  if (query === "") return [];
  const wanted = query.toLowerCase();
  return projects.flatMap((project) => {
    const offset = project.marker.name.toLowerCase().indexOf(wanted);
    return offset === -1 ? [] : [{ project, offset, length: query.length }];
  });
}

export function openProjectSearch(into: HTMLElement, options: ProjectSearchOptions): ProjectSearch {
  const query = element("input", {
    className: "search__query",
    type: "text",
    placeholder: "Search…",
    spellcheck: false,
    autocomplete: "off",
    ariaLabel: "Search your projects",
  });
  query.setAttribute("role", "combobox");
  query.setAttribute("aria-controls", "project-search-results");
  query.setAttribute("aria-expanded", "false");

  const count = element("p", { className: "search__count" });
  const list = element("ul", { className: "search__results", id: "project-search-results", role: "listbox" });
  const footer = element("p", { className: "search__footer" }, [
    element("span", { className: "search__footer-item" }, [
      icon(ArrowUpDown),
      element("span", { textContent: "move" }),
    ]),
    element("span", { className: "search__footer-item", textContent: "Enter open" }),
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
  const backdrop = element(
    "div",
    { className: "search search--centred", role: "dialog", ariaModal: "true", ariaLabel: "Search" },
    [panel],
  );

  let matches: readonly ProjectMatch[] = [];
  let chosen = 0;
  let done = false;

  const close = (): void => {
    if (done) return;
    done = true;
    backdrop.remove();
    options.closed?.();
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

  const open = (index: number): void => {
    const match = matches[index];
    if (match === undefined) return;
    close();
    options.open(match.project);
  };

  const show = (): void => {
    const text = query.value;
    matches = findProjects(options.projects(), text);
    chosen = 0;

    const searching = text !== "";
    count.hidden = list.hidden = footer.hidden = !searching;
    query.setAttribute("aria-expanded", String(matches.length > 0));
    query.removeAttribute("aria-activedescendant");
    if (!searching) {
      list.replaceChildren();
      return;
    }
    count.textContent = countLine(matches.length);
    list.replaceChildren(
      ...matches.map((match, index) => {
        const row = element(
          "li",
          { className: "search__result", id: `project-search-result-${index}`, role: "option" },
          [name(match), element("span", { className: "search__page", textContent: match.project.marker.format })],
        );
        // mousedown rather than click, so the field never loses focus first.
        row.addEventListener("mousedown", (event) => {
          event.preventDefault();
          open(index);
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
      open(chosen);
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

function countLine(total: number): string {
  if (total === 0) return "No results";
  return total === 1 ? "1 result" : `${total} results`;
}

/** The project's name, the part found marked. */
function name({ project, offset, length }: ProjectMatch): HTMLElement {
  const text = project.marker.name;
  return element("span", { className: "search__line" }, [
    document.createTextNode(text.slice(0, offset)),
    element("mark", { className: "search__match", textContent: text.slice(offset, offset + length) }),
    document.createTextNode(text.slice(offset + length)),
  ]);
}

function icon(node: Parameters<typeof createElement>[0]): SVGElement {
  const drawn = createElement(node, { class: "search__icon" });
  drawn.setAttribute("aria-hidden", "true");
  return drawn;
}
