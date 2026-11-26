/**
 * Draft Tree… (File menu): every draft the project has, drawn as the lineage
 * it is (ADR-0002, amended 2026-11-26), to read a locked one or move to
 * another open one.
 *
 * The trunk runs down the left — Draft 1, 2, 3 — with each draft's revisions a
 * compact step in beneath it, and a branch (2a, 2b) a step in under the draft
 * it departs from. Open drafts are marked open, and the one being written in
 * is marked so. A locked draft shows the day it was locked and its note.
 *
 * - **A locked draft** opens on the paper to be read, never changed.
 * - **An open draft** becomes the one written in; the one before it is saved
 *   first, and stays open.
 * - **Lock this Draft…** locks the open draft being written in.
 *
 * Write-ist's own dialog (ADR-0034), as the others are: a modal `<dialog>`,
 * Esc closes, the arrows walk the rows and Enter opens one (`dialogKeys`), and
 * nothing can be pressed twice while the disk is answering.
 */
import { createElement, Lock, type IconNode } from "lucide";
import { draftTree, type Drafts, type LockedDraft, type OpenDraft, type TreeRow } from "../../../../src/project/drafts.ts";
import { dialogAction } from "../../screens/dialog-action.ts";
import { dialogKeys } from "../../screens/dialog-keys.ts";
import { element } from "../../screens/element.ts";
import { trouble } from "../../screens/trouble.ts";

export interface DraftTreeOptions {
  readonly drafts: Drafts;
  /** The open draft being written in. */
  readonly live: OpenDraft;
  /** The locked draft on the paper, if one is being read. */
  readonly reading: string | undefined;
  /** Read a locked draft. Words for the writer when it could not be; nothing when it was, and the tree closes. */
  readonly read: (draft: LockedDraft) => Promise<string | undefined>;
  /** Write in an open draft, the same way. */
  readonly moveTo: (open: OpenDraft) => Promise<string | undefined>;
  /** Open Lock this Draft… for the open draft, once the tree has closed; `undefined` when it cannot be. */
  readonly lock: (() => void) | undefined;
  readonly closed: () => void;
}

/** A lock's day as the writer reads it: `Nov 20, 2026`. */
export function dayWords(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** What a row is called. */
export function rowTitle(row: TreeRow): string {
  if (row.kind === "locked") return row.revision ? row.draft.name : `Draft ${row.draft.name}`;
  return row.after === undefined ? `Draft ${row.first}` : "Open draft";
}

export function openDraftTree(into: HTMLElement, options: DraftTreeOptions): HTMLDialogElement {
  const rows = draftTree(options.drafts);
  let working = false;
  /** Set when the tree closes for Lock this Draft…, which opens once it has gone. */
  let thenLock = false;

  const problem = element("div", { className: "new-project__problem" });
  const say = (words: string | undefined): void => problem.replaceChildren(...(words === undefined ? [] : [trouble(words)]));

  const close = dialogAction("Close", "Esc", "button");
  const lock = dialogAction("Lock this Draft…", undefined, "button");
  lock.disabled = options.lock === undefined;

  /** The row for what is on the paper now, where the keys start. */
  let here: HTMLButtonElement | undefined;
  const buttons: HTMLButtonElement[] = rows.map((row) => drawRow(row));

  function drawRow(row: TreeRow): HTMLButtonElement {
    const title = element("span", { className: "draft-tree__title", textContent: rowTitle(row) });
    let status: string;
    const lines: HTMLElement[] = [];
    let mark: Node;
    if (row.kind === "locked") {
      const reading = options.reading === row.draft.name;
      status = reading ? "Reading" : "Locked";
      if (row.draft.locked !== undefined) status += ` · ${dayWords(row.draft.locked)}`;
      if (row.draft.note !== undefined) lines.push(element("span", { className: "draft-tree__note", textContent: row.draft.note }));
      mark = icon(Lock);
    } else {
      const live = row.open.file === options.live.file;
      status = live ? "Open · writing in it" : "Open";
      const from = row.after?.name ?? (row.open.line === "" ? undefined : row.open.line.slice(0, -1));
      if (from !== undefined) lines.push(element("span", { className: "draft-tree__note", textContent: `${row.after === undefined ? "From" : "After"} Draft ${from}` }));
      mark = element("span", { className: `draft-tree__dot${live ? " draft-tree__dot--live" : ""}`, ariaHidden: "true" });
    }
    const button = element("button", { type: "button", className: `draft-tree__row draft-tree__row--${row.kind}${row.kind === "locked" && row.revision ? " draft-tree__row--revision" : ""}` }, [
      element("span", { className: "draft-tree__head" }, [mark, title, element("span", { className: "draft-tree__status", textContent: status })]),
      ...lines,
    ]);
    button.style.setProperty("--draft-depth", String(row.depth));
    const isHere = row.kind === "locked" ? options.reading === row.draft.name : options.reading === undefined && row.open.file === options.live.file;
    if (row.kind === "open" && row.open.file === options.live.file) button.setAttribute("aria-current", "true");
    if (isHere) here = button;
    button.addEventListener("click", () => void choose(row, isHere));
    return button;
  }

  const list = element("div", { className: "draft-tree__list", role: "group", ariaLabel: "Drafts" }, buttons);
  const form = element("form", { className: "new-project-dialog__form" }, [
    list,
    problem,
    element("div", { className: "new-project-dialog__actions" }, [close, lock]),
  ]);
  const modal = element("dialog", { className: "new-project-dialog project-dialog draft-tree", ariaLabel: "Draft Tree" }, [form]);
  dialogKeys(modal, [...buttons.map((button) => [button]), [close, lock]]);

  const settle = (): void => {
    for (const button of [...buttons, close]) button.disabled = working;
    lock.disabled = working || options.lock === undefined;
  };

  async function choose(row: TreeRow, isHere: boolean): Promise<void> {
    if (working) return;
    // Already on the paper: nothing to do but go back to it.
    if (isHere) {
      modal.close();
      return;
    }
    say(undefined);
    working = true;
    settle();
    const focused = modal.ownerDocument.activeElement;
    let wrong: string | undefined;
    try {
      wrong = row.kind === "locked" ? await options.read(row.draft) : await options.moveTo(row.open);
    } finally {
      working = false;
      settle();
    }
    if (wrong === undefined) {
      modal.close();
      return;
    }
    say(wrong);
    if (focused instanceof HTMLElement) focused.focus();
  }

  form.addEventListener("submit", (event) => event.preventDefault());
  close.addEventListener("click", () => {
    if (!working) modal.close();
  });
  lock.addEventListener("click", () => {
    if (working || options.lock === undefined) return;
    thenLock = true;
    modal.close();
  });
  modal.addEventListener("cancel", (event) => {
    if (working) event.preventDefault();
  });
  modal.addEventListener("close", () => {
    modal.remove();
    options.closed();
    if (thenLock) options.lock?.();
  });

  into.append(modal);
  modal.showModal();
  settle();
  (here ?? buttons[0] ?? close).focus();
  here?.scrollIntoView?.({ block: "nearest" });
  return modal;
}

function icon(node: IconNode): SVGElement {
  const drawn = createElement(node, { class: "draft-tree__icon" });
  drawn.setAttribute("aria-hidden", "true");
  return drawn;
}
