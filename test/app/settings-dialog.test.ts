/**
 * Settings: one dialog, a list of five sections and the one chosen, opened from
 * Home's `[s]` and from File ▸ Settings… (`settings-from-editor.test.ts`).
 *
 * The disk is behind ports here: the dictionary and the Graveyard are fakes
 * holding invented words and projects, and `change` records what would be kept.
 * The keys are the real command table's. What the ports do on a real disk is
 * `test/settings/`, `test/project/recover.test.ts`, `test/project/exile.test.ts`
 * and the Rust tests in `folders.rs` and `spelling.rs`.
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
import { CAPTURES_KEYS, isCapturedKey } from "../../app/src/screens/shortcuts.ts";
import {
  commandById,
  commandForKey,
  hintOf,
  RESERVED_KEYS,
  shortcutCommands,
  useKeyBindings,
} from "../../app/src/workspaces/editor/commands.ts";
import type { Project } from "../../src/project/bundle.ts";
import { DEFAULT_SETTINGS, settingsFrom, settingsText, type Settings } from "../../src/settings/settings.ts";

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
  useKeyBindings({});
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
    exile: vi.fn(async (project: Project) => {
      held.splice(held.indexOf(project), 1);
      return undefined as string | undefined;
    }),
  } satisfies SettingsGraveyard & { held: Project[] };
  return graveyard;
}

function open(overrides: Partial<SettingsDialogOptions> = {}, start: Settings = DEFAULT_SETTINGS) {
  let settings: Settings = start;
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
      // As `main.ts` does: the keys are used at once.
      useKeyBindings(next.keyBindings);
      return undefined;
    },
    shortcuts: { commands: shortcutCommands(), reserved: RESERVED_KEYS },
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
const settingsCss = (): string => readFileSync("app/src/style/settings.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("the Settings dialog", () => {
  it("lists Noah's five sections, in his order, with no Appearance tab, and shows exactly one: General first", () => {
    const { modal } = open();
    expect(modal.getAttribute("aria-label")).toBe("Settings");
    expect(SETTINGS_SECTIONS).toEqual(["General", "New Project Defaults", "Keyboard Shortcuts", "Dictionary", "Graveyard"]);
    expect(tabs(modal).map((tab) => tab.textContent)).toEqual(SETTINGS_SECTIONS.map((name) => `>${name}`));
    expect(tabs(modal).some((tab) => tab.textContent!.includes("Appearance"))).toBe(false);
    expect(visiblePanels(modal)).toHaveLength(1);
    expect(shownSection(modal)).toBe("General");
    expect(tabs(modal)[0]!.getAttribute("aria-selected")).toBe("true");
    // Keyboard first: the section list has the focus.
    expect(document.activeElement).toBe(tabs(modal)[0]);
  });

  it("opens on the section asked for", () => {
    const { modal } = open({ section: "Graveyard" });
    expect(shownSection(modal)).toBe("Graveyard");
    expect(document.activeElement).toBe(tabs(modal)[4]);
  });

  it("walks the sections with Up and Down, wrapping, and steps in with Right and back out with Left", () => {
    const { modal } = open();
    press("ArrowDown");
    expect(shownSection(modal)).toBe("New Project Defaults");
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

  it("draws no title tooltips and no inline styles, in any section", () => {
    const { modal } = open();
    for (const section of SETTINGS_SECTIONS) {
      choose(modal, section);
      expect(modal.querySelector("[title]"), section).toBeNull();
      expect(modal.querySelector("[style]"), section).toBeNull();
    }
  });

  it("is styled from tokens, fits the window, and lets a long section scroll with no scrollbar", () => {
    const css = settingsCss();
    expect(css).toMatch(/\.settings__pane \{[^}]*overflow-y: auto/);
    expect(css).not.toMatch(/scrollbar-width:\s*(auto|thin)/);
    // A hidden section must stay hidden under `display: grid`.
    expect(css).toMatch(/\.settings__panel\[hidden\] \{[^}]*display: none/);
    const main = readFileSync("app/src/main.ts", "utf8");
    expect(main).toContain('import "./style/settings.css";');
    const tokens = readFileSync("app/src/style/tokens.css", "utf8");
    const px = (name: string) => Number(new RegExp(`${name}: (\\d+)px;`).exec(tokens)![1]);
    expect(px("--measure-settings-sections") + px("--measure-settings-pane") + 24 * 4 + 3).toBeLessThan(1100);
    expect(px("--size-settings-pane") + 24 * 2 + 24 + 16 + 2).toBeLessThan(820);
  });

  it("has no two-column layout anywhere: every section is one column", () => {
    const css = settingsCss();
    // The only grid with columns is the frame: sections, divider, pane.
    const columns = [...css.matchAll(/grid-template-columns:[^;]*;/g)].map((match) => match[0]);
    expect(columns).toEqual(["grid-template-columns: var(--measure-settings-sections) var(--rule-thin) minmax(0, 1fr);"]);
    const { modal } = open();
    expect(modal.querySelector(".settings__pair, .settings__key-columns, .settings__key-column")).toBeNull();
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

describe("Appearance, inside General", () => {
  it("is a part of General under its own subheading: the one theme, Light as coming, white paper, and the two kinds of corner", () => {
    const { modal } = open();
    const panel = visiblePanels(modal)[0]!;
    expect(shownSection(modal)).toBe("General");
    expect([...panel.querySelectorAll(".settings__subheading")].map((heading) => heading.textContent)).toEqual([
      "Author",
      "Goals",
      "Appearance",
    ]);
    const labels = [...panel.querySelectorAll(".new-project-dialog__label")].map((label) => label.textContent);
    expect(labels.slice(labels.indexOf("Appearance") + 1)).toEqual([
      "Theme",
      "White paper",
      "Interface corners",
      "Paper corners",
      "Background animation",
    ]);
    const themes = [...panel.querySelectorAll("#settings-theme-list [role=option]")].map((option) => option.textContent);
    expect(themes).toEqual(["Dark", "Lightsoon"]);
  });

  it("is reached from the keyboard after the day's end", () => {
    open();
    byId("settings-day-ends-at").focus();
    press("ArrowDown");
    expect(document.activeElement).toBe(byId("settings-theme"));
    press("ArrowDown");
    expect(document.activeElement).toBe(byId("settings-white-paper"));
  });

  it("changes a corner at once, and the stylesheet reads it from the root", () => {
    const { current } = open();
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
    const { current } = open();
    byId<HTMLButtonElement>("settings-white-paper").click();
    expect(current().appearance.whitePaper).toBe(true);
  });

  it("has the background animation on by default, and turns it off and on at once", () => {
    const { current, kept } = open();
    const animation = byId<HTMLButtonElement>("settings-background-animation");
    expect(animation.getAttribute("role")).toBe("switch");
    expect(animation.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('label[for="settings-background-animation"]')?.textContent).toBe("Background animation");

    animation.click();
    expect(animation.getAttribute("aria-checked")).toBe("false");
    expect(current().appearance.backgroundAnimation).toBe(false);
    // Kept as it is flipped, with nothing to confirm.
    expect(kept.at(-1)?.appearance.backgroundAnimation).toBe(false);
    // The rest of Appearance is left as it was.
    expect(current().appearance.whitePaper).toBe(false);

    animation.click();
    expect(current().appearance.backgroundAnimation).toBe(true);
  });

  it("is reached from the keyboard after the paper's corners", () => {
    open();
    byId("settings-paper-corners").focus();
    press("ArrowDown");
    expect(document.activeElement).toBe(byId("settings-background-animation"));
  });

  it("starts from what is kept", () => {
    open({
      settings: () => settingsFrom({ appearance: { interfaceCorners: "sharp", paperCorners: "sharp", whitePaper: true } }),
    });
    expect(byId("settings-interface-corners").textContent).toBe("Sharp");
    expect(byId("settings-paper-corners").textContent).toBe("Sharp");
    expect(byId("settings-white-paper").getAttribute("aria-checked")).toBe("true");
    expect(byId("settings-background-animation").getAttribute("aria-checked")).toBe("true");
  });

  it("shows the background animation off when it was kept off", () => {
    open({ settings: () => settingsFrom({ appearance: { backgroundAnimation: false } }) });
    expect(byId("settings-background-animation").getAttribute("aria-checked")).toBe("false");
  });
});

describe("every list, as one column of pill cells", () => {
  it("draws Keyboard Shortcuts, New Project Defaults, Dictionary and Graveyard as cells in one list each", async () => {
    const { modal } = open();
    for (const [section, list] of [
      ["Keyboard Shortcuts", "Keyboard shortcuts"],
      ["New Project Defaults", "Project types"],
      ["Dictionary", "Your words"],
      ["Graveyard", "The Graveyard"],
    ] as const) {
      choose(modal, section);
      await vi.waitFor(() => expect(modal.querySelectorAll(`[aria-label="${list}"] > li`).length, section).toBeGreaterThan(0));
      const items = [...modal.querySelectorAll(`[aria-label="${list}"] > li`)];
      expect(items.every((item) => item.classList.contains("settings__cell")), section).toBe(true);
    }
  });

  it("dresses a cell as the editor's pills are dressed: the raised surface, an edge, the interface's corners, full width with a margin", () => {
    const css = settingsCss();
    const rule = (selector: string): string => new RegExp(`(?:^|\\})\\s*${selector.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`).exec(css)![1]!;
    const cell = rule(".settings__cell");
    expect(cell).toContain("background: var(--colour-raised)");
    expect(cell).toContain("border-radius: var(--radius-float)");
    expect(cell).toMatch(/border: var\(--rule-thin\) solid var\(--colour-border\)/);
    const list = rule(".settings__list");
    expect(list).toContain("padding: 0 var(--space-cell-margin)");
    expect(list).toContain("gap: var(--space-cell-gap)");
    // Sharp interface corners square the cells too: they read the same radius the pills do.
    expect(readFileSync("app/src/style/editor.css", "utf8")).toMatch(/\.pill \{[^}]*border-radius: var\(--radius-float\)/);
  });
});

describe("New Project Defaults", () => {
  const heads = (modal: HTMLElement) => [...modal.querySelectorAll<HTMLButtonElement>(".settings__cell-head")];
  const head = (type: string) => byId<HTMLButtonElement>(`settings-defaults-${type.toLowerCase().replace(/ /g, "-")}-head`);
  const opened = (modal: HTMLElement) => heads(modal).filter((one) => one.getAttribute("aria-expanded") === "true").map((one) => one.querySelector(".settings__row-name")!.textContent);

  it("lists every type New Project lists, the coming ones marked as coming, each collapsed", () => {
    const { modal } = open();
    choose(modal, "New Project Defaults");
    expect(rowsOf(modal, "Project types")).toEqual(["Feature", "Episode", "Short Film", "Novel", "Short Story", "Novella", "Flash Fiction", "Poem"]);
    const coming = heads(modal).filter((one) => one.querySelector(".settings__row-aside")?.textContent === "Coming soon");
    expect(coming.map((one) => one.querySelector(".settings__row-name")!.textContent)).toEqual(["Novel", "Short Story", "Novella", "Flash Fiction", "Poem"]);
    expect(opened(modal)).toEqual([]);
    expect(modal.querySelectorAll(".settings__cell-body:not([hidden])")).toHaveLength(0);
    // No drop-down of types any more.
    expect(modal.querySelector("#settings-defaults-type")).toBeNull();
    expect(heads(modal).every((one) => one.querySelector(".settings__cell-chevron") !== null)).toBe(true);
  });

  it("opens each one on its own, and each stays as the writer left it", () => {
    const { modal } = open();
    choose(modal, "New Project Defaults");
    head("Feature").click();
    head("Novel").click();
    expect(opened(modal)).toEqual(["Feature", "Novel"]);
    head("Episode").click();
    expect(opened(modal)).toEqual(["Feature", "Episode", "Novel"]);
    head("Feature").click();
    expect(opened(modal)).toEqual(["Episode", "Novel"]);
    // Elsewhere and back: still as left.
    choose(modal, "Dictionary");
    choose(modal, "New Project Defaults");
    expect(opened(modal)).toEqual(["Episode", "Novel"]);
    expect(byId("settings-defaults-novel-options").hidden).toBe(false);
    expect(byId("settings-defaults-feature-options").hidden).toBe(true);
  });

  it("opens and closes from the keyboard, and the keys walk into an open one only", () => {
    const { modal } = open();
    choose(modal, "New Project Defaults");
    press("ArrowRight");
    expect(document.activeElement).toBe(head("Feature"));
    press("ArrowDown");
    expect(document.activeElement).toBe(head("Episode"));
    press("Enter");
    expect(opened(modal)).toEqual(["Episode"]);
    press("ArrowDown");
    expect(document.activeElement).toBe(byId("settings-defaults-episode-shown"));
    press("ArrowUp");
    press("Enter");
    expect(opened(modal)).toEqual([]);
    press("ArrowDown");
    expect(document.activeElement).toBe(head("Short Film"));
  });

  it("shows the options that are there, and the screenplay ones only for a screenplay", () => {
    const { modal } = open();
    choose(modal, "New Project Defaults");
    head("Feature").click();
    head("Poem").click();
    const labels = (type: string) =>
      [...byId(`settings-defaults-${type}-options`).querySelectorAll(".new-project-dialog__label")].map((label) => label.textContent);
    expect(labels("feature")).toEqual([
      "Show in New Project",
      "Daily word goal",
      "Target page count",
      "Screenplay",
      "Bold scene headings",
      "Bold transitions",
      "Blank lines before scene headings",
    ]);
    expect(labels("poem")).toEqual(["Show in New Project", "Daily word goal", "Target page count"]);
  });

  it("keeps each type's defaults on their own, and puts numbers right quietly", () => {
    const { modal, current } = open();
    choose(modal, "New Project Defaults");
    head("Feature").click();
    byId<HTMLButtonElement>("settings-defaults-feature-shown").click();
    const goal = byId<HTMLInputElement>("settings-defaults-feature-goal");
    expect(goal.disabled).toBe(true);
    byId<HTMLButtonElement>("settings-defaults-feature-goal-on").click();
    expect(goal.disabled).toBe(false);
    typeAndLeave(goal, "749.6");
    expect(goal.value).toBe("750");
    typeAndLeave(byId("settings-defaults-feature-pages"), "-4");
    expect(byId<HTMLInputElement>("settings-defaults-feature-pages").value).toBe("");
    typeAndLeave(byId("settings-defaults-feature-pages"), "110");
    byId<HTMLButtonElement>("settings-defaults-feature-bold-headings").click();
    byId<HTMLButtonElement>("settings-defaults-feature-blank-lines").click();
    document.querySelector<HTMLElement>("#settings-defaults-feature-blank-lines-list [role=option]:nth-child(2)")!.click();

    expect(current().projectDefaults["Feature"]).toEqual({
      shown: false,
      dailyGoalOn: true,
      dailyGoal: 750,
      targetPages: 110,
      boldSceneHeadings: true,
      boldTransitions: false,
      blankLinesBeforeSceneHeadings: 2,
    });
    expect(current().projectDefaults["Episode"]).toEqual(DEFAULT_SETTINGS.projectDefaults["Episode"]);

    // A coming type's defaults are kept too.
    head("Novel").click();
    byId<HTMLButtonElement>("settings-defaults-novel-shown").click();
    expect(current().projectDefaults["Novel"]!.shown).toBe(false);
    expect(modal.querySelector(".trouble")).toBeNull();
  });
});

describe("Keyboard Shortcuts", () => {
  const keyList = (modal: HTMLElement) => modal.querySelector<HTMLElement>('[aria-label="Keyboard shortcuts"]')!;
  const cellOf = (modal: HTMLElement, label: string): HTMLElement =>
    [...keyList(modal).children].find((cell) => cell.querySelector(".settings__row-name")!.textContent === label) as HTMLElement;
  const chipsOf = (modal: HTMLElement, label: string): string[] =>
    [...cellOf(modal, label).querySelectorAll(".settings__chip")].map((chip) => chip.textContent!);
  const button = (modal: HTMLElement, name: string): HTMLButtonElement => modal.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!;
  const noteOf = (modal: HTMLElement, label: string): HTMLElement => cellOf(modal, label).querySelector(".settings__cell-note")!;
  const openKeys = () => {
    const opened = open();
    choose(opened.modal, "Keyboard Shortcuts");
    return opened;
  };

  it("lists every command in one scrolling column, in the table's order, and never Settings", () => {
    const { modal } = openKeys();
    const names = [...keyList(modal).querySelectorAll(".settings__row-name")].map((name) => name.textContent);
    expect(names).toEqual(shortcutCommands().map((command) => command.label));
    expect(names).toEqual(expect.arrayContaining(["Save Project", "Export As…", "Search", "Spellcheck", "Scene Heading", "Copy"]));
    expect(names).not.toContain("Settings…");
    expect(modal.querySelectorAll('[aria-label="Keyboard shortcuts"]')).toHaveLength(1);
    // No filter: Noah's call.
    expect(visiblePanels(modal)[0]!.querySelector("input")).toBeNull();
    expect(visiblePanels(modal)[0]!.textContent).not.toMatch(/Unassigned|Assigned/);
  });

  it("shows both of Search's keys, Alt + Enter and Ctrl + F, each a chip with its own ×", () => {
    const { modal } = openKeys();
    expect(chipsOf(modal, "Search")).toEqual(["Alt + Enter", "Ctrl + F"]);
    expect(button(modal, "Remove Alt + Enter from Search")).not.toBeNull();
    expect(button(modal, "Remove Ctrl + F from Search")).not.toBeNull();
    expect(button(modal, "Add a key for Search")).not.toBeNull();
    // Its own keys: nothing to reset.
    expect(button(modal, "Reset Search to its own keys")).toBeNull();
  });

  it("shows Blank for a command with no key, and a + to give it one", () => {
    const { modal } = openKeys();
    expect(chipsOf(modal, "Export As…")).toEqual(["Blank"]);
    expect(cellOf(modal, "Export As…").querySelector(".settings__chip--blank")).not.toBeNull();
    expect(button(modal, "Add a key for Export As…")).not.toBeNull();
  });

  it("locks the standard keys: plain chips, nothing to press", () => {
    const { modal } = openKeys();
    for (const [label, key] of [
      ["Cut", "Ctrl + X"],
      ["Copy", "Ctrl + C"],
      ["Paste", "Ctrl + V"],
      ["Select All", "Ctrl + A"],
      ["Undo", "Ctrl + Z"],
      ["Redo", "Ctrl + Y"],
      ["Home", "Esc"],
      ["Save Project", "Ctrl + S"],
    ] as const) {
      const cell = cellOf(modal, label);
      expect(chipsOf(modal, label), label).toEqual([key]);
      expect(cell.querySelector("button"), label).toBeNull();
      expect(cell.querySelector(".settings__chip--fixed"), label).not.toBeNull();
    }
  });

  it("replaces a key: the chip listens, a modifier alone is not a key, and the new one is used at once", () => {
    const { modal, current } = openKeys();
    button(modal, "Change Spellcheck: Ctrl + ;").click();
    const listening = cellOf(modal, "Spellcheck").querySelector<HTMLElement>(".settings__chip--capturing")!;
    expect(listening.textContent).toBe("Press keys…");
    expect(listening.hasAttribute(CAPTURES_KEYS)).toBe(true);
    expect(document.activeElement).toBe(listening);
    // A modifier on its own, a bare letter, and Ctrl with Alt: still listening.
    expect(press("Control", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(isCapturedKey(press("Alt", { altKey: true }))).toBe(true);
    press("l");
    press("l", { ctrlKey: true, altKey: true });
    expect(current().keyBindings).toEqual({});
    expect(document.activeElement).toBe(listening);
    press("L", { altKey: true, shiftKey: true });
    expect(current().keyBindings).toEqual({ "toggle-spellcheck": [{ key: "l", alt: true }] });
    expect(chipsOf(modal, "Spellcheck")).toEqual(["Alt + L"]);
    expect(document.activeElement).toBe(button(modal, "Change Spellcheck: Alt + L"));
    // Live: the Editor's keys and the menus' hint read it now.
    const spellcheck = commandById("toggle-spellcheck")!;
    expect(commandForKey({ key: "l", altKey: true, ctrlKey: false, metaKey: false }, "editor")).toBe(spellcheck);
    expect(commandForKey({ key: ";", altKey: false, ctrlKey: true, metaKey: false }, "editor")).toBeUndefined();
    expect(hintOf(spellcheck)).toBe("[Alt + L]");
  });

  it("adds a key with +, and a command keeps every key it has", () => {
    const { modal, current } = openKeys();
    button(modal, "Add a key for Search").click();
    press("g", { ctrlKey: true });
    expect(chipsOf(modal, "Search")).toEqual(["Alt + Enter", "Ctrl + F", "Ctrl + G"]);
    expect(current().keyBindings["search"]).toEqual([{ key: "Enter", alt: true }, { key: "f", mod: true }, { key: "g", mod: true }]);
    const search = commandById("search")!;
    for (const key of [{ key: "Enter", altKey: true, ctrlKey: false }, { key: "f", altKey: false, ctrlKey: true }, { key: "g", altKey: false, ctrlKey: true }]) {
      expect(commandForKey({ ...key, metaKey: false }, "window"), key.key).toBe(search);
    }
  });

  it("removes a key with ×, at once, and a command with none left shows Blank", () => {
    const { modal, current } = openKeys();
    button(modal, "Remove Ctrl + F from Search").click();
    expect(chipsOf(modal, "Search")).toEqual(["Alt + Enter"]);
    expect(current().keyBindings["search"]).toEqual([{ key: "Enter", alt: true }]);
    button(modal, "Remove Alt + Enter from Search").click();
    expect(chipsOf(modal, "Search")).toEqual(["Blank"]);
    expect(current().keyBindings["search"]).toEqual([]);
    expect(commandForKey({ key: "Enter", altKey: true, ctrlKey: false, metaKey: false }, "window")).toBeUndefined();
    // Blank sets the first one.
    button(modal, "Set a key for Search").click();
    press("j", { ctrlKey: true });
    expect(chipsOf(modal, "Search")).toEqual(["Ctrl + J"]);
  });

  it("puts a command's own keys back with ↺, shown only while they differ, and keeps nothing for it", () => {
    const { modal, current } = openKeys();
    button(modal, "Remove Ctrl + F from Search").click();
    const reset = button(modal, "Reset Search to its own keys");
    expect(reset).not.toBeNull();
    reset.click();
    expect(chipsOf(modal, "Search")).toEqual(["Alt + Enter", "Ctrl + F"]);
    expect(current().keyBindings).toEqual({});
    expect(button(modal, "Reset Search to its own keys")).toBeNull();
    // Taking a key away and giving the same one back is its own keys again too.
    button(modal, "Remove Ctrl + ; from Spellcheck").click();
    button(modal, "Set a key for Spellcheck").click();
    press(";", { ctrlKey: true });
    expect(current().keyBindings).toEqual({});
  });

  it.each([
    ["Ctrl + F", { key: "f", ctrlKey: true }, "Search"],
    ["Alt + Enter", { key: "Enter", altKey: true }, "Search"],
    ["Ctrl + ,", { key: ",", ctrlKey: true }, "Previous Scene"],
    ["Ctrl + C", { key: "c", ctrlKey: true }, "Copy"],
    ["Ctrl + S", { key: "s", ctrlKey: true }, "Save Project"],
    ["Alt + 1", { key: "1", altKey: true }, "Editor"],
    ["Alt + F", { key: "f", altKey: true }, "File menu"],
    ["Ctrl + B", { key: "b", ctrlKey: true }, "Bold"],
  ] as const)("refuses %s, another's key, and says whose it is, in that cell only", (name, chord, owner) => {
    const { modal, current } = openKeys();
    button(modal, "Change Spellcheck: Ctrl + ;").click();
    const { key, ...held } = chord;
    press(key, held);
    expect(current().keyBindings).toEqual({});
    expect(chipsOf(modal, "Spellcheck")).toEqual(["Ctrl + ;"]);
    expect(noteOf(modal, "Spellcheck").hidden).toBe(false);
    expect(noteOf(modal, "Spellcheck").textContent).toBe(`${name} is already used by ${owner}.`);
    expect(modal.querySelectorAll(".settings__cell-note:not([hidden])")).toHaveLength(1);
    expect(document.querySelector(".trouble")).toBeNull();
    expect(document.querySelectorAll("dialog")).toHaveLength(1);
    // The next change says nothing more.
    button(modal, "Add a key for Spellcheck").click();
    expect(noteOf(modal, "Spellcheck").hidden).toBe(true);
  });

  it("refuses a key the writer gave another command, too", () => {
    const { modal } = openKeys();
    button(modal, "Add a key for Export As…").click();
    press("e", { ctrlKey: true });
    button(modal, "Add a key for Edit Goals…").click();
    press("e", { ctrlKey: true });
    expect(noteOf(modal, "Edit Goals…").textContent).toBe("Ctrl + E is already used by Export As….");
    expect(chipsOf(modal, "Edit Goals…")).toEqual(["Blank"]);
  });

  it("cancels on Escape: nothing changes, and the dialog stays", () => {
    const { modal, current, closed } = openKeys();
    button(modal, "Change Spellcheck: Ctrl + ;").click();
    escape(modal);
    expect(modal.isConnected).toBe(true);
    expect(closed).not.toHaveBeenCalled();
    expect(chipsOf(modal, "Spellcheck")).toEqual(["Ctrl + ;"]);
    expect(current().keyBindings).toEqual({});
    expect(document.activeElement).toBe(button(modal, "Change Spellcheck: Ctrl + ;"));
    // And the next Escape is the dialog's again.
    escape(modal);
    expect(modal.isConnected).toBe(false);
  });

  it("cancels when the writer clicks away", () => {
    const { modal, current } = openKeys();
    button(modal, "Add a key for Search").click();
    (document.activeElement as HTMLElement).blur();
    expect(cellOf(modal, "Search").querySelector(".settings__chip--capturing")).toBeNull();
    expect(chipsOf(modal, "Search")).toEqual(["Alt + Enter", "Ctrl + F"]);
    expect(current().keyBindings).toEqual({});
  });

  it("starts from the writer's kept keys, and keeps them in the file's text", () => {
    const start = settingsFrom({ keyBindings: { search: [{ key: "f", mod: true }], "reset-zoom": [] } });
    const { modal, current } = open({}, start);
    choose(modal, "Keyboard Shortcuts");
    expect(chipsOf(modal, "Search")).toEqual(["Ctrl + F"]);
    expect(chipsOf(modal, "Reset Zoom")).toEqual(["Blank"]);
    button(modal, "Add a key for Next Scene").click();
    press("n", { altKey: true });
    const written = JSON.parse(settingsText(current()));
    expect(written.keyBindings).toEqual({
      search: [{ key: "f", mod: true }],
      "reset-zoom": [],
      // Its own key keeps the other name it arrives under: Ctrl+. still asks for it.
      "next-scene": [{ key: ">", alsoKeys: ["."], mod: true }, { key: "n", alt: true }],
    });
  });

  it("walks every cell's buttons from the keyboard, and skips the locked ones", () => {
    const { modal } = openKeys();
    press("ArrowRight");
    const first = document.activeElement as HTMLElement;
    expect(first.closest(".settings__cell")!.querySelector(".settings__row-name")!.textContent).toBe("Export As…");
    press("ArrowRight");
    expect(document.activeElement).toBe(button(modal, "Add a key for Export As…"));
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
  it("lists the projects in the Graveyard, each with Recover and Exile, Exile in the alarm colour", async () => {
    const { modal } = open();
    choose(modal, "Graveyard");
    await vi.waitFor(() => expect(rowsOf(modal, "The Graveyard")).toEqual(["Paper Boats", "Quiet Road"]));
    const actions = [...modal.querySelectorAll('[aria-label="The Graveyard"] .settings__row-action')].map((b) => b.textContent);
    expect(actions).toEqual(["Recover", "Exile", "Recover", "Exile"]);
    expect(modal.querySelector('[aria-label="Exile Paper Boats"]')!.classList.contains("settings__row-action--alarm")).toBe(true);
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

  const exileConfirm = () => document.querySelector<HTMLDialogElement>('dialog[aria-label="Exile Project"]');
  async function askToExile(name: string) {
    const opened = open();
    choose(opened.modal, "Graveyard");
    await vi.waitFor(() => expect(rowsOf(opened.modal, "The Graveyard")).toHaveLength(2));
    opened.modal.querySelector<HTMLButtonElement>(`[aria-label="Exile ${name}"]`)!.click();
    const confirm = exileConfirm()!;
    const [cancel, exile] = [...confirm.querySelectorAll<HTMLButtonElement>(".new-project-dialog__action")];
    return { ...opened, confirm, cancel: cancel!, exile: exile! };
  }

  it("asks first, in its own pop-up over Settings, dressed as the serious one, with Cancel under the writer's hand", async () => {
    const { modal, confirm, cancel, exile, graveyard } = await askToExile("Quiet Road");
    expect(graveyard.exile).not.toHaveBeenCalled();
    // Over Settings, not inside it: its keys are its own.
    expect(modal.contains(confirm)).toBe(false);
    expect([...confirm.querySelectorAll(".project-dialog__line")].map((line) => line.textContent)).toEqual([
      'Exile "Quiet Road"?',
      "This permanently deletes the project. It cannot be recovered.",
      "Your writing history for it stays in your metrics.",
    ]);
    expect(cancel.textContent).toBe(">Cancel[Esc]");
    expect(exile.textContent).toBe(">Exile[Enter]");
    expect(exile.disabled).toBe(false);
    expect(document.activeElement).toBe(cancel);
    // The alarm colour: an edge, an icon and the Exile button. No type-to-confirm.
    expect(confirm.classList.contains("project-dialog--alarm")).toBe(true);
    expect(confirm.querySelector(".project-dialog__alarm-icon")).not.toBeNull();
    expect(exile.classList.contains("project-dialog__alarm-action")).toBe(true);
    expect(confirm.querySelector("input")).toBeNull();
    const css = readFileSync("app/src/style/open-project.css", "utf8");
    expect(css).toMatch(/\.project-dialog--alarm \{[^}]*border-color: var\(--colour-alarm\)/);
    expect(css).toMatch(/\.project-dialog__alarm-icon \{[^}]*color: var\(--colour-alarm\)/);
  });

  it("erases nothing on Escape", async () => {
    const { modal, confirm, graveyard } = await askToExile("Quiet Road");
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(event);
    const cancelled = new Event("cancel", { cancelable: true });
    confirm.dispatchEvent(cancelled);
    if (!event.defaultPrevented && !cancelled.defaultPrevented) confirm.close();
    expect(confirm.isConnected).toBe(false);
    expect(graveyard.exile).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(rowsOf(modal, "The Graveyard")).toEqual(["Paper Boats", "Quiet Road"]));
    expect(modal.isConnected).toBe(true);
  });

  it("erases nothing on Cancel", async () => {
    const { modal, cancel, graveyard } = await askToExile("Quiet Road");
    cancel.click();
    expect(exileConfirm()).toBeNull();
    expect(graveyard.exile).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(rowsOf(modal, "The Graveyard")).toEqual(["Paper Boats", "Quiet Road"]));
  });

  it("exiles through the port only after Exile is pressed, and reads the Graveyard again", async () => {
    const { modal, confirm, exile, graveyard } = await askToExile("Paper Boats");
    exile.click();
    await vi.waitFor(() => expect(confirm.isConnected).toBe(false));
    expect(graveyard.exile).toHaveBeenCalledOnce();
    expect(graveyard.exile).toHaveBeenCalledWith(expect.objectContaining({ path: buried("Paper Boats").path }));
    await vi.waitFor(() => expect(rowsOf(modal, "The Graveyard")).toEqual(["Quiet Road"]));
  });

  it("stays open with the reason when Exile is refused", async () => {
    const graveyard = fakeGraveyard([buried("Paper Boats")]);
    graveyard.exile.mockImplementation(async () => "“Paper Boats” has changed on disk since the Graveyard was read, so it has been left alone.");
    const { modal } = open({ graveyard });
    choose(modal, "Graveyard");
    await vi.waitFor(() => expect(rowsOf(modal, "The Graveyard")).toHaveLength(1));
    modal.querySelector<HTMLButtonElement>('[aria-label="Exile Paper Boats"]')!.click();
    const confirm = exileConfirm()!;
    [...confirm.querySelectorAll<HTMLButtonElement>(".new-project-dialog__action")][1]!.click();
    await vi.waitFor(() => expect(confirm.querySelector(".trouble")?.textContent).toMatch(/left alone/));
    expect(confirm.isConnected).toBe(true);
    expect(graveyard.held).toHaveLength(1);
  });
});
