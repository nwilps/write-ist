/**
 * The confirm: a question, Cancel [Esc] and one action [Enter] — the dialog
 * Delete Project, Exile and every workspace's "are you sure?" are made of
 * (`toolbox.dialogs.confirm`, ADR-0045).
 *
 * New Project's look (ADR-0042) and its manners, from the same shared button
 * and keys: a modal `<dialog>`, so Escape cancels and the screen behind hears
 * nothing; Cancel on the left and the action on the right; a failure said
 * inside the dialog in the writer's words, with the dialog left open; and
 * nothing to press twice while the disk is answering. Never the system's own
 * `confirm()` (ADR-0034).
 *
 * **Alarm** is for what cannot be undone — Exile, deleting a note: the alarm
 * colour, a warning sign, and focus on Cancel, so the safe answer is the one
 * under the writer's hand. Otherwise focus is on the action, whose key the
 * label shows.
 */
import { createElement, TriangleAlert } from "lucide";
import { dialogAction } from "./dialog-action.ts";
import { dialogKeys, enterSubmits, type DialogKeys } from "./dialog-keys.ts";
import { element } from "./element.ts";
import { message, trouble as troublePanel } from "./trouble.ts";

/**
 * Do it. Resolves to words for the writer when it could not be done — the
 * dialog stays open with them — and to nothing when it was, and it closes.
 */
export type ConfirmAttempt = () => Promise<string | undefined>;

/** A confirm, in the asker's own words. */
export interface ConfirmSpec {
  /** What a screen reader calls the dialog: "Delete Note". */
  readonly label: string;
  /** The question, the first line: `Delete "Ideas"?`. */
  readonly question: string;
  /** What it means, a line each: "This permanently deletes the note…". */
  readonly lines?: readonly string[];
  /** The action's name, on its button: "Delete". */
  readonly confirm: string;
  /** For what cannot be undone: the alarm colour, and focus on Cancel. */
  readonly alarm?: boolean;
  /** Do it, once the writer has said so (`ConfirmAttempt`). */
  readonly act: ConfirmAttempt;
  /** Said before the reason, when `act` throws: "“Ideas” could not be deleted, so it is still in your notes." */
  readonly failed: string;
  /** The dialog is gone, however it went. */
  readonly closed?: () => void;
}

/** Ask, and do it only if the writer says so. Answers the dialog. */
export function showConfirm(into: HTMLElement, spec: ConfirmSpec): HTMLDialogElement {
  const alarm = spec.alarm === true;
  const lead = element("p", { className: "project-dialog__line project-dialog__line--lead", textContent: spec.question });
  const lines = (spec.lines ?? []).map((line) => element("p", { className: "project-dialog__line", textContent: line }));
  const body: HTMLElement[] = [];
  if (alarm) {
    const warning = createElement(TriangleAlert, { class: "project-dialog__alarm-icon" });
    warning.setAttribute("aria-hidden", "true");
    body.push(element("div", { className: "project-dialog__message project-dialog__message--alarm" }, [warning, lead, ...lines]));
  } else {
    body.push(element("div", { className: "project-dialog__message" }, [lead, ...lines]));
  }
  const shown = confirmDialog(into, {
    label: spec.label,
    body,
    stops: [],
    confirm: spec.confirm,
    ready: () => true,
    attempt: spec.act,
    failed: spec.failed,
    resume: () => (alarm ? shown.cancel : shown.confirm).focus(),
    onClose: spec.closed ?? (() => {}),
  });
  if (alarm) {
    shown.modal.classList.add("project-dialog--alarm");
    shown.confirm.classList.add("project-dialog__alarm-action");
    // Cancel first: the safe answer is the one under the writer's hand.
    shown.cancel.focus();
  } else {
    // Focus on the action whose key the label shows, as New Project's title does.
    shown.confirm.focus();
  }
  return shown.modal;
}

export interface DialogSpec {
  readonly label: string;
  readonly body: readonly HTMLElement[];
  /** What the keys visit above the buttons, top to bottom. */
  readonly stops: readonly HTMLElement[];
  readonly confirm: string;
  readonly ready: () => boolean;
  readonly attempt: ConfirmAttempt;
  /** Said before the reason, when the attempt throws rather than answers. */
  readonly failed: string;
  /** Put focus back after a failure: the buttons were disabled, and it was lost. */
  readonly resume: () => void;
  readonly onClose: () => void;
}

export interface ShownDialog {
  readonly modal: HTMLDialogElement;
  readonly confirm: HTMLButtonElement;
  readonly cancel: HTMLButtonElement;
  readonly keys: DialogKeys;
  readonly settle: () => void;
}

/** The frame every dialog here is: a form with a body, a place for trouble, and Cancel and the action. */
export function confirmDialog(into: HTMLElement, spec: DialogSpec): ShownDialog {
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
