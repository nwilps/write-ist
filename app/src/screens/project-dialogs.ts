/**
 * Rename Project and Delete Project: the two dialogs the Open Project screen's
 * right-click menu opens, for the project that was right-clicked.
 *
 * Both are the New Project dialog's look (ADR-0042) and its manners: a modal
 * `<dialog>`, so Escape cancels and the screen behind hears nothing; Cancel
 * [Esc] on the left and the action [Enter] on the right; a failure said inside
 * the dialog in the writer's words, with the dialog left open; and nothing to
 * press twice while the disk is answering. What is done on disk is the
 * project layer's (`src/project/rename.ts`, `src/project/delete.ts`).
 */
import type { Project } from "../../../src/project/bundle.ts";
import { element } from "./element.ts";
import { action } from "./new-project.ts";
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
  const field = element("div", { className: "new-project-dialog__field" }, [
    element("label", { htmlFor: name.id, className: "new-project-dialog__label", textContent: "Project name" }),
    element("div", { className: "new-project-dialog__box" }, [name]),
  ]);
  // Nothing to confirm until the name is one, and a different one.
  const ready = () => name.value.trim() !== "" && name.value.trim() !== project.marker.name;
  const shown = dialog(into, {
    label: "Rename Project",
    body: [field],
    confirm: "Confirm",
    ready,
    attempt: () => onRename(name.value),
    failed: "The project could not be renamed, so nothing was changed.",
    onClose,
  });
  name.addEventListener("input", shown.settle);
  name.focus();
  name.select();
  return shown.modal;
}

export interface DeleteProjectDialog {
  readonly project: Project;
  /** Where it will go: `~/Documents/write-ist/Deleted Projects`, as a full path. */
  readonly deletedFolder: string;
  readonly onDelete: () => Promise<string | undefined>;
  readonly onClose: () => void;
}

/**
 * Ask before a project is moved to the deleted folder — and say plainly that
 * it is moved, where to, and that it is not deleted for good.
 */
export function showDeleteProject(
  into: HTMLElement,
  { project, deletedFolder, onDelete, onClose }: DeleteProjectDialog,
): HTMLDialogElement {
  const shown = dialog(into, {
    label: "Delete Project",
    body: [
      element("div", { className: "project-dialog__message" }, [
        element("p", {
          className: "project-dialog__line project-dialog__line--lead",
          textContent: `Delete “${project.marker.name}”?`,
        }),
        element("p", {
          className: "project-dialog__line",
          textContent:
            "It is not deleted for good. The whole project folder is moved, unchanged, to the deleted folder:",
        }),
        element("p", { className: "project-dialog__path", textContent: deletedFolder }),
        element("p", {
          className: "project-dialog__line",
          textContent: "To bring it back, move its folder from there back into the write-ist folder.",
        }),
      ]),
    ],
    confirm: "Delete",
    ready: () => true,
    attempt: onDelete,
    failed: `“${project.marker.name}” could not be moved, so it is where it was.`,
    onClose,
  });
  // Focus on the action whose key the label shows, as New Project's title does.
  shown.confirm.focus();
  return shown.modal;
}

interface DialogSpec {
  readonly label: string;
  readonly body: readonly HTMLElement[];
  readonly confirm: string;
  readonly ready: () => boolean;
  readonly attempt: Attempt;
  /** Said before the reason, when the attempt throws rather than answers. */
  readonly failed: string;
  readonly onClose: () => void;
}

function dialog(into: HTMLElement, spec: DialogSpec) {
  const confirm = action(spec.confirm, "Enter", "submit");
  confirm.classList.add("new-project-dialog__action--confirm");
  const cancel = action("Cancel", "Esc", "button");
  const problem = element("div", { className: "new-project__problem" });
  const form = element("form", { className: "new-project-dialog__form" }, [
    ...spec.body,
    problem,
    element("div", { className: "new-project-dialog__actions" }, [cancel, confirm]),
  ]);
  // No heading, as New Project has none; the dialog is still named.
  const modal = element("dialog", { className: "new-project-dialog project-dialog", ariaLabel: spec.label }, [form]);

  let working = false;
  const settle = (): void => {
    problem.replaceChildren();
    confirm.disabled = working || !spec.ready();
    cancel.disabled = working;
  };
  const say = (words: string): void => {
    problem.replaceChildren(troublePanel(words));
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
  // Enter confirms from anywhere in the dialog but a button, which acts on its own.
  modal.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    form.requestSubmit();
  });
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
  return { modal, confirm, settle };
}
