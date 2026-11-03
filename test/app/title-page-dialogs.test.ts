/**
 * Edit Title Page, View Title Page, and the Edit and View menus that open them
 * (slice 2, steps 4 and 6).
 */
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { editorMenus } from "../../app/src/workspaces/editor/menus.ts";
import { sidePanels } from "../../app/src/workspaces/editor/panels.ts";
import { openTitlePageDialog } from "../../app/src/workspaces/editor/title-page-dialog.ts";
import { showTitlePagePreview } from "../../app/src/workspaces/editor/title-page-preview.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { titlePageRuns } from "../../src/screenplay/title-page-layout.ts";

// jsdom has no modal dialog.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  HTMLFormElement.prototype.requestSubmit = function () {
    this.dispatchEvent(new Event("submit", { cancelable: true }));
  };
});
afterEach(() => document.body.replaceChildren());

const TITLE_PAGE = parse(
  "Title:\n\t_**BRICK & STEEL**_\n\t_**FULL RETIRED**_\nCredit: Written by\nAuthor: Stu\nRevision: Blue\n\nx\n",
).titlePage;

function opened(titlePage = TITLE_PAGE) {
  const save = vi.fn();
  const closed = vi.fn();
  const into = document.body.appendChild(document.createElement("div"));
  const modal = openTitlePageDialog(into, { titlePage, save, closed });
  const box = (key: string) => modal.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#title-page-${key}`)!;
  const button = (label: string) => [...modal.querySelectorAll("button")].find((b) => b.textContent === label)!;
  const submit = () => modal.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
  const type = (key: string, value: string) => {
    box(key).value = value;
    box(key).dispatchEvent(new Event("input"));
  };
  return { into, modal, save, closed, box, button, submit, type };
}

describe("Edit Title Page", () => {
  it("has a box for every key in the spec, prefilled, marks as written", () => {
    const { modal, box } = opened();
    const labels = [...modal.querySelectorAll("label")].map((l) => l.textContent);
    expect(labels).toEqual([
      "Title", "Credit", "Author(s)", "Source", "Draft date", "Contact", "Notes",
    ]);
    expect(box("title").value).toBe("_**BRICK & STEEL**_\n_**FULL RETIRED**_");
    expect(box("credit").value).toBe("Written by");
    expect(box("author").value).toBe("Stu");
    expect(box("draft-date").value).toBe("");
    expect(modal.querySelector("#title-page-other, #title-page-copyright")).toBeNull();
    // A value with several lines is never squashed into a one-line input.
    expect(box("title").tagName).toBe("TEXTAREA");
    expect(box("credit").tagName).toBe("INPUT");
  });

  it("focuses the first box, as New Project focuses its title", () => {
    const { box } = opened();
    expect(document.activeElement).toBe(box("title"));
  });

  it("saves what was changed, and closes", () => {
    const { save, closed, modal, type, submit } = opened();
    type("credit", "Screenplay by");
    type("draft-date", "the week after next");
    submit();
    expect(save).toHaveBeenCalledTimes(1);
    const saved = save.mock.calls[0]![0];
    expect(serialise({ titlePage: saved, elements: [], comments: [], endsWithNewline: false })).toBe(
      "Title:\n\t_**BRICK & STEEL**_\n\t_**FULL RETIRED**_\nCredit: Screenplay by\nAuthor: Stu\nRevision: Blue\nDraft date: the week after next",
    );
    expect(modal.hasAttribute("open")).toBe(false);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when Save is pressed with nothing changed", () => {
    const { save, closed, submit } = opened();
    submit();
    expect(save).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("saves from the Save button's form with Enter, as New Project does", () => {
    const { button } = opened();
    expect(button("Save").type).toBe("submit");
  });

  it("saves with Ctrl+Enter from a several-line box, where Enter is a new line", () => {
    const { box, save, type } = opened();
    type("notes", "FINAL\nDRAFT");
    const ctrl = new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true });
    box("notes").dispatchEvent(ctrl);
    expect(ctrl.defaultPrevented).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("cancels with the Cancel button and with Escape, saving nothing", () => {
    const first = opened();
    first.type("credit", "x");
    first.button("Cancel").click();
    expect(first.save).not.toHaveBeenCalled();
    expect(first.closed).toHaveBeenCalledTimes(1);

    document.body.replaceChildren();
    const second = opened();
    second.type("credit", "x");
    // The browser answers Escape on a modal dialog by closing it.
    second.modal.close();
    expect(second.save).not.toHaveBeenCalled();
    expect(second.closed).toHaveBeenCalledTimes(1);
  });

  it("previews what is typed now, saved or not, without saving", () => {
    const { into, save, type, button } = opened();
    type("credit", "Screenplay by");
    button("View").click();
    const preview = into.querySelector("dialog.title-preview")!;
    expect([...preview.querySelectorAll("text")].map((t) => t.textContent)).toContain("Screenplay by");
    expect(save).not.toHaveBeenCalled();
  });
});

describe("View Title Page", () => {
  it("draws the shared layout's runs, each where the layout put it", () => {
    const into = document.body.appendChild(document.createElement("div"));
    const modal = showTitlePagePreview(into, TITLE_PAGE);
    const drawn = [...modal.querySelectorAll("text")].map((t) => ({
      text: t.textContent,
      x: Number(t.getAttribute("x")),
      y: Number(t.getAttribute("y")),
    }));
    expect(drawn).toEqual(titlePageRuns(TITLE_PAGE).map(({ text, x, y }) => ({ text, x, y })));
    expect(drawn.length).toBeGreaterThan(0);
    // Marks are faces, not delimiters.
    expect(modal.textContent).not.toContain("_**");
    expect(modal.querySelector(".title-run--bold.title-run--underline")).not.toBeNull();
  });

  it("closes with Escape and leaves the page where it was", () => {
    const into = document.body.appendChild(document.createElement("div"));
    const closed = vi.fn();
    const modal = showTitlePagePreview(into, TITLE_PAGE, closed);
    modal.close();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(into.querySelector("dialog")).toBeNull();
  });

  it("says there is nothing to show for an empty title page, on an empty sheet", () => {
    const into = document.body.appendChild(document.createElement("div"));
    const modal = showTitlePagePreview(into, []);
    expect(modal.textContent).toContain("no title page to show");
    expect(modal.querySelector("svg.title-sheet")).not.toBeNull();
    expect(modal.querySelectorAll("text")).toHaveLength(0);
  });
});

describe("the Edit and View menus", () => {
  const act = {
    save: vi.fn(), saveCopy: vi.fn(), exportPdf: vi.fn(), toProjects: vi.fn(), toHome: vi.fn(),
    editTitlePage: vi.fn(), viewTitlePage: vi.fn(), confirmName: vi.fn(), confirmLocation: vi.fn(),
  };
  function panel() {
    const panels = sidePanels(undefined, editorMenus(act));
    document.body.append(panels.left);
    return panels;
  }
  afterEach(() => vi.clearAllMocks());

  it("hold only what works: Edit Title Page… and View Title Page", () => {
    const menus = editorMenus(act);
    const labels = (name: string) => menus[name]!.map((entry) => ("label" in entry ? entry.label : "—"));
    expect(Object.keys(menus)).toEqual(["File", "Edit", "View"]);
    expect(labels("Edit")).toEqual([
      "Edit Title Page…", "—", "Confirm This Name", "Confirm This Location",
    ]);
    expect(labels("View")).toEqual(["View Title Page"]);
    // No shortcut is shown that does not exist: only the Confirm items have one.
    expect(menus["View"]!.every((entry) => !("hint" in entry))).toBe(true);
    expect(menus["Edit"]!.flatMap((entry) => ("hint" in entry ? [entry.hint] : []))).toEqual([
      "[Ctrl + K]", "[Ctrl + K]",
    ]);
  });

  it("open from their rows like File, and the items run the actions", () => {
    const panels = panel();
    const rows = [...panels.left.querySelectorAll<HTMLButtonElement>(".panel__row")];
    expect(rows.map((r) => r.getAttribute("aria-haspopup"))).toEqual(["menu", "menu", "menu"]);
    rows[1]!.click();
    const edit = panels.left.querySelector<HTMLButtonElement>('[aria-label="Edit"] [role="menuitem"]')!;
    expect(edit.textContent).toBe("Edit Title Page…");
    edit.click();
    expect(act.editTitlePage).toHaveBeenCalledTimes(1);
    rows[2]!.click();
    panels.left.querySelector<HTMLButtonElement>('[aria-label="View"] [role="menuitem"]')!.click();
    expect(act.viewTitlePage).toHaveBeenCalledTimes(1);
    panels.dispose();
  });

  it("open with Alt+E and Alt+V, focus the item, and close on Escape without it reaching the window", () => {
    const panels = panel();
    const heard = vi.fn();
    window.addEventListener("keydown", heard);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", altKey: true, bubbles: true, cancelable: true }));
    const edit = panels.left.querySelector<HTMLElement>('[aria-label="Edit"]')!;
    expect(edit.hidden).toBe(false);
    expect(document.activeElement?.textContent).toBe("Edit Title Page…");
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(edit.hidden).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "v", altKey: true, bubbles: true, cancelable: true }));
    expect(panels.left.querySelector<HTMLElement>('[aria-label="View"]')!.hidden).toBe(false);
    expect(panels.left.querySelector<HTMLElement>('[aria-label="Edit"]')!.hidden).toBe(true);
    window.removeEventListener("keydown", heard);
    panels.dispose();
  });
});
