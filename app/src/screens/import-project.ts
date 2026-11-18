/**
 * The Import dialog: a project type, an optional name and a file, New Project's
 * dialog with a file added.
 *
 * The name is New Project's title field, except that it may stay blank: the
 * project is then named for the title page, or the file. It opens with focus on
 * the file, the one thing the dialog needs, and nothing being edited, so one
 * Escape cancels.
 *
 * The file field is for looking at, not typing in, so it is a button drawn as a
 * field: the keys pass over it like any other stop, and pressing it — a click,
 * Enter or Space — opens the file picker. Confirm stays disabled until a file is
 * chosen. A failure is said inside the dialog with the dialog left open, and the file imported from is
 * only ever read (`src/project/import.ts`).
 */
import type { OpenDialogOptions } from "@tauri-apps/plugin-dialog";
import {
  CannotImport,
  importProject,
  refusedImportName,
  sourceFileName,
  type ImportDependencies,
} from "../../../src/project/import.ts";
import type { ProjectFormat } from "../../../src/project/marker.ts";
import { dialogAction } from "./dialog-action.ts";
import { dialogKeys, enterSubmits } from "./dialog-keys.ts";
import { element } from "./element.ts";
import { chevron, field, projectTypeSelect } from "./new-project.ts";
import { message, trouble as troublePanel } from "./trouble.ts";

/** The operating system's file picker, offering what Write-ist can import. */
export const IMPORT_PICKER: OpenDialogOptions = {
  multiple: false,
  directory: false,
  title: "Import a screenplay",
  filters: [{ name: "Fountain screenplay", extensions: ["fountain", "spmd", "txt"] }],
};

const NO_FILE = "Select a file for import...";
const COULD_NOT_IMPORT = "That screenplay could not be imported, so no project was made. The file you chose is unchanged.";

export interface ImportProjectScreen {
  /** Ask the operating system for a file. Undefined: the writer cancelled. */
  readonly chooseSource: () => Promise<string | undefined>;
  /** Import it. Resolves to words for the writer when it could not be done. */
  readonly onImport: (request: {
    readonly sourcePath: string;
    readonly type: ProjectFormat;
    /** As typed; blank leaves the naming to the script. */
    readonly name: string;
  }) => Promise<string | undefined>;
  /** The dialog is gone, however it went. */
  readonly onClose: () => void;
}

export function showImportProject(
  into: HTMLElement,
  { chooseSource, onImport, onClose }: ImportProjectScreen,
): HTMLDialogElement {
  const type = projectTypeSelect("import-project-type");
  const name = element("input", {
    id: "import-project-name",
    className: "new-project-dialog__input",
    type: "text",
    placeholder: "Optional; title page or file name",
    autocomplete: "off",
    spellcheck: false,
  });
  const fileName = element("span", {
    id: "import-project-file-name",
    className: "import-project__file-name",
    textContent: NO_FILE,
  });
  const file = element("button", {
    id: "import-project-file",
    type: "button",
    className: "new-project-dialog__input import-project__file import-project__file--empty",
  }, [fileName]);
  // Its label names it, so what it holds is said as well.
  file.setAttribute("aria-describedby", fileName.id);
  const confirm = dialogAction("Confirm", "Enter", "submit");
  const cancel = dialogAction("Cancel", "Esc", "button");
  const problem = element("div", { className: "new-project__problem" });

  const form = element("form", { className: "new-project-dialog__form" }, [
    field("Project type", type.control, [chevron(), type.tray]),
    field("Project Name", name),
    element("div", { className: "import-project__source" }, [field("Project File", file)]),
    problem,
    element("div", { className: "new-project-dialog__actions" }, [cancel, confirm]),
  ]);
  const modal = element("dialog", { className: "new-project-dialog import-project", ariaLabel: "Import" }, [form]);
  const keys = dialogKeys(modal, [[type.control], [name], [file], [cancel, confirm]]);
  enterSubmits(modal, form);
  name.addEventListener("input", () => problem.replaceChildren());

  let source: string | undefined;
  // The picker is up, or the import is running: one thing at a time.
  let busy = false;
  const settle = (): void => {
    confirm.disabled = busy || source === undefined;
    cancel.disabled = busy;
  };

  const askForFile = async (): Promise<void> => {
    if (busy) return;
    const held = modal.ownerDocument.activeElement;
    busy = true;
    settle();
    let chosen: string | undefined;
    try {
      chosen = await chooseSource();
    } catch (error) {
      problem.replaceChildren(troublePanel(`The file picker could not be opened. ${message(error)}`));
    }
    busy = false;
    if (chosen !== undefined) {
      source = chosen;
      fileName.textContent = sourceFileName(chosen);
      file.classList.remove("import-project__file--empty");
      problem.replaceChildren();
    }
    settle();
    // On to Confirm with a file; cancelled, back to where the writer was.
    if (chosen !== undefined) confirm.focus();
    else (held instanceof HTMLElement && modal.contains(held) && held !== modal ? held : file).focus();
  };
  file.addEventListener("click", () => void askForFile());

  const failed = (words: string): void => {
    busy = false;
    problem.replaceChildren(troublePanel(words));
    settle();
    // The likeliest next step, and the buttons being disabled lost the focus.
    file.focus();
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy || source === undefined) return;
    const refused = refusedImportName(name.value);
    if (refused !== undefined) {
      problem.replaceChildren(troublePanel(refused));
      keys.edit(name);
      return;
    }
    busy = true;
    problem.replaceChildren();
    settle();
    onImport({ sourcePath: source, type: type.value() as ProjectFormat, name: name.value }).then(
      (wrong) => {
        if (wrong !== undefined) {
          failed(wrong);
          return;
        }
        busy = false;
        modal.close();
      },
      (error: unknown) => failed(`${COULD_NOT_IMPORT} ${message(error)}`),
    );
  });
  cancel.addEventListener("click", () => modal.close());
  // Escape closes a dialog natively; not while the picker or the import is running.
  modal.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
  modal.addEventListener("close", () => {
    modal.remove();
    onClose();
  });

  into.append(modal);
  modal.showModal();
  settle();
  file.focus();
  return modal;
}

/** What an import needs of the application. */
export interface ImportPorts extends ImportDependencies {
  readonly projectsDirectory: () => Promise<string>;
  readonly chooseSource: () => Promise<string | undefined>;
  readonly isImporting: () => boolean;
  /** An import began or ended; the screen behind says so. */
  readonly setImporting: (importing: boolean) => void;
  /** Read the list of projects again, so that the new one is in it. */
  readonly reread: () => Promise<void>;
}

/**
 * The one way a screenplay is imported, in a dialog (`src/project/import.ts`).
 * Nothing opens over another dialog, or while an import is still running.
 */
export function askToImportProject(ports: ImportPorts): void {
  if (ports.isImporting() || document.querySelector("dialog[open]") !== null) return;
  showImportProject(document.body, {
    chooseSource: ports.chooseSource,
    onImport: async ({ sourcePath, type, name }) => {
      ports.setImporting(true);
      let wrong: string | undefined;
      try {
        await importProject(ports, {
          sourcePath,
          projectsDirectory: await ports.projectsDirectory(),
          format: type,
          name,
        });
      } catch (error) {
        wrong = error instanceof CannotImport ? error.message : `${COULD_NOT_IMPORT} ${message(error)}`;
      }
      if (wrong === undefined) await ports.reread();
      ports.setImporting(false);
      return wrong;
    },
    onClose: () => {},
  });
}
