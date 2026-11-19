/**
 * Edit Title Page, View Title Page, and the Edit and View menus that open them
 * (slice 2, steps 4 and 6).
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
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

const css = (name: string): string =>
  readFileSync(`app/src/style/${name}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** What one selector's block in a stylesheet says. */
const rule = (sheet: string, selector: string): string =>
  new RegExp(`(?:^|\\})\\s*${selector.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`).exec(sheet)![1]!;
/** A token's size in pixels. */
const px = (token: string): number => Number(new RegExp(`${token}: ([\\d.]+)px;`).exec(css("tokens.css"))![1]);

const TITLE_PAGE = parse(
  "Title:\n\t_**BRICK & STEEL**_\n\t_**FULL RETIRED**_\nCredit: Written by\nAuthor: Stu\nRevision: Blue\n\nx\n",
).titlePage;

function opened(titlePage = TITLE_PAGE) {
  const save = vi.fn();
  const closed = vi.fn();
  const into = document.body.appendChild(document.createElement("div"));
  const modal = openTitlePageDialog(into, { titlePage, save, closed });
  const box = (key: string) => modal.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#title-page-${key}`)!;
  const button = (label: string) =>
    [...modal.querySelectorAll("button")].find((b) => b.querySelector("span:not(.gesture__cursor)")?.textContent === label)!;
  const submit = () => modal.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
  const type = (key: string, value: string) => {
    box(key).value = value;
    box(key).dispatchEvent(new Event("input"));
  };
  return { into, modal, save, closed, box, button, submit, type };
}

/** A key, pressed on whatever holds the focus. */
const press = (key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  document.activeElement!.dispatchEvent(event);
  return event;
};
/** Escape as the webview treats it: the `<dialog>` cancels unless the key was used. */
const escape = (modal: HTMLDialogElement): void => {
  const event = press("Escape");
  const cancel = new Event("cancel", { cancelable: true });
  modal.dispatchEvent(cancel);
  if (!event.defaultPrevented && !cancel.defaultPrevented) modal.close();
};
const saved = (fields: Parameters<typeof serialise>[0]["titlePage"]): string =>
  serialise({ titlePage: fields, elements: [], comments: [], endsWithNewline: false });
const PLAIN = parse("Title: Big Fish\nCredit: Written by\nAuthor: John August\n\nx\n").titlePage;
const TWO_AUTHORS = parse("Title: Big Fish\nAuthor:\n\tJohn August\n\tDaniel Wallace\nCopyright: 2003\n\nx\n").titlePage;

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

  it.each(["ctrlKey", "metaKey"])("saves with Enter and %s from a several-line box", (modifier) => {
    const { box, save, type } = opened();
    type("notes", "FINAL\nDRAFT");
    box("notes").focus();
    expect(press("Enter", { [modifier]: true }).defaultPrevented).toBe(true);
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

describe("Edit Title Page's look", () => {
  it("has no visible title, and is still named for a screen reader", () => {
    const { modal } = opened();
    expect(modal.querySelector("h1, h2, h3, .report__heading")).toBeNull();
    expect(modal.getAttribute("aria-label") ?? modal.ariaLabel).toBe("Edit Title Page");
  });

  it("wears New Project's frame, fields and buttons, not the old ones", () => {
    const { modal, box, button } = opened(PLAIN);
    expect(modal.classList.contains("new-project-dialog")).toBe(true);
    expect(modal.querySelector(".new-project__form, .field, .field__input, .button, .report__actions")).toBeNull();
    expect(modal.classList.contains("report")).toBe(false);
    expect(modal.querySelectorAll(".new-project-dialog__field")).toHaveLength(7);
    for (const key of ["title", "credit", "author", "source", "draft-date", "contact", "notes"]) {
      expect(box(key).classList.contains("new-project-dialog__input"), key).toBe(true);
    }
    expect(button("View").textContent).toBe(">View");
    expect(button("Cancel").textContent).toBe(">Cancel[Esc]");
    expect(button("Save").textContent).toBe(">Save[Enter]");
    for (const label of ["View", "Cancel", "Save"]) expect(button(label).classList.contains("dialog-action"), label).toBe(true);
    expect(modal.querySelector("[title]")).toBeNull();
  });

  it("has Goals' margins, with New Project's own left alone", () => {
    expect(css("title-page.css")).toMatch(/\.new-project-dialog\.title-page\s*\{[^}]*padding: var\(--space-loose\)/);
    expect(css("home.css")).toMatch(/\.new-project-dialog\s*\{[^}]*padding: var\(--space-roomy\)/);
  });

  it("stacks every box full width, one to a row, in the title page's order", () => {
    const { modal } = opened(TWO_AUTHORS);
    const list = modal.querySelector(".title-page__fields")!;
    expect([...list.children].map((row) => row.querySelector("label")!.textContent)).toEqual([
      "Title", "Credit", "Author(s)", "Source", "Draft date", "Contact", "Notes",
    ]);
    const sheet = css("title-page.css");
    expect(rule(sheet, ".title-page__fields")).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(sheet).not.toContain("repeat(");
    expect(sheet).not.toContain("grid-column");
  });

  it("is wide enough for a line of authors", () => {
    expect(px("--measure-title-page")).toBe(720);
    const inside = px("--measure-title-page") - px("--space-panel") * 2 - px("--rule-thin") * 2;
    // A column of the interface's face is 0.6em wide.
    const columns = inside / (px("--size-query") * 0.6);
    expect(columns).toBeGreaterThan("John August, Daniel Wallace, Tim Burton".length * 2);
  });

  /** The whole dialog's height, nothing scrolled, from the tokens: jsdom lays nothing out. */
  const packed = (extraLines = 0): number => {
    const label = px("--size-caption") * Number(/--leading-tight: ([\d.]+);/.exec(css("tokens.css"))![1]) + px("--space-tight");
    const oneLine = label + px("--size-field");
    const fourLines = oneLine + px("--leading-title-lines") * 3;
    const list = oneLine * 5 + fourLines * 2 + px("--space-panel") * 6 + px("--leading-title-lines") * extraLines;
    const foot = px("--space-dialog-actions") + px("--size-row");
    const frame = (px("--space-loose") + px("--rule-thin")) * 2;
    return list + foot + frame;
  };

  it("shows every box with no scrolling in a laptop's window", () => {
    // The sum headless Chrome measures too.
    expect(packed()).toBeCloseTo(689.2, 5);
    expect(packed()).toBeLessThan(720);
    expect(px("--measure-title-page") + (px("--space-loose") + px("--rule-thin")) * 2).toBe(770);
  });

  it("still fits a laptop's window with a two-line title, which adds one line", () => {
    expect(packed(1)).toBeCloseTo(709.2, 5);
    expect(packed(1)).toBeLessThan(720);
  });

  it("sets no height of its own, so nothing but the window limits the dialog", () => {
    const frame = rule(css("title-page.css"), ".new-project-dialog.title-page");
    expect(frame).not.toMatch(/(^|[\s;])height:/);
    expect(frame).not.toContain("min-height");
  });

  it("keeps inside a smaller window: the boxes scroll, the buttons do not", () => {
    const sheet = css("title-page.css");
    const frame = rule(sheet, ".new-project-dialog.title-page");
    expect(frame).toContain("max-width: 100%");
    expect(frame).toContain("max-height: 100%");
    expect(frame).toContain("padding: var(--space-loose)");
    const form = rule(sheet, ".title-page .new-project-dialog__form");
    expect(form).toContain("flex-direction: column");
    expect(form).toContain("max-height: calc(var(--size-desk-height) - var(--space-loose) * 2 - var(--rule-thin) * 2)");
    const list = rule(sheet, ".title-page__fields");
    expect(list).toContain("min-height: 0");
    expect(list).toContain("overflow-y: auto");
  });

  it("brings the whole of a focused field into view, label and all", () => {
    const { modal, box } = opened(PLAIN);
    const row = box("notes").closest(".new-project-dialog__field")!;
    const scrolled = vi.fn();
    row.scrollIntoView = scrolled;
    box("notes").focus();
    expect(modal.querySelector(".title-page__fields")!.contains(row)).toBe(true);
    expect(scrolled).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("makes Contact and Notes four lines, with no gripper", () => {
    const { box } = opened(PLAIN);
    for (const key of ["contact", "notes"]) {
      expect(box(key).tagName, key).toBe("TEXTAREA");
      expect((box(key) as HTMLTextAreaElement).rows, key).toBe(4);
    }
    expect(css("tokens.css")).toContain("--size-title-lines: calc(var(--size-field) + var(--leading-title-lines) * 3);");
    expect(rule(css("title-page.css"), ".title-page .title-page__lines--long")).toContain("height: var(--size-title-lines)");
    expect(rule(css("title-page.css"), ".title-page .title-page__lines")).toContain("resize: none");
  });

  it("keeps Contact four lines however much is typed, and scrolls inside the box", () => {
    const { modal, box, type } = opened(PLAIN);
    const contact = box("contact") as HTMLTextAreaElement;
    // jsdom lays nothing out, so the text's height is stood in for.
    Object.defineProperty(contact, "scrollHeight", { get: () => 400 });
    type("contact", Array.from({ length: 20 }, (_, line) => `line ${line}`).join("\n"));
    expect(contact.rows).toBe(4);
    expect(contact.getAttribute("style")).toBeNull();
    expect(modal.getAttribute("style")).toBeNull();
    expect(rule(css("title-page.css"), ".title-page .title-page__lines")).toContain("overflow-y: auto");
  });

  it("no longer grows a box or shares out the window's spare room", () => {
    const sheets = css("title-page.css") + css("tokens.css");
    for (const gone of ["--title-lines-height", "--title-page-rest", "--size-title-lines-most", "--size-title-lines-long"]) {
      expect(sheets, gone).not.toContain(gone);
    }
  });

  it("shows another broken value at its own lines, up to four", () => {
    expect((opened().box("title") as HTMLTextAreaElement).rows).toBe(2);
    const long = parse("Title:\n\tA\n\tB\n\tC\n\tD\n\tE\n\nx\n").titlePage;
    expect((opened(long).box("title") as HTMLTextAreaElement).rows).toBe(4);
  });

  it("keeps the preview's sheet and frame", () => {
    expect(css("title-page.css")).toMatch(/\.title-sheet\s*\{[^}]*width: var\(--size-title-sheet\)/);
    expect(css("title-page.css")).toContain(".title-run--underline");
    const preview = showTitlePagePreview(document.body, TITLE_PAGE);
    expect(preview.classList.contains("report")).toBe(true);
    expect(preview.querySelector(".report__heading")?.textContent).toBe("Title Page");
  });

  it("leaves the other dialogs' frames as they were", () => {
    expect(css("home.css")).toMatch(/\.new-project-dialog\s*\{[^}]*width: var\(--measure-new-project\)/);
    expect(css("home.css")).toMatch(/\.new-project-dialog__input\s*\{[^}]*height: var\(--size-field\)/);
    expect(css("home.css")).toMatch(/\.new-project-dialog__action\s*\{[^}]*min-width: var\(--measure-dialog-slot\)/);
    expect(css("goals.css")).toMatch(/\.new-project-dialog\.goals\s*\{[^}]*padding: var\(--space-loose\)/);
  });
});

describe("the Author(s) box", () => {
  it("is one line, and shows authors written on several lines joined by a comma", () => {
    const { box } = opened(TWO_AUTHORS);
    expect(box("author").tagName).toBe("INPUT");
    expect(box("author").value).toBe("John August, Daniel Wallace");
  });

  it("leaves an untouched Author on its several lines, even when a neighbour changes", () => {
    const { save, type, submit } = opened(TWO_AUTHORS);
    type("credit", "Written by");
    submit();
    const written = save.mock.calls[0]![0];
    expect(written.find((one: { key: string }) => one.key === "Author")).toBe(TWO_AUTHORS[1]);
    expect(saved(written)).toBe(
      "Title: Big Fish\nCredit: Written by\nAuthor:\n\tJohn August\n\tDaniel Wallace\nCopyright: 2003",
    );
  });

  it("writes nothing when the joined Author is saved as it opened", () => {
    const { save, closed, submit } = opened(TWO_AUTHORS);
    submit();
    expect(save).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("counts typing the same words back as untouched", () => {
    const { save, type, submit } = opened(TWO_AUTHORS);
    type("author", "John August");
    type("author", "John August, Daniel Wallace");
    submit();
    expect(save).not.toHaveBeenCalled();
  });

  it("writes an edited Author back as one line, and leaves unboxed keys alone", () => {
    const { save, type, submit } = opened(TWO_AUTHORS);
    type("author", "John August, Daniel Wallace, Tim Burton");
    submit();
    expect(saved(save.mock.calls[0]![0])).toBe(
      "Title: Big Fish\nAuthor: John August, Daniel Wallace, Tim Burton\nCopyright: 2003",
    );
  });

  it("previews an untouched Author on its own lines", () => {
    const { into, button } = opened(TWO_AUTHORS);
    button("View").click();
    const drawn = [...into.querySelectorAll("dialog.title-preview text")].map((t) => t.textContent);
    expect(drawn).toEqual(expect.arrayContaining(["John August", "Daniel Wallace"]));
  });
});

describe("Edit Title Page from the keyboard", () => {
  const WALK = ["title", "credit", "author", "source", "draft-date", "contact", "notes"].map((key) => `title-page-${key}`);
  const at = (): string => {
    const held = document.activeElement as HTMLElement;
    return held.id || held.querySelector("span:not(.gesture__cursor)")!.textContent!;
  };
  const stops = (count: number, key: string, init: KeyboardEventInit = {}): string[] =>
    Array.from({ length: count }, () => {
      press(key, init);
      return at();
    });

  it("opens in the Title box, ready to type", () => {
    const { box } = opened(PLAIN);
    expect(document.activeElement).toBe(box("title"));
    expect(box("title").classList.contains("dialog-keys__editing")).toBe(true);
  });

  it("walks every stop with Tab, wraps, and goes back with Shift+Tab", () => {
    opened(PLAIN);
    expect(stops(10, "Tab")).toEqual([...WALK.slice(1), "View", "Cancel", "Save", WALK[0]]);
    expect(stops(2, "Tab", { shiftKey: true })).toEqual(["Save", "Cancel"]);
  });

  it("moves between the rows and along them with the arrows, once out of the edit", () => {
    const { modal } = opened(PLAIN);
    escape(modal);
    expect(stops(8, "ArrowDown")).toEqual([...WALK.slice(1), "View", WALK[0]]);
    expect(stops(1, "ArrowUp")).toEqual(["View"]);
    expect(stops(2, "ArrowRight")).toEqual(["Cancel", "Save"]);
    // A box has its row to itself, so there is nowhere along it to go.
    press("ArrowDown");
    expect(stops(1, "ArrowRight")).toEqual([WALK[0]]);
  });

  it("leaves the arrows to the caret in a box being edited", () => {
    const { box } = opened(PLAIN);
    expect(press("ArrowDown").defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(box("title"));
  });

  it("saves on Enter in a one-line box being edited", () => {
    const { save, closed, type } = opened(PLAIN);
    type("title", "Bigger Fish");
    expect(press("Enter").defaultPrevented).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("starts the edit on Enter in a box the keys are only resting on, and a held Enter does not save", () => {
    const { box, closed } = opened(PLAIN);
    press("Tab");
    press("Enter");
    expect(box("credit").classList.contains("dialog-keys__editing")).toBe(true);
    press("Enter", { repeat: true });
    expect(closed).not.toHaveBeenCalled();
  });

  it("keeps Enter a new line in Contact and Notes", () => {
    for (const key of ["contact", "notes"]) {
      const { box, save, closed, modal } = opened(PLAIN);
      box(key).focus();
      expect(press("Enter").defaultPrevented, `${key}: starts the edit`).toBe(true);
      expect(box(key).classList.contains("dialog-keys__editing"), key).toBe(true);
      // Not prevented: the browser puts the new line in.
      expect(press("Enter").defaultPrevented, `${key}: a new line`).toBe(false);
      expect(save).not.toHaveBeenCalled();
      expect(closed).not.toHaveBeenCalled();
      expect(press("ArrowUp").defaultPrevented, `${key}: the caret's`).toBe(false);
      modal.remove();
    }
  });

  it("keeps Enter a new line in a title that already has several lines", () => {
    const { box, closed } = opened();
    expect(box("title").tagName).toBe("TEXTAREA");
    expect(press("Enter").defaultPrevented).toBe(false);
    expect(closed).not.toHaveBeenCalled();
  });

  it("leaves the edit on the first Escape and cancels on the second, saving nothing", () => {
    const { modal, box, save, closed, type } = opened(PLAIN);
    box("notes").focus();
    press("Enter");
    type("notes", "changed");
    escape(modal);
    expect(modal.hasAttribute("open")).toBe(true);
    expect(document.activeElement).toBe(box("notes"));
    expect(box("notes").classList.contains("dialog-keys__editing")).toBe(false);
    escape(modal);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  it("presses the buttons with Enter: Cancel saves nothing, Save saves", () => {
    const first = opened(PLAIN);
    first.type("credit", "x");
    first.button("Cancel").focus();
    press("Enter");
    expect(first.save).not.toHaveBeenCalled();
    expect(first.closed).toHaveBeenCalledTimes(1);

    const second = opened(PLAIN);
    second.type("credit", "x");
    second.button("Save").focus();
    press("Enter");
    expect(second.save).toHaveBeenCalledTimes(1);
  });

  it("opens the preview from View with Enter, and comes back to View", () => {
    const { into, button, save, modal } = opened(PLAIN);
    button("View").focus();
    press("Enter");
    const preview = into.querySelector<HTMLDialogElement>("dialog.title-preview")!;
    expect(save).not.toHaveBeenCalled();
    preview.close();
    expect(document.activeElement).toBe(button("View"));
    expect(modal.hasAttribute("open")).toBe(true);
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
    save: vi.fn(), exportAs: vi.fn(), toProjects: vi.fn(), renameProject: vi.fn(), toHome: vi.fn(),
    editTitlePage: vi.fn(), viewTitlePage: vi.fn(), editGoals: vi.fn(),
    toggleSpellcheck: vi.fn(), spellcheckOn: vi.fn(() => false),
    search: vi.fn(), view: () => undefined,
      cut: vi.fn(), copy: vi.fn(), paste: vi.fn(), selectAll: vi.fn(), undo: vi.fn(), redo: vi.fn(), misspellingAt: () => undefined,
  };
  function panel() {
    const panels = sidePanels(undefined, editorMenus(act));
    document.body.append(panels.left);
    return panels;
  }
  afterEach(() => vi.clearAllMocks());

  it("hold only what works: undo, the title page, goals and spelling", () => {
    const menus = editorMenus(act);
    const labels = (name: string) => menus[name]!.map((entry) => ("label" in entry ? entry.label : "—"));
    expect(Object.keys(menus)).toEqual(["File", "Edit", "View"]);
    expect(labels("Edit")).toEqual([
      "Undo", "Redo", "—", "Edit Title Page…", "—", "Edit Goals…",
    ]);
    expect(labels("View")).toEqual(["View Title Page", "—", "Spellcheck"]);
    // No shortcut is shown that does not exist: only Undo, Redo and Spellcheck have one here.
    expect(menus["View"]!.flatMap((entry) => ("hint" in entry ? [entry.hint] : []))).toEqual(["[Ctrl + ;]"]);
    expect(menus["Edit"]!.flatMap((entry) => ("hint" in entry ? [entry.hint] : []))).toEqual(["[Ctrl + Z]", "[Ctrl + Y]"]);
  });

  it("open from their rows like File, and the items run the actions", () => {
    const panels = panel();
    const rows = [...panels.left.querySelectorAll<HTMLButtonElement>(".panel__row")];
    expect(rows.map((r) => r.getAttribute("aria-haspopup"))).toEqual(["menu", "menu", "menu"]);
    rows[1]!.click();
    const items = [...panels.left.querySelectorAll<HTMLButtonElement>('[aria-label="Edit"] [role="menuitem"]')];
    const edit = items.find((item) => item.textContent?.startsWith("Edit Title Page…"))!;
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
    // The first item is Undo, with its key beside it.
    expect(document.activeElement?.textContent).toBe("Undo[Ctrl + Z]");
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(edit.hidden).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "v", altKey: true, bubbles: true, cancelable: true }));
    expect(panels.left.querySelector<HTMLElement>('[aria-label="View"]')!.hidden).toBe(false);
    expect(panels.left.querySelector<HTMLElement>('[aria-label="Edit"]')!.hidden).toBe(true);
    window.removeEventListener("keydown", heard);
    panels.dispose();
  });
});
