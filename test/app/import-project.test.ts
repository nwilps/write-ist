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
    name: modal.querySelector<HTMLInputElement>("#import-project-name")!,
    file: modal.querySelector<HTMLButtonElement>("#import-project-file")!,
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
  it("is New Project's dialog, with the same types, a blank optional name and the file under it", () => {
    const { modal, type, name, file, cancel, confirm } = shown();
    expect(document.activeElement).toBe(file);
    const other = showNewProject(document.body, { onCreate: async () => undefined, onClose: () => {} });
    expect(rowsOf(modal)).toEqual(rowsOf(other));
    expect(modal.querySelectorAll(".dialog-select__option--unavailable")).toHaveLength(5);
    other.close();

    expect(modal.classList.contains("new-project-dialog")).toBe(true);
    expect(modal.getAttribute("aria-label")).toBe("Import");
    expect(modal.querySelector("h1, h2, h3, [title]")).toBeNull();
    expect([...modal.querySelectorAll("label")].map((label) => label.textContent)).toEqual([
      "Project type",
      "Project Name",
      "Project File",
    ]);
    expect(type.textContent).toBe("Feature");
    expect([...modal.querySelectorAll("input")]).toEqual([name]);
    expect(name.value).toBe("");
    expect(name.placeholder).toBe("Optional...");
    expect(name.classList.contains("new-project-dialog__input")).toBe(true);
    expect(file.classList.contains("new-project-dialog__input")).toBe(true);
    expect(file.textContent).toBe("Select a file for import...");
    expect(modal.querySelectorAll(".dialog-action")).toHaveLength(2);
    expect(modal.textContent).not.toContain("Browse");
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

  it("asks for a file by Enter and by a press on the field", async () => {
    const { file, chooseSource } = shown(undefined);
    file.focus();
    press("Enter");
    await settled();
    expect(chooseSource).toHaveBeenCalledTimes(1);
    file.click();
    await settled();
    expect(chooseSource).toHaveBeenCalledTimes(2);
  });

  it("leaves Space to the field, a button, which presses itself with it", () => {
    const { file } = shown(undefined);
    expect(file.tagName).toBe("BUTTON");
    expect(file.type).toBe("button");
    expect(press(" ").defaultPrevented).toBe(false);
  });

  it("never treats the file field as a field being typed in: the arrows move on", async () => {
    const { file, name, type, cancel } = shown(undefined);
    press("Enter");
    await settled();
    expect(file.classList.contains("dialog-keys__editing")).toBe(false);
    expect(document.activeElement).toBe(file);
    press("ArrowRight");
    expect(document.activeElement).toBe(file);
    press("ArrowUp");
    expect(document.activeElement).toBe(name);
    press("ArrowUp");
    expect(document.activeElement).toBe(type);
    press("ArrowUp");
    expect(document.activeElement).toBe(cancel);
  });

  it("treats the name as New Project treats its title: focused, then edited", () => {
    const { modal, name, file, type } = shown();
    const editing = () => name.classList.contains("dialog-keys__editing");
    // Nothing is being edited at the start, so one Escape is the dialog's.
    expect(modal.querySelector(".dialog-keys__editing")).toBeNull();
    expect(press("Escape").defaultPrevented).toBe(false);

    press("ArrowUp");
    expect(document.activeElement).toBe(name);
    expect(editing()).toBe(false);
    press("ArrowUp");
    expect(document.activeElement).toBe(type);
    press("ArrowDown");
    press("Enter");
    expect(document.activeElement).toBe(name);
    expect(editing()).toBe(true);
    expect(press("ArrowDown").defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(name);

    expect(press("Escape").defaultPrevented).toBe(true);
    expect(editing()).toBe(false);
    expect(modal.open).toBe(true);
    press("ArrowDown");
    expect(document.activeElement).toBe(file);

    name.focus();
    name.value = "P";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    expect(editing()).toBe(true);
    name.blur();
    name.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(editing()).toBe(true);
  });

  it("wraps Tab through everything usable: type, name, file, then the buttons", async () => {
    const { type, name, file, cancel, confirm } = shown();
    const walk = (count: number, init = {}) => Array.from({ length: count }, () => (press("Tab", init), document.activeElement));
    expect(walk(4)).toEqual([cancel, type, name, file]);
    file.click();
    await settled();
    expect(document.activeElement).toBe(confirm);
    expect(walk(5)).toEqual([type, name, file, cancel, confirm]);
    expect(walk(1, { shiftKey: true })).toEqual([cancel]);
  });

  it("needs a file for Confirm, and a name is neither needed nor enough", async () => {
    const { name, file, confirm, onImport, modal } = shown();
    name.value = "Paper Boats";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    expect(confirm.disabled).toBe(true);
    modal.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(onImport).not.toHaveBeenCalled();
    name.value = "";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    file.click();
    await settled();
    expect(confirm.disabled).toBe(false);
  });

  it.each([
    [".hidden", "A name that starts with a dot would hide the project. Choose another name."],
    ["...", "A name that starts with a dot would hide the project. Choose another name."],
    ["  graveyard ", "“Graveyard” is where deleted projects go. Choose another name."],
  ])("refuses the name %j in the dialog, ready to change it", async (typed, words) => {
    const { modal, name, file, confirm, onImport, problem } = shown();
    file.click();
    await settled();
    name.value = typed;
    confirm.click();
    expect(problem()).toBe(words);
    expect(onImport).not.toHaveBeenCalled();
    expect(modal.open).toBe(true);
    expect(confirm.disabled).toBe(false);
    expect(document.activeElement).toBe(name);
    expect(name.classList.contains("dialog-keys__editing")).toBe(true);

    name.dispatchEvent(new Event("input", { bubbles: true }));
    expect(problem()).toBe("");
  });

  it("shows the chosen file's name, not its path, and goes on to Confirm", async () => {
    const { file, confirm } = shown("/home/writer/scripts/The Pilot.fountain");
    file.click();
    await settled();
    expect(file.textContent).toBe("The Pilot.fountain");
    expect(file.classList.contains("import-project__file--empty")).toBe(false);
    expect(confirm.disabled).toBe(false);
    expect(document.activeElement).toBe(confirm);
  });

  it("shows only the name of a Windows path too", async () => {
    const { file } = shown("C:\\Users\\writer\\The Pilot.fountain");
    file.click();
    await settled();
    expect(file.textContent).toBe("The Pilot.fountain");
  });

  it("keeps the earlier choice when the picker is cancelled, and comes back where it was", async () => {
    const answers = ["/scripts/First.fountain", undefined];
    const chooseSource = vi.fn(async () => answers.shift());
    const onImport = vi.fn(async () => undefined);
    const modal = showImportProject(document.body, { chooseSource, onImport, onClose: () => {} });
    const { file, confirm } = parts(modal);
    file.click();
    await settled();
    file.focus();
    file.click();
    await settled();
    expect(file.textContent).toBe("First.fountain");
    expect(confirm.disabled).toBe(false);
    expect(document.activeElement).toBe(file);
    expect(modal.open).toBe(true);
  });

  it("opens one picker at a time, and cannot be cancelled or confirmed under it", async () => {
    let answer: (path: string | undefined) => void = () => {};
    const chooseSource = vi.fn(() => new Promise<string | undefined>((resolve) => (answer = resolve)));
    const modal = showImportProject(document.body, { chooseSource, onImport: vi.fn(), onClose: () => {} });
    const { file, cancel } = parts(modal);
    file.click();
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
    const { file, problem } = parts(modal);
    file.click();
    await settled();
    expect(problem()).toBe("The file picker could not be opened. No portal.");
    expect(modal.open).toBe(true);
  });

  it("does not take Enter from Cancel", async () => {
    const { file, cancel, onImport, onClose } = shown();
    file.click();
    await settled();
    cancel.focus();
    press("Enter");
    expect(onClose).toHaveBeenCalledOnce();
    expect(onImport).not.toHaveBeenCalled();
  });

  it("confirms on Enter on Confirm, with the type chosen, and ignores a held key", async () => {
    const { modal, type, file, onImport, onClose } = shown();
    file.click();
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
    expect(onImport).toHaveBeenCalledExactlyOnceWith({ sourcePath: "/scripts/The Pilot.fountain", type: "Episode", name: "" });
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
    const { file, confirm, type: control } = parts(modal);
    if (type !== undefined) {
      control.click();
      [...modal.querySelectorAll<HTMLElement>("[role=option]")].find((row) => row.textContent === type)!.click();
    }
    file.click();
    await settled();
    confirm.click();
  }

  it("makes a project named from the title page, of the chosen type, and shows no report", async () => {
    const { modal, reread, seen } = ask();
    await chooseAndConfirm(modal!, "Short Film");
    await vi.waitFor(() => expect(modal!.isConnected).toBe(false));

    const { projects: listed } = await listProjects(nodeFilesystem, projects);
    expect(listed.map((project) => project.marker.name)).toEqual(["Another Name"]);
    expect(listed[0]!.marker.format).toBe("Short Film");
    expect(readFileSync(join(projects, "Another Name", MARKER_FILE), "utf8")).toContain("Format: Short Film\n");
    // The list was read again before the dialog went, and the guard was let go.
    expect(reread).toHaveBeenCalledOnce();
    expect(seen).toEqual([true, false]);
    expect(document.querySelector("dialog, .report, .report__changes")).toBeNull();
    expect(readFileSync(source, "utf8")).toBe(script);
  });

  it("uses a typed name, in place of the title page's", async () => {
    const { modal } = ask();
    parts(modal!).name.value = "  Paper   Boats ";
    await chooseAndConfirm(modal!);
    await vi.waitFor(() => expect(modal!.isConnected).toBe(false));
    const { projects: listed } = await listProjects(nodeFilesystem, projects);
    expect(listed.map((project) => project.marker.name)).toEqual(["Paper Boats"]);
    expect(readdirSync(projects)).toEqual(["Paper Boats"]);
  });

  it("falls back to the file's name when the name is blank and there is no title", async () => {
    writeFileSync(source, "INT. ROOM - DAY\n");
    const { modal } = ask();
    parts(modal!).name.value = "   ";
    await chooseAndConfirm(modal!);
    await vi.waitFor(() => expect(modal!.isConnected).toBe(false));
    expect(readdirSync(projects)).toEqual(["The Pilot"]);
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
    expect(document.activeElement).toBe(parts(modal!).file);
    expect(readFileSync(source, "utf8")).toBe(script);
    expect(readFileSync(blocked, "utf8")).toBe("");
    expect(existsSync(projects)).toBe(false);
    expect(reread).not.toHaveBeenCalled();
    expect(seen).toEqual([true, false]);
  });

  it("stays open when the chosen file has gone, making no project", async () => {
    const { modal } = ask();
    const { file, confirm, problem } = parts(modal!);
    file.click();
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
    const { file, confirm } = parts(modal!);
    file.click();
    await settled();
    confirm.click();
    modal!.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(modal!.isConnected).toBe(false));
    expect(readdirSync(projects)).toEqual(["Another Name"]);
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
  it("fills the dialog's width, and cuts a long name short instead of widening it", () => {
    const css = readFileSync("app/src/style/home.css", "utf8");
    expect(css).toMatch(/\.import-project__source \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\);\s*\}/);
    expect(css).toMatch(/\.import-project__source \.new-project-dialog__box \{\s*grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).not.toContain("import-project__browse");
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
