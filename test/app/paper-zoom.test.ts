/**
 * View ▸ Zoom: the paper drawn larger or smaller, and nothing else.
 *
 * Checked four ways: the five levels, as numbers worked out from a window; the
 * keys, the View menu's Zoom row and a resize, in a mounted Editor on Brick &
 * Steel, by the zoom they leave on the document; where the paper and the caret
 * end up after a zoom, in a window whose layout is modelled (jsdom draws
 * nothing); and the stylesheet, for which rules read the zoom: the paper, its
 * column and its fades, and no piece of chrome.
 */
// @vitest-environment jsdom
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EditorView } from "prosemirror-view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MountedWorkspace, WorkspaceContext } from "../../app/src/shell/workspace.ts";
import {
  paperZoomLevel,
  setPaperZoomLevel,
  ZOOM_DEFAULT,
  ZOOM_LEVELS,
  zoomedIn,
  zoomedOut,
  zoomScales,
  type ZoomRoom,
} from "../../app/src/workspaces/editor/paper-zoom.ts";
import { importProject } from "../../src/project/import.ts";
import { openProject } from "../../src/project/open.ts";
import { readFixtureBytes } from "../support/files.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { fakeEngine } from "../support/spell-engine.ts";

// The Rust dictionary is not here; the fake stands in for it.
vi.mock("../../app/src/spell-tauri.ts", () => ({ tauriSpellEngine: fakeEngine() }));
const { editorWorkspace } = await import("../../app/src/workspaces/editor/editor.ts");

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");

HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
};

/**
 * The four tokens the levels are measured with, read from the stylesheets
 * rather than written down again here: `--page-width` and `--page-height`
 * (816px and 1056px), `--size-panel` (240px) and `--space-panel-gap` (12px).
 */
const TOKENS = (() => {
  const sheets = ["geometry.css", "tokens.css"].map((name) => readFileSync(join(style, name), "utf8")).join("\n");
  const value = (name: string): number => {
    const declared = sheets.match(new RegExp(`${name}:\\s*([^;]+);`))![1]!.trim();
    const alias = declared.match(/^var\((--[\w-]+)\)$/);
    return alias === null ? Number.parseFloat(declared) : value(alias[1]!);
  };
  return {
    pageWidth: value("--page-width"),
    pageHeight: value("--page-height"),
    panel: value("--size-panel"),
    gap: value("--space-panel-gap"),
  };
})();

/** The room on a window of a size: the first window is 1100 by 820 (`tauri.conf.json`). */
const room = (viewWidth: number, viewHeight: number): ZoomRoom => ({ viewWidth, viewHeight, ...TOKENS });

describe("the five levels", () => {
  it("are measured with the tokens the desk is drawn with", () => {
    expect(TOKENS).toEqual({ pageWidth: 816, pageHeight: 1056, panel: 240, gap: 12 });
    expect([ZOOM_LEVELS, ZOOM_DEFAULT]).toEqual([5, 2]);
  });

  it("on a wide window are one sheet top to bottom, halfway, 100%, the panels a gap in from the edges, and the paper edge to edge", () => {
    const [out2, out1, middle, in1, in2] = zoomScales(room(1920, 1000));
    // One whole sheet, with the gap above and below it.
    expect(out2! * 1056 + 2 * 12).toBeCloseTo(1000);
    expect(out1).toBeCloseTo((out2! + 1) / 2);
    expect(middle).toBe(1);
    // From each edge the gap, a panel, the gap, then the paper: the window's width.
    expect(in1! * 816 + 4 * 12 + 2 * 240).toBeCloseTo(1920);
    // The paper and the gap either side: the window's width, the panels past it.
    expect(in2! * 816 + 2 * 12).toBeCloseTo(1920);
    expect([out2, out1, in1, in2].map((scale) => scale!.toFixed(4))).toEqual(["0.9242", "0.9621", "1.7059", "2.3235"]);
  });

  it("on the first window, 1100 by 820, hold the panels' level at 100%: they already reach past its edges there", () => {
    const scales = zoomScales(room(1100, 820));
    // The panels a gap in from the edges would be (1100 − 480 − 48) / 816 = 70%, smaller than 100%.
    expect((1100 - 2 * 240 - 4 * 12) / 816).toBeLessThan(1);
    expect(scales.map((scale) => scale.toFixed(4))).toEqual(["0.7538", "0.8769", "1.0000", "1.0000", "1.3186"]);
  });

  it("never run backwards: a zoom in smaller than 100% is 100%, and a zoom out larger than 100% is 100%", () => {
    // Narrow and short: even edge to edge is narrower than the sheet.
    expect(zoomScales(room(700, 500)).map((scale) => scale.toFixed(4))).toEqual(["0.4508", "0.7254", "1.0000", "1.0000", "1.0000"]);
    // Very tall: a whole sheet fits at more than 100%.
    expect(zoomScales(room(1100, 1400)).map((scale) => scale.toFixed(4))).toEqual(["1.0000", "1.0000", "1.0000", "1.0000", "1.3186"]);
    for (let width = 300; width <= 3000; width += 137) {
      for (let height = 200; height <= 2000; height += 151) {
        const scales = zoomScales(room(width, height));
        expect(scales).toHaveLength(5);
        expect(scales[2], `${width}×${height}`).toBe(1);
        for (let at = 1; at < 5; at += 1) expect(scales[at]!, `${width}×${height}`).toBeGreaterThanOrEqual(scales[at - 1]!);
        expect(scales[0]!).toBeGreaterThan(0);
      }
    }
  });

  it("are all 100% where there is no window to measure yet", () => {
    expect(zoomScales(room(0, 0))).toEqual([1, 1, 1, 1, 1]);
  });

  it("step one level at a time, and go no further than either end", () => {
    expect(zoomedIn(ZOOM_DEFAULT)).toBe(3);
    expect(zoomedOut(ZOOM_DEFAULT)).toBe(1);
    expect(zoomedIn(4)).toBe(4);
    expect(zoomedOut(0)).toBe(0);
    setPaperZoomLevel(9);
    expect(paperZoomLevel()).toBe(4);
    setPaperZoomLevel(-3);
    expect(paperZoomLevel()).toBe(0);
    setPaperZoomLevel(ZOOM_DEFAULT);
  });
});

/**
 * A window jsdom cannot draw, modelled: the scroller is `width` by `height`
 * at the window's top left, and the desk centres the paper in it, drawn at
 * the zoom on the root; scrolling moves it. The caret is at a place on the
 * unzoomed paper, so it moves as the paper grows.
 */
function modelWindow(scroller: HTMLElement, size: { width: number; height: number }) {
  let scrollLeft = 0;
  let scrollTop = 0;
  Object.defineProperties(scroller, {
    clientWidth: { configurable: true, get: () => size.width },
    clientHeight: { configurable: true, get: () => size.height },
    scrollLeft: { configurable: true, get: () => scrollLeft, set: (to: number) => (scrollLeft = to) },
    scrollTop: { configurable: true, get: () => scrollTop, set: (to: number) => (scrollTop = to) },
  });
  scroller.getBoundingClientRect = () => new DOMRect(0, 0, size.width, size.height);
  const scale = (): number => Number(document.documentElement.style.getPropertyValue("--paper-zoom") || "1");
  const paperLeft = (): number => (size.width - TOKENS.pageWidth * scale()) / 2 - scrollLeft;
  return {
    scale,
    paper: (): DOMRect => new DOMRect(paperLeft(), -scrollTop, TOKENS.pageWidth * scale(), 40 * TOKENS.pageHeight * scale()),
    /** The caret at `x`, `y` on the paper as laid out, where the window sees it. */
    caretAt: (x: number, y: number) => () => {
      const left = paperLeft() + x * scale();
      const top = y * scale() - scrollTop;
      return { left, right: left, top, bottom: top + 12 * scale() };
    },
    scroll: (to: { left?: number; top?: number }) => {
      scrollLeft = to.left ?? scrollLeft;
      scrollTop = to.top ?? scrollTop;
    },
  };
}

describe("in the Editor", () => {
  let temporary: { path: string; remove: () => void };
  const size = { width: 1100, height: 820 };
  beforeEach(() => {
    temporary = temporaryDirectory();
    setPaperZoomLevel(ZOOM_DEFAULT);
    size.width = 1100;
    size.height = 820;
    const root = document.documentElement.style;
    root.setProperty("--page-width", `${TOKENS.pageWidth}px`);
    root.setProperty("--page-height", `${TOKENS.pageHeight}px`);
    root.setProperty("--size-panel", `${TOKENS.panel}px`);
    root.setProperty("--space-panel-gap", `${TOKENS.gap}px`);
  });
  const live: MountedWorkspace[] = [];
  afterEach(async () => {
    // A test that failed half-way leaves no Editor listening to the next one.
    for (const mounted of live.splice(0)) await mounted.unmount();
    vi.restoreAllMocks();
    document.body.replaceChildren();
    for (const name of ["--paper-zoom", "--page-width", "--page-height", "--size-panel", "--space-panel-gap"]) {
      document.documentElement.style.removeProperty(name);
    }
    temporary.remove();
  });

  /** The Editor on Brick & Steel, inside a scroller the size of the first window. */
  async function editor(statuses: string[] = []) {
    const scroller = document.createElement("main");
    scroller.style.overflow = "auto";
    scroller.style.overflowY = "auto";
    const window = modelWindow(scroller, size);
    // jsdom measures no text: the caret is put somewhere on the paper, and a test may move it.
    vi.spyOn(EditorView.prototype, "coordsAtPos").mockImplementation(window.caretAt(400, 1000) as never);
    const into = document.createElement("div");
    scroller.append(into);
    document.body.append(scroller);
    const source = join(temporary.path, "Brick-&-Steel.fountain");
    writeFileSync(source, readFixtureBytes("Brick-&-Steel.fountain"));
    const imported = await importProject(
      { filesystem: nodeFilesystem, newProjectId: () => "3f2a1c44-0000-4000-8000-0123456789ab" },
      { sourcePath: source, projectsDirectory: join(temporary.path, `write-ist-${Math.random()}`) },
    );
    const project = await openProject(nodeFilesystem, imported.project);
    const quiet = (): (() => void) => () => {};
    const context = {
      project: project.project,
      filesystem: nodeFilesystem,
      report: () => {},
      setStatus: (text: string) => statuses.push(text),
      setGoal: () => {},
      whenGoalsAsked: quiet,
      whenRenameAsked: quiet,
      setSaved: () => {},
      setSpellcheck: () => {},
      whenSwitchedAway: quiet,
      whenSwitchedBack: quiet,
      leave: { toProjects: () => {}, toHome: () => {} },
      ledger: () => undefined,
      places: () => undefined,
      chooseCopyLocation: async () => undefined,
      choosePdfLocation: async () => undefined,
    } as unknown as WorkspaceContext;
    const workspace = editorWorkspace.mount(into, context);
    const mounted: MountedWorkspace = {
      ...workspace,
      unmount: () => {
        live.splice(live.indexOf(mounted), 1);
        return workspace.unmount();
      },
    };
    live.push(mounted);
    await vi.waitFor(() => expect(into.querySelector(".ProseMirror")).not.toBeNull());
    const page = into.querySelector<HTMLElement>(".desk > .page")!;
    page.getBoundingClientRect = window.paper;
    return { into, mounted, scroller, window };
  }

  /** A key pressed on whatever holds the focus. */
  const press = (key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    (document.activeElement ?? document.body).dispatchEvent(event);
    return event;
  };
  /** The zoom the paper is drawn at, as the stylesheet reads it, to four places. */
  const drawn = (): string => Number(document.documentElement.style.getPropertyValue("--paper-zoom")).toFixed(4);

  it("draws the paper at 100%, the middle level, when it opens", async () => {
    const { mounted } = await editor();
    expect(drawn()).toBe("1.0000");
    expect(paperZoomLevel()).toBe(2);
    await mounted.unmount();
  });

  it("steps a level with Ctrl+= and Ctrl++, back with Ctrl+-, and to 100% with Ctrl+0, keeping each key from the webview", async () => {
    const { mounted } = await editor();
    const keys: [string, KeyboardEventInit, number, string][] = [
      // On the first window the panels' level is held at 100%.
      ["=", { ctrlKey: true }, 3, "1.0000"],
      ["+", { ctrlKey: true, shiftKey: true }, 4, "1.3186"],
      ["-", { ctrlKey: true }, 3, "1.0000"],
      ["+", { ctrlKey: true }, 4, "1.3186"],
      ["0", { ctrlKey: true }, 2, "1.0000"],
      ["-", { metaKey: true }, 1, "0.8769"],
      ["Subtract", { ctrlKey: true }, 0, "0.7538"],
      ["=", { metaKey: true }, 1, "0.8769"],
      ["Add", { ctrlKey: true }, 2, "1.0000"],
    ];
    for (const [key, held, level, zoom] of keys) {
      const event = press(key, held);
      expect(event.defaultPrevented, key).toBe(true);
      expect([paperZoomLevel(), drawn()], `${key} ${JSON.stringify(held)}`).toEqual([level, zoom]);
    }
    await mounted.unmount();
  });

  it("walks the levels while the key is held, and stops at either end", async () => {
    const { mounted } = await editor();
    press("=", { ctrlKey: true });
    for (let held = 0; held < 6; held += 1) press("=", { ctrlKey: true, repeat: true });
    expect([paperZoomLevel(), drawn()]).toEqual([4, "1.3186"]);
    press("=", { ctrlKey: true });
    expect([paperZoomLevel(), drawn()]).toEqual([4, "1.3186"]);
    // Reset goes to the middle from either end.
    press("0", { ctrlKey: true });
    expect([paperZoomLevel(), drawn()]).toEqual([2, "1.0000"]);
    for (let held = 0; held < 6; held += 1) press("-", { ctrlKey: true, repeat: held > 0 });
    expect([paperZoomLevel(), drawn()]).toEqual([0, "0.7538"]);
    press("-", { ctrlKey: true });
    expect([paperZoomLevel(), drawn()]).toEqual([0, "0.7538"]);
    press("0", { ctrlKey: true });
    expect([paperZoomLevel(), drawn()]).toEqual([2, "1.0000"]);
    await mounted.unmount();
  });

  it("zooms from View's Zoom row, whose − and + leave the menu open, and from Reset Zoom, which closes it", async () => {
    const { into, mounted } = await editor();
    into.querySelectorAll<HTMLButtonElement>(".panel__row")[2]!.click();
    const menu = into.querySelector<HTMLElement>('[role="menu"][aria-label="View"]')!;
    const row = menu.querySelector<HTMLElement>(".drop-menu__stepper")!;
    const dots = (): string =>
      [...row.querySelectorAll(".drop-menu__dot")].map((dot) => (dot.classList.contains("drop-menu__dot--on") ? "●" : "○")).join("");
    const step = (label: string): void => row.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click();
    expect(dots()).toBe("○○●○○");
    step("Zoom In");
    step("Zoom In");
    expect([drawn(), dots(), menu.hidden]).toEqual(["1.3186", "○○○○●", false]);
    step("Zoom Out");
    step("Zoom Out");
    step("Zoom Out");
    expect([drawn(), dots(), menu.hidden]).toEqual(["0.8769", "○●○○○", false]);
    row.focus();
    row.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    expect([drawn(), dots(), menu.hidden]).toEqual(["0.7538", "●○○○○", false]);
    [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((item) => item.textContent === "Reset Zoom[Ctrl + 0]")!.click();
    expect([drawn(), menu.hidden]).toEqual(["1.0000", true]);
    // Opened again, the dots say where the paper is now.
    into.querySelectorAll<HTMLButtonElement>(".panel__row")[2]!.click();
    expect(dots()).toBe("○○●○○");
    await mounted.unmount();
  });

  it("keeps the level when the window changes size, and works its size out again", async () => {
    const { mounted } = await editor();
    press("=", { ctrlKey: true });
    press("=", { ctrlKey: true });
    expect([paperZoomLevel(), drawn()]).toEqual([4, "1.3186"]);
    size.width = 1400;
    window.dispatchEvent(new Event("resize"));
    expect([paperZoomLevel(), drawn()]).toEqual([4, ((1400 - 24) / 816).toFixed(4)]);
    // Narrower than the sheet: edge to edge is held at 100%.
    size.width = 700;
    window.dispatchEvent(new Event("resize"));
    expect([paperZoomLevel(), drawn()]).toEqual([4, "1.0000"]);
    size.width = 1100;
    size.height = 1000;
    press("0", { ctrlKey: true });
    press("-", { ctrlKey: true });
    press("-", { ctrlKey: true });
    expect([paperZoomLevel(), drawn()]).toEqual([0, ((1000 - 24) / 1056).toFixed(4)]);
    size.height = 600;
    window.dispatchEvent(new Event("resize"));
    expect([paperZoomLevel(), drawn()]).toEqual([0, ((600 - 24) / 1056).toFixed(4)]);
    await mounted.unmount();
  });

  it("keeps the paper centred across the window, and does not follow a caret near its right margin", async () => {
    const { mounted, scroller, window } = await editor();
    // The caret at the end of a line, 700px across the sheet's 816.
    vi.spyOn(EditorView.prototype, "coordsAtPos").mockImplementation(window.caretAt(700, 1500) as never);
    const centred = (): number => window.paper().left + window.paper().width / 2 - size.width / 2;
    for (const [key, scale] of [["=", "1.0000"], ["=", "1.3186"], ["-", "1.0000"], ["-", "1.0000"], ["-", "0.8769"]] as const) {
      press(key, { ctrlKey: true });
      expect(drawn()).toBe(scale);
      expect(centred(), `${key} at ${scale}`).toBeCloseTo(0);
      expect(scroller.scrollLeft).toBeCloseTo(0);
    }
    // The paper scrolled sideways (a trackpad, or the writer reaching a panel at
    // the largest zoom): the next zoom puts it back in the middle.
    press("=", { ctrlKey: true });
    window.scroll({ left: 260 });
    press("=", { ctrlKey: true });
    expect(centred()).toBeCloseTo(0);
    // And so does a resize.
    window.scroll({ left: -180 });
    size.width = 1300;
    globalThis.dispatchEvent(new Event("resize"));
    expect(centred()).toBeCloseTo(0);
    await mounted.unmount();
  });

  it("keeps the caret's line where it was in the window as the paper grows and shrinks", async () => {
    const { mounted, window } = await editor();
    const caret = window.caretAt(500, 1800);
    vi.spyOn(EditorView.prototype, "coordsAtPos").mockImplementation(caret as never);
    window.scroll({ top: 1500 });
    expect(caret().top).toBe(300);
    for (const key of ["=", "=", "-", "-", "-", "-", "0"]) {
      press(key, { ctrlKey: true });
      expect(caret().top, `${key} at ${drawn()}`).toBeCloseTo(300);
    }
    await mounted.unmount();
  });

  it("at the largest level leaves the panels on the desk, past the window's edges, and Alt+F still opens File", async () => {
    const { into, mounted } = await editor();
    press("=", { ctrlKey: true });
    press("=", { ctrlKey: true });
    expect(paperZoomLevel()).toBe(4);
    // The paper and a gap either side fill the window; the panels hang beyond the gaps.
    expect(Number(drawn()) * 816 + 2 * 12).toBeCloseTo(1100, 0);
    const columns = into.querySelectorAll<HTMLElement>(".desk > .desk__column");
    expect(columns).toHaveLength(2);
    for (const column of columns) expect(column.hidden).toBe(false);
    press("f", { altKey: true });
    const file = into.querySelector<HTMLElement>('[role="menu"][aria-label="File"]')!;
    expect(file.hidden).toBe(false);
    expect(into.querySelector(".desk__column--left")!.contains(file)).toBe(true);
    press("Escape");
    press("0", { ctrlKey: true });
    expect(into.querySelectorAll(".desk > .desk__column")).toHaveLength(2);
    await mounted.unmount();
  });

  it("does not change the page count: the paper is drawn larger, not laid out again", async () => {
    const statuses: string[] = [];
    const { mounted } = await editor(statuses);
    await vi.waitFor(() => expect(statuses.at(-1)).toMatch(/^p\. /));
    const before = statuses.at(-1);
    for (const key of ["=", "=", "-", "-", "-", "-"]) press(key, { ctrlKey: true });
    expect(drawn()).toBe("0.7538");
    expect(statuses.at(-1)).toBe(before);
    await mounted.unmount();
  });

  it("is kept for the rest of the run: the next project opened is drawn at the same level", async () => {
    const first = await editor();
    press("-", { ctrlKey: true });
    expect(drawn()).toBe("0.8769");
    expect(await first.mounted.unmount()).toBe(true);
    // With no paper up, nothing is drawn zoomed.
    expect(drawn()).toBe("1.0000");
    const second = await editor();
    expect(drawn()).toBe("0.8769");
    expect(paperZoomLevel()).toBe(1);
    await second.mounted.unmount();
  });

  it("is nothing once the Editor is gone", async () => {
    const { mounted } = await editor();
    await mounted.unmount();
    const event = press("=", { ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(paperZoomLevel()).toBe(2);
    size.width = 1600;
    window.dispatchEvent(new Event("resize"));
    expect(drawn()).toBe("1.0000");
  });

  it("puts the zoom on the paper alone: the panels and the dialogs are not inside it", async () => {
    const { into, mounted } = await editor();
    const page = into.querySelector<HTMLElement>(".desk > .page")!;
    expect(page).not.toBeNull();
    for (const panel of into.querySelectorAll(".desk__column")) expect(page.contains(panel)).toBe(false);
    press("k", { ctrlKey: true });
    const dialog = into.querySelector("dialog[open]")!;
    expect(dialog).not.toBeNull();
    expect(page.contains(dialog)).toBe(false);
    dialog.remove();
    await mounted.unmount();
  });
});

describe("the stylesheet", () => {
  const sheets = readdirSync(style)
    .filter((name) => name.endsWith(".css"))
    .map((name) => [name, readFileSync(join(style, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")] as const);
  /** Every rule as `[file, selector, declarations]`. */
  const rules = sheets.flatMap(([name, sheet]) =>
    [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => [name, match[1]!.trim(), match[2]!] as const),
  );

  it("draws the paper zoomed, and nothing else", () => {
    const zoomed = rules.filter(([, , body]) => /(?:^|[\s;])zoom\s*:/.test(body));
    expect(zoomed.map(([name, selector, body]) => [name, selector, body.match(/zoom\s*:[^;]*/)![0]])).toEqual([
      ["editor.css", ".page", "zoom: var(--paper-zoom)"],
    ]);
  });

  it("lets only the paper, its column on the desk and its fades read the zoom; no chrome does", () => {
    const readers = rules
      .filter(([name, , body]) => name !== "tokens.css" && body.includes("--paper-zoom"))
      .map(([name, selector]) => `${name} ${selector}`);
    expect(readers.sort()).toEqual(["editor.css .page", "editor.css .paper-fade", "panels.css .desk"]);
    expect(rules.find(([, selector]) => selector === ".desk")![2]).toContain(
      "grid-template-columns: 0 calc(var(--page-width) * var(--paper-zoom)) 0",
    );
    expect(rules.find(([name, selector]) => name === "editor.css" && selector === ".paper-fade")![2]).toContain(
      "width: min(calc(var(--page-width) * var(--paper-zoom)), 100%)",
    );
  });

  it("starts at 100%, and leaves the type and the insets that the page count reads alone", () => {
    expect(readFileSync(join(style, "tokens.css"), "utf8")).toMatch(/--paper-zoom: 1;/);
    const geometry = readFileSync(join(style, "geometry.css"), "utf8");
    expect(geometry).not.toContain("paper-zoom");
  });
});
