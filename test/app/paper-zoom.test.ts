/**
 * View ▸ Zoom: the paper drawn larger or smaller, and nothing else.
 *
 * Checked three ways: the steps and the two ends, as numbers; the keys and the
 * View menu, in a mounted Editor on Brick & Steel, by the zoom they leave on
 * the document; and the stylesheet, for which rules read the zoom — the paper,
 * its column and its fades, and no piece of chrome.
 */
// @vitest-environment jsdom
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MountedWorkspace, WorkspaceContext } from "../../app/src/shell/workspace.ts";
import {
  paperZoom,
  setPaperZoom,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_RESET,
  ZOOM_STEP,
  zoomedIn,
  zoomedOut,
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

describe("the steps and the ends", () => {
  it("are 10% a step, from 50% to 200%, starting at 100%", () => {
    expect([ZOOM_STEP, ZOOM_MIN, ZOOM_MAX, ZOOM_RESET]).toEqual([10, 50, 200, 100]);
    expect(zoomedIn(100)).toBe(110);
    expect(zoomedOut(100)).toBe(90);
  });

  it("go no further than either end", () => {
    expect(zoomedIn(200)).toBe(200);
    expect(zoomedIn(195)).toBe(200);
    expect(zoomedOut(50)).toBe(50);
    expect(zoomedOut(55)).toBe(50);
  });

  it("land on whole steps all the way, with no drift: ten in from 100 is 200, five out is 50", () => {
    let percent = ZOOM_RESET;
    const walked: number[] = [];
    for (let step = 0; step < 12; step += 1) walked.push((percent = zoomedIn(percent)));
    expect(walked).toEqual([110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 200, 200]);
    percent = ZOOM_RESET;
    walked.length = 0;
    for (let step = 0; step < 7; step += 1) walked.push((percent = zoomedOut(percent)));
    expect(walked).toEqual([90, 80, 70, 60, 50, 50, 50]);
  });

  it("are held to when set from outside them", () => {
    setPaperZoom(500);
    expect(paperZoom()).toBe(200);
    setPaperZoom(10);
    expect(paperZoom()).toBe(50);
    setPaperZoom(ZOOM_RESET);
  });
});

describe("in the Editor", () => {
  let temporary: { path: string; remove: () => void };
  beforeEach(() => {
    temporary = temporaryDirectory();
    setPaperZoom(ZOOM_RESET);
  });
  afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.style.removeProperty("--paper-zoom");
    temporary.remove();
  });

  async function editor(statuses: string[] = []): Promise<{ into: HTMLElement; mounted: MountedWorkspace }> {
    const into = document.createElement("div");
    document.body.append(into);
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
    const mounted = editorWorkspace.mount(into, context);
    await vi.waitFor(() => expect(into.querySelector(".ProseMirror")).not.toBeNull());
    return { into, mounted };
  }

  /** A key pressed on whatever holds the focus. */
  const press = (key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    (document.activeElement ?? document.body).dispatchEvent(event);
    return event;
  };
  /** The zoom the paper is drawn at, as the stylesheet reads it. */
  const drawn = (): string => document.documentElement.style.getPropertyValue("--paper-zoom");

  it("draws the paper at 100% when it opens", async () => {
    const { mounted } = await editor();
    expect(drawn()).toBe("1");
    await mounted.unmount();
  });

  it("zooms in with Ctrl+= and with Ctrl++, out with Ctrl+-, and back to 100% with Ctrl+0, keeping each key from the webview", async () => {
    const { mounted } = await editor();
    const keys: [string, KeyboardEventInit, string][] = [
      ["=", { ctrlKey: true }, "1.1"],
      ["+", { ctrlKey: true, shiftKey: true }, "1.2"],
      ["+", { ctrlKey: true }, "1.3"],
      ["-", { ctrlKey: true }, "1.2"],
      ["0", { ctrlKey: true }, "1"],
      ["-", { metaKey: true }, "0.9"],
      ["=", { metaKey: true }, "1"],
    ];
    for (const [key, held, zoom] of keys) {
      const event = press(key, held);
      expect(event.defaultPrevented, key).toBe(true);
      expect(drawn(), `${key} ${JSON.stringify(held)}`).toBe(zoom);
    }
    await mounted.unmount();
  });

  it("steps on while the key is held, and stops at 200% and at 50%", async () => {
    const { mounted } = await editor();
    press("=", { ctrlKey: true });
    for (let held = 0; held < 15; held += 1) press("=", { ctrlKey: true, repeat: true });
    expect(drawn()).toBe("2");
    expect(paperZoom()).toBe(200);
    press("=", { ctrlKey: true });
    expect(drawn()).toBe("2");
    // Reset goes to 100% from either end.
    press("0", { ctrlKey: true });
    expect(drawn()).toBe("1");
    for (let held = 0; held < 15; held += 1) press("-", { ctrlKey: true, repeat: held > 0 });
    expect(drawn()).toBe("0.5");
    press("-", { ctrlKey: true });
    expect(drawn()).toBe("0.5");
    press("0", { ctrlKey: true });
    expect(drawn()).toBe("1");
    await mounted.unmount();
  });

  it("zooms from View ▸ Zoom In, Zoom Out and Reset Zoom", async () => {
    const { into, mounted } = await editor();
    const choose = (label: string): void => {
      into.querySelectorAll<HTMLButtonElement>(".panel__row")[2]!.click();
      const items = [...into.querySelectorAll<HTMLButtonElement>('[aria-label="View"] [role="menuitem"]')];
      items.find((item) => item.textContent?.startsWith(label))!.click();
    };
    choose("Zoom In");
    choose("Zoom In");
    expect(drawn()).toBe("1.2");
    choose("Zoom Out");
    expect(drawn()).toBe("1.1");
    choose("Reset Zoom");
    expect(drawn()).toBe("1");
    await mounted.unmount();
  });

  it("does not change the page count: the paper is drawn larger, not laid out again", async () => {
    const statuses: string[] = [];
    const { mounted } = await editor(statuses);
    await vi.waitFor(() => expect(statuses.at(-1)).toMatch(/^p\. /));
    const before = statuses.at(-1);
    press("=", { ctrlKey: true });
    press("=", { ctrlKey: true });
    press("-", { ctrlKey: true });
    press("-", { ctrlKey: true });
    press("-", { ctrlKey: true });
    expect(drawn()).toBe("0.9");
    expect(statuses.at(-1)).toBe(before);
    await mounted.unmount();
  });

  it("is kept for the rest of the run: the next project opened is drawn at the same zoom", async () => {
    const first = await editor();
    press("=", { ctrlKey: true });
    press("=", { ctrlKey: true });
    expect(drawn()).toBe("1.2");
    expect(await first.mounted.unmount()).toBe(true);
    // With no paper up, nothing is drawn zoomed.
    expect(drawn()).toBe("1");
    const second = await editor();
    expect(drawn()).toBe("1.2");
    expect(paperZoom()).toBe(120);
    await second.mounted.unmount();
  });

  it("is nothing once the Editor is gone", async () => {
    const { mounted } = await editor();
    await mounted.unmount();
    const event = press("=", { ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(paperZoom()).toBe(100);
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
