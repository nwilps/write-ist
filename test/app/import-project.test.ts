/**
 * The Import dialog, and importing through it: real files in a temporary folder,
 * an invented script, and the operating system's picker stood in for.
 */
// @vitest-environment jsdom
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { askToImportProject, IMPORT_PICKER, showImportProject } from "../../app/src/screens/import-project.ts";
import { showNewProject } from "../../app/src/screens/new-project.ts";
import { MARKER_FILE } from "../../src/project/bundle.ts";
import { listProjects } from "../../src/project/projects.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

// jsdom has no modal dialog.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => document.body.replaceChildren());

const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));
const press = (key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  document.activeElement!.dispatchEvent(event);
  return event;
};
const rowsOf = (modal: HTMLElement) =>
  [...modal.querySelectorAll("[role=option]")].map((row) => row.textContent);

function parts(modal: HTMLDialogElement) {
  const buttons = [...modal.querySelectorAll<HTMLButtonElement>(".dialog-action")];
  const named = (label: string) => buttons.find((button) => button.textContent!.includes(label))!;
  return {
    type: modal.querySelector<HTMLButtonElement>("#import-project-type")!,
    file: modal.querySelector<HTMLButtonElement>("#import-project-file")!,
    browse: named("Browse"),
    cancel: named("Cancel"),
    confirm: named("Confirm"),
    problem: () => modal.querySelector(".new-project__problem")!.textContent,
  };
}

/** The dialog, over a picker that answers `chosen`: undefined is a cancel. */
function shown(...answer: [chosen?: string]) {
  const chosen = answer.length === 0 ? "/scripts/The Pilot.fountain" : answer[0];
  const chooseSource = vi.fn(async () => chosen);
  const onImport = vi.fn(async (_request: unknown) => undefined as string | undefined);
  const onClose = vi.fn();
  const modal = showImportProject(document.body, { chooseSource, onImport, onClose });
  return { modal, chooseSource, onImport, onClose, ...parts(modal) };
}

describe("the Import dialog", () => {
  it("is New Project's dialog, with the same types and the file in the title's place", () => {
    const { modal, type, file, browse, cancel, confirm } = shown();
    expect(document.activeElement).toBe(file);
    const other = showNewProject(document.body, { onCreate: async () => undefined, onClose: () => {} });
    expect(rowsOf(modal)).toEqual(rowsOf(other));
    expect(modal.querySelectorAll(".dialog-select__option--unavailable")).toHaveLength(5);
    other.close();

    expect(modal.classList.contains("new-project-dialog")).toBe(true);
    expect(modal.getAttribute("aria-label")).toBe("Import");
    expect(modal.querySelector("h1, h2, h3, [title]")).toBeNull();
    expect([...modal.querySelectorAll("label")].map((label) => label.textContent)).toEqual(["Project type", "Project File"]);
    expect(type.textContent).toBe("Feature");
    expect(modal.querySelector("input")).toBeNull();
    expect(file.classList.contains("new-project-dialog__input")).toBe(true);
    expect(file.textContent).toBe("Select a file for import...");
    expect(browse.textContent).toBe(">Browse");
    expect(cancel.textContent).toBe(">Cancel[Esc]");
    expect(confirm.textContent).toBe(">Confirm[Enter]");
  });

  it("keeps Confirm disabled without a file, and Enter there asks for one instead", async () => {
    const { confirm, onImport, chooseSource, modal } = shown(undefined);
    expect(confirm.disabled).toBe(true);
    modal.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(onImport).not.toHaveBeenCalled();
    press("Enter");
    await settled();
    expect(chooseSource).toHaveBeenCalledOnce();
    expect(confirm.disabled).toBe(true);
  });

  it.each(["file", "browse"] as const)("asks for a file by Enter and by a press on %s", async (which) => {
    const view = shown(undefined);
    view[which].focus();
    press("Enter");
    await settled();
    expect(view.chooseSource).toHaveBeenCalledTimes(1);
    view[which].click();
    await settled();
    expect(view.chooseSource).toHaveBeenCalledTimes(2);
  });

  it("never treats the file field as a field being typed in: the arrows move on", async () => {
    const { file, browse, type, cancel } = shown(undefined);
    press("Enter");
    await settled();
    expect(file.classList.contains("dialog-keys__editing")).toBe(false);
    expect(document.activeElement).toBe(file);
    press("ArrowRight");
    expect(document.activeElement).toBe(browse);
    press("ArrowLeft");
    expect(document.activeElement).toBe(file);
    press("ArrowUp");
    expect(document.activeElement).toBe(type);
    press("ArrowUp");
    expect(document.activeElement).toBe(cancel);
  });

  it("wraps Tab through everything usable", async () => {
    const { type, file, browse, cancel, confirm } = shown();
    const walk = (count: number, init = {}) => Array.from({ length: count }, () => (press("Tab", init), document.activeElement));
    expect(walk(4)).toEqual([browse, cancel, type, file]);
    browse.click();
    await settled();
    expect(document.activeElement).toBe(confirm);
    expect(walk(5)).toEqual([type, file, browse, cancel, confirm]);
    expect(walk(1, { shiftKey: true })).toEqual([cancel]);
  });

  it("shows the chosen file's name, not its path, and goes on to Confirm", async () => {
    const { file, browse, confirm } = shown("/home/writer/scripts/The Pilot.fountain");
    browse.click();
    await settled();
    expect(file.textContent).toBe("The Pilot.fountain");
    expect(file.classList.contains("import-project__file--empty")).toBe(false);
    expect(confirm.disabled).toBe(false);
    expect(document.activeElement).toBe(confirm);
  });

  it("shows only the name of a Windows path too", async () => {
    const { file, browse } = shown("C:\\Users\\writer\\The Pilot.fountain");
    browse.click();
    await settled();
    expect(file.textContent).toBe("The Pilot.fountain");
  });

  it("keeps the earlier choice when the picker is cancelled, and comes back where it was", async () => {
    const answers = ["/scripts/First.fountain", undefined];
    const chooseSource = vi.fn(async () => answers.shift());
    const onImport = vi.fn(async () => undefined);
    const modal = showImportProject(document.body, { chooseSource, onImport, onClose: () => {} });
    const { file, browse, confirm } = parts(modal);
    browse.click();
    await settled();
    browse.focus();
    browse.click();
    await settled();
    expect(file.textContent).toBe("First.fountain");
    expect(confirm.disabled).toBe(false);
    expect(document.activeElement).toBe(browse);
    expect(modal.open).toBe(true);
  });

  it("opens one picker at a time, and cannot be cancelled or confirmed under it", async () => {
    let answer: (path: string | undefined) => void = () => {};
    const chooseSource = vi.fn(() => new Promise<string | undefined>((resolve) => (answer = resolve)));
    const modal = showImportProject(document.body, { chooseSource, onImport: vi.fn(), onClose: () => {} });
    const { browse, file, cancel } = parts(modal);
    browse.click();
    file.click();
    expect(chooseSource).toHaveBeenCalledOnce();
    expect(cancel.disabled).toBe(true);
    expect(modal.dispatchEvent(new Event("cancel", { cancelable: true }))).toBe(false);
    answer(undefined);
    await settled();
    expect(cancel.disabled).toBe(false);
  });

  it("says so in the dialog when the picker cannot open", async () => {
    const chooseSource = vi.fn(async () => {
      throw new Error("No portal.");
    });
    const modal = showImportProject(document.body, { chooseSource, onImport: vi.fn(), onClose: () => {} });
    const { browse, problem } = parts(modal);
    browse.click();
    await settled();
    expect(problem()).toBe("The file picker could not be opened. No portal.");
    expect(modal.open).toBe(true);
  });

  it("does not take Enter from Cancel", async () => {
    const { browse, cancel, onImport, onClose } = shown();
    browse.click();
    await settled();
    cancel.focus();
    press("Enter");
    expect(onClose).toHaveBeenCalledOnce();
    expect(onImport).not.toHaveBeenCalled();
  });

  it("confirms on Enter on Confirm, with the type chosen, and ignores a held key", async () => {
    const { modal, type, browse, onImport, onClose } = shown();
    browse.click();
    await settled();
    press("Enter", { repeat: true });
    expect(onImport).not.toHaveBeenCalled();
    type.focus();
    press("Enter");
    press("ArrowDown");
    press("Enter");
    expect(type.textContent).toBe("Episode");
    parts(modal).confirm.focus();
    press("Enter");
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onImport).toHaveBeenCalledExactlyOnceWith({ sourcePath: "/scripts/The Pilot.fountain", type: "Episode" });
  });

  it("will not choose a type that is only coming", () => {
    const { modal, type } = shown();
    type.focus();
    press("Enter");
    for (let step = 0; step < 3; step++) press("ArrowDown");
    press("Enter");
    expect(type.getAttribute("aria-expanded")).toBe("true");
    modal.querySelector<HTMLElement>("#import-project-type-option-3")!.click();
    expect(type.textContent).toBe("Feature");
  });
});

describe("importing through the dialog", () => {
  const script = "Title: Another Name\n\nINT. ROOM - DAY\r\n\r\nShe waits.   \r\n";
  let temporary: { path: string; remove: () => void };
  let projects: string;
  let source: string;

  beforeEach(() => {
    temporary = temporaryDirectory();
    projects = join(temporary.path, "write-ist");
    mkdirSync(join(temporary.path, "scripts"));
    source = join(temporary.path, "scripts", "The Pilot.fountain");
    writeFileSync(source, script);
  });
  afterEach(() => temporary.remove());

  function ask(overrides: { directory?: string; importing?: boolean } = {}) {
    let importing = overrides.importing ?? false;
    const seen: boolean[] = [];
    const reread = vi.fn(async () => {});
    askToImportProject({
      filesystem: nodeFilesystem,
      newProjectId: () => "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      projectsDirectory: async () => overrides.directory ?? projects,
      chooseSource: async () => source,
      isImporting: () => importing,
      setImporting: (now) => {
        importing = now;
        seen.push(now);
      },
      reread,
    });
    const modal = document.querySelector<HTMLDialogElement>("dialog[open]");
    return { modal, reread, seen };
  }

  async function chooseAndConfirm(modal: HTMLDialogElement, type?: string) {
    const { browse, confirm, type: control } = parts(modal);
    if (type !== undefined) {
      control.click();
      [...modal.querySelectorAll<HTMLElement>("[role=option]")].find((row) => row.textContent === type)!.click();
    }
    browse.click();
    await settled();
    confirm.click();
  }

  it("makes a project named from the file, of the chosen type, and shows no report", async () => {
    const { modal, reread, seen } = ask();
    await chooseAndConfirm(modal!, "Short Film");
    await vi.waitFor(() => expect(modal!.isConnected).toBe(false));

    const { projects: listed } = await listProjects(nodeFilesystem, projects);
    expect(listed.map((project) => project.marker.name)).toEqual(["The Pilot"]);
    expect(listed[0]!.marker.format).toBe("Short Film");
    expect(readFileSync(join(projects, "The Pilot", MARKER_FILE), "utf8")).toContain("Format: Short Film\n");
    // The list was read again before the dialog went, and the guard was let go.
    expect(reread).toHaveBeenCalledOnce();
    expect(seen).toEqual([true, false]);
    expect(document.querySelector("dialog, .report, .report__changes")).toBeNull();
    expect(readFileSync(source, "utf8")).toBe(script);
  });

  it("stays open with the reason when it fails, writing nothing and leaving the file alone", async () => {
    // A file where the projects folder should be: the folder cannot be made.
    const blocked = join(temporary.path, "blocked");
    writeFileSync(blocked, "");
    const { modal, reread, seen } = ask({ directory: blocked });
    await chooseAndConfirm(modal!);
    await vi.waitFor(() => expect(parts(modal!).problem()).toContain("could not be imported"));

    expect(modal!.open).toBe(true);
    expect(modal!.querySelector("[role=alert]")).not.toBeNull();
    expect(parts(modal!).confirm.disabled).toBe(false);
    expect(document.activeElement).toBe(parts(modal!).browse);
    expect(readFileSync(source, "utf8")).toBe(script);
    expect(readFileSync(blocked, "utf8")).toBe("");
    expect(existsSync(projects)).toBe(false);
    expect(reread).not.toHaveBeenCalled();
    expect(seen).toEqual([true, false]);
  });

  it("stays open when the chosen file has gone, making no project", async () => {
    const { modal } = ask();
    const { browse, confirm, problem } = parts(modal!);
    browse.click();
    await settled();
    rmSync(source);
    confirm.click();
    await vi.waitFor(() => expect(problem()).toContain("could not be imported"));
    expect(existsSync(projects)).toBe(false);
  });

  it("does not open while an import is running, or over another dialog", () => {
    expect(ask({ importing: true }).modal).toBeNull();
    const first = ask().modal;
    ask();
    expect(document.querySelectorAll("dialog[open]")).toHaveLength(1);
    expect(document.querySelector("dialog[open]")).toBe(first);
  });

  it("will not run a second import on top of one in flight", async () => {
    const { modal } = ask();
    const { browse, confirm } = parts(modal!);
    browse.click();
    await settled();
    confirm.click();
    modal!.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(modal!.isConnected).toBe(false));
    expect(readdirSync(projects)).toEqual(["The Pilot"]);
  });
});

describe("the way in", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("offers the picker what can be imported, one file at a time", () => {
    expect(IMPORT_PICKER.multiple).toBe(false);
    expect(IMPORT_PICKER.directory).toBe(false);
    expect(IMPORT_PICKER.filters).toEqual([{ name: "Fountain screenplay", extensions: ["fountain", "spmd", "txt"] }]);
  });

  it("is Open Project's Import, through the dialog, and the report popup is gone", () => {
    const main = read("app/src/main.ts");
    expect(main).toContain("onImport: askToImport,");
    expect(main).toContain("askToImportProject({");
    expect(main).not.toMatch(/showImportReport|describeImportReport|showReport/);
    expect(existsSync("app/src/screens/import-report.ts")).toBe(false);
  });
});

describe("the file field's look", () => {
  it("cuts a long name short instead of pushing past Browse", () => {
    const css = readFileSync("app/src/style/home.css", "utf8");
    expect(css).toMatch(/\.import-project__source \.new-project-dialog__box \{\s*grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.import-project__file-name \{[^}]*text-overflow: ellipsis/);
  });
});

describe("the older dialogs' styles", () => {
  it("stay for Title Page, its preview and Goals", () => {
    const css = readFileSync("app/src/style/app.css", "utf8");
    for (const rule of [".report {", ".report__heading {", ".report__standfirst {", ".report__nothing {", ".report__actions {"]) {
      expect(css, rule).toContain(rule);
    }
    expect(css).not.toContain(".report__changes");
    for (const file of ["title-page-dialog", "title-page-preview", "goals-dialog"]) {
      expect(readFileSync(`app/src/workspaces/editor/${file}.ts`, "utf8"), file).toContain('"report');
    }
  });
});
