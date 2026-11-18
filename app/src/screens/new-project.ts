/**
 * The New Project dialog: a type and a title, and nothing else.
 *
 * A modal `<dialog>`, like the import report, so Escape cancels it natively and
 * the window behind hears nothing while it is open. Enter in the title
 * confirms, as the label says. Confirm stays disabled until there is a title, and a failure is
 * said inside the dialog — in the writer's words — with the dialog left open
 * so they can change the title and try again.
 *
 * The pattern for the other dialogs: its button, drop-down and keys are the
 * shared `dialogAction`, `dialogSelect` and `dialogKeys`.
 */
import { PROJECT_TYPES, type ProjectType } from "../../../src/project/create.ts";
import { createElement, ChevronDown } from "lucide";
import { dialogAction } from "./dialog-action.ts";
import { dialogKeys } from "./dialog-keys.ts";
import { dialogSelect } from "./dialog-select.ts";
import { element } from "./element.ts";
import { message, trouble as troublePanel } from "./trouble.ts";

export interface NewProjectScreen {
  /**
   * Make it. Resolves to words for the writer when it could not be made, and
   * to nothing when it was — the caller opens the project then.
   */
  readonly onCreate: (request: {
    readonly type: ProjectType;
    readonly title: string;
  }) => Promise<string | undefined>;
  /** The dialog is gone, however it went. */
  readonly onClose: () => void;
}

export function showNewProject(
  into: HTMLElement,
  { onCreate, onClose }: NewProjectScreen,
): HTMLDialogElement {
  const type = dialogSelect({
    id: "new-project-type",
    label: "Project type",
    choices: PROJECT_TYPES.map((name) => ({ value: name, label: name })),
  });
  const title = element("input", {
    id: "new-project-title",
    className: "new-project-dialog__input",
    type: "text",
    // A hint, not a name: an empty title is still refused.
    placeholder: "Untitled",
    autocomplete: "off",
    spellcheck: false,
  });
  const create = dialogAction("Confirm", "Enter", "submit");
  create.disabled = true;
  const cancel = dialogAction("Cancel", "Esc", "button");
  const problem = element("div", { className: "new-project__problem" });

  // Cancel on the left, Confirm on the right: the keys the labels promise.
  const form = element("form", { className: "new-project-dialog__form" }, [
    field("Project type", type.control, [chevron(), type.tray]),
    field("Project title", title),
    problem,
    element("div", { className: "new-project-dialog__actions" }, [cancel, create]),
  ]);
  // No heading (the home design); the dialog is still named for a screen reader.
  const modal = element("dialog", { className: "new-project-dialog", ariaLabel: "New Project" }, [form]);
  const keys = dialogKeys(modal, [[type.control], [title], [cancel, create]]);

  let making = false;
  const settle = () => {
    create.disabled = making || title.value.trim() === "";
    cancel.disabled = making;
  };
  title.addEventListener("input", () => {
    problem.replaceChildren();
    settle();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    // Enter in the field submits even when the button is disabled.
    if (making || title.value.trim() === "") return;
    making = true;
    problem.replaceChildren();
    settle();
    onCreate({ type: type.value() as ProjectType, title: title.value }).then(
      (wrong) => {
        making = false;
        if (wrong === undefined) {
          modal.close();
          return;
        }
        problem.replaceChildren(troublePanel(wrong));
        settle();
        keys.edit(title);
      },
      (error: unknown) => {
        making = false;
        problem.replaceChildren(
          troublePanel(`A new project could not be made. ${message(error)}`),
        );
        settle();
        keys.edit(title);
      },
    );
  });
  // Enter confirms from the title being edited. Everywhere else it has already
  // been used: to start editing, to press a button, or by the drop-down.
  modal.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.defaultPrevented) return;
    event.preventDefault();
    form.requestSubmit();
  });
  cancel.addEventListener("click", () => modal.close());
  // Escape closes a dialog natively; it must not while a project is being made.
  modal.addEventListener("cancel", (event) => {
    if (making) event.preventDefault();
  });
  modal.addEventListener("close", () => {
    modal.remove();
    onClose();
  });

  into.append(modal);
  modal.showModal();
  keys.edit(title);
  return modal;
}

/** A labelled box; `extra` is what sits in the box with the input, as a drop-down's arrow does. */
export function field(label: string, input: HTMLElement, extra: readonly Node[] = []): HTMLDivElement {
  return element("div", { className: "new-project-dialog__field" }, [
    element("label", { htmlFor: input.id, className: "new-project-dialog__label", textContent: label }),
    element("div", { className: "new-project-dialog__box" }, [input, ...extra]),
  ]);
}

/** A button drawn as the home screen's selected row is: `> Label [Key]`. */
export function action(label: string, key: string, kind: "submit" | "button"): HTMLButtonElement {
  return element("button", { className: "new-project-dialog__action", type: kind }, [
    element("span", { className: "new-project-dialog__cursor", ariaHidden: "true", textContent: ">" }),
    element("span", { textContent: label }),
    element("span", { ariaHidden: "true", textContent: `[${key}]` }),
  ]);
}

/** The drop-down's arrow: Lucide's own drawing, at the icon size (ADR-0035). */
export function chevron(): SVGElement {
  return createElement(ChevronDown, { class: "new-project-dialog__chevron", "aria-hidden": "true" });
}
