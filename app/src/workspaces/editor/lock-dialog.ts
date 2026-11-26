/**
 * Lock this Draft… (File menu, and the Draft Tree's button): the open draft
 * copied aside under a name, never to change again, while the writer goes on
 * in the open draft (ADR-0002, ADR-0014; amended 2026-11-26).
 *
 * **The choice is made here, after the writing, never before it.** The first
 * lock on a line has one name and asks nothing. After that the writer chooses
 * Revision or New Draft, and the dialog says the exact name either one locks
 * as — in the sentence above and on the button — so nothing is guessed.
 *
 * *Carry comments forward* (ADR-0018, amended): on for a revision and off for
 * a new draft, changed whenever the choice is, and the writer's to flip
 * either way. The locked copy keeps its comments whatever it says; off takes
 * them out of the open draft only.
 *
 * Edit Project Details' look and manners (`confirm-dialog.ts`): a modal
 * `<dialog>`, Esc cancels, Cancel on the left and the action [Enter] on the
 * right, a failure said inside it, and nothing to press twice while the disk
 * is answering.
 */
import { NOTE_MAX, type LockNames } from "../../../../src/project/drafts.ts";
import { confirmDialog } from "../../screens/confirm-dialog.ts";
import { dialogSelect } from "../../screens/dialog-select.ts";
import { dialogToggle } from "../../screens/dialog-toggle.ts";
import { element } from "../../screens/element.ts";
import { chevron, field } from "../../screens/new-project.ts";

/** What the writer chose. */
export interface LockChoice {
  readonly name: string;
  /** Leave the comments in the open draft (`true`) or take them out of it. */
  readonly carry: boolean;
  /** One line, or empty. */
  readonly note: string;
}

export interface LockDialogOptions {
  /** What locking this open draft would call it (`lockNames`). */
  readonly names: LockNames;
  /** Lock. Words for the writer when it could not be done; nothing when it was, and the dialog closes. */
  readonly lock: (choice: LockChoice) => Promise<string | undefined>;
  readonly closed: () => void;
}

/** The two choices, by the value the drop-down keeps. */
type Kind = "revision" | "new";

export function openLockDialog(into: HTMLElement, { names, lock, closed }: LockDialogOptions): HTMLDialogElement {
  const choosing = names.kind === "choose";
  const nameFor = (kind: Kind): string =>
    names.kind === "first" ? names.name : kind === "revision" ? names.revision : names.newDraft;

  const kind = dialogSelect({
    id: "lock-kind",
    label: "Lock as",
    choices:
      names.kind === "choose"
        ? [
            { value: "revision", label: `Revision · Draft ${names.revision}` },
            { value: "new", label: `New Draft · Draft ${names.newDraft}` },
          ]
        : [{ value: "revision", label: `Draft ${names.name}` }],
    onChange: () => {
      // Each choice has its own default; the writer may still flip it after.
      carry.set(chosen() === "revision");
      redraw();
    },
  });
  const chosen = (): Kind => (kind.value() === "new" ? "new" : "revision");

  const carry = dialogToggle({ id: "lock-carry", onChange: () => {} });
  // On for a revision, and for a first lock: everything carries by default (ADR-0018).
  carry.set(true);

  const note = element("input", {
    id: "lock-note",
    className: "new-project-dialog__input",
    type: "text",
    placeholder: "Optional",
    autocomplete: "off",
    spellcheck: false,
  });
  // At most NOTE_MAX, quietly: typing stops there.
  note.maxLength = NOTE_MAX;

  const lead = element("p", { className: "project-dialog__line project-dialog__line--lead" });
  const message = element("div", { className: "project-dialog__message" }, [
    lead,
    element("p", {
      className: "project-dialog__line",
      textContent: "The locked copy never changes. You go on writing in this draft, which stays open.",
    }),
  ]);

  const shown = confirmDialog(into, {
    label: "Lock this Draft",
    body: [
      message,
      ...(choosing ? [field("Lock as", kind.control, [chevron(), kind.tray])] : []),
      element("div", { className: "settings__switch" }, [
        element("label", { htmlFor: carry.control.id, className: "new-project-dialog__label", textContent: "Carry comments forward" }),
        carry.control,
      ]),
      field("Note", note),
    ],
    stops: [...(choosing ? [kind.control] : []), carry.control, note],
    confirm: "Lock",
    ready: () => true,
    attempt: () => lock({ name: nameFor(chosen()), carry: carry.on(), note: note.value }),
    failed: "Nothing was locked, and your draft is as it was.",
    resume: () => shown.confirm.focus(),
    onClose: closed,
  });
  shown.modal.classList.add("lock-draft");

  /** The name, said exactly, in the sentence and on the button. */
  function redraw(): void {
    const name = nameFor(chosen());
    lead.textContent = `This draft is kept, as it is now, as Draft ${name}.`;
    const label = [...shown.confirm.children].find((part) => !part.hasAttribute("aria-hidden"));
    if (label !== undefined) label.textContent = `Lock as Draft ${name}`;
  }
  redraw();

  // The decision first, when there is one to make; otherwise the button that says the name.
  if (choosing) kind.control.focus();
  else shown.confirm.focus();
  return shown.modal;
}
