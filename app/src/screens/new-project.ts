/**
 * The New Project dialog: a type and a title, and nothing else.
 *
 * A modal `<dialog>`, so Escape cancels it natively and the window behind hears
 * nothing while it is open. Enter in the title
 * confirms, as the label says. Confirm stays disabled until there is a title, and a failure is
 * said inside the dialog — in the writer's words — with the dialog left open
 * so they can change the title and try again.
 *
 * The pattern for the other simple dialogs (Rename, Delete, Export As, Import):
 * its button, drop-down and keys are the shared `dialogAction`, `dialogSelect`
 * and `dialogKeys`.
 */
import { COMING_FORMATS } from "../../../src/project/create.ts";
import { FORMATS, type ProjectFormat } from "../../../src/project/marker.ts";
import { createElement, ChevronDown } from "lucide";
import { dialogAction } from "./dialog-action.ts";
import { dialogKeys, enterSubmits } from "./dialog-keys.ts";
import { dialogSelect, type DialogSelect } from "./dialog-select.ts";
import { element } from "./element.ts";
import { message, trouble as troublePanel } from "./trouble.ts";

export interface NewProjectScreen {
  /**
   * Make it. Resolves to words for the writer when it could not be made, and
   * to nothing when it was — the caller opens the project then.
   */
  readonly onCreate: (request: {
    readonly type: ProjectFormat;
    readonly title: string;
  }) => Promise<string | undefined>;
  /** The dialog is gone, however it went. */
  readonly onClose: () => void;
  /** The types Settings ▸ New Project Defaults says not to show (`ProjectDefaults.shown`). */
  readonly hiddenTypes?: readonly string[];
}

export function showNewProject(
  into: HTMLElement,
  { onCreate, onClose, hiddenTypes = [] }: NewProjectScreen,
): HTMLDialogElement {
  const type = projectTypeSelect("new-project-type", hiddenTypes);
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
    onCreate({ type: type.value() as ProjectFormat, title: title.value }).then(
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
  enterSubmits(modal, form);
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

/**
 * The project types, the same wherever a project is begun: New Project and
 * Import. New Project leaves out the ones the writer hid in Settings — but
 * never every type it can make, which would leave a dialog that makes nothing:
 * those stay, whatever Settings says.
 */
export function projectTypeSelect(id: string, hidden: readonly string[] = []): DialogSelect {
  const makeable = FORMATS.filter((name) => !hidden.includes(name));
  return dialogSelect({
    id,
    label: "Project type",
    choices: [
      ...(makeable.length === 0 ? FORMATS : makeable).map((name) => ({ value: name, label: name })),
      ...COMING_FORMATS.filter((name) => !hidden.includes(name)).map((name) => ({ value: name, label: name, unavailable: "soon" })),
    ],
  });
}

/** A labelled box; `extra` is what sits in the box with the input, as a drop-down's arrow does. */
export function field(label: string, input: HTMLElement, extra: readonly Node[] = []): HTMLDivElement {
  return element("div", { className: "new-project-dialog__field" }, [
    element("label", { htmlFor: input.id, className: "new-project-dialog__label", textContent: label }),
    element("div", { className: "new-project-dialog__box" }, [input, ...extra]),
  ]);
}

/** The drop-down's arrow: Lucide's own drawing, at the icon size (ADR-0035). */
export function chevron(): SVGElement {
  return createElement(ChevronDown, { class: "new-project-dialog__chevron", "aria-hidden": "true" });
}
