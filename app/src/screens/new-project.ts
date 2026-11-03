/**
 * The New Project dialog: a type and a title, and nothing else.
 *
 * A modal `<dialog>`, like the import report, so Escape cancels it natively and
 * the window behind hears nothing while it is open. Enter in the title
 * confirms. Create stays disabled until there is a title, and a failure is
 * said inside the dialog — in the writer's words — with the dialog left open
 * so they can change the title and try again.
 */
import { PROJECT_TYPES, type ProjectType } from "../../../src/project/create.ts";
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
    { id: "new-project-type", className: "field__input" },
    PROJECT_TYPES.map((name) => element("option", { value: name, textContent: name })),
  );
  const title = element("input", {
    id: "new-project-title",
    className: "field__input",
    type: "text",
    autocomplete: "off",
    spellcheck: false,
  });
  const create = element("button", {
    className: "button button--leading",
    type: "submit",
    textContent: "Create",
    disabled: true,
  });
  const cancel = element("button", {
    className: "button",
    type: "button",
    textContent: "Cancel",
  });
  const problem = element("div", { className: "new-project__problem" });

  const form = element("form", { className: "new-project__form" }, [
    element("h2", { className: "report__heading", textContent: "New Project" }),
    element("div", { className: "field" }, [
      element("label", { htmlFor: type.id, className: "field__label", textContent: "Project type" }),
      type,
    ]),
    element("div", { className: "field" }, [
      element("label", { htmlFor: title.id, className: "field__label", textContent: "Title" }),
      title,
    ]),
    problem,
    element("div", { className: "report__actions new-project__actions" }, [cancel, create]),
  ]);
  const modal = element("dialog", { className: "report new-project" }, [form]);

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
