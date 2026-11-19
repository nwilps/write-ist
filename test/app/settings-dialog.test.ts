/**
 * Settings: one dialog, a list of sections and the one chosen, opened from
 * Home's `[s]` and from File ▸ Settings… (`settings-from-editor.test.ts`).
 *
 * The disk is behind ports here: the dictionary and the Graveyard are fakes
 * holding invented words and projects, and `change` records what would be kept.
 * What the ports do on a real disk is `test/settings/`, `test/project/recover.test.ts`
 * and the Rust tests in `spelling.rs`.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  applyAppearance,
  openSettingsDialog,
  SETTINGS_SECTIONS,
  type SettingsDialogOptions,
  type SettingsGraveyard,
} from "../../app/src/screens/settings.ts";
import { shortcutGroups } from "../../app/src/workspaces/editor/keyboard-shortcuts-dialog.ts";
import type { Project } from "../../src/project/bundle.ts";
import { DEFAULT_SETTINGS, settingsFrom, type Settings } from "../../src/settings/settings.ts";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => {
  document.body.replaceChildren();
  delete document.documentElement.dataset["interfaceCorners"];
  delete document.documentElement.dataset["paperCorners"];
  delete document.documentElement.dataset["whitePaper"];
});

const buried = (name: string, folder = name): Project => ({
  path: `/home/writer/Documents/write-ist/Graveyard/${folder}`,
  marker: { projectId: `id-${folder}`, name, format: "Feature", formatVersion: "1" },
});

/** A dictionary that keeps its words in a list, as the custom file would. */
function fakeDictionary(start: readonly string[] = []) {
  const held = [...start];
  return {
    held,
    words: vi.fn(async () => [...held].sort()),
    add: vi.fn(async (word: string) => {
      if (held.includes(word)) return false;
      held.push(word);
      return true;
    }),
    remove: vi.fn(async (word: string) => {
      const at = held.indexOf(word);
      if (at < 0) return false;
      held.splice(at, 1);
      return true;
    }),
  };
}

function fakeGraveyard(start: readonly Project[] = []) {
  const held = [...start];
  const graveyard = {
    held,
    list: vi.fn(async () => [...held]),
    recover: vi.fn(async (project: Project) => {
      held.splice(held.indexOf(project), 1);
      return undefined as string | undefined;
    }),
  } satisfies SettingsGraveyard & { held: Project[] };
  return graveyard;
}

function open(overrides: Partial<SettingsDialogOptions> = {}) {
  let settings: Settings = DEFAULT_SETTINGS;
  const kept: Settings[] = [];
  const dictionary = fakeDictionary(["Quimby", "Zorblax"]);
  const graveyard = fakeGraveyard([buried("Paper Boats"), buried("Quiet Road")]);
  const closed = vi.fn();
  const into = document.createElement("div");
  document.body.append(into);
  const modal = openSettingsDialog(into, {
    settings: () => settings,
    change: async (next) => {
      settings = next;
      kept.push(next);
      return undefined;
    },
    shortcuts: [
      { name: "File", rows: [{ label: "Save Project", hint: "[Ctrl + S]" }] },
      { name: "Writing", rows: [{ label: "Search", hint: "[Alt + Enter]" }] },
    ],
    dictionary,
    graveyard,
    closed,
    ...overrides,
  });
  return { into, modal, kept, current: () => settings, dictionary, graveyard, closed };
}

/** A key pressed on whatever holds the focus. */
const press = (key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
};
/** Escape as the webview treats it: the `<dialog>` cancels unless the key was used. */
const escape = (modal: HTMLDialogElement): void => {
  const event = press("Escape");
  const cancel = new Event("cancel", { cancelable: true });
  modal.dispatchEvent(cancel);
  if (!event.defaultPrevented && !cancel.defaultPrevented) modal.close();
};
const tabs = (modal: HTMLElement) => [...modal.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const visiblePanels = (modal: HTMLElement) =>
  [...modal.querySelectorAll<HTMLElement>('[role="tabpanel"]')].filter((panel) => !panel.hidden);
const shownSection = (modal: HTMLElement): string => visiblePanels(modal)[0]!.getAttribute("aria-label")!;
const choose = (modal: HTMLElement, section: string): void => tabs(modal).find((tab) => tab.textContent!.endsWith(section))!.click();
const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
/** Type into a field and leave it, as the writer does. */
function typeAndLeave(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const rowsOf = (modal: HTMLElement, list: string): string[] =>
  [...modal.querySelectorAll(`[aria-label="${list}"] .settings__row-name`)].map((name) => name.textContent!);

describe("the Settings dialog", () => {
  it("lists Noah's six sections, in his order, and shows exactly one: General first", () => {
    const { modal } = open();
    expect(modal.getAttribute("aria-label")).toBe("Settings");
    expect(tabs(modal).map((tab) => tab.textContent)).toEqual(SETTINGS_SECTIONS.map((name) => `>${name}`));
    expect(SETTINGS_SECTIONS).toEqual(["General", "Appearance", "New Project Defaults", "Keyboard Shortcuts", "Dictionary", "Graveyard"]);
    expect(visiblePanels(modal)).toHaveLength(1);
    expect(shownSection(modal)).toBe("General");
    expect(tabs(modal)[0]!.getAttribute("aria-selected")).toBe("true");
    // Keyboard first: the section list has the focus.
    expect(document.activeElement).toBe(tabs(modal)[0]);
  });

  it("opens on the section asked for", () => {
    const { modal } = open({ section: "Graveyard" });
    expect(shownSection(modal)).toBe("Graveyard");
    expect(document.activeElement).toBe(tabs(modal)[5]);
  });

  it("walks the sections with Up and Down, wrapping, and steps in with Right and back out with Left", () => {
    const { modal } = open();
    press("ArrowDown");
    expect(shownSection(modal)).toBe("Appearance");
    expect(document.activeElement).toBe(tabs(modal)[1]);
    press("ArrowUp");
    press("ArrowUp");
    expect(shownSection(modal)).toBe("Graveyard");
    press("ArrowDown");
    expect(shownSection(modal)).toBe("General");
    press("ArrowRight");
    expect(document.activeElement).toBe(byId("settings-author-name"));
    press("ArrowDown");
    expect(document.activeElement).toBe(byId("settings-pen-names"));
    press("ArrowLeft");
    expect(document.activeElement).toBe(tabs(modal)[0]);
    // From the top of the section, Up is the section list again.
    press("ArrowRight");
    press("ArrowUp");
    expect(document.activeElement).toBe(tabs(modal)[0]);
  });

  it("closes on Escape and on Done, and says so once", () => {
    const first = open();
    escape(first.modal);
    expect(first.modal.isConnected).toBe(false);
    expect(first.closed).toHaveBeenCalledOnce();

    const second = open();
    const done = second.modal.querySelector<HTMLButtonElement>(".new-project-dialog__actions .dialog-action")!;
    expect(done.textContent).toBe(">Done[Esc]");
    done.click();
    expect(second.modal.isConnected).toBe(false);
    expect(second.closed).toHaveBeenCalledOnce();
  });

  it("lets Escape end typing in a field first, and only then close", () => {
    const { modal } = open();
    press("ArrowRight");
    press("Enter");
    expect(byId("settings-author-name").classList.contains("dialog-keys__editing")).toBe(true);
    escape(modal);
    expect(modal.isConnected).toBe(true);
    escape(modal);
    expect(modal.isConnected).toBe(false);
  });

  it("draws no title tooltips and no inline styles", () => {
    const { modal } = open();
    expect(modal.querySelector("[title]")).toBeNull();
    expect(modal.querySelector("[style]")).toBeNull();
  });

  it("is styled from tokens, fits the window, and lets a long section scroll with no scrollbar", () => {
    const css = readFileSync("app/src/style/settings.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/\.settings__pane \{[^}]*overflow-y: auto/);
    expect(css).not.toMatch(/scrollbar-width:\s*(auto|thin)/);
    // A hidden section must stay hidden under `display: grid`.
    expect(css).toMatch(/\.settings__panel\[hidden\] \{[^}]*display: none/);
    const main = readFileSync("app/src/main.ts", "utf8");
    expect(main).toContain('import "./style/settings.css";');
    // 216 + 24 * 2 + 1 + 560 + 24 * 2 + 2 = 875px wide and 560px of section: inside 1100 × 820.
    const tokens = readFileSync("app/src/style/tokens.css", "utf8");
    const px = (name: string) => Number(new RegExp(`${name}: (\\d+)px;`).exec(tokens)![1]);
    expect(px("--measure-settings-sections") + px("--measure-settings-pane") + 24 * 4 + 3).toBeLessThan(1100);
    expect(px("--size-settings-pane") + 24 * 2 + 24 + 16 + 2).toBeLessThan(820);
  });
});

describe("General", () => {
  it("keeps the author's details, trimmed, and pen names one each", () => {
    const { kept, current } = open();
    typeAndLeave(byId("settings-author-name"), "  Ada Quill ");
    typeAndLeave(byId("settings-pen-names"), "J. Tern,, A. Quill , j. tern");
    typeAndLeave(byId("settings-author-email"), "ada@example.com");
    typeAndLeave(byId("settings-author-phone"), "555 0100");
    typeAndLeave(byId("settings-author-address"), "1 Harbour Lane");
    expect(byId<HTMLInputElement>("settings-author-name").value).toBe("Ada Quill");
    expect(byId<HTMLInputElement>("settings-pen-names").value).toBe("J. Tern, A. Quill");
    expect(current().author).toEqual({
      name: "Ada Quill",
      penNames: ["J. Tern", "A. Quill"],
      email: "ada@example.com",
      phone: "555 0100",
      address: "1 Harbour Lane",
    });
    expect(kept).toHaveLength(5);
  });

  it("shows where the day ends, midnight to begin with, and keeps a time typed any usual way", () => {
    const { current } = open();
    const box = byId<HTMLInputElement>("settings-day-ends-at");
    expect(box.value).toBe("12:00 AM");
    typeAndLeave(box, "0:01");
    expect(box.value).toBe("12:01 AM");
    expect(current().dayEndsAt).toEqual({ hour: 0, minute: 1 });
    typeAndLeave(box, "4pm");
    expect(box.value).toBe("4:00 PM");
    expect(current().dayEndsAt).toEqual({ hour: 16, minute: 0 });
  });

  it("puts a day end that is not a time back to the one in force, without a word", () => {
    const { modal, current } = open();
    const box = byId<HTMLInputElement>("settings-day-ends-at");
    typeAndLeave(box, "4:30 AM");
    typeAndLeave(box, "after lunch");
    expect(box.value).toBe("4:30 AM");
    expect(current().dayEndsAt).toEqual({ hour: 4, minute: 30 });
    expect(modal.querySelector(".trouble")).toBeNull();
  });

  it("keeps a field typed and not yet left when the dialog closes", () => {
    const { modal, current } = open();
    const name = byId<HTMLInputElement>("settings-author-name");
    name.focus();
    name.value = "Ada Quill";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    // The first Escape ends the typing, the second closes; neither is a "change".
    escape(modal);
    escape(modal);
    expect(modal.isConnected).toBe(false);
    expect(current().author.name).toBe("Ada Quill");
  });

  it("keeps on Enter in a field being typed in", () => {
    const { current } = open();
    press("ArrowRight");
    press("Enter");
    const name = byId<HTMLInputElement>("settings-author-name");
    name.value = "Ada Quill";
    press("Enter");
    expect(current().author.name).toBe("Ada Quill");
  });

  it("says, in the dialog, when a change could not be kept", async () => {
    const { modal } = open({ change: async () => "Your settings could not be kept." });
    typeAndLeave(byId("settings-author-name"), "Ada Quill");
    await settle();
    expect(modal.querySelector(".trouble")?.textContent).toBe("Your settings could not be kept.");
  });
});

describe("Appearance", () => {
  it("offers the one theme, Light as coming, white paper, and the two kinds of corner", () => {
    const { modal } = open();
    choose(modal, "Appearance");
    const panel = visiblePanels(modal)[0]!;
    expect([...panel.querySelectorAll(".new-project-dialog__label")].map((label) => label.textContent)).toEqual([
      "Theme",
      "White paper",
      "Interface corners",
      "Paper corners",
    ]);
    const themes = [...panel.querySelectorAll("#settings-theme-list [role=option]")].map((option) => option.textContent);
    expect(themes).toEqual(["Dark", "Lightsoon"]);
  });

  it("changes a corner at once, and the stylesheet reads it from the root", () => {
    const { modal, current } = open();
    choose(modal, "Appearance");
    const paper = byId<HTMLButtonElement>("settings-paper-corners");
    paper.click();
    document.querySelector<HTMLElement>("#settings-paper-corners-list [role=option]:nth-child(2)")!.click();
    expect(paper.textContent).toBe("Sharp");
    expect(current().appearance.paperCorners).toBe("sharp");

    applyAppearance(document.documentElement, current().appearance);
    expect(document.documentElement.dataset["paperCorners"]).toBe("sharp");
    expect(document.documentElement.dataset["interfaceCorners"]).toBe("rounded");
    const tokens = readFileSync("app/src/style/tokens.css", "utf8");
    expect(tokens).toMatch(/:root\[data-paper-corners="sharp"\] \{\s*--radius-paper: 0px;/);
    expect(tokens).toMatch(/:root\[data-interface-corners="sharp"\] \{[^}]*--radius-float: 0px;/);
    // Sharp interface corners leave the paper's own setting alone.
    expect(tokens).toMatch(/--radius-paper: var\(--radius-float-rounded\);/);
  });

  it("keeps white paper on or off", () => {
    const { modal, current } = open();
    choose(modal, "Appearance");
    byId<HTMLButtonElement>("settings-white-paper").click();
    expect(current().appearance.whitePaper).toBe(true);
  });

  it("starts from what is kept", () => {
    const { modal } = open({
      settings: () => settingsFrom({ appearance: { interfaceCorners: "sharp", paperCorners: "sharp", whitePaper: true } }),
    });
    choose(modal, "Appearance");
    expect(byId("settings-interface-corners").textContent).toBe("Sharp");
    expect(byId("settings-paper-corners").textContent).toBe("Sharp");
    expect(byId("settings-white-paper").getAttribute("aria-checked")).toBe("true");
  });
});

describe("New Project Defaults", () => {
  it("lists the types New Project makes, with the coming ones drawn as coming", () => {
    const { modal } = open();
    choose(modal, "New Project Defaults");
    const types = [...document.querySelectorAll("#settings-defaults-type-list [role=option]")].map((option) => option.textContent);
    expect(types).toEqual(["Feature", "Episode", "Short Film", "Novelsoon", "Short Storysoon", "Novellasoon", "Flash Fictionsoon", "Poemsoon"]);
    expect(byId("settings-defaults-type").textContent).toBe("Feature");
  });

  it("keeps each type's defaults on their own, and puts numbers right quietly", () => {
    const { modal, current } = open();
    choose(modal, "New Project Defaults");
    byId<HTMLButtonElement>("settings-defaults-shown").click();
    const goal = byId<HTMLInputElement>("settings-defaults-goal");
    expect(goal.disabled).toBe(true);
    byId<HTMLButtonElement>("settings-defaults-goal-on").click();
    expect(goal.disabled).toBe(false);
    typeAndLeave(goal, "749.6");
    expect(goal.value).toBe("750");
    typeAndLeave(byId("settings-defaults-pages"), "-4");
    expect(byId<HTMLInputElement>("settings-defaults-pages").value).toBe("");
    typeAndLeave(byId("settings-defaults-pages"), "110");
    byId<HTMLButtonElement>("settings-defaults-bold-headings").click();
    byId<HTMLButtonElement>("settings-defaults-blank-lines").click();
    document.querySelector<HTMLElement>("#settings-defaults-blank-lines-list [role=option]:nth-child(2)")!.click();

    expect(current().projectDefaults["Feature"]).toEqual({
      shown: false,
      dailyGoalOn: true,
      dailyGoal: 750,
      targetPages: 110,
      boldSceneHeadings: true,
      boldTransitions: false,
      blankLinesBeforeSceneHeadings: 2,
    });

    // Episode is untouched, and shown as it is.
    byId<HTMLButtonElement>("settings-defaults-type").click();
    document.querySelector<HTMLElement>("#settings-defaults-type-list [role=option]:nth-child(2)")!.click();
    expect(byId("settings-defaults-shown").getAttribute("aria-checked")).toBe("true");
    expect(byId<HTMLInputElement>("settings-defaults-goal").value).toBe("500");
    expect(byId<HTMLInputElement>("settings-defaults-pages").value).toBe("");
    expect(current().projectDefaults["Episode"]).toEqual(DEFAULT_SETTINGS.projectDefaults["Episode"]);
  });
});

describe("Keyboard Shortcuts", () => {
  it("lists the keys it is given, read only", () => {
    const { modal } = open();
    choose(modal, "Keyboard Shortcuts");
    const panel = visiblePanels(modal)[0]!;
    expect([...panel.querySelectorAll(".settings__key-row")].map((row) => row.textContent)).toEqual([
      "Save Project[Ctrl + S]",
      "Search[Alt + Enter]",
    ]);
    expect(panel.querySelector("button, input")).toBeNull();
  });

  it("lists exactly what the Keyboard Shortcuts dialog lists, from the command table", () => {
    const { modal } = open({ shortcuts: shortcutGroups() });
    choose(modal, "Keyboard Shortcuts");
    const drawn = [...visiblePanels(modal)[0]!.querySelectorAll(".settings__keys")].map((group) => [
      group.querySelector(".settings__subheading")!.textContent,
      [...group.querySelectorAll(".settings__key-row")].map((row) => row.textContent),
    ]);
    expect(drawn).toEqual(
      shortcutGroups().map((group) => [group.name, group.rows.map((row) => `${row.label}${row.hint}`)]),
    );
    // Settings has no key of its own, so it is not listed: nothing here is a key that does not work.
    expect(drawn.flatMap(([, rows]) => rows as string[]).some((row) => row.startsWith("Settings"))).toBe(false);
  });
});

describe("Dictionary", () => {
  it("lists the writer's words, and finds as the writer types", async () => {
    const { modal, dictionary } = open();
    choose(modal, "Dictionary");
    await vi.waitFor(() => expect(rowsOf(modal, "Your words")).toEqual(["Quimby", "Zorblax"]));
    expect(dictionary.words).toHaveBeenCalled();
    const box = byId<HTMLInputElement>("settings-dictionary-word");
    box.value = "zor";
    box.dispatchEvent(new Event("input", { bubbles: true }));
    expect(rowsOf(modal, "Your words")).toEqual(["Zorblax"]);
  });

  it("adds a word with Enter or Add, and Add is not offered for what cannot be one word", async () => {
    const { modal, dictionary } = open();
    choose(modal, "Dictionary");
    await vi.waitFor(() => expect(rowsOf(modal, "Your words")).toHaveLength(2));
    const box = byId<HTMLInputElement>("settings-dictionary-word");
    const add = [...modal.querySelectorAll<HTMLButtonElement>(".settings__row-action")].find((b) => b.textContent === "Add")!;
    for (const [typed, offered] of [["", false], ["two words", false], ["a/b", false], ["quimby", false], ["Brightwater", true]] as const) {
      box.value = typed;
      box.dispatchEvent(new Event("input", { bubbles: true }));
      expect(add.disabled, typed).toBe(!offered);
    }
    add.click();
    await vi.waitFor(() => expect(rowsOf(modal, "Your words")).toEqual(["Brightwater", "Quimby", "Zorblax"]));
    expect(dictionary.add).toHaveBeenCalledWith("Brightwater");
    expect(box.value).toBe("");

    box.focus();
    press("Enter");
    box.value = "  Marrowby ";
    press("Enter");
    await vi.waitFor(() => expect(dictionary.held).toContain("Marrowby"));
  });

  it("removes a word", async () => {
    const { modal, dictionary } = open();
    choose(modal, "Dictionary");
    await vi.waitFor(() => expect(rowsOf(modal, "Your words")).toHaveLength(2));
    modal.querySelector<HTMLButtonElement>('[aria-label="Remove Quimby"]')!.click();
    await vi.waitFor(() => expect(rowsOf(modal, "Your words")).toEqual(["Zorblax"]));
    expect(dictionary.remove).toHaveBeenCalledWith("Quimby");
  });

  it("edits a word in place: the new one is added before the old one goes; Escape changes nothing", async () => {
    const { modal, dictionary } = open();
    choose(modal, "Dictionary");
    await vi.waitFor(() => expect(rowsOf(modal, "Your words")).toHaveLength(2));
    modal.querySelector<HTMLButtonElement>('[aria-label="Edit Zorblax"]')!.click();
    const box = modal.querySelector<HTMLInputElement>('[aria-label="Change Zorblax"]')!;
    expect(document.activeElement).toBe(box);
    box.value = "Zorblaxx";
    press("Enter");
    await vi.waitFor(() => expect(rowsOf(modal, "Your words")).toEqual(["Quimby", "Zorblaxx"]));
    expect(dictionary.add.mock.invocationCallOrder[0]!).toBeLessThan(dictionary.remove.mock.invocationCallOrder[0]!);

    modal.querySelector<HTMLButtonElement>('[aria-label="Edit Quimby"]')!.click();
    modal.querySelector<HTMLInputElement>('[aria-label="Change Quimby"]')!.value = "Changed";
    escape(modal);
    await vi.waitFor(() => expect(rowsOf(modal, "Your words")).toEqual(["Quimby", "Zorblaxx"]));
    // The Escape was the edit's: the dialog is still open.
    expect(modal.isConnected).toBe(true);
  });

  it("says when the dictionary could not be read", async () => {
    const { modal } = open({
      dictionary: { words: async () => Promise.reject(new Error("no file")), add: async () => true, remove: async () => true },
    });
    choose(modal, "Dictionary");
    await vi.waitFor(() => expect(modal.querySelector(".trouble")?.textContent).toMatch(/could not be changed or read/));
  });
});

describe("Graveyard", () => {
  it("lists the projects in the Graveyard, each with Recover and Exile", async () => {
    const { modal } = open();
    choose(modal, "Graveyard");
    await vi.waitFor(() => expect(rowsOf(modal, "The Graveyard")).toEqual(["Paper Boats", "Quiet Road"]));
    const actions = [...modal.querySelectorAll('[aria-label="The Graveyard"] .settings__row-action')].map((b) => b.textContent);
    expect(actions).toEqual(["Recover", "Exile", "Recover", "Exile"]);
    // No Archive: it is not confirmed.
    expect(modal.textContent).not.toMatch(/Archive/);
  });

  it("recovers a project, and reads the Graveyard again", async () => {
    const { modal, graveyard } = open();
    choose(modal, "Graveyard");
    await vi.waitFor(() => expect(rowsOf(modal, "The Graveyard")).toHaveLength(2));
    modal.querySelector<HTMLButtonElement>('[aria-label="Recover Paper Boats"]')!.click();
    await vi.waitFor(() => expect(rowsOf(modal, "The Graveyard")).toEqual(["Quiet Road"]));
    expect(graveyard.recover).toHaveBeenCalledWith(expect.objectContaining({ path: buried("Paper Boats").path }));
    // The keys stay in the list.
    expect(document.activeElement).toBe(modal.querySelector('[aria-label="Recover Quiet Road"]'));
  });

  it("says why, in the section, when a recovery is refused", async () => {
    const graveyard = fakeGraveyard([buried("Paper Boats")]);
    graveyard.recover.mockImplementation(async () => "“Paper Boats” has changed on disk since the Graveyard was read, so it has been left alone.");
    const { modal } = open({ graveyard });
    choose(modal, "Graveyard");
    await vi.waitFor(() => expect(rowsOf(modal, "The Graveyard")).toHaveLength(1));
    modal.querySelector<HTMLButtonElement>('[aria-label="Recover Paper Boats"]')!.click();
    await vi.waitFor(() => expect(modal.querySelector(".trouble")?.textContent).toMatch(/left alone/));
    expect(rowsOf(modal, "The Graveyard")).toEqual(["Paper Boats"]);
  });

  it("is empty, quietly, when nothing has been deleted", async () => {
    const { modal } = open({ graveyard: fakeGraveyard([]) });
    choose(modal, "Graveyard");
    await vi.waitFor(() => expect(visiblePanels(modal)[0]!.querySelector(".settings__empty")?.textContent).toBe("The Graveyard is empty."));
  });

  it("asks before Exile in its own pop-up, and with nothing to erase with, its Exile cannot be pressed", async () => {
    const { modal, graveyard } = open();
    choose(modal, "Graveyard");
    await vi.waitFor(() => expect(rowsOf(modal, "The Graveyard")).toHaveLength(2));
    modal.querySelector<HTMLButtonElement>('[aria-label="Exile Quiet Road"]')!.click();
    const confirm = document.querySelector<HTMLDialogElement>('dialog[aria-label="Exile Project"]')!;
    expect(confirm).not.toBeNull();
    // Over Settings, not inside it: its keys are its own.
    expect(modal.contains(confirm)).toBe(false);
    expect([...confirm.querySelectorAll(".project-dialog__line")].map((line) => line.textContent)).toEqual([
      'Exile "Quiet Road"?',
      "This permanently deletes the project. It cannot be recovered.",
    ]);
    const [cancel, exile] = [...confirm.querySelectorAll<HTMLButtonElement>(".new-project-dialog__action")];
    expect(cancel!.textContent).toBe(">Cancel[Esc]");
    expect(exile!.textContent).toBe(">Exile[Enter]");
    expect(exile!.disabled).toBe(true);
    expect(document.activeElement).toBe(cancel);
    // Enter does nothing; Cancel closes it and the project is still there.
    confirm.querySelector("form")!.requestSubmit();
    expect(confirm.isConnected).toBe(true);
    cancel!.click();
    expect(confirm.isConnected).toBe(false);
    await vi.waitFor(() => expect(rowsOf(modal, "The Graveyard")).toEqual(["Paper Boats", "Quiet Road"]));
    expect(graveyard.held).toHaveLength(2);
    expect(modal.isConnected).toBe(true);
  });

  it("exiles through the port when one is given, and only after the confirm", async () => {
    const graveyard = fakeGraveyard([buried("Paper Boats")]);
    const exile = vi.fn(async (project: Project) => {
      graveyard.held.splice(graveyard.held.indexOf(project), 1);
      return undefined as string | undefined;
    });
    const { modal } = open({ graveyard: { ...graveyard, exile } });
    choose(modal, "Graveyard");
    await vi.waitFor(() => expect(rowsOf(modal, "The Graveyard")).toHaveLength(1));
    modal.querySelector<HTMLButtonElement>('[aria-label="Exile Paper Boats"]')!.click();
    expect(exile).not.toHaveBeenCalled();
    const confirm = document.querySelector<HTMLDialogElement>('dialog[aria-label="Exile Project"]')!;
    const button = [...confirm.querySelectorAll<HTMLButtonElement>(".new-project-dialog__action")][1]!;
    expect(button.disabled).toBe(false);
    button.click();
    await vi.waitFor(() => expect(confirm.isConnected).toBe(false));
    expect(exile).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(rowsOf(modal, "The Graveyard")).toEqual([]));
  });
});
