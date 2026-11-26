/**
 * Drafts from the Editor (ADR-0002, ADR-0018, amended 2026-11-26): File ▸ Lock
 * this Draft… and File ▸ Draft Tree…, a locked draft read on the paper with its
 * card beside it, Return to live, Branch from here, and moving between open
 * drafts without losing a word.
 *
 * The real shell and Editor, wired as `main.ts` wires them, over an invented
 * screenplay in a temporary folder.
 */
// @vitest-environment jsdom
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorView } from "prosemirror-view";
import { mountShell, type MountedShell } from "../../app/src/shell/shell.ts";
import { MANUSCRIPT_FILE, type Project } from "../../src/project/bundle.ts";
import { createProject } from "../../src/project/create.ts";
import { DRAFTS_INDEX, parseDraftIndex } from "../../src/project/drafts.ts";
import { shownComments } from "../../src/screenplay/comment-editing.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { fakeEngine } from "../support/spell-engine.ts";

// The paper's view, which the Editor keeps to itself, so a test can type on it.
// A new one is made for each draft put on the paper.
const paper = vi.hoisted(() => ({ view: undefined as unknown }));
vi.mock("prosemirror-view", async (actual) => {
  const real = await actual<typeof import("prosemirror-view")>();
  class Kept extends real.EditorView {
    constructor(...args: ConstructorParameters<typeof real.EditorView>) {
      super(...args);
      // jsdom lays nothing out: the comment cards are drawn level with a line at the top.
      this.coordsAtPos = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
      paper.view = this;
    }
  }
  return { ...real, EditorView: Kept };
});
vi.mock("../../app/src/spell-tauri.ts", () => ({ tauriSpellEngine: fakeEngine() }));
const { editorWorkspace } = await import("../../app/src/workspaces/editor/editor.ts");

// jsdom has no modal dialog.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

/** An invented scene, with one comment on its action. */
const SCENE = "INT. FERRY - NIGHT\n\n[[c:1 too slow]]The deck rolls under MAYA.[[/c:1]]\n\nMAYA\nHold on.\n";

let temporary: { path: string; remove: () => void };
let shell: MountedShell | undefined;
let project: Project;
let reports: string[];

beforeEach(async () => {
  temporary = temporaryDirectory();
  project = await createProject({ filesystem: nodeFilesystem, newProjectId: () => "id-ferry" }, join(temporary.path, "write-ist"), {
    title: "Night Ferry",
    type: "Feature",
  });
  // A project made before drafts: manuscript.fountain, and nothing about drafts at all.
  writeFileSync(join(project.path, MANUSCRIPT_FILE), SCENE);
  reports = [];
});
afterEach(async () => {
  await shell?.unmount();
  shell = undefined;
  document.body.replaceChildren();
  temporary.remove();
});

const at = (file: string): string => join(project.path, file);
const read = (file: string): string => readFileSync(at(file), "utf8");
const view = (): EditorView => paper.view as EditorView;
const dialog = () => document.querySelector<HTMLDialogElement>("dialog[open]");
const text = (): string => view().state.doc.textContent;
/** Type at the end of the script, in MAYA's speech, where nothing is capitalised. */
const type = (words: string): void => view().dispatch(view().state.tr.insertText(` ${words}`, view().state.doc.content.size - 1));

async function editing(): Promise<HTMLElement> {
  const into = document.createElement("div");
  document.body.append(into);
  const quiet = (): (() => void) => () => {};
  shell = mountShell(into, {
    project,
    filesystem: nodeFilesystem,
    workspaces: [editorWorkspace],
    onClose: () => {},
    onHome: () => {},
    whenSwitchedAway: quiet,
    whenSwitchedBack: quiet,
    ledger: () => undefined,
    places: () => undefined,
    spellEngine: fakeEngine(),
    chooseCopyLocation: async () => undefined,
    openSettings: () => {},
    choosePdfLocation: async () => undefined,
    askToEditDetails: () => {},
    report: (words: string) => reports.push(words),
  } as never);
  await vi.waitFor(() => expect(into.querySelector(".ProseMirror")).not.toBeNull());
  return into;
}

function fileItem(into: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...into.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((item) => item.textContent === label);
}

/** The words on the dialog's action button, without its `>` and key. */
const confirmLabel = (): string =>
  [...dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.children].find((part) => !part.hasAttribute("aria-hidden"))!.textContent!;
const carry = () => dialog()!.querySelector<HTMLButtonElement>("#lock-carry")!;
const carried = (): boolean => carry().getAttribute("aria-checked") === "true";
const kindField = () => dialog()!.querySelector<HTMLButtonElement>("#lock-kind");
const noteBox = () => dialog()!.querySelector<HTMLInputElement>("#lock-note")!;

async function openLock(into: HTMLElement): Promise<void> {
  fileItem(into, "Lock this Draft…")!.click();
  await vi.waitFor(() => expect(dialog()?.getAttribute("aria-label")).toBe("Lock this Draft"));
}

function choose(label: string): void {
  kindField()!.click();
  const option = [...dialog()!.querySelectorAll<HTMLElement>('[role="option"]')].find((each) => each.textContent === label);
  if (option === undefined) throw new Error(`No "${label}" to choose.`);
  option.click();
}

/** Confirm, and wait for the dialog to go: the lock has landed. */
async function confirm(): Promise<void> {
  dialog()!.querySelector("form")!.requestSubmit();
  await vi.waitFor(() => expect(dialog()).toBeNull());
}

async function lockAs(into: HTMLElement, kind: "first" | "Revision" | "New Draft", { note = "", carry: keep }: { note?: string; carry?: boolean } = {}): Promise<void> {
  await openLock(into);
  if (kind !== "first") choose(kind === "Revision" ? (dialog()!.querySelector('[role="option"]')!.textContent!) : [...dialog()!.querySelectorAll('[role="option"]')][1]!.textContent!);
  if (keep !== undefined && carried() !== keep) carry().click();
  noteBox().value = note;
  await confirm();
}

async function openTree(into: HTMLElement): Promise<HTMLDialogElement> {
  fileItem(into, "Draft Tree…")!.click();
  await vi.waitFor(() => expect(dialog()?.getAttribute("aria-label")).toBe("Draft Tree"));
  return dialog()!;
}

const rows = (): HTMLButtonElement[] => [...dialog()!.querySelectorAll<HTMLButtonElement>(".draft-tree__row")];
const rowTitles = (): string[] =>
  rows().map((row) => `${"  ".repeat(Number(row.style.getPropertyValue("--draft-depth")))}${row.querySelector(".draft-tree__title")!.textContent}`);
const rowCalled = (title: string, status?: RegExp): HTMLButtonElement => {
  const found = rows().find(
    (row) => row.querySelector(".draft-tree__title")!.textContent === title && (status === undefined || status.test(row.querySelector(".draft-tree__status")!.textContent!)),
  );
  if (found === undefined) throw new Error(`No row "${title}".`);
  return found;
};

const lockedCard = (into: HTMLElement) => into.querySelector<HTMLElement>(".locked-draft");
const cardButton = (into: HTMLElement, label: string) =>
  [...lockedCard(into)!.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === label)!;

/** Wait until a draft other than `before` is on the paper. */
async function newPaper(before: EditorView): Promise<EditorView> {
  await vi.waitFor(() => expect(paper.view).not.toBe(before));
  await vi.waitFor(() => expect(document.querySelector(".ProseMirror")).toBe(view().dom));
  return view();
}

describe("the File menu", () => {
  it("offers Lock this Draft… and Draft Tree…, and the desk has no draft pill", async () => {
    const into = await editing();
    expect(fileItem(into, "Lock this Draft…")).toBeDefined();
    expect(fileItem(into, "Draft Tree…")).toBeDefined();
    const pills = [...into.querySelectorAll(".pill")].map((pill) => pill.textContent ?? "");
    expect(pills.some((words) => /draft/i.test(words))).toBe(false);
    expect(into.querySelector(".locked-draft")).toBeNull();
  });
});

describe("Lock this Draft…", () => {
  it("first locks as Draft 1, saying so on the button, and asks nothing else", async () => {
    const into = await editing();
    await openLock(into);
    expect(confirmLabel()).toBe("Lock as Draft 1");
    expect(dialog()!.textContent).toContain("as Draft 1.");
    expect(kindField()).toBeNull();
    expect(carried()).toBe(true);
    expect(noteBox().maxLength).toBe(120);
  });

  it("locks the words on screen, saved first, with the note, and the writer goes on in the open draft", async () => {
    const into = await editing();
    type("Rain.");
    await openLock(into);
    noteBox().value = "First pass, for Sam.";
    await confirm();

    const locked = read("drafts/1.fountain");
    expect(locked).toContain("Rain.");
    expect(locked).toContain("[[c:1 too slow]]");
    expect(read(MANUSCRIPT_FILE)).toBe(locked);
    const index = parseDraftIndex(read(DRAFTS_INDEX));
    expect(index.records.get("1")?.note).toBe("First pass, for Sam.");
    expect(index.records.get("1")?.locked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Still the open draft, still written in.
    expect(view().editable).toBe(true);
    type("More.");
    await shell!.unmount();
    shell = undefined;
    expect(read(MANUSCRIPT_FILE)).toContain("More.");
    expect(read("drafts/1.fountain")).not.toContain("More.");
  });

  it("then asks Revision or New Draft, the name on the button following, and Carry comments forward its default", async () => {
    const into = await editing();
    await lockAs(into, "first");
    await openLock(into);
    expect(kindField()!.textContent).toContain("Revision · Draft 1.1");
    expect(confirmLabel()).toBe("Lock as Draft 1.1");
    expect(carried()).toBe(true);

    choose("New Draft · Draft 2");
    expect(confirmLabel()).toBe("Lock as Draft 2");
    expect(dialog()!.textContent).toContain("as Draft 2.");
    expect(carried()).toBe(false);
    // The writer's either way.
    carry().click();
    expect(carried()).toBe(true);

    choose("Revision · Draft 1.1");
    expect(confirmLabel()).toBe("Lock as Draft 1.1");
    expect(carried()).toBe(true);
    carry().click();
    expect(carried()).toBe(false);
  });

  it("unticked, takes the comments out of the open draft only: the locked copy keeps them", async () => {
    const into = await editing();
    await lockAs(into, "first");
    expect(shownComments(view().state)).toHaveLength(1);
    await lockAs(into, "New Draft", { carry: false });

    expect(read("drafts/2.fountain")).toContain("[[c:1 too slow]]The deck rolls under MAYA.[[/c:1]]");
    expect(shownComments(view().state)).toHaveLength(0);
    expect(text()).toContain("The deck rolls under MAYA.");
    await vi.waitFor(() => expect(read(MANUSCRIPT_FILE)).not.toContain("[[c:"));
    expect(read(MANUSCRIPT_FILE)).toContain("The deck rolls under MAYA.");
  });

  it("ticked, as a revision is, carries them forward", async () => {
    const into = await editing();
    await lockAs(into, "first");
    await lockAs(into, "Revision");
    expect(existsSync(at("drafts/1.1.fountain"))).toBe(true);
    expect(shownComments(view().state)).toHaveLength(1);
    expect(read(MANUSCRIPT_FILE)).toContain("[[c:1 too slow]]");
  });

  it("says a failure inside the dialog and locks nothing when drafts.md will not read", async () => {
    writeFileSync(at(DRAFTS_INDEX), "Not the index.\n");
    const into = await editing();
    await openLock(into);
    dialog()!.querySelector("form")!.requestSubmit();
    await vi.waitFor(() => expect(dialog()!.querySelector(".new-project__problem")!.textContent).toMatch(/Nothing was changed/));
    expect(existsSync(at("drafts/1.fountain"))).toBe(false);
    expect(read(DRAFTS_INDEX)).toBe("Not the index.\n");
  });
});

describe("the Draft Tree", () => {
  it("draws the trunk, revisions a step in, branches under their draft, and the open drafts, the one written in marked", async () => {
    const into = await editing();
    await lockAs(into, "first", { note: "First pass." });
    await lockAs(into, "Revision");
    await lockAs(into, "New Draft");
    await openTree(into);
    expect(rowTitles()).toEqual(["Draft 1", "  1.1", "Draft 2", "Open draft"]);
    expect(rowCalled("Draft 1").textContent).toContain("First pass.");
    expect(rowCalled("Draft 1").querySelector(".draft-tree__status")!.textContent).toMatch(/^Locked · \w{3} \d+, \d{4}$/);
    expect(rowCalled("Open draft").getAttribute("aria-current")).toBe("true");
    expect(rowCalled("Open draft").textContent).toContain("Open · writing in it");
    expect(rowCalled("Open draft").textContent).toContain("After Draft 2");
    // The keys start on the open draft written in, walk the rows, and Esc closes.
    expect(document.activeElement).toBe(rowCalled("Open draft"));
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(document.activeElement).toBe(rowCalled("Draft 2"));
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(document.activeElement).toBe(rowCalled("1.1"));
  });

  it("opens a locked draft read-only on the paper, from Enter on its row, with a card beside it and no bar", async () => {
    const into = await editing();
    await lockAs(into, "first", { note: "First pass." });
    type("Later.");
    const live = view();
    await openTree(into);
    const row = rowCalled("Draft 1");
    row.focus();
    row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const locked = await newPaper(live);
    await vi.waitFor(() => expect(dialog()).toBeNull());

    // The open draft's words were saved on the way.
    expect(read(MANUSCRIPT_FILE)).toContain("Later.");
    expect(text()).not.toContain("Later.");
    expect(locked.editable).toBe(false);
    expect(locked.dom.getAttribute("contenteditable")).toBe("false");
    const card = lockedCard(into)!;
    expect(card.closest(".desk__column--right")).not.toBeNull();
    expect(card.querySelector(".locked-draft__title")!.textContent).toBe("Locked · Draft 1");
    expect(card.textContent).toContain("First pass.");
    expect([...card.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Return to live", "Branch from here"]);
    expect(into.querySelector(".locked-draft-bar, header.locked")).toBeNull();
  });

  it("moves to another open draft, saving the words in the one before", async () => {
    const into = await editing();
    await lockAs(into, "first");
    // A branch from Draft 1, then back to the trunk's open draft from the tree.
    let before = view();
    await openTree(into);
    rowCalled("Draft 1").click();
    await newPaper(before);
    before = view();
    cardButton(into, "Branch from here").click();
    await newPaper(before);
    type("On the branch.");

    before = view();
    await openTree(into);
    expect(rowTitles()).toEqual(["Draft 1", "  Draft 1a", "Open draft"]);
    rowCalled("Open draft").click();
    await newPaper(before);
    expect(read("manuscript 1a.fountain")).toContain("On the branch.");
    expect(read(MANUSCRIPT_FILE)).not.toContain("On the branch.");
    expect(text()).not.toContain("On the branch.");
    expect(parseDraftIndex(read(DRAFTS_INDEX)).writingIn).toBe(MANUSCRIPT_FILE);
    // Moving between drafts is not closing the project: nothing is said about the ledger.
    expect(into.textContent).not.toMatch(/ledger/);
  });
});

describe("a locked draft on the paper", () => {
  async function reading(into: HTMLElement): Promise<void> {
    await lockAs(into, "first");
    const before = view();
    await openTree(into);
    rowCalled("Draft 1").click();
    await newPaper(before);
  }

  it("takes no typing, no paste, no command: nothing edits it and nothing branches", async () => {
    const into = await editing();
    await reading(into);
    const doc = view().state.doc;
    view().dispatch(view().state.tr.insertText("TYPED"));
    view().dispatch(view().state.tr.delete(1, 5));
    fileItem(into, "Undo")?.click();
    expect(view().state.doc).toBe(doc);
    // Lock this Draft… is for an open draft: nothing opens.
    fileItem(into, "Lock this Draft…")!.click();
    await new Promise((settled) => setTimeout(settled, 20));
    expect(dialog()).toBeNull();
    expect(existsSync(at("manuscript 1a.fountain"))).toBe(false);
    expect(read("drafts/1.fountain")).toBe(SCENE);
    await shell!.unmount();
    shell = undefined;
    // Leaving wrote nothing over the locked draft or the open one.
    expect(read("drafts/1.fountain")).toBe(SCENE);
    expect(read(MANUSCRIPT_FILE)).toBe(SCENE);
  });

  it("shows its comments, read and never written: no caret in a card, no Resolve, no Add Comment", async () => {
    const into = await editing();
    await reading(into);
    await vi.waitFor(() => expect(into.querySelectorAll(".comment-card")).toHaveLength(1));
    const card = into.querySelector<HTMLElement>(".comment-card")!;
    expect(card.textContent).toContain("too slow");
    expect(card.querySelector("[contenteditable]")).toBeNull();
    expect(card.querySelector(".comment-card__resolve")).toBeNull();
    into.querySelector<HTMLButtonElement>('[aria-label="Add comment"]')!.click();
    expect(shownComments(view().state)).toHaveLength(1);
  });

  it("Return to live puts the open draft back, written in, and the card away", async () => {
    const into = await editing();
    type("Live words.");
    await reading(into);
    const before = view();
    cardButton(into, "Return to live").click();
    await newPaper(before);
    expect(view().editable).toBe(true);
    expect(text()).toContain("Live words.");
    expect(lockedCard(into)).toBeNull();
  });

  it("Branch from here makes 1a, a new open draft written in at once, and leaves the trunk's open", async () => {
    const into = await editing();
    await reading(into);
    const before = view();
    cardButton(into, "Branch from here").click();
    await newPaper(before);
    expect(view().editable).toBe(true);
    expect(lockedCard(into)).toBeNull();
    expect(read("manuscript 1a.fountain")).toBe(SCENE);
    type("Branch words.");
    await shell!.unmount();
    shell = undefined;
    expect(read("manuscript 1a.fountain")).toContain("Branch words.");
    expect(read(MANUSCRIPT_FILE)).toBe(SCENE);
    expect(read("drafts/1.fountain")).toBe(SCENE);
    // And the project opens in it next time.
    await editing();
    expect(text()).toContain("Branch words.");
  });
});
