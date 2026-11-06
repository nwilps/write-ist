/**
 * The Open Project screen's search (ADR-0043): the desk's search dialog, its
 * results projects rather than lines. Every project name here is made up.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { findProjects, openProjectSearch } from "../../app/src/screens/project-search.ts";
import type { Project } from "../../src/project/bundle.ts";

const project = (name: string): Project => ({
  path: `/projects/${name}`,
  marker: { name, formatVersion: "1", projectId: `id-${name}`, format: "Feature" },
});
const projects = ["Big Fish", "Kitchen Draft", "Paper Boats", "Quiet Road"].map(project);

function open() {
  const into = document.createElement("div");
  document.body.replaceChildren(into);
  const chosen = vi.fn();
  const closed = vi.fn();
  openProjectSearch(into, { projects: () => projects, open: chosen, closed });
  const field = into.querySelector<HTMLInputElement>(".search__query")!;
  const press = (key: string) =>
    field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  const type = (text: string) => {
    field.value = text;
    field.dispatchEvent(new Event("input"));
  };
  const rows = () => [...into.querySelectorAll<HTMLElement>(".search__result")];
  return { into, field, press, type, rows, chosen, closed };
}

describe("findProjects", () => {
  it("finds names holding the query, ignoring case, in the list's order", () => {
    expect(findProjects(projects, "").map((m) => m.project.marker.name)).toEqual([]);
    expect(findProjects(projects, "R").map((m) => [m.project.marker.name, m.offset])).toEqual([
      ["Kitchen Draft", 9],
      ["Paper Boats", 4],
      ["Quiet Road", 6],
    ]);
  });
});

describe("The project search", () => {
  it("is the desk's dialog, centred: a veil, a panel, a focused field, nothing listed yet", () => {
    const s = open();
    const veil = s.into.querySelector(".search")!;
    expect(veil.classList.contains("search--centred")).toBe(true);
    expect(veil.getAttribute("role")).toBe("dialog");
    expect(s.into.querySelector(".search__panel .search__field .search__hint")!.textContent).toBe("[Esc]");
    expect(document.activeElement).toBe(s.field);
    expect(s.rows()).toHaveLength(0);
  });

  it("lists projects, not lines: the name with the match marked, the format beside it", () => {
    const s = open();
    s.type("boat");
    expect(s.into.querySelector(".search__count")!.textContent).toBe("1 result");
    const [row] = s.rows();
    expect(row!.querySelector(".search__match")!.textContent).toBe("Boat");
    expect(row!.querySelector(".search__line")!.textContent).toBe("Paper Boats");
    expect(row!.querySelector(".search__page")!.textContent).toBe("Feature");
    s.type("nothing like it");
    expect(s.into.querySelector(".search__count")!.textContent).toBe("No results");
  });

  it("Up and Down move, Enter opens the chosen project and closes", () => {
    const s = open();
    s.type("r");
    s.press("ArrowDown");
    s.press("ArrowDown");
    s.press("ArrowDown");
    s.press("ArrowUp");
    expect(s.rows()[2]!.getAttribute("aria-selected")).toBe("true");
    s.press("Enter");
    expect(s.chosen).toHaveBeenCalledWith(projects[3]);
    expect(s.into.querySelector(".search")).toBeNull();
  });

  it("Escape closes it, and the key goes no further", () => {
    const s = open();
    const heard = vi.fn();
    document.body.addEventListener("keydown", heard);
    s.press("Escape");
    document.body.removeEventListener("keydown", heard);
    expect(s.into.querySelector(".search")).toBeNull();
    expect(s.closed).toHaveBeenCalledTimes(1);
    expect(heard).not.toHaveBeenCalled();
    expect(s.chosen).not.toHaveBeenCalled();
  });

  it("a click on the veil closes it; a click on a row opens that project", () => {
    const s = open();
    s.type("fish");
    s.rows()[0]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(s.chosen).toHaveBeenCalledWith(projects[0]);
    const t = open();
    t.into.querySelector(".search")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(t.into.querySelector(".search")).toBeNull();
  });
});
