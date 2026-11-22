/**
 * Edit Title Page, View Title Page, and the Edit and View menus that open them
 * (slice 2, steps 4 and 6).
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { editorMenus } from "../../app/src/workspaces/editor/menus.ts";
import { hintNow } from "../../app/src/menus/drop-menu.ts";
import { sidePanels } from "../../app/src/workspaces/editor/panels.ts";
import { openTitlePageDialog } from "../../app/src/workspaces/editor/title-page-dialog.ts";
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

function opened(titlePage = TITLE_PAGE, opensOn?: "edit" | "view") {
  const save = vi.fn();
  const closed = vi.fn();
  const into = document.body.appendChild(document.createElement("div"));
  const modal = openTitlePageDialog(into, { titlePage, save, closed, ...(opensOn === undefined ? {} : { opensOn }) });
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
const BRICK_AND_STEEL = readFileSync("test/fixtures/Brick-&-Steel.fountain", "utf8");
const BRICK_TITLE = "_**BRICK & STEEL**_\n_**FULL RETIRED**_";

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

  it.each([
    ["title", "ctrlKey"], ["title", "metaKey"],
    ["author", "ctrlKey"], ["author", "metaKey"],
    ["source", "ctrlKey"], ["source", "metaKey"],
    ["contact", "ctrlKey"], ["contact", "metaKey"],
    ["notes", "ctrlKey"], ["notes", "metaKey"],
  ])("saves from %s with Enter and %s", (key, modifier) => {
    const { box, save, closed, type } = opened();
    type(key, "FINAL\nDRAFT");
    box(key).focus();
    expect(press("Enter", { [modifier]: true }).defaultPrevented).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
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

  it("saves what was typed on going to View, shows it, and stays open", () => {
    const { modal, save, closed, type, button } = opened();
    type("credit", "Screenplay by");
    button("View").click();
    expect(save).toHaveBeenCalledTimes(1);
    expect(saved(save.mock.calls[0]![0])).toBe(
      "Title:\n\t_**BRICK & STEEL**_\n\t_**FULL RETIRED**_\nCredit: Screenplay by\nAuthor: Stu\nRevision: Blue",
    );
    expect([...modal.querySelectorAll(".title-page__print text")].map((t) => t.textContent)).toContain("Screenplay by");
    expect(modal.hasAttribute("open")).toBe(true);
    expect(closed).not.toHaveBeenCalled();
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
    expect(button("View").textContent).toBe(">View[Ctrl+E]");
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

  it("is as wide as a rough 8.5 by 11 of its packed height", () => {
    const width = px("--measure-title-page") + (px("--space-loose") + px("--rule-thin")) * 2;
    expect(px("--measure-title-page")).toBe(514);
    expect(width).toBe(564);
    expect(width / packed()).toBeCloseTo(8.5 / 11, 2);
  });

  /** The whole dialog's height, nothing scrolled, from the tokens: jsdom lays nothing out. */
  const packed = (): number => {
    const label = px("--size-caption") * Number(/--leading-tight: ([\d.]+);/.exec(css("tokens.css"))![1]) + px("--space-tight");
    const oneLine = label + px("--size-field");
    const lines = (count: number): number => oneLine + px("--leading-title-lines") * (count - 1);
    const list = lines(2) * 3 + oneLine * 2 + lines(3) + lines(4) + px("--space-panel") * 6;
    const foot = px("--space-dialog-actions") + px("--size-row");
    const frame = (px("--space-loose") + px("--rule-thin")) * 2;
    return list + foot + frame;
  };

  it("shows every box with no scrolling in a laptop's window", () => {
    // The sum headless Chrome measures too.
    expect(packed()).toBeCloseTo(729.2, 5);
    expect(packed()).toBeLessThan(768);
    expect(px("--measure-title-page") + (px("--space-loose") + px("--rule-thin")) * 2).toBe(564);
  });

  it("is the same height whether the title has one line or two", () => {
    for (const titlePage of [PLAIN, TITLE_PAGE]) {
      const title = opened(titlePage).box("title") as HTMLTextAreaElement;
      expect(title.rows).toBe(2);
      expect(title.classList.contains("title-page__lines--2")).toBe(true);
    }
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

  it.each([
    ["title", "--2", 2, "calc(var(--size-field) + var(--leading-title-lines))"],
    ["author", "--2", 2, "calc(var(--size-field) + var(--leading-title-lines))"],
    ["source", "--2", 2, "calc(var(--size-field) + var(--leading-title-lines))"],
    ["contact", "--3", 3, "calc(var(--size-field) + var(--leading-title-lines) * 2)"],
    ["notes", "--4", 4, "calc(var(--size-field) + var(--leading-title-lines) * 3)"],
  ])("makes %s a fixed text area, with no gripper", (key, modifier, lines, height) => {
    const area = opened(PLAIN).box(key) as HTMLTextAreaElement;
    expect(area.tagName).toBe("TEXTAREA");
    expect(area.rows).toBe(lines);
    expect(css("tokens.css")).toContain(`--size-title-lines-${lines}: ${height};`);
    expect(rule(css("title-page.css"), `.title-page .title-page__lines${modifier}`)).toContain(
      `height: var(--size-title-lines-${lines})`,
    );
    expect(rule(css("title-page.css"), ".title-page .title-page__lines")).toContain("resize: none");
  });

  it.each([["title", 2], ["author", 2], ["source", 2], ["contact", 3], ["notes", 4]])("keeps %s at its height however much is typed", (key, lines) => {
    const { modal, box, type } = opened(PLAIN);
    const area = box(key) as HTMLTextAreaElement;
    // jsdom lays nothing out, so the text's height is stood in for.
    Object.defineProperty(area, "scrollHeight", { get: () => 400 });
    type(key, Array.from({ length: 20 }, (_, line) => `line ${line}`).join("\n"));
    expect(area.rows).toBe(lines);
    expect(area.getAttribute("style")).toBeNull();
    expect(modal.getAttribute("style")).toBeNull();
    expect(rule(css("title-page.css"), ".title-page .title-page__lines")).toContain("overflow-y: auto");
  });

  it("keeps a title of many lines at two, scrolling the rest", () => {
    const long = parse("Title:\n\tA\n\tB\n\tC\n\tD\n\tE\n\nx\n").titlePage;
    const title = opened(long).box("title") as HTMLTextAreaElement;
    expect(title.rows).toBe(2);
    expect(title.value).toBe("A\nB\nC\nD\nE");
  });

  it("no longer grows a box or shares out the window's spare room", () => {
    const sheets = css("title-page.css") + css("tokens.css");
    for (const gone of [
      "--title-lines-height", "--title-page-rest", "--size-title-lines-most", "--size-title-lines-long",
      "--size-title-lines:", "title-page__lines--long",
    ]) {
      expect(sheets, gone).not.toContain(gone);
    }
  });

  it("shows another broken value at its own lines, up to four", () => {
    const broken = (lines: string) => parse(`Title: T\nCredit:\n${lines}\n\nx\n`).titlePage;
    expect((opened(broken("\tA\n\tB")).box("credit") as HTMLTextAreaElement).rows).toBe(2);
    expect((opened(broken("\tA\n\tB\n\tC\n\tD\n\tE")).box("credit") as HTMLTextAreaElement).rows).toBe(4);
  });

  it("leaves the other dialogs' frames as they were", () => {
    expect(css("home.css")).toMatch(/\.new-project-dialog\s*\{[^}]*width: var\(--measure-new-project\)/);
    expect(css("home.css")).toMatch(/\.new-project-dialog__input\s*\{[^}]*height: var\(--size-field\)/);
    expect(css("home.css")).toMatch(/\.new-project-dialog__action\s*\{[^}]*min-width: var\(--measure-dialog-slot\)/);
    expect(css("goals.css")).toMatch(/\.new-project-dialog\.goals\s*\{[^}]*padding: var\(--space-loose\)/);
  });
});

describe("the Author(s) box", () => {
  it("is two lines, and shows authors written on several lines one per line", () => {
    const { box } = opened(TWO_AUTHORS);
    const author = box("author") as HTMLTextAreaElement;
    expect(author.tagName).toBe("TEXTAREA");
    expect(author.rows).toBe(2);
    expect(author.value).toBe("John August\nDaniel Wallace");
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

  it("writes nothing when Author is saved as it opened", () => {
    const { save, closed, submit } = opened(TWO_AUTHORS);
    submit();
    expect(save).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("counts typing the same lines back as untouched", () => {
    const { save, type, submit } = opened(TWO_AUTHORS);
    type("author", "John August");
    type("author", "John August\nDaniel Wallace");
    submit();
    expect(save).not.toHaveBeenCalled();
  });

  it("counts a blank line left at the end as no change", () => {
    const { save, type, submit } = opened(TWO_AUTHORS);
    type("author", "John August\nDaniel Wallace\n");
    submit();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves an edited two-line Author as two lines that read back the same, and leaves unboxed keys alone", () => {
    const { save, type, submit } = opened(TWO_AUTHORS);
    type("author", "John August\nTim Burton");
    submit();
    expect(saved(save.mock.calls[0]![0])).toBe(
      "Title: Big Fish\nAuthor: John August\n\tTim Burton\nCopyright: 2003",
    );
    const reread = opened(save.mock.calls[0]![0]);
    expect(reread.box("author").value).toBe("John August\nTim Burton");
    reread.submit();
    expect(reread.save).not.toHaveBeenCalled();
  });

  it("previews an untouched Author on its own lines", () => {
    const { modal, button } = opened(TWO_AUTHORS);
    button("View").click();
    const drawn = [...modal.querySelectorAll(".title-page__print text")].map((t) => t.textContent);
    expect(drawn).toEqual(expect.arrayContaining(["John August", "Daniel Wallace"]));
  });
});

describe("the Source box", () => {
  const TWO_SOURCE = parse("Title: Big Fish\nSource:\n\tBased on a novel\n\tby Daniel Wallace\nCopyright: 2003\n\nx\n").titlePage;

  it("is two lines, and shows a source written on several lines one per line", () => {
    const source = opened(TWO_SOURCE).box("source") as HTMLTextAreaElement;
    expect(source.tagName).toBe("TEXTAREA");
    expect(source.rows).toBe(2);
    expect(source.value).toBe("Based on a novel\nby Daniel Wallace");
  });

  it("writes nothing when Source is left alone, and keeps it when a neighbour changes", () => {
    const first = opened(TWO_SOURCE);
    first.submit();
    expect(first.save).not.toHaveBeenCalled();
    const { save, type, submit } = opened(TWO_SOURCE);
    type("credit", "Written by");
    submit();
    const written = save.mock.calls[0]![0];
    expect(written.find((one: { key: string }) => one.key === "Source")).toBe(TWO_SOURCE.find((one) => one.key === "Source"));
  });

  it("saves an edited two-line Source as two lines that read back the same", () => {
    const { save, type, submit } = opened(PLAIN);
    type("source", "Based on a novel\nby Daniel Wallace");
    submit();
    expect(saved(save.mock.calls[0]![0])).toBe(
      "Title: Big Fish\nCredit: Written by\nAuthor: John August\nSource: Based on a novel\n\tby Daniel Wallace",
    );
    const reread = opened(save.mock.calls[0]![0]);
    expect(reread.box("source").value).toBe("Based on a novel\nby Daniel Wallace");
    reread.submit();
    expect(reread.save).not.toHaveBeenCalled();
  });
});

describe("the Title box", () => {
  const brick = parse(BRICK_AND_STEEL);
  const file = (titlePage: readonly (typeof brick.titlePage)[number][]): string => serialise({ ...brick, titlePage });

  it("writes nothing when Brick & Steel's two-line title is left alone", () => {
    const { box, save, closed, submit } = opened(brick.titlePage);
    expect(box("title").value).toBe(BRICK_TITLE);
    submit();
    expect(save).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("keeps Brick & Steel's title as written when a neighbour changes", () => {
    const { save, type, submit } = opened(brick.titlePage);
    type("credit", "Screenplay by");
    submit();
    const written = save.mock.calls[0]![0];
    expect(written[0]).toBe(brick.titlePage[0]);
    // Against the file as parsed: the fixture on disk is not yet normalised.
    expect(file(written)).toBe(file(brick.titlePage).replace("Credit: Written by", "Credit: Screenplay by"));
  });

  it("counts a blank line left at the end as no change", () => {
    const { save, type, submit } = opened(brick.titlePage);
    type("title", `${BRICK_TITLE}\n`);
    submit();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves an edited two-line title as two lines that read back the same", () => {
    const { save, type, submit } = opened(brick.titlePage);
    const edited = "_**BRICK & STEEL**_\n_**NOT RETIRED**_";
    type("title", edited);
    submit();
    const written = file(save.mock.calls[0]![0]);
    expect(written.startsWith("Title: _**BRICK & STEEL**_\n\t_**NOT RETIRED**_\nCredit: Written by\n")).toBe(true);
    const reread = parse(written);
    expect(reread.elements).toEqual(brick.elements);
    const again = opened(reread.titlePage);
    expect(again.box("title").value).toBe(edited);
    again.submit();
    expect(again.save).not.toHaveBeenCalled();
  });

  it("gives a one-line title a second line, with no comma and no blank lines", () => {
    const { save, type, submit } = opened(PLAIN);
    type("title", "Big Fish\n\nA Novel, Filmed");
    submit();
    expect(saved(save.mock.calls[0]![0])).toBe(
      "Title: Big Fish\n\tA Novel, Filmed\nCredit: Written by\nAuthor: John August",
    );
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
    press("Tab");
    press("Enter");
    type("credit", "Screenplay by");
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

  it("keeps Enter a new line in Author, Source, Contact and Notes", () => {
    for (const key of ["author", "source", "contact", "notes"]) {
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

  it.each([["one line", PLAIN], ["two lines", TITLE_PAGE]])("keeps Enter a new line in a title of %s", (_, titlePage) => {
    const { box, save, closed } = opened(titlePage);
    expect(document.activeElement).toBe(box("title"));
    // Not prevented: the browser puts the new line in.
    expect(press("Enter").defaultPrevented).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
  });

  it("leaves the Title edit on the first Escape, restarts it on Enter, and cancels on the second", () => {
    const { modal, box, save, closed } = opened(PLAIN);
    escape(modal);
    expect(modal.hasAttribute("open")).toBe(true);
    expect(box("title").classList.contains("dialog-keys__editing")).toBe(false);
    expect(press("Enter").defaultPrevented).toBe(true);
    expect(box("title").classList.contains("dialog-keys__editing")).toBe(true);
    expect(closed).not.toHaveBeenCalled();
    escape(modal);
    escape(modal);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
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

  it("shows the page from View with Enter, saving nothing and staying open", () => {
    const { button, save, modal } = opened(PLAIN);
    button("View").focus();
    press("Enter");
    expect(modal.classList.contains("title-page--view")).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(modal.hasAttribute("open")).toBe(true);
  });
});

describe("View Title Page", () => {
  const viewing = (titlePage = TITLE_PAGE) => opened(titlePage, "view");
  const labels = (modal: HTMLDialogElement): string[] =>
    [...modal.querySelectorAll<HTMLButtonElement>(".new-project-dialog__actions button")].filter((b) => !b.hidden).map((b) => b.textContent!);
  const isView = (modal: HTMLDialogElement): boolean => modal.classList.contains("title-page--view");

  it("draws the shared layout's runs, each where the layout put it", () => {
    const { modal } = viewing();
    const drawn = [...modal.querySelectorAll("text")].map((t) => ({
      text: t.textContent,
      x: Number(t.getAttribute("x")),
      y: Number(t.getAttribute("y")),
    }));
    expect(drawn).toEqual(titlePageRuns(TITLE_PAGE).map(({ text, x, y }) => ({ text, x, y })));
    expect(drawn.length).toBeGreaterThan(0);
    // Marks are faces, not delimiters.
    expect(modal.querySelector(".title-page__print")!.textContent).not.toContain("_**");
    expect(modal.querySelector(".title-run--bold.title-run--underline")).not.toBeNull();
  });

  it("draws Brick & Steel's saved title page as the layout does", () => {
    const { titlePage } = parse(BRICK_AND_STEEL);
    const drawn = [...viewing(titlePage).modal.querySelectorAll("text")].map((t) => t.textContent);
    expect(drawn).toEqual(titlePageRuns(titlePage).map((run) => run.text));
  });

  it("says there is nothing to show for an empty title page, on an empty sheet", () => {
    const { modal } = viewing([]);
    expect(modal.querySelector(".title-page__print")!.textContent).toContain("no title page to show");
    expect(modal.querySelector("svg.title-sheet")).not.toBeNull();
    expect(modal.querySelectorAll("text")).toHaveLength(0);
  });

  it("has no heading or standfirst, only the page and two buttons", () => {
    const { modal } = viewing(PLAIN);
    expect(modal.querySelector("h1, h2, h3, .report__heading, .report__standfirst")).toBeNull();
    expect(modal.classList.contains("report")).toBe(false);
    expect(modal.getAttribute("aria-label") ?? modal.ariaLabel).toBe("View Title Page");
    expect(labels(modal)).toEqual([">Edit[Ctrl+E]", ">Close[Esc]"]);
    for (const button of modal.querySelectorAll(".new-project-dialog__actions button")) {
      expect(button.classList.contains("dialog-action")).toBe(true);
    }
  });

  it("lays the page over the whole dialog, keeping the boxes' size under it", () => {
    const sheet = css("title-page.css");
    expect(rule(sheet, ".title-page__print")).toContain("inset: 0");
    expect(rule(sheet, ".title-sheet")).toContain("width: 100%");
    expect(rule(sheet, ".title-sheet")).toContain("height: 100%");
    expect(rule(sheet, ".title-page--view .title-page__fields")).toContain("visibility: hidden");
    expect(rule(sheet, ".title-page .new-project-dialog__actions")).toContain("position: relative");
  });

  it("is the same dialog and the same button on both faces", () => {
    const { into, modal, button } = opened(PLAIN);
    const toggle = button("View");
    toggle.click();
    expect(into.querySelectorAll("dialog")).toHaveLength(1);
    expect(button("Edit")).toBe(toggle);
    expect(modal.querySelector(".title-page__fields")!.hasAttribute("inert")).toBe(true);
    toggle.click();
    expect(button("View")).toBe(toggle);
    expect(modal.querySelector(".title-page__fields")!.hasAttribute("inert")).toBe(false);
    expect(labels(modal)).toEqual([">View[Ctrl+E]", ">Cancel[Esc]", ">Save[Enter]"]);
  });

  it("opens with nothing focused, and the first Escape closes it", () => {
    const { modal, closed, save } = viewing(PLAIN);
    expect(document.activeElement).toBe(modal);
    escape(modal);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(modal.isConnected).toBe(false);
  });

  it("closes at once on Escape even after Ctrl+E from a box being typed in, the typing saved", () => {
    const { modal, box, closed, save, type } = opened(PLAIN);
    type("title", "Changed");
    expect(box("title").classList.contains("dialog-keys__editing")).toBe(true);
    press("e", { ctrlKey: true });
    expect(document.activeElement).toBe(modal);
    expect(box("title").classList.contains("dialog-keys__editing")).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(saved(save.mock.calls[0]![0])).toBe("Title: Changed\nCredit: Written by\nAuthor: John August");
    escape(modal);
    expect(closed).toHaveBeenCalledTimes(1);
    // Saved on the switch, and not again on the way out.
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps what was typed when View is closed with Close", () => {
    const { modal, closed, save, type, button } = opened(PLAIN);
    type("credit", "Screenplay by");
    button("View").click();
    expect(modal.querySelector(".title-page__print")!.textContent).toContain("Screenplay by");
    button("Close").click();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(saved(save.mock.calls[0]![0])).toBe("Title: Big Fish\nCredit: Screenplay by\nAuthor: John August");
  });

  it("writes nothing on going to View with nothing changed", () => {
    const { modal, save, button } = opened(PLAIN);
    button("View").click();
    expect(modal.classList.contains("title-page--view")).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("closes completely from Close", () => {
    const { into, closed, button, save } = viewing(PLAIN);
    button("Close").click();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(into.querySelector("dialog")).toBeNull();
  });

  it.each([["Tab", {}, "Edit"], ["Tab", { shiftKey: true }, "Close"], ["ArrowDown", {}, "Edit"], ["ArrowUp", {}, "Edit"], ["ArrowLeft", {}, "Edit"], ["ArrowRight", {}, "Edit"]])(
    "steps onto the buttons with %s %j",
    (key, init, label) => {
      const { button } = viewing(PLAIN);
      press(key, init);
      expect(document.activeElement).toBe(button(label));
    },
  );

  it("walks only its two buttons, never the boxes under the page", () => {
    const { button } = viewing(PLAIN);
    press("Tab");
    press("Tab");
    expect(document.activeElement).toBe(button("Close"));
    press("Tab");
    expect(document.activeElement).toBe(button("Edit"));
    press("ArrowRight");
    expect(document.activeElement).toBe(button("Close"));
    press("ArrowDown");
    expect(document.activeElement).toBe(button("Close"));
  });

  it("never saves from the page, by Enter or Ctrl+Enter or the form", () => {
    const { modal, save, closed, submit } = opened(PLAIN);
    press("e", { ctrlKey: true });
    press("Enter");
    press("Enter", { ctrlKey: true });
    submit();
    expect(save).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
    expect(isView(modal)).toBe(true);
  });

  it.each([["ctrlKey"], ["metaKey"]])("goes both ways with E and %s, from a text area and a one-line box", (modifier) => {
    const { modal, box, button } = opened(PLAIN);
    for (const key of ["title", "credit"]) {
      box(key).focus();
      expect(press("e", { [modifier]: true }).defaultPrevented).toBe(true);
      expect(isView(modal)).toBe(true);
      expect(button("Edit").textContent).toBe(">Edit[Ctrl+E]");
      expect(press("E", { [modifier]: true }).defaultPrevented).toBe(true);
      expect(isView(modal)).toBe(false);
      expect(document.activeElement).toBe(box(key));
      expect(box(key).classList.contains("dialog-keys__editing")).toBe(true);
    }
  });

  it("does not flicker while Ctrl+E is held, and leaves Alt+E and a plain e alone", () => {
    const { modal } = opened(PLAIN);
    expect(press("e", { ctrlKey: true, repeat: true }).defaultPrevented).toBe(true);
    expect(isView(modal)).toBe(false);
    expect(press("e", { altKey: true }).defaultPrevented).toBe(false);
    expect(press("e").defaultPrevented).toBe(false);
    expect(isView(modal)).toBe(false);
  });

  it("keeps what was typed across the switch, and shows it on the page", () => {
    const { modal, box, type, button, save } = opened(PLAIN);
    type("credit", "Screenplay by");
    button("View").click();
    expect(modal.querySelector(".title-page__print")!.textContent).toContain("Screenplay by");
    button("Edit").click();
    expect(box("credit").value).toBe("Screenplay by");
    type("credit", "Story by");
    button("View").click();
    expect(modal.querySelector(".title-page__print")!.textContent).toContain("Story by");
    expect(modal.querySelector(".title-page__print")!.textContent).not.toContain("Screenplay by");
    // Each trip to View saved what was typed then.
    expect(save.mock.calls.map(([titlePage]) => saved(titlePage))).toEqual([
      "Title: Big Fish\nCredit: Screenplay by\nAuthor: John August",
      "Title: Big Fish\nCredit: Story by\nAuthor: John August",
    ]);
  });

  it("saves a box typed back to how it opened, after a trip to View saved it changed", () => {
    const { type, button, save } = opened(PLAIN);
    type("credit", "Screenplay by");
    button("View").click();
    button("Edit").click();
    type("credit", "Written by");
    button("View").click();
    expect(save.mock.calls.map(([titlePage]) => saved(titlePage))).toEqual([
      "Title: Big Fish\nCredit: Screenplay by\nAuthor: John August",
      "Title: Big Fish\nCredit: Written by\nAuthor: John August",
    ]);
  });

  it("writes nothing more from Save after a trip to View saved everything", () => {
    const { type, button, save, closed, submit } = opened(PLAIN);
    type("credit", "Screenplay by");
    button("View").click();
    button("Edit").click();
    submit();
    expect(save).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("can still save after coming back from the page", () => {
    const { button, type, save, closed } = opened(PLAIN, "view");
    button("Edit").click();
    type("credit", "Screenplay by");
    press("Enter", { ctrlKey: true });
    expect(save).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("opens Edit on the Title box when it began on the page", () => {
    const { box, button } = viewing(PLAIN);
    button("Edit").click();
    expect(document.activeElement).toBe(box("title"));
  });
});

describe("the Edit and View menus", () => {
  const act = {
    save: vi.fn(), exportAs: vi.fn(), toProjects: vi.fn(), editProjectDetails: vi.fn(), openContextMenu: vi.fn(), openSettings: vi.fn(), toHome: vi.fn(),
    editTitlePage: vi.fn(), viewTitlePage: vi.fn(), editGoals: vi.fn(),
    toggleSpellcheck: vi.fn(), spellcheckOn: vi.fn(() => false), keyboardShortcuts: vi.fn(),
    zoomIn: vi.fn(), zoomOut: vi.fn(), resetZoom: vi.fn(), zoomLevel: () => 2,
    search: vi.fn(), view: () => undefined,
      cut: vi.fn(), copy: vi.fn(), paste: vi.fn(), selectAll: vi.fn(), undo: vi.fn(), redo: vi.fn(), misspellingAt: () => undefined,
  };
  function panel() {
    const panels = sidePanels(undefined, editorMenus(act));
    document.body.append(panels.left);
    return panels;
  }
  afterEach(() => vi.clearAllMocks());

  it("hold only what works: undo, the title page, goals, spelling, zoom and the shortcuts", () => {
    const menus = editorMenus(act);
    const labels = (name: string) => menus[name]!.map((entry) => ("label" in entry ? entry.label : "—"));
    expect(Object.keys(menus)).toEqual(["File", "Edit", "View"]);
    expect(labels("Edit")).toEqual([
      "Undo", "Redo", "—", "Edit Title Page…", "—", "Edit Goals…",
    ]);
    expect(labels("View")).toEqual([
      "View Title Page", "—", "Spellcheck", "—", "Zoom", "Reset Zoom", "—", "Keyboard Shortcuts",
    ]);
    // No shortcut is shown that does not exist: only Undo, Redo, Spellcheck, Reset Zoom and Keyboard Shortcuts
    // have one here. The Zoom row is − and +, whose keys the Keyboard Shortcuts dialog lists.
    expect(menus["View"]!.flatMap((entry) => ("act" in entry && hintNow(entry) !== undefined ? [hintNow(entry)] : []))).toEqual([
      "[Ctrl + ;]", "[Ctrl + 0]", "[Ctrl + K]",
    ]);
    expect(menus["Edit"]!.flatMap((entry) => ("act" in entry && hintNow(entry) !== undefined ? [hintNow(entry)] : []))).toEqual(["[Ctrl + Z]", "[Ctrl + Y]"]);
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
