/**
 * The Open Project list scrolls: eight rows at most, fewer on a short window,
 * whole rows always — and the arrows, the pointer and the right-click menu
 * still land on the project they mean once it has scrolled.
 *
 * Every project here is made up. jsdom has no layout, so where a measurement
 * matters it is given one: each row 24px tall and 32px from the next, as the
 * tokens draw them.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MOST_ROWS,
  renderOpenProject,
  rowsThatFit,
  type OpenProjectScreen,
} from "../../app/src/screens/open-project.ts";
import { answerKey, type KeyPress } from "../../app/src/screens/shortcuts.ts";
import type { Project } from "../../src/project/bundle.ts";
import type { ProjectsListing } from "../../src/project/projects.ts";

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
const uncommented = (name: string) => readFileSync(join(style, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const css = uncommented("open-project.css");
const tokens = uncommented("tokens.css");

const NAMES = Array.from({ length: 12 }, (_, i) => `Made-Up Project ${String(i + 1).padStart(2, "0")}`);

const project = (name: string): Project => ({
  path: `/projects/${name}`,
  marker: { name, formatVersion: "1", projectId: `id-${name}`, format: "Feature" },
});
const listing = (names: readonly string[]): ProjectsListing => ({ projects: names.map(project), unreadable: [] });
const press = (key: string, more: Partial<KeyPress> = {}): KeyPress => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...more,
});

const ROW = 24;
const GAP = 8;
const innerHeight = window.innerHeight;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "innerHeight", { value: innerHeight, configurable: true });
  document.body.replaceChildren();
});

/**
 * A layout for jsdom: rows 24px tall, 32px apart; the list as tall as the
 * rows it shows; everything else on the screen `rest` pixels.
 */
function laidOut(rest: number): void {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const box = (top: number, height: number) => new DOMRect(0, top, 480, height);
    // A row, and the button that fills it.
    const item = this instanceof HTMLButtonElement && this.classList.contains("project") ? this.parentElement : this;
    if (item instanceof HTMLLIElement && item.parentElement?.classList.contains("projects")) {
      const index = [...item.parentElement.children].indexOf(item);
      return box(index * (ROW + GAP), ROW);
    }
    const list = this.classList.contains("projects") ? this : this.querySelector(".projects");
    const shown = Number((list as HTMLElement | null)?.style.getPropertyValue("--project-rows") || MOST_ROWS);
    const listHeight = shown * ROW + (shown - 1) * GAP;
    if (this.classList.contains("projects")) return box(0, listHeight);
    if (this.classList.contains("composition--open-project")) return box(0, rest + listHeight);
    return box(0, 0);
  });
}

function draw(names: readonly string[] = NAMES, overrides: Partial<OpenProjectScreen> = {}) {
  const into = document.createElement("div");
  document.body.replaceChildren(into);
  const calls = {
    onOpen: vi.fn(),
    onBack: vi.fn(),
    onNewProject: vi.fn(),
    onSearch: vi.fn(),
    onImport: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
  };
  const drawn = renderOpenProject(into, { listing: listing(names), importing: false, ...calls, ...overrides });
  const list = into.querySelector<HTMLElement>(".projects")!;
  const rows = [...into.querySelectorAll<HTMLButtonElement>("button.project")];
  const lit = () => rows.flatMap((r, i) => (r.classList.contains("gesture--selected") ? [i] : []));
  const key = (p: KeyPress) =>
    answerKey(p, { dialogOpen: document.querySelector("dialog[open]") !== null, gestures: drawn.gestures, navigate: drawn.navigate });
  const shown = () => list.style.getPropertyValue("--project-rows");
  return { into, calls, list, rows, lit, key, shown };
}

describe("the list's window: eight rows at most", () => {
  it("is eight rows, and the stylesheet's eight is the screen's", () => {
    expect(MOST_ROWS).toBe(8);
    expect(tokens).toMatch(new RegExp(`--count-project-rows:\\s*${MOST_ROWS};`));
  });

  it("is the only thing that scrolls: the list, sized in whole rows and the gaps between them", () => {
    const rule = css.match(/\.projects\s*\{([^}]*)\}/)![1]!;
    expect(rule).toMatch(/--rows-shown:\s*var\(--project-rows,\s*var\(--count-project-rows\)\)/);
    expect(rule).toMatch(
      /max-height:\s*calc\(var\(--rows-shown\) \* var\(--size-row\) \+ \(var\(--rows-shown\) - 1\) \* var\(--space-project-row\)\)/,
    );
    // `auto`, so eight projects or fewer draw no scrollbar at all.
    expect(rule).toMatch(/overflow-y:\s*auto/);
    expect(tokens).toMatch(/--size-row:\s*24px;/);
    expect(tokens).toMatch(/--space-row-gap:\s*8px;/);
    // Eight rows and seven gaps: 248px, no ninth row begun.
    expect(8 * ROW + 7 * GAP).toBe(248);
    // The header, the rules and the foot are outside it, and none of them scrolls.
    for (const fixed of [".open-project__header", ".open-project-rule", ".menu--foot"]) {
      const block = css.match(new RegExp(`\\${fixed}\\s*\\{([^}]*)\\}`))![1]!;
      expect(block, fixed).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
    }
  });

  it("holds every project, with the header, rules and foot outside it", () => {
    const { into, list, rows } = draw();
    expect(rows).toHaveLength(12);
    expect(list.contains(into.querySelector(".open-project__header"))).toBe(false);
    expect(list.contains(into.querySelector(".open-project-rule"))).toBe(false);
    expect(list.contains(into.querySelector(".menu--foot"))).toBe(false);
  });

  it("counts whole rows: eight at most, fewer on a short window, never none", () => {
    expect(rowsThatFit(248, ROW, GAP)).toBe(8);
    expect(rowsThatFit(2000, ROW, GAP)).toBe(8);
    expect(rowsThatFit(247, ROW, GAP)).toBe(7);
    expect(rowsThatFit(216, ROW, GAP)).toBe(7);
    expect(rowsThatFit(215, ROW, GAP)).toBe(6);
    expect(rowsThatFit(5 * ROW + 4 * GAP, ROW, GAP)).toBe(5);
    expect(rowsThatFit(ROW, ROW, GAP)).toBe(1);
    expect(rowsThatFit(3, ROW, GAP)).toBe(1);
    expect(rowsThatFit(-100, ROW, GAP)).toBe(1);
    // A fractional layout keeps the row it has room for.
    expect(rowsThatFit(247.7, ROW, GAP)).toBe(8);
  });

  it("shows eight on a tall window, and fewer whole rows on a short one", () => {
    laidOut(500);
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
    expect(draw().shown()).toBe("8");

    // 500 for the rest, 150 for the list: four rows (4 × 24 + 3 × 8 = 120), not five (152).
    Object.defineProperty(window, "innerHeight", { value: 650, configurable: true });
    expect(draw().shown()).toBe("4");
  });

  it("refits when the window is resized, and lets go of the window once the screen is gone", () => {
    laidOut(500);
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
    const { into, list, shown } = draw();
    expect(shown()).toBe("8");

    Object.defineProperty(window, "innerHeight", { value: 700, configurable: true });
    window.dispatchEvent(new Event("resize"));
    expect(shown()).toBe("6");

    Object.defineProperty(window, "innerHeight", { value: 2000, configurable: true });
    window.dispatchEvent(new Event("resize"));
    expect(shown()).toBe("8");

    // Another screen: the old list is not measured again.
    into.replaceChildren();
    Object.defineProperty(window, "innerHeight", { value: 600, configurable: true });
    window.dispatchEvent(new Event("resize"));
    expect(list.style.getPropertyValue("--project-rows")).toBe("8");
  });

  it("leaves the stylesheet's eight alone when there is no layout to measure", () => {
    expect(draw().shown()).toBe("");
  });
});

describe("moving through more than eight", () => {
  function watched() {
    const scrolled: number[] = [];
    const screen = draw();
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(function (this: HTMLElement, arg) {
      expect(arg).toEqual({ block: "nearest" });
      scrolled.push(screen.rows.indexOf(this as HTMLButtonElement));
    });
    return { ...screen, scrolled };
  }
  // jsdom has no scrollIntoView to spy on until one is given.
  HTMLElement.prototype.scrollIntoView ??= function () {};

  it("Down past the eighth row lights the ninth, focuses it and scrolls it into view", () => {
    const { lit, key, rows, scrolled } = watched();
    for (let i = 0; i < 8; i += 1) key(press("ArrowDown"));
    expect(lit()).toEqual([8]);
    expect(document.activeElement).toBe(rows[8]);
    expect(scrolled.at(-1)).toBe(8);
    key(press("ArrowDown"));
    key(press("ArrowDown"));
    key(press("ArrowDown"));
    expect(lit()).toEqual([11]);
    expect(scrolled.at(-1)).toBe(11);
  });

  it("wraps both ways, scrolling the row it wraps to into view", () => {
    const { lit, key, scrolled } = watched();
    key(press("ArrowUp"));
    expect(lit()).toEqual([11]);
    expect(scrolled.at(-1)).toBe(11);
    key(press("ArrowDown"));
    expect(lit()).toEqual([0]);
    expect(scrolled.at(-1)).toBe(0);
  });

  it("Enter opens the row scrolled to, not one still in view", () => {
    const { key, calls } = watched();
    for (let i = 0; i < 10; i += 1) key(press("ArrowDown"));
    key(press("Enter"));
    expect(calls.onOpen).toHaveBeenCalledExactlyOnceWith(project(NAMES[10]!));
  });

  it("keeps one highlight: hover on a scrolled-to row moves it there, without scrolling", () => {
    const { lit, key, rows, scrolled } = watched();
    for (let i = 0; i < 9; i += 1) key(press("ArrowDown"));
    const before = scrolled.length;
    rows[3]!.dispatchEvent(new MouseEvent("mouseenter"));
    expect(lit()).toEqual([3]);
    expect(scrolled).toHaveLength(before);
  });

  it("leaves the wheel to the browser: nothing on the screen takes it", () => {
    const { list, rows } = draw();
    const wheel = new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true });
    rows[2]!.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    expect(getComputedStyle(list).overflow).not.toBe("hidden");
  });
});

describe("the right-click menu, once the list has scrolled", () => {
  const menu = () => document.querySelector<HTMLElement>('[role="menu"]');
  const choose = (label: string) =>
    [...menu()!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((i) => i.textContent === label)!.click();

  it("opens where the pointer is and acts on the row right-clicked", () => {
    const { list, rows, lit, calls } = draw();
    list.scrollTop = 200;
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 300, clientY: 120 });
    rows[10]!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(lit()).toEqual([10]);
    expect(menu()!.style.getPropertyValue("--menu-x")).toBe("300");
    expect(menu()!.style.getPropertyValue("--menu-y")).toBe("120");
    choose("Rename Project");
    expect(calls.onRename).toHaveBeenCalledExactlyOnceWith(project(NAMES[10]!));

    rows[9]!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 300, clientY: 90 }));
    choose("Delete Project");
    expect(calls.onDelete).toHaveBeenCalledExactlyOnceWith(project(NAMES[9]!));
    expect(calls.onOpen).not.toHaveBeenCalled();
  });

  it("from the Menu key, opens under the lit row where it now is", () => {
    laidOut(500);
    const { key, lit, calls } = draw();
    for (let i = 0; i < 9; i += 1) key(press("ArrowDown"));
    expect(lit()).toEqual([9]);
    key(press("ContextMenu"));
    // Row 9's box in the made-up layout: top 288, 24 tall.
    expect(menu()!.style.getPropertyValue("--menu-y")).toBe(String(9 * (ROW + GAP) + ROW));
    choose("Rename Project");
    expect(calls.onRename).toHaveBeenCalledExactlyOnceWith(project(NAMES[9]!));
  });
});

describe("eight or fewer: nothing to scroll", () => {
  it("draws every row, the first lit, and the same window", () => {
    laidOut(500);
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
    const { rows, lit, shown, key } = draw(NAMES.slice(0, 8));
    expect(rows).toHaveLength(8);
    expect(lit()).toEqual([0]);
    expect(shown()).toBe("8");
    key(press("ArrowUp"));
    expect(lit()).toEqual([7]);
  });

  it("keeps Import, New Project, Home and Alt+Enter", () => {
    const { key, calls } = draw();
    key(press("i"));
    key(press("n"));
    key(press("Enter", { altKey: true }));
    key(press("Escape"));
    expect(calls.onImport).toHaveBeenCalledOnce();
    expect(calls.onNewProject).toHaveBeenCalledOnce();
    expect(calls.onSearch).toHaveBeenCalledOnce();
    expect(calls.onBack).toHaveBeenCalledOnce();
    expect(calls.onOpen).not.toHaveBeenCalled();
  });
});
