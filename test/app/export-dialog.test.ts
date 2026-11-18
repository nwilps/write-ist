/**
 * File ▸ Export As…: the dialog, what it hands on, and the real Editor behind
 * it. What each format writes is checked with the format (`test/pdf/`,
 * `test/project/copy.test.ts`); this is that the writer's choices reach it.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EditorView } from "prosemirror-view";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MountedWorkspace, WorkspaceContext } from "../../app/src/shell/workspace.ts";
import { openExportDialog } from "../../app/src/workspaces/editor/export-dialog.ts";
import { EXPORT_FORMATS, exportScript } from "../../src/project/export-formats.ts";
import { fountainCopyOf } from "../../src/screenplay/fountain-copy.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { fakeEngine } from "../support/spell-engine.ts";

vi.mock("../../app/src/spell-tauri.ts", () => ({ tauriSpellEngine: fakeEngine() }));
const { editorWorkspace } = await import("../../app/src/workspaces/editor/editor.ts");

// jsdom has no modal dialog.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  HTMLFormElement.prototype.requestSubmit = function () {
    this.dispatchEvent(new Event("submit", { cancelable: true }));
  };
});
afterEach(() => document.body.replaceChildren());

const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

function opened(write: (id: string, range: unknown) => Promise<boolean> = async () => true) {
  const written = vi.fn(write);
  const closed = vi.fn();
  const report = vi.fn();
  const into = document.body.appendChild(document.createElement("div"));
  const modal = openExportDialog(into, {
    formats: EXPORT_FORMATS,
    pageCount: () => 12,
    write: (format, range) => written(format.id, range),
    report,
    closed,
  });
  const q = <T extends HTMLElement>(selector: string): T => modal.querySelector<T>(selector)!;
  const choose = (id: string): void => {
    q<HTMLInputElement>(`#${id}`).checked = true;
    q(`#${id}`).dispatchEvent(new Event("change", { bubbles: true }));
  };
  const enterIn = (selector: string): KeyboardEvent => {
    const press = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    q(selector).dispatchEvent(press);
    return press;
  };
  const range = (from: string, to: string): void => {
    choose("export-pages-range");
    q<HTMLInputElement>("#export-from").value = from;
    q<HTMLInputElement>("#export-to").value = to;
  };
  const button = (label: string): HTMLButtonElement =>
    [...modal.querySelectorAll("button")].find((b) => b.textContent === label)!;
  const problem = (): string => q(".new-project__problem").textContent ?? "";
  return { modal, written, closed, report, q, choose, enterIn, range, button, problem };
}

describe("the Export As dialog", () => {
  it("lists every format in the table, with PDF chosen and Export leading", () => {
    const { modal, q, button } = opened();
    const labels = [...modal.querySelectorAll(".export-as__choices")][0]!.textContent;
    expect(labels).toBe("PDFFountain");
    expect(EXPORT_FORMATS.map((format) => format.id)).toEqual(["pdf", "fountain"]);
    expect(q<HTMLInputElement>("#export-format-pdf").checked).toBe(true);
    expect(q<HTMLInputElement>("#export-pages-all").checked).toBe(true);
    expect(button("Export").type).toBe("submit");
    expect(button("Export").classList.contains("button--leading")).toBe(true);
    expect(modal.querySelector("[title]")).toBeNull();
  });

  it("offers a page range for PDF and not for Fountain", () => {
    const { q, choose } = opened();
    expect(q(".export-as__pages").hidden).toBe(false);
    choose("export-format-fountain");
    expect(q(".export-as__pages").hidden).toBe(true);
    choose("export-format-pdf");
    expect(q(".export-as__pages").hidden).toBe(false);
  });

  it("fills in the whole script when the writer switches to a range", () => {
    const { q, choose } = opened();
    expect(q<HTMLInputElement>("#export-from").disabled).toBe(true);
    choose("export-pages-range");
    expect(q<HTMLInputElement>("#export-from").disabled).toBe(false);
    expect(q<HTMLInputElement>("#export-from").value).toBe("1");
    expect(q<HTMLInputElement>("#export-to").value).toBe("12");
  });

  it("exports all pages on Enter from a choice, then closes without a word", async () => {
    const { modal, written, closed, enterIn, problem } = opened();
    expect(enterIn("#export-format-pdf").defaultPrevented).toBe(true);
    await settled();
    expect(written).toHaveBeenCalledExactlyOnceWith("pdf", undefined);
    expect(modal.isConnected).toBe(false);
    expect(closed).toHaveBeenCalledOnce();
    expect(problem()).toBe("");
  });

  it("exports the range on Enter from a page box", async () => {
    const { written, range, enterIn } = opened();
    range("2", "3");
    enterIn("#export-to");
    await settled();
    expect(written).toHaveBeenCalledExactlyOnceWith("pdf", { from: 2, to: 3 });
  });

  it("leaves Enter on Cancel to Cancel, and Alt+Enter to the window", async () => {
    const { written, q, button } = opened();
    const press = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    button("Cancel").dispatchEvent(press);
    expect(press.defaultPrevented).toBe(false);
    q("#export-format-pdf").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true }));
    await settled();
    expect(written).not.toHaveBeenCalled();
  });

  it("is cancelled by Escape and by Cancel, writing nothing", () => {
    const escaped = opened();
    // What the webview does for Escape on a modal dialog.
    expect(escaped.modal.dispatchEvent(new Event("cancel", { cancelable: true }))).toBe(true);
    escaped.modal.close();
    expect(escaped.closed).toHaveBeenCalledOnce();
    expect(escaped.written).not.toHaveBeenCalled();
    const cancelled = opened();
    cancelled.button("Cancel").click();
    expect(cancelled.modal.isConnected).toBe(false);
    expect(cancelled.written).not.toHaveBeenCalled();
  });

  it.each([
    ["3", "2", "cannot come after"],
    ["0", "2", "pages 1 to 12"],
    ["1", "13", "pages 1 to 12"],
    ["1.5", "2", "whole numbers"],
    ["", "2", "whole numbers"],
  ])("refuses From %s To %s and stays open", async (from, to, words) => {
    const { modal, written, range, enterIn, problem, q } = opened();
    range(from, to);
    enterIn("#export-to");
    await settled();
    expect(written).not.toHaveBeenCalled();
    expect(modal.open).toBe(true);
    expect(problem()).toContain(words);
    q("#export-to").dispatchEvent(new Event("input"));
    expect(problem()).toBe("");
  });

  it("lets the webview's own validation stay out of the way of those words", () => {
    expect(opened().q<HTMLFormElement>("form").noValidate).toBe(true);
  });

  it("hands Fountain no range, whatever was left in the boxes", async () => {
    const { written, range, choose, enterIn, problem } = opened();
    range("9", "2");
    choose("export-format-fountain");
    enterIn("#export-format-fountain");
    await settled();
    expect(problem()).toBe("");
    expect(written).toHaveBeenCalledExactlyOnceWith("fountain", undefined);
  });

  it("stays open, as it was, when the save dialog is cancelled", async () => {
    const { modal, closed, range, enterIn, q, problem } = opened(async () => false);
    range("2", "3");
    enterIn("#export-to");
    await settled();
    expect(modal.open).toBe(true);
    expect(closed).not.toHaveBeenCalled();
    expect(q<HTMLInputElement>("#export-from").value).toBe("2");
    expect(problem()).toBe("");
  });

  it("says a failure in the dialog, and the screenplay is unchanged", async () => {
    const { modal, enterIn, problem, report } = opened(async () => {
      throw new Error("The disk is full.");
    });
    enterIn("#export-format-pdf");
    await settled();
    expect(modal.open).toBe(true);
    expect(problem()).toBe("Write-ist could not export the PDF. Your screenplay is unchanged. The disk is full.");
    expect(report).not.toHaveBeenCalled();
  });

  it("will not start twice or be dismissed while a file is on its way", async () => {
    let finish: (done: boolean) => void = () => {};
    const { modal, written, enterIn, button } = opened(() => new Promise((resolve) => (finish = resolve)));
    enterIn("#export-format-pdf");
    enterIn("#export-format-pdf");
    expect(written).toHaveBeenCalledOnce();
    button("Cancel").click();
    expect(modal.dispatchEvent(new Event("cancel", { cancelable: true }))).toBe(false);
    expect(modal.open).toBe(true);
    finish(true);
    await settled();
    expect(modal.isConnected).toBe(false);
  });
});

describe("exportScript", () => {
  const places = (destination: string | undefined) => ({
    chooseCopyLocation: vi.fn(async (_name: string) => destination),
    choosePdfLocation: vi.fn(async (_name: string) => destination),
  });
  const project = { path: "/p", marker: { name: "Small" } } as never;
  const fountain = EXPORT_FORMATS.find((format) => format.id === "fountain")!;
  const source = "INT. A - DAY\n\nHi [[c:a1 private]]there[[/c:a1]].\n\n/*\n\nCut.\n\n*/\n\nBye.\n";

  it("writes the same clean whole-script copy, with or without a leftover range", async () => {
    const writes: Uint8Array[] = [];
    const filesystem = { writeFile: async (_path: string, bytes: Uint8Array) => void writes.push(bytes) };
    const job = {
      filesystem: filesystem as never,
      project,
      places: places("/out/a.fountain"),
      document: () => parse(source),
      faces: () => Promise.reject(new Error("a Fountain copy needs no fonts")),
    };
    expect(await exportScript(fountain, job)).toBe(true);
    expect(await exportScript(fountain, { ...job, range: { from: 2, to: 1 } })).toBe(true);
    expect(job.places.chooseCopyLocation).toHaveBeenCalledWith("Small.fountain");
    expect(writes[0]).toEqual(fountainCopyOf(parse(source)));
    expect(writes[1]).toEqual(writes[0]);
    expect(new TextDecoder().decode(writes[0])).not.toMatch(/private|Cut\./);
  });

  it("writes nothing and reads nothing when the save dialog is cancelled", async () => {
    for (const format of EXPORT_FORMATS) {
      const writeFile = vi.fn();
      const document = vi.fn(() => parse(source));
      const answered = await exportScript(format, {
        filesystem: { writeFile } as never,
        project,
        places: places(undefined),
        document,
        faces: () => Promise.reject(new Error("not reached")),
      });
      expect(answered, format.id).toBe(false);
      expect(writeFile).not.toHaveBeenCalled();
      expect(document).not.toHaveBeenCalled();
    }
  });

  it("refuses the project's own manuscript, in either format", async () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const font = new Uint8Array(readFileSync(join(root, "app", "public", "fonts", "CourierPrime-Regular.ttf")));
    const faces = async () => ({ regular: font, bold: font, italic: font, boldItalic: font });
    for (const format of EXPORT_FORMATS) {
      const writeFile = vi.fn();
      await expect(
        exportScript(format, {
          filesystem: { writeFile } as never,
          project,
          places: places("/p/manuscript.fountain"),
          document: () => parse(source),
          faces,
        }),
      ).rejects.toThrow(/own manuscript/);
      expect(writeFile).not.toHaveBeenCalled();
    }
  });
});

describe("Export As… in the Editor", () => {
  /** The real Editor over a project held in memory, the File menu's item pressed. */
  async function editing() {
    const manuscript = new TextEncoder().encode("INT. A - DAY\n\nHello.\n");
    const writes = new Map<string, Uint8Array>();
    const filesystem = new Proxy(
      {
        readFile: async () => manuscript,
        writeFile: async (path: string, bytes: Uint8Array) => void writes.set(path, bytes),
      } as Record<string, unknown>,
      { get: (target, name) => target[name as string] ?? (async () => undefined) },
    );
    const quiet = (): (() => void) => () => {};
    const context = {
      project: { path: "/p", marker: { name: "Small", projectId: "x" } },
      filesystem,
      report: vi.fn(),
      setStatus: () => {},
      setGoal: () => {},
      whenGoalsAsked: quiet,
      setSaved: () => {},
      setSpellcheck: () => {},
      whenSwitchedAway: quiet,
      whenSwitchedBack: quiet,
      leave: { toProjects: () => {}, toHome: () => {} },
      ledger: () => undefined,
      places: () => undefined,
      chooseCopyLocation: async () => "/out/copy.fountain",
      choosePdfLocation: async () => undefined,
    } as unknown as WorkspaceContext;
    const into = document.body.appendChild(document.createElement("div"));
    // The Editor keeps its view to itself; it sets the caret's room on it as it opens.
    const viewSeen = vi.spyOn(EditorView.prototype, "setProps");
    const mounted: MountedWorkspace = editorWorkspace.mount(into, context);
    await vi.waitFor(() => expect(into.querySelector(".ProseMirror")).not.toBeNull());
    const view = viewSeen.mock.contexts[0] as EditorView;
    viewSeen.mockRestore();
    return { into, writes, mounted, view };
  }
  const pressFileExportAs = (into: HTMLElement): void => {
    into.querySelector<HTMLElement>(".panel__row")!.click();
    const items = [...into.querySelectorAll<HTMLElement>('[aria-label="File"] [role="menuitem"]')];
    items.find((item) => item.textContent?.startsWith("Export As…"))!.click();
  };

  it("opens from the File menu and writes the live script, unsaved typing included, saving nothing", async () => {
    const { into, writes, mounted, view } = await editing();
    view.dispatch(view.state.tr.insertText(" Unsaved.", view.state.doc.content.size - 1));
    pressFileExportAs(into);
    const modal = into.querySelector<HTMLDialogElement>("dialog.export-as")!;
    expect(modal.open).toBe(true);
    const fountain = modal.querySelector<HTMLInputElement>("#export-format-fountain")!;
    fountain.checked = true;
    fountain.dispatchEvent(new Event("change", { bubbles: true }));
    modal.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(modal.isConnected).toBe(false));
    expect([...writes.keys()]).toEqual(["/out/copy.fountain"]);
    expect(new TextDecoder().decode(writes.get("/out/copy.fountain"))).toContain("Hello. Unsaved.");
    await mounted.unmount();
  });
});
