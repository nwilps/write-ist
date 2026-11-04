/**
 * The New Project dialog: a type and a title, and nothing else.
 *
 * A modal `<dialog>`, like the import report, so Escape cancels it natively and
 * the window behind hears nothing while it is open. Enter in the title
 * confirms, as the label says. Confirm stays disabled until there is a title, and a failure is
 * said inside the dialog — in the writer's words — with the dialog left open
 * so they can change the title and try again.
 */
import { PROJECT_TYPES, type ProjectType } from "../../../src/project/create.ts";
import { createElement, ChevronDown } from "lucide";
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
  const type = element(
    "select",
    { id: "new-project-type", className: "new-project-dialog__input" },
    PROJECT_TYPES.map((name) => element("option", { value: name, textContent: name })),
  );
  const title = element("input", {
    id: "new-project-title",
    className: "new-project-dialog__input",
    type: "text",
    // A hint, not a name: an empty title is still refused.
    placeholder: "Untitled",
    autocomplete: "off",
    spellcheck: false,
  });
  const create = action("Confirm", "Enter", "submit");
  create.classList.add("new-project-dialog__action--confirm");
  create.disabled = true;
  const cancel = action("Cancel", "Esc", "button");
  const problem = element("div", { className: "new-project__problem" });

  const field = (label: string, input: HTMLElement, extra: readonly Node[] = []) =>
    element("div", { className: "new-project-dialog__field" }, [
      element("label", { htmlFor: input.id, className: "new-project-dialog__label", textContent: label }),
      element("div", { className: "new-project-dialog__box" }, [input, ...extra]),
    ]);

  // Cancel on the left, Confirm on the right: the keys the labels promise.
  const form = element("form", { className: "new-project-dialog__form" }, [
    field("Project type", type, [chevron()]),
    field("Project title", title),
    problem,
    element("div", { className: "new-project-dialog__actions" }, [cancel, create]),
  ]);
  // No heading (the home design); the dialog is still named for a screen reader.
  const modal = element("dialog", { className: "new-project-dialog", ariaLabel: "New Project" }, [form]);

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
    onCreate({ type: type.value as ProjectType, title: title.value }).then(
      (wrong) => {
        making = false;
        if (wrong === undefined) {
          modal.close();
          return;
        }
        problem.replaceChildren(troublePanel(wrong));
        settle();
        title.focus();
      },
      (error: unknown) => {
        making = false;
        problem.replaceChildren(
          troublePanel(`A new project could not be made. ${message(error)}`),
        );
        settle();
      },
    );
  });
  // Enter confirms from anywhere in the dialog but a button, which acts on its
  // own: a select does not submit a form by itself.
  modal.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.target instanceof HTMLButtonElement) return;
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
  title.focus();
  return modal;
}

/** A button drawn as the home screen's selected row is: `> Label [Key]`. */
function action(label: string, key: string, kind: "submit" | "button"): HTMLButtonElement {
  return element("button", { className: "new-project-dialog__action", type: kind }, [
    element("span", { className: "new-project-dialog__cursor", ariaHidden: "true", textContent: ">" }),
    element("span", { textContent: label }),
    element("span", { ariaHidden: "true", textContent: `[${key}]` }),
  ]);
}

/** The drop-down's arrow: Lucide's own drawing, at the icon size (ADR-0035). */
function chevron(): SVGElement {
  return createElement(ChevronDown, { class: "new-project-dialog__chevron", "aria-hidden": "true" });
}
