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
  /** The bold each export asked for, in order: absent for a format not set in type. */
  const emphases: unknown[] = [];
  const closed = vi.fn();
  const report = vi.fn();
  const into = document.body.appendChild(document.createElement("div"));
  const modal = openExportDialog(into, {
    formats: EXPORT_FORMATS,
    pageCount: () => 12,
    write: (format, range, emphasis) => {
      emphases.push(emphasis);
      return written(format.id, range);
    },
    report,
    closed,
  });
  const q = <T extends HTMLElement>(selector: string): T => modal.querySelector<T>(selector)!;
  /** Open the drop-down and click the row with this label. */
  const choose = (id: string, label: string): void => {
    q(`#${id}`).click();
    [...modal.querySelectorAll<HTMLElement>(`#${id}-list [role="option"]`)].find((row) => row.textContent === label)!.click();
  };
  const press = (key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    document.activeElement!.dispatchEvent(event);
    return event;
  };
  const box = (id: string): HTMLInputElement => q<HTMLInputElement>(`#${id}`);
  /** Whether the writer can use Pages, From and To: always drawn, dimmed when not. */
  const pagesOn = (): boolean => !q<HTMLButtonElement>("#export-pages").disabled;
  const rangeOn = (): boolean => !box("export-from").disabled && !box("export-to").disabled;
  /** Enter from a page box being typed in. */
  const enterIn = (selector: string): void => {
    q(selector).focus();
    q(selector).dispatchEvent(new Event("input", { bubbles: true }));
    press("Enter");
  };
  /** Enter on Export itself. */
  const exportNow = (): void => {
    button("Export").focus();
    press("Enter");
  };
  const range = (from: string, to: string): void => {
    choose("export-pages", "Page Range");
    q<HTMLInputElement>("#export-from").value = from;
    q<HTMLInputElement>("#export-to").value = to;
  };
  const button = (label: string): HTMLButtonElement =>
    [...modal.querySelectorAll("button")].find((b) => b.textContent?.includes(label))!;
  const problem = (): string => q(".new-project__problem").textContent ?? "";
  const walk = (count: number) => Array.from({ length: count }, () => (press("Tab"), document.activeElement));
  return { modal, written, emphases, closed, report, q, box, choose, press, pagesOn, rangeOn, enterIn, exportNow, range, button, problem, walk };
}

describe("the Export As dialog", () => {
  it("offers every format in the table under File Type, with PDF chosen and Export confirming", () => {
    const { modal, q, button } = opened();
    const format = q<HTMLButtonElement>("#export-format");
    expect(modal.querySelector('label[for="export-format"]')!.textContent).toBe("File Type");
    expect(modal.querySelector('label[for="export-pages"]')!.textContent).toBe("Pages");
    expect(q("#export-format-list").getAttribute("aria-label") ?? q("#export-format-list").ariaLabel).toBe("File Type");
    expect(modal.querySelector("select")).toBeNull();
    expect(format.classList.contains("dialog-select")).toBe(true);
    expect([...modal.querySelectorAll("#export-format-list [role=option]")].map((row) => row.textContent)).toEqual(
      EXPORT_FORMATS.map((each) => each.label),
    );
    expect(EXPORT_FORMATS.map((each) => each.label)).toEqual(["PDF", "Fountain", "Final Draft (.fdx)"]);
    // Every one can be picked: none is drawn as coming soon.
    expect(modal.querySelector(".dialog-select__option--unavailable, [aria-disabled]")).toBeNull();
    expect(format.textContent).toBe("PDF");
    expect(document.activeElement).toBe(format);
    expect([...modal.querySelectorAll("#export-pages-list [role=option]")].map((row) => row.textContent)).toEqual([
      "All Pages",
      "Page Range",
    ]);
    expect(q("#export-pages").textContent).toBe("All Pages");
    expect(modal.querySelector('input[type="radio"]')).toBeNull();
    expect(button("Export").type).toBe("submit");
    expect(modal.querySelector("[title]")).toBeNull();
  });

  it("is built from New Project's pieces", () => {
    const { modal, q, button } = opened();
    expect(modal.classList.contains("new-project-dialog")).toBe(true);
    expect(modal.getAttribute("aria-label") ?? modal.ariaLabel).toBe("Export As");
    expect(modal.querySelector("h2, .report__heading, .field, .button")).toBeNull();
    for (const id of ["export-format", "export-pages", "export-from", "export-to"]) {
      expect(q(`#${id}`).classList.contains("new-project-dialog__input"), id).toBe(true);
      expect(q(`#${id}`).closest(".new-project-dialog__box"), id).not.toBeNull();
      expect(modal.querySelector(`label[for="${id}"].new-project-dialog__label`), id).not.toBeNull();
    }
    for (const id of ["export-format", "export-pages"]) {
      expect(q(`#${id}`).parentElement!.querySelector(".new-project-dialog__chevron"), id).not.toBeNull();
      expect(q(`#${id}`).parentElement!.querySelector(".dialog-select__tray"), id).not.toBeNull();
    }
    // Cancel on the left, Export on the right, each saying its key.
    expect([...q(".new-project-dialog__actions").children]).toEqual([button("Cancel"), button("Export")]);
    expect(button("Cancel").textContent).toBe(">Cancel[Esc]");
    expect(button("Export").textContent).toBe(">Export[Enter]");
    for (const label of ["Cancel", "Export"]) expect(button(label).classList.contains("dialog-action")).toBe(true);
  });

  it("puts the right-click menu's separator under File Type, and Goals' dim arrow between From and To", () => {
    const { q } = opened();
    const typeField = q("#export-format").closest(".new-project-dialog__field")!;
    const divider = typeField.nextElementSibling!;
    expect(divider.className).toBe("drop-menu__divider");
    expect(divider.getAttribute("role")).toBe("separator");
    expect(divider.nextElementSibling).toBe(q("#export-pages").closest(".new-project-dialog__field"));
    // The same separator below From → To, then the two bold switches, then the
    // same separator again straight above Cancel and Export.
    const actions = q(".new-project-dialog__actions");
    const closing = actions.previousElementSibling!;
    expect(closing.outerHTML).toBe(divider.outerHTML);
    expect(closing.previousElementSibling!.className).toBe("new-project__problem");
    const transitions = closing.previousElementSibling!.previousElementSibling!;
    const headings = transitions.previousElementSibling!;
    expect([headings, transitions].map((row) => row.className)).toEqual(["settings__switch", "settings__switch"]);
    expect([headings, transitions].map((row) => row.textContent)).toEqual(["Bold scene headings", "Bold transitions"]);
    expect(headings.previousElementSibling!.outerHTML).toBe(divider.outerHTML);
    expect(headings.previousElementSibling!.previousElementSibling).toBe(q(".export-as__range"));
    expect(q(".new-project-dialog__form").querySelectorAll(".drop-menu__divider")).toHaveLength(3);
    const row = q(".export-as__range");
    expect([...row.children].map((child) => child.textContent)).toEqual(["From", "", "→", "To", ""]);
    expect(row.children[1]!.contains(q("#export-from"))).toBe(true);
    expect(row.children[4]!.contains(q("#export-to"))).toBe(true);
    expect(row.children[2]!.className).toBe("goals__arrow");
    expect(row.children[2]!.getAttribute("aria-hidden") ?? (row.children[2] as HTMLElement).ariaHidden).toBe("true");
  });

  it("walks every control the writer can use, wrapping, and skips what is dimmed", () => {
    const { q, choose, button, walk } = opened();
    const bold = [q("#export-bold-headings"), q("#export-bold-transitions")];
    // PDF, All Pages: From and To are dimmed.
    expect(walk(6)).toEqual([q("#export-pages"), ...bold, button("Cancel"), button("Export"), q("#export-format")]);
    choose("export-pages", "Page Range");
    q("#export-format").focus();
    expect(walk(8)).toEqual([q("#export-pages"), q("#export-from"), q("#export-to"), ...bold, button("Cancel"), button("Export"), q("#export-format")]);
    choose("export-format", "Fountain");
    expect(walk(3)).toEqual([button("Cancel"), button("Export"), q("#export-format")]);
    choose("export-format", "Final Draft (.fdx)");
    expect(walk(2)).toEqual([button("Cancel"), q("#export-format")]);
  });

  it("steps over what is dimmed with the arrows too", () => {
    const { q, choose, press, button } = opened();
    choose("export-format", "Fountain");
    press("ArrowDown");
    expect(document.activeElement).toBe(button("Cancel"));
    press("ArrowRight");
    expect(document.activeElement).toBe(button("Export"));
    press("ArrowDown");
    expect(document.activeElement).toBe(q("#export-format"));
    choose("export-format", "Final Draft (.fdx)");
    press("ArrowDown");
    expect(document.activeElement).toBe(button("Cancel"));
    press("ArrowRight");
    expect(document.activeElement).toBe(button("Cancel"));
    press("ArrowUp");
    expect(document.activeElement).toBe(q("#export-format"));
  });

  it("opens a drop-down on Enter and picks with the arrows, exporting nothing", async () => {
    const { q, press, written, rangeOn } = opened();
    q("#export-pages").focus();
    press("Enter");
    expect(q("#export-pages").getAttribute("aria-expanded")).toBe("true");
    press("ArrowDown");
    press("Enter");
    expect(q("#export-pages").getAttribute("aria-expanded")).toBe("false");
    expect(q("#export-pages").textContent).toBe("Page Range");
    expect(rangeOn()).toBe(true);
    await settled();
    expect(written).not.toHaveBeenCalled();
  });

  it("closes an open drop-down on Escape and only then lets Escape cancel", () => {
    const { modal, q, press } = opened();
    press("Enter");
    expect(press("Escape").defaultPrevented).toBe(true);
    expect(q("#export-format").getAttribute("aria-expanded")).toBe("false");
    expect(modal.dispatchEvent(new Event("cancel", { cancelable: true }))).toBe(false);
    expect(press("Escape").defaultPrevented).toBe(false);
    expect(modal.dispatchEvent(new Event("cancel", { cancelable: true }))).toBe(true);
  });

  it("treats From and To as fields to enter and leave, like New Project's title", () => {
    const { q, choose, press } = opened();
    choose("export-pages", "Page Range");
    const from = q("#export-from");
    from.focus();
    expect(from.classList.contains("dialog-keys__editing")).toBe(false);
    press("ArrowRight");
    expect(document.activeElement).toBe(q("#export-to"));
    press("ArrowLeft");
    press("Enter");
    expect(from.classList.contains("dialog-keys__editing")).toBe(true);
    // Being edited, the arrows are the box's own.
    expect(press("ArrowUp").defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(from);
    expect(press("Escape").defaultPrevented).toBe(true);
    expect(from.classList.contains("dialog-keys__editing")).toBe(false);
  });

  it("offers Pages, From and To for PDF, and dims them all for Fountain and Final Draft", () => {
    const { q, box, choose, pagesOn, rangeOn } = opened();
    expect(pagesOn()).toBe(true);
    choose("export-pages", "Page Range");
    expect(rangeOn()).toBe(true);
    for (const label of ["Fountain", "Final Draft (.fdx)"]) {
      choose("export-format", label);
      expect(pagesOn(), label).toBe(false);
      expect(rangeOn(), label).toBe(false);
      // Drawn, not hidden; Pages goes back to All Pages and the boxes show the whole script.
      expect(q(".export-as__range").hidden, label).toBe(false);
      expect(q("#export-pages").closest<HTMLElement>(".new-project-dialog__field")!.hidden, label).toBe(false);
      expect(q("#export-pages").textContent, label).toBe("All Pages");
      expect([box("export-from").value, box("export-to").value], label).toEqual(["1", "12"]);
    }
    choose("export-format", "PDF");
    expect(pagesOn()).toBe(true);
    expect(q("#export-pages").textContent).toBe("All Pages");
    expect(rangeOn()).toBe(false);
  });

  it("will not open Pages while it is dimmed", () => {
    const { q, choose } = opened();
    choose("export-format", "Fountain");
    q("#export-pages").click();
    q("#export-pages").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(q("#export-pages").getAttribute("aria-expanded")).toBe("false");
    expect(q("#export-pages").parentElement!.querySelector<HTMLElement>(".dialog-select__tray")!.hidden).toBe(true);
  });

  it("shows the whole script, dimmed, under All Pages, and opens the boxes for a Page Range", () => {
    const { box, choose, rangeOn } = opened();
    expect(rangeOn()).toBe(false);
    expect([box("export-from").value, box("export-to").value]).toEqual(["1", "12"]);
    choose("export-pages", "Page Range");
    expect(rangeOn()).toBe(true);
    expect([box("export-from").value, box("export-to").value]).toEqual(["1", "12"]);
    choose("export-pages", "All Pages");
    expect(rangeOn()).toBe(false);
  });

  it("keeps what was typed when the writer steps away from a range and back, showing the whole script meanwhile", () => {
    const { box, choose, range } = opened();
    range("2", "3");
    choose("export-pages", "All Pages");
    expect([box("export-from").value, box("export-to").value]).toEqual(["1", "12"]);
    choose("export-pages", "Page Range");
    expect([box("export-from").value, box("export-to").value]).toEqual(["2", "3"]);
    // And across a format without pages.
    choose("export-format", "Fountain");
    choose("export-format", "PDF");
    choose("export-pages", "Page Range");
    expect([box("export-from").value, box("export-to").value]).toEqual(["2", "3"]);
  });

  it("exports all pages when a range was typed and then All pages chosen", async () => {
    const { written, range, choose, exportNow } = opened();
    range("9", "2");
    choose("export-pages", "All Pages");
    exportNow();
    await settled();
    expect(written).toHaveBeenCalledExactlyOnceWith("pdf", undefined);
  });

  it("exports all pages on Enter on Export, then closes without a word", async () => {
    const { modal, written, closed, exportNow, problem } = opened();
    exportNow();
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
    const { modal, written, button, press } = opened();
    button("Cancel").focus();
    press("Enter");
    expect(modal.isConnected).toBe(false);
    const again = opened();
    again.q("#export-format").focus();
    expect(again.press("Enter", { altKey: true }).defaultPrevented).toBe(false);
    expect(again.q("#export-format").getAttribute("aria-expanded")).toBe("false");
    await settled();
    expect(written).not.toHaveBeenCalled();
    expect(again.written).not.toHaveBeenCalled();
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
    const { written, range, choose, exportNow, problem } = opened();
    range("9", "2");
    choose("export-format", "Fountain");
    exportNow();
    await settled();
    expect(problem()).toBe("");
    expect(written).toHaveBeenCalledExactlyOnceWith("fountain", undefined);
  });

  it("lists Final Draft with Export dimmed: no click, no Enter, no note, and Cancel and Escape still close", async () => {
    const { modal, q, choose, button, press, written, problem } = opened();
    const before = modal.textContent;
    choose("export-format", "Final Draft (.fdx)");
    expect(q("#export-format").textContent).toBe("Final Draft (.fdx)");
    expect(button("Export").disabled).toBe(true);
    expect(modal.textContent).toBe(before.replace("PDF", "Final Draft (.fdx)"));
    button("Export").click();
    // Enter that nothing else uses, as from the dialog's empty space, would confirm.
    modal.focus();
    press("Enter");
    modal.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await settled();
    expect(written).not.toHaveBeenCalled();
    expect(modal.open).toBe(true);
    expect(problem()).toBe("");
    expect(modal.dispatchEvent(new Event("cancel", { cancelable: true }))).toBe(true);
    button("Cancel").click();
    expect(modal.isConnected).toBe(false);
    expect(written).not.toHaveBeenCalled();
  });

  it("lights Export again on leaving Final Draft", async () => {
    const { choose, button, exportNow, written } = opened();
    choose("export-format", "Final Draft (.fdx)");
    choose("export-format", "Fountain");
    expect(button("Export").disabled).toBe(false);
    exportNow();
    await settled();
    expect(written).toHaveBeenCalledExactlyOnceWith("fountain", undefined);
  });

  it("stays open, as it was, when the save dialog is cancelled", async () => {
    const { modal, closed, range, enterIn, q, problem } = opened(async () => false);
    range("2", "3");
    enterIn("#export-to");
    await settled();
    expect(modal.open).toBe(true);
    expect(closed).not.toHaveBeenCalled();
    expect(q("#export-format").textContent).toBe("PDF");
    expect(q("#export-pages").textContent).toBe("Page Range");
    expect(q<HTMLInputElement>("#export-from").value).toBe("2");
    expect(problem()).toBe("");
  });

  it("says a failure in the dialog, and the screenplay is unchanged", async () => {
    const { modal, exportNow, problem, report } = opened(async () => {
      throw new Error("The disk is full.");
    });
    exportNow();
    await settled();
    expect(modal.open).toBe(true);
    expect(problem()).toBe("Write-ist could not export the PDF. Your screenplay is unchanged. The disk is full.");
    expect(report).not.toHaveBeenCalled();
  });

  it("will not start twice or be dismissed while a file is on its way", async () => {
    let finish: (done: boolean) => void = () => {};
    const { modal, written, exportNow, button } = opened(() => new Promise((resolve) => (finish = resolve)));
    exportNow();
    exportNow();
    expect(written).toHaveBeenCalledOnce();
    button("Cancel").click();
    expect(modal.dispatchEvent(new Event("cancel", { cancelable: true }))).toBe(false);
    expect(modal.open).toBe(true);
    finish(true);
    await settled();
    expect(modal.isConnected).toBe(false);
  });
});

describe("bold, for one export", () => {
  it("starts with both switches off, and an untouched export prints headings and transitions regular", async () => {
    const { q, emphases, exportNow } = opened();
    expect([q("#export-bold-headings"), q("#export-bold-transitions")].map((toggle) => toggle.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    exportNow();
    await settled();
    expect(emphases).toEqual([{ boldSceneHeadings: false, boldTransitions: false }]);
  });

  it("prints what the writer switched on, in this export", async () => {
    const { q, emphases, exportNow } = opened(async () => false);
    q("#export-bold-headings").click();
    exportNow();
    await settled();
    q("#export-bold-transitions").click();
    q("#export-bold-headings").click();
    exportNow();
    await settled();
    expect(emphases).toEqual([
      { boldSceneHeadings: true, boldTransitions: false },
      { boldSceneHeadings: false, boldTransitions: true },
    ]);
  });

  it("is dimmed, and asks for nothing, for a format not set in type", async () => {
    const { q, choose, emphases, exportNow } = opened();
    q("#export-bold-headings").click();
    choose("export-format", "Fountain");
    expect(q<HTMLButtonElement>("#export-bold-headings").disabled).toBe(true);
    expect(q<HTMLButtonElement>("#export-bold-transitions").disabled).toBe(true);
    exportNow();
    await settled();
    expect(emphases).toEqual([undefined]);
    choose("export-format", "PDF");
    expect(q<HTMLButtonElement>("#export-bold-headings").disabled).toBe(false);
  });

  it("opens off again next time: the choice is never kept", async () => {
    const first = opened(async () => false);
    first.q("#export-bold-headings").click();
    first.modal.close();
    const { q } = opened();
    expect(q("#export-bold-headings").getAttribute("aria-checked")).toBe("false");
  });
});

describe("exportScript", () => {
  const places = (destination: string | undefined) => ({
    chooseCopyLocation: vi.fn(async (_name: string) => destination),
    choosePdfLocation: vi.fn(async (_name: string) => destination),
  });
  const project = { path: "/p", marker: { name: "Small" } } as never;
  const fountain = EXPORT_FORMATS.find((format) => format.id === "fountain")!;
  const writable = EXPORT_FORMATS.filter((format) => format.writable);
  const source = "INT. A - DAY\n\nHi [[c:a1 private]]there[[/c:a1]].\n\n/*\n\nCut.\n\n*/\n\nBye.\n";

  it("hands this export's bold to a format set in type, and to no other", async () => {
    const pdf = EXPORT_FORMATS.find((format) => format.id === "pdf")!;
    const seen: unknown[] = [];
    const watching = (format: (typeof EXPORT_FORMATS)[number]) => ({ ...format, write: async (job: { emphasis?: unknown }) => void seen.push(job.emphasis) });
    const job = {
      filesystem: {} as never,
      project,
      places: places("/out/a"),
      document: () => parse(source),
      faces: () => Promise.reject(new Error("unused")),
      emphasis: { boldSceneHeadings: true, boldTransitions: false },
    };
    await exportScript(watching(pdf), job);
    await exportScript(watching(fountain), job);
    await exportScript(watching(pdf), { ...job, emphasis: undefined });
    expect(seen).toEqual([{ boldSceneHeadings: true, boldTransitions: false }, undefined, undefined]);
  });

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
    expect(writable.map((format) => format.id)).toEqual(["pdf", "fountain"]);
    for (const format of writable) {
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
    for (const format of writable) {
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

  it("lists Final Draft with no writer: it asks nowhere, reads nothing and writes nothing", async () => {
    const fdx = EXPORT_FORMATS.find((format) => format.id === "fdx")!;
    expect(fdx).toMatchObject({ label: "Final Draft (.fdx)", writable: false, pageRange: false });
    const writeFile = vi.fn();
    const document = vi.fn(() => parse(source));
    const asked = places("/out/a.fdx");
    await expect(
      exportScript(fdx, {
        filesystem: { writeFile } as never,
        project,
        places: asked,
        document,
        faces: () => Promise.reject(new Error("not reached")),
      }),
    ).rejects.toThrow(/cannot export Final Draft/);
    expect(asked.chooseCopyLocation).not.toHaveBeenCalled();
    expect(asked.choosePdfLocation).not.toHaveBeenCalled();
    expect(document).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    // Its own row writes nothing either, if anything reached past `exportScript`.
    expect(await fdx.chooseLocation(asked, "a.fdx")).toBeUndefined();
    await expect(
      fdx.write({ filesystem: { writeFile } as never, project, document: parse(source), faces: async () => ({}) as never, destination: "/out/a.fdx", range: undefined }),
    ).rejects.toThrow(/cannot export Final Draft/);
    expect(writeFile).not.toHaveBeenCalled();
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
      whenDetailsAsked: quiet,
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
    modal.querySelector<HTMLElement>("#export-format")!.click();
    modal.querySelector<HTMLElement>("#export-format-option-1")!.click();
    modal.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(modal.isConnected).toBe(false));
    expect([...writes.keys()]).toEqual(["/out/copy.fountain"]);
    expect(new TextDecoder().decode(writes.get("/out/copy.fountain"))).toContain("Hello. Unsaved.");
    await mounted.unmount();
  });
});
