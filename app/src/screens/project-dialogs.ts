/**
 * Rename Project and Delete Project: the two dialogs the Open Project screen's
 * right-click menu opens, for the project that was right-clicked. Rename Project
 * is opened for the open project from the Editor too (`askToRenameProject`).
 * Exile Project is Settings ▸ Graveyard's, for a project already deleted.
 *
 * Both are the New Project dialog's look (ADR-0042) and its manners, from the
 * same shared button and keys: a modal `<dialog>`, so Escape cancels and the
 * screen behind hears nothing; Cancel [Esc] on the left and the action [Enter]
 * on the right; a failure said inside the dialog in the writer's words, with
 * the dialog left open; and nothing to press twice while the disk is answering. What is done on disk is the
 * project layer's (`src/project/rename.ts`, `src/project/delete.ts`).
 */
import { createElement, TriangleAlert } from "lucide";
import type { Project } from "../../../src/project/bundle.ts";
import type { Filesystem } from "../../../src/project/filesystem.ts";
import { CannotRename, renameProject } from "../../../src/project/rename.ts";
import { dialogAction } from "./dialog-action.ts";
import { dialogKeys, enterSubmits, type DialogKeys } from "./dialog-keys.ts";
import { element } from "./element.ts";
import { field } from "./new-project.ts";
import { message, trouble as troublePanel } from "./trouble.ts";

/**
 * Do it. Resolves to words for the writer when it could not be done — the
 * dialog stays open with them — and to nothing when it was, and it closes.
 */
type Attempt = () => Promise<string | undefined>;

export interface RenameProjectDialog {
  readonly project: Project;
  readonly onRename: (name: string) => Promise<string | undefined>;
  /** The dialog is gone, however it went. */
  readonly onClose: () => void;
}

/** Ask for a project's new name, starting from the one it has. */
export function showRenameProject(
  into: HTMLElement,
  { project, onRename, onClose }: RenameProjectDialog,
): HTMLDialogElement {
  const name = element("input", {
    id: "rename-project-name",
    className: "new-project-dialog__input",
    type: "text",
    value: project.marker.name,
    autocomplete: "off",
    spellcheck: false,
  });
  // Nothing to confirm until the name is one, and a different one.
  const ready = () => name.value.trim() !== "" && name.value.trim() !== project.marker.name;
  const shown = dialog(into, {
    label: "Rename Project",
    body: [field("Project name", name)],
    stops: [name],
    confirm: "Confirm",
    ready,
    attempt: () => onRename(name.value),
    failed: "The project could not be renamed, so nothing was changed.",
    resume: () => shown.keys.edit(name),
    onClose,
  });
  name.addEventListener("input", shown.settle);
  shown.keys.edit(name);
  name.select();
  return shown.modal;
}

/** What a rename needs of the application, wherever it was asked for. */
export interface RenamePorts {
  readonly filesystem: Filesystem;
  readonly projectsDirectory: () => Promise<string>;
  /** Read the list of projects again, so that it is true when next shown. */
  readonly reread: () => Promise<void>;
}

/** What differs between renaming from Open Project and from the open project. */
export interface RenameRoute {
  /** Where the dialog goes. */
  readonly into: HTMLElement;
  /** Run the move, at a moment that is safe for whatever has the project open. */
  readonly carryOut: (move: () => Promise<Project>) => Promise<Project>;
  /** The project was renamed, and this is the project as it now is. */
  readonly renamed: (project: Project) => void;
  /** The dialog is gone, however it went. */
  readonly closed: () => void;
}

/**
 * The one way a project is renamed (`src/project/rename.ts`), in a dialog.
 * Refused or failed, the dialog stays up with the reason and the project keeps
 * its name. Nothing opens over another dialog.
 */
export function askToRenameProject(ports: RenamePorts, project: Project, route: RenameRoute): void {
  if (document.querySelector("dialog[open]") !== null) return;
  showRenameProject(route.into, {
    project,
    onRename: async (name) => {
      let wrong: string | undefined;
      try {
        const directory = await ports.projectsDirectory();
        route.renamed(await route.carryOut(() => renameProject(ports.filesystem, directory, project, name)));
      } catch (error) {
        wrong =
          error instanceof CannotRename
            ? error.message
            : `The project could not be renamed, so nothing was changed. ${message(error)}`;
      }
      await ports.reread();
      return wrong;
    },
    onClose: route.closed,
  });
}

export interface DeleteProjectDialog {
  readonly project: Project;
  readonly onDelete: () => Promise<string | undefined>;
  readonly onClose: () => void;
}

/** Ask before a project is moved to the Graveyard, and say that is all it is. */
export function showDeleteProject(
  into: HTMLElement,
  { project, onDelete, onClose }: DeleteProjectDialog,
): HTMLDialogElement {
  const shown = dialog(into, {
    label: "Delete Project",
    body: [
      element("div", { className: "project-dialog__message" }, [
        element("p", {
          className: "project-dialog__line project-dialog__line--lead",
          textContent: `Delete "${project.marker.name}"?`,
        }),
        element("p", {
          className: "project-dialog__line",
          textContent:
            "This will NOT permanently delete your project, but move it to the Graveyard. You may access your Graveyard in Settings.",
        }),
      ]),
    ],
    stops: [],
    confirm: "Move to Graveyard",
    ready: () => true,
    attempt: onDelete,
    failed: `“${project.marker.name}” could not be moved, so it is where it was.`,
    resume: () => shown.confirm.focus(),
    onClose,
  });
  // Focus on the action whose key the label shows, as New Project's title does.
  shown.confirm.focus();
  return shown.modal;
}

export interface ExileProjectDialog {
  /** The project's name, as the Graveyard lists it. */
  readonly name: string;
  /**
   * Erase it for good (`src/project/exile.ts`). Resolves to words for the
   * writer when it was refused; the dialog then stays, with them.
   */
  readonly onExile: () => Promise<string | undefined>;
  readonly onClose: () => void;
}

/**
 * Ask before a project in the Graveyard is erased forever (Settings ▸
 * Graveyard). Delete Project's dialog, dressed in the alarm colour so it reads
 * as the serious one: Cancel [Esc] is where focus starts, and Exile [Enter]
 * is the only way through.
 */
export function showExileProject(
  into: HTMLElement,
  { name, onExile, onClose }: ExileProjectDialog,
): HTMLDialogElement {
  const warning = createElement(TriangleAlert, { class: "project-dialog__alarm-icon" });
  warning.setAttribute("aria-hidden", "true");
  const shown = dialog(into, {
    label: "Exile Project",
    body: [
      element("div", { className: "project-dialog__message project-dialog__message--alarm" }, [
        warning,
        element("p", {
          className: "project-dialog__line project-dialog__line--lead",
          textContent: `Exile "${name}"?`,
        }),
        element("p", {
          className: "project-dialog__line",
          textContent: "This permanently deletes the project. It cannot be recovered.",
        }),
        element("p", {
          className: "project-dialog__line",
          textContent: "Your writing history for it stays in your metrics.",
        }),
      ]),
    ],
    stops: [],
    confirm: "Exile",
    ready: () => true,
    attempt: onExile,
    failed: `“${name}” could not be exiled, so it is still in the Graveyard.`,
    resume: () => shown.cancel.focus(),
    onClose,
  });
  shown.modal.classList.add("project-dialog--alarm");
  shown.confirm.classList.add("project-dialog__alarm-action");
  // Cancel first: the safe answer is the one under the writer's hand.
  shown.cancel.focus();
  return shown.modal;
}

interface DialogSpec {
  readonly label: string;
  readonly body: readonly HTMLElement[];
  /** What the keys visit above the buttons, top to bottom. */
  readonly stops: readonly HTMLElement[];
  readonly confirm: string;
  readonly ready: () => boolean;
  readonly attempt: Attempt;
  /** Said before the reason, when the attempt throws rather than answers. */
  readonly failed: string;
  /** Put focus back after a failure: the buttons were disabled, and it was lost. */
  readonly resume: () => void;
  readonly onClose: () => void;
}

interface ShownDialog {
  readonly modal: HTMLDialogElement;
  readonly confirm: HTMLButtonElement;
  readonly cancel: HTMLButtonElement;
  readonly keys: DialogKeys;
  readonly settle: () => void;
}

function dialog(into: HTMLElement, spec: DialogSpec): ShownDialog {
  const confirm = dialogAction(spec.confirm, "Enter", "submit");
  const cancel = dialogAction("Cancel", "Esc", "button");
  const problem = element("div", { className: "new-project__problem" });
  const form = element("form", { className: "new-project-dialog__form" }, [
    ...spec.body,
    problem,
    element("div", { className: "new-project-dialog__actions" }, [cancel, confirm]),
  ]);
  // No heading, as New Project has none; the dialog is still named.
  const modal = element("dialog", { className: "new-project-dialog project-dialog", ariaLabel: spec.label }, [form]);
  const keys = dialogKeys(modal, [...spec.stops.map((stop) => [stop]), [cancel, confirm]]);

  let working = false;
  const settle = (): void => {
    problem.replaceChildren();
    confirm.disabled = working || !spec.ready();
    cancel.disabled = working;
  };
  const say = (words: string): void => {
    problem.replaceChildren(troublePanel(words));
    spec.resume();
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    // Enter in a field submits even when the button is disabled.
    if (working || !spec.ready()) return;
    working = true;
    settle();
    spec.attempt().then(
      (wrong) => {
        working = false;
        if (wrong === undefined) {
          modal.close();
          return;
        }
        settle();
        say(wrong);
      },
      (error: unknown) => {
        working = false;
        settle();
        say(`${spec.failed} ${message(error)}`);
      },
    );
  });
  enterSubmits(modal, form);
  cancel.addEventListener("click", () => modal.close());
  // Escape closes a dialog natively; not while the disk is still answering.
  modal.addEventListener("cancel", (event) => {
    if (working) event.preventDefault();
  });
  modal.addEventListener("close", () => {
    modal.remove();
    spec.onClose();
  });

  into.append(modal);
  modal.showModal();
  settle();
  return { modal, confirm, cancel, keys, settle };
}
