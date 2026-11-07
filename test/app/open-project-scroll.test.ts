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
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MOST_ROWS,
  renderOpenProject,
  edgeTolerance,
  rowsThatFit,
  type OpenProjectScreen,
} from "../../app/src/screens/open-project.ts";
import { answerKey, type KeyPress } from "../../app/src/screens/shortcuts.ts";
import { ChevronDown, ChevronUp, createElement } from "lucide";
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
    // The rest of the screen, and the list as tall as its own box says.
    if (this.classList.contains("composition--open-project")) return box(0, rest + (list?.getBoundingClientRect().height ?? 0));
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

describe("the chevrons: no scrollbar, and a hint of what is out of view", () => {
  /**
   * A scroll geometry for the list, which jsdom does not have: `shown` rows
   * of `count` in view, the list scrolled `top` pixels — and a scroll event
   * when it moves, as a browser sends one whatever moved it. Each row's box
   * moves with the scroll, as a browser's does; the list's stays put.
   */
  function geometry(list: HTMLElement, count: number, shown: number) {
    const height = (n: number) => n * ROW + Math.max(0, n - 1) * GAP;
    let top = 0;
    let rows = shown;
    const LIST_TOP = 100;
    Object.defineProperty(list, "scrollHeight", { get: () => height(count), configurable: true });
    Object.defineProperty(list, "clientHeight", { get: () => height(Math.min(rows, count)), configurable: true });
    Object.defineProperty(list, "scrollTop", {
      get: () => top,
      set: (to: number) => {
        top = Math.max(0, Math.min(to, height(count) - height(Math.min(rows, count))));
      },
      configurable: true,
    });
    list.getBoundingClientRect = () => new DOMRect(0, LIST_TOP, 480, height(Math.min(rows, count)));
    [...list.children].forEach((item, index) => {
      item.getBoundingClientRect = () => new DOMRect(0, LIST_TOP + index * (ROW + GAP) - top, 480, ROW);
    });
    return {
      scrollTo(to: number) {
        list.scrollTop = to;
        list.dispatchEvent(new Event("scroll"));
      },
      showRows(n: number) {
        rows = n;
      },
      end: () => height(count) - height(Math.min(rows, count)),
    };
  }
  const hints = (into: HTMLElement) => ({
    above: into.querySelector<HTMLElement>(".projects-hint--above")!,
    below: into.querySelector<HTMLElement>(".projects-hint--below")!,
  });
  const showing = (into: HTMLElement) => {
    const { above, below } = hints(into);
    return { above: !above.hidden, below: !below.hidden };
  };

  it("are Lucide's chevron-up and chevron-down, real drawings and not characters", () => {
    const { into } = draw();
    const { above, below } = hints(into);
    expect(above.textContent).toBe("");
    expect(below.textContent).toBe("");
    expect(above.querySelector("svg")!.innerHTML).toBe(createElement(ChevronUp).innerHTML);
    expect(below.querySelector("svg")!.innerHTML).toBe(createElement(ChevronDown).innerHTML);
  });

  it("at the top: only the down chevron", () => {
    const { into, list } = draw();
    geometry(list, 12, 8).scrollTo(0);
    expect(showing(into)).toEqual({ above: false, below: true });
  });

  it("in the middle: both", () => {
    const { into, list } = draw();
    geometry(list, 12, 8).scrollTo(2 * (ROW + GAP));
    expect(showing(into)).toEqual({ above: true, below: true });
  });

  it("at the bottom: only the up chevron — a fractional scroll short of it included", () => {
    const { into, list } = draw();
    const scroll = geometry(list, 12, 8);
    scroll.scrollTo(scroll.end());
    expect(showing(into)).toEqual({ above: true, below: false });
    scroll.scrollTo(scroll.end() - 0.5);
    expect(showing(into)).toEqual({ above: true, below: false });
    scroll.scrollTo(0.5);
    expect(showing(into)).toEqual({ above: false, below: true });
  });

  /**
   * What WebKitGTK 2.52 reports at a scale of 1.1 (measured: Debian's
   * libwebkit2gtk-4.1 under Xvfb, `set_zoom_level(1.1)`, 13 projects in eight
   * rows, the list wheeled, arrowed and `scrollBy`-ed as far as it goes): the
   * counters are whole numbers rounded one at a time, so they promise a pixel
   * the list can never reach, while the rows' boxes are where the rows are.
   */
  function webkitAtScale(list: HTMLElement, reported: { scrollTop: number; scrollHeight: number; clientHeight: number }, box: { top: number; height: number }, lastBelow: number) {
    Object.defineProperty(list, "scrollHeight", { get: () => reported.scrollHeight, configurable: true });
    Object.defineProperty(list, "clientHeight", { get: () => reported.clientHeight, configurable: true });
    Object.defineProperty(list, "scrollTop", { get: () => reported.scrollTop, configurable: true });
    list.getBoundingClientRect = () => new DOMRect(0, box.top, 480, box.height);
    const items = [...list.children];
    const bottom = box.top + box.height + lastBelow;
    items.forEach((item, index) => {
      const rowTop = bottom - ROW - (items.length - 1 - index) * (ROW + GAP);
      item.getBoundingClientRect = () => new DOMRect(0, rowTop, 480, ROW);
    });
    list.dispatchEvent(new Event("scroll"));
  }

  it("at the very bottom in WebKitGTK at 1.1: no down chevron, though the counters say a pixel is left", () => {
    const { into, list } = draw(Array.from({ length: 13 }, (_, i) => `Made-Up Project ${i + 1}`));
    const reported = { scrollTop: 160, scrollHeight: 409, clientHeight: 248 };
    // The cause, as measured: the counters' "left to scroll" is a whole pixel…
    expect(reported.scrollHeight - reported.clientHeight - reported.scrollTop).toBe(1);
    // …while the last row ends 0.14px *inside* the list.
    webkitAtScale(list, reported, { top: 306.09375, height: 247.9971466064453 }, -0.14202308654785156);
    expect(showing(into)).toEqual({ above: true, below: false });
  });

  it("at the very bottom at 0.67: no down chevron, though the last row is a quarter-pixel past the edge", () => {
    const { into, list } = draw(Array.from({ length: 13 }, (_, i) => `Made-Up Project ${i + 1}`));
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(0.67);
    webkitAtScale(list, { scrollTop: 159, scrollHeight: 407, clientHeight: 248 }, { top: 589.9020385742188, height: 247.99440002441406 }, 0.25652313232421875);
    expect(showing(into)).toEqual({ above: true, below: false });
  });

  it("a little more than a pixel left to scroll still shows the chevron: rounding is not more rows", () => {
    const { into, list } = draw();
    webkitAtScale(list, { scrollTop: 158, scrollHeight: 408, clientHeight: 248 }, { top: 100, height: 248 }, 1.5);
    expect(showing(into)).toEqual({ above: true, below: true });
    // Where a device pixel is two CSS pixels, 1.5 of them cannot be shown by any scroll.
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(0.5);
    list.dispatchEvent(new Event("scroll"));
    expect(showing(into)).toEqual({ above: true, below: false });
  });

  it("the tolerance is a CSS pixel, or one device pixel where that is more", () => {
    expect(edgeTolerance(1)).toBe(1);
    expect(edgeTolerance(1.1)).toBe(1);
    expect(edgeTolerance(2)).toBe(1);
    expect(edgeTolerance(0.5)).toBe(2);
    expect(edgeTolerance(0)).toBe(1);
  });

  it("follow the rows changing under them, with no scroll to say so", async () => {
    const { into, list } = draw();
    geometry(list, 12, 8).scrollTo(0);
    expect(showing(into)).toEqual({ above: false, below: true });
    // Rows taken away until everything fits: the observer sees it.
    const items = [...list.children];
    for (const item of items.slice(8)) item.remove();
    await Promise.resolve();
    expect(showing(into)).toEqual({ above: false, below: false });
  });

  it("eight projects or fewer: neither, wherever the wheel tries to take it", () => {
    for (const count of [1, 5, 8]) {
      const { into, list, rows } = draw(NAMES.slice(0, count));
      const scroll = geometry(list, count, 8);
      list.dispatchEvent(new Event("scroll"));
      expect(showing(into), `${count} projects`).toEqual({ above: false, below: false });
      rows[0]!.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true }));
      scroll.scrollTo(120);
      expect(showing(into), `${count} projects, wheeled`).toEqual({ above: false, below: false });
    }
  });

  it("with no layout to measure: neither, not a chevron claiming rows nobody counted", () => {
    const { into } = draw();
    expect(showing(into)).toEqual({ above: false, below: false });
  });

  it("follow the wheel: each scroll it makes moves them", () => {
    const { into, list, rows } = draw();
    const scroll = geometry(list, 12, 8);
    list.dispatchEvent(new Event("scroll"));
    expect(showing(into)).toEqual({ above: false, below: true });
    // The browser scrolls for the wheel, and says so with a scroll event.
    const wheel = new WheelEvent("wheel", { deltaY: 60, bubbles: true, cancelable: true });
    rows[3]!.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    scroll.scrollTo(60);
    expect(showing(into)).toEqual({ above: true, below: true });
    scroll.scrollTo(10_000);
    expect(showing(into)).toEqual({ above: true, below: false });
    scroll.scrollTo(-50);
    expect(showing(into)).toEqual({ above: false, below: true });
  });

  it("follow the arrows: Down past the eighth, and the wrap back to the first", () => {
    const { into, list, rows, key } = draw();
    const scroll = geometry(list, 12, 8);
    // `nearest`, as a browser does it: the least scroll that shows the row whole.
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(function (this: HTMLElement) {
      const index = rows.indexOf(this as HTMLButtonElement);
      const rowTop = index * (ROW + GAP);
      const view = list.clientHeight;
      if (rowTop < list.scrollTop) scroll.scrollTo(rowTop);
      else if (rowTop + ROW > list.scrollTop + view) scroll.scrollTo(rowTop + ROW - view);
    });
    for (let i = 0; i < 8; i += 1) key(press("ArrowDown"));
    expect(showing(into)).toEqual({ above: true, below: true });
    for (let i = 0; i < 3; i += 1) key(press("ArrowDown"));
    expect(showing(into)).toEqual({ above: true, below: false });
    key(press("ArrowDown"));
    expect(showing(into)).toEqual({ above: false, below: true });
    key(press("ArrowUp"));
    expect(showing(into)).toEqual({ above: true, below: false });
  });

  it("follow a resize: a window tall enough for everything shows neither, a short one the down", () => {
    laidOut(500);
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
    const { into, list, shown } = draw(NAMES.slice(0, 10));
    const scroll = geometry(list, 10, 8);
    window.dispatchEvent(new Event("resize"));
    expect(showing(into)).toEqual({ above: false, below: true });

    // The rows the stylesheet now shows, from the count the fit hands it.
    Object.defineProperty(window, "innerHeight", { value: 650, configurable: true });
    scroll.showRows(4);
    window.dispatchEvent(new Event("resize"));
    expect(shown()).toBe("4");
    expect(showing(into)).toEqual({ above: false, below: true });

    // Scrolled to the end of four, then given room for all ten: nothing left out.
    scroll.scrollTo(scroll.end());
    expect(showing(into)).toEqual({ above: true, below: false });
    scroll.showRows(10);
    list.scrollTop = 0;
    window.dispatchEvent(new Event("resize"));
    expect(showing(into)).toEqual({ above: false, below: false });
  });

  it("are outside the list, against its edges, and take no room", () => {
    const { into, list } = draw();
    const { above, below } = hints(into);
    const window = list.parentElement!;
    expect(window.className).toBe("projects-window");
    expect([...window.children]).toEqual([above, list, below]);
    expect(list.contains(above) || list.contains(below)).toBe(false);
    expect(css).toMatch(/\.projects-window\s*\{[^}]*position:\s*relative/);
    const hint = css.match(/\.projects-hint\s*\{([^}]*)\}/)![1]!;
    expect(hint).toMatch(/position:\s*absolute/);
    expect(hint).toMatch(/left:\s*50%/);
    expect(hint).toMatch(/color:\s*var\(--colour-faint\)/);
    expect(css).toMatch(/\.projects-hint--above\s*\{[^}]*bottom:\s*100%/);
    expect(css).toMatch(/\.projects-hint--below\s*\{[^}]*top:\s*100%/);
    expect(css).toMatch(/\.projects-hint\[hidden\]\s*\{[^}]*display:\s*none/);
    // The nudge keeps inside the 16px the words under the list leave it.
    const px = (name: string) => Number(tokens.match(new RegExp(`--${name}:\\s*(\\d+)px;`))![1]);
    expect(px("size-icon") + px("distance-hint-bounce")).toBeLessThanOrEqual(px("space-roomy"));
  });

  it("are for the eye: hidden from a screen reader, and never in the pointer's way", () => {
    const { into } = draw();
    const { above, below } = hints(into);
    expect(above.getAttribute("aria-hidden")).toBe("true");
    expect(below.getAttribute("aria-hidden")).toBe("true");
    expect(css.match(/\.projects-hint\s*\{([^}]*)\}/)![1]).toMatch(/pointer-events:\s*none/);
    // Nothing on them to click.
    const before = into.innerHTML;
    below.click();
    expect(into.innerHTML).toBe(before);
  });

  it("nudge the way the rows are, and keep still for a writer who asked for less motion", () => {
    const hint = css.match(/\.projects-hint\s*\{([^}]*)\}/)![1]!;
    expect(hint).toMatch(/animation:\s*var\(--duration-hint-bounce\) ease-in-out infinite/);
    expect(css).toMatch(/\.projects-hint--above\s*\{[^}]*animation-name:\s*hint-up/);
    expect(css).toMatch(/\.projects-hint--below\s*\{[^}]*animation-name:\s*hint-down/);
    expect(css).toMatch(/@keyframes hint-up\s*\{\s*50%\s*\{\s*translate:\s*0 calc\(-1 \* var\(--distance-hint-bounce\)\)/);
    expect(css).toMatch(/@keyframes hint-down\s*\{\s*50%\s*\{\s*translate:\s*0 var\(--distance-hint-bounce\)/);
    const still = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?\})\s*\}/)![1]!;
    expect(still).toMatch(/\.projects-hint\s*\{\s*animation:\s*none/);
    // After the rules it overrides, so it wins.
    expect(css.indexOf("prefers-reduced-motion")).toBeGreaterThan(css.indexOf(".projects-hint--below"));
  });

  it("stand in for the scrollbar, which the list no longer draws — and only the list", () => {
    const rule = css.match(/\.projects\s*\{([^}]*)\}/)![1]!;
    expect(rule).toMatch(/scrollbar-width:\s*none/);
    // Still a scroller: the wheel, the trackpad and the keys still move it.
    expect(rule).toMatch(/overflow-y:\s*auto/);
    expect(css).toMatch(/\.projects::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
    // No other stylesheet hides or styles a scrollbar.
    for (const name of readdirSync(style).filter((f) => f.endsWith(".css") && f !== "open-project.css")) {
      expect(uncommented(name), name).not.toMatch(/scrollbar/);
    }
    expect(css.match(/scrollbar/g)).toHaveLength(2);
  });

  it("leave the right-click menu on the row pointed at, and open nothing themselves", () => {
    const { into, list, rows, lit, calls } = draw();
    geometry(list, 12, 8).scrollTo(2 * (ROW + GAP));
    expect(showing(into)).toEqual({ above: true, below: true });

    const onHint = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 240, clientY: 0 });
    hints(into).above.dispatchEvent(onHint);
    expect(onHint.defaultPrevented).toBe(true);
    expect(document.querySelector('[role="menu"]')).toBeNull();

    rows[11]!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 300, clientY: 200 }));
    expect(lit()).toEqual([11]);
    [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((i) => i.textContent === "Delete Project")!.click();
    expect(calls.onDelete).toHaveBeenCalledExactlyOnceWith(project(NAMES[11]!));
  });
});
