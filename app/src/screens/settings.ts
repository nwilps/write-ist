/**
 * Settings: one dialog for the whole application, opened from Home (`[s]`) and
 * from an open project (File ▸ Settings…).
 *
 * A list of sections down the left and the one chosen on the right, so the
 * dialog keeps one size and fits the window: General, Appearance, New Project
 * Defaults, Keyboard Shortcuts, Dictionary and Graveyard (Noah's notes,
 * *INT. SETTINGS - DAY*). Nothing is "saved" with a button, as in Goals:
 * a choice changes the setting at once and **Done** only puts the dialog away.
 * A field is put right quietly when it is left, and never says it was wrong.
 *
 * New Project's dialog, built from its pieces: a modal `<dialog>` with no
 * heading, Escape closes it natively, and the shared button, drop-down, switch
 * and keys. The section list is a vertical tab list: Up and Down choose a
 * section, Right or Enter step into it, and Left from the start of a row comes
 * back out. Tab goes round everything that can be used.
 *
 * Here, not in the shell: the shell knows nothing about what it hosts
 * (ADR-0005), and Settings is reached before any project is open. Everything
 * that touches the disk arrives as a port, so this draws and listens.
 */
import type { Project } from "../../../src/project/bundle.ts";
import {
  DEFAULTS_COMING,
  DEFAULTS_FOR,
  DEFAULT_PROJECT_DEFAULTS,
  MOST_PAGES,
  MOST_WORDS,
  penNamesFrom,
  settingsFrom,
  timeFrom,
  timeSaid,
  wholeNumber,
  type Appearance,
  type ProjectDefaults,
  type Settings,
} from "../../../src/settings/settings.ts";
import { dialogAction } from "./dialog-action.ts";
import { dialogKeys } from "./dialog-keys.ts";
import { dialogSelect, type DialogSelect } from "./dialog-select.ts";
import { dialogToggle, type DialogToggle } from "./dialog-toggle.ts";
import { element } from "./element.ts";
import { cursor } from "./menu.ts";
import { chevron, field } from "./new-project.ts";
import { showExileProject } from "./project-dialogs.ts";
import { message, trouble as troublePanel } from "./trouble.ts";

/** The sections, in the order the list draws them. */
export const SETTINGS_SECTIONS = [
  "General",
  "Appearance",
  "New Project Defaults",
  "Keyboard Shortcuts",
  "Dictionary",
  "Graveyard",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** A group of keys, as the Keyboard Shortcuts dialog draws them. */
export interface ShortcutListing {
  readonly name: string;
  readonly rows: readonly { readonly label: string; readonly hint: string }[];
}

/** The writer's own words (ADR-0032): the custom dictionary, never the shipped one. */
export interface SettingsDictionary {
  readonly words: () => Promise<readonly string[]>;
  /** Answers whether the word was new. */
  readonly add: (word: string) => Promise<boolean>;
  /** Answers whether the word was there. */
  readonly remove: (word: string) => Promise<boolean>;
}

/** The Graveyard (ADR-0044): what is in it, and bringing a project back. */
export interface SettingsGraveyard {
  readonly list: () => Promise<readonly Project[]>;
  /** Move it back to the projects folder. Resolves to words for the writer when refused. */
  readonly recover: (project: Project) => Promise<string | undefined>;
  /** Erase it for good. Absent until it is built: Exile's confirm is drawn, and its button stays disabled. */
  readonly exile?: (project: Project) => Promise<string | undefined>;
}

export interface SettingsDialogOptions {
  /** The settings as they stand now. */
  readonly settings: () => Settings;
  /** Use these from now on, and keep them. Resolves to words for the writer when they could not be kept. */
  readonly change: (settings: Settings) => Promise<string | undefined>;
  /** Every key the Editor answers, grouped (`shortcutGroups()`). */
  readonly shortcuts: readonly ShortcutListing[];
  readonly dictionary: SettingsDictionary;
  readonly graveyard: SettingsGraveyard;
  /** The section shown first. Default General. */
  readonly section?: SettingsSection;
  readonly closed: () => void;
}

/** The corners and the paper, as the stylesheet reads them (`tokens.css`). */
export function applyAppearance(root: HTMLElement, appearance: Appearance): void {
  root.dataset["interfaceCorners"] = appearance.interfaceCorners;
  root.dataset["paperCorners"] = appearance.paperCorners;
  root.dataset["whitePaper"] = String(appearance.whitePaper);
}

const idOf = (name: string): string => `settings-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

/** A switch with its label on the left, on one row. */
function switchRow(label: string, toggle: DialogToggle): HTMLElement {
  return element("div", { className: "settings__switch" }, [
    element("label", { htmlFor: toggle.control.id, className: "new-project-dialog__label", textContent: label }),
    toggle.control,
  ]);
}

/** A drop-down in its box, with New Project's chevron. */
const selectField = (label: string, select: DialogSelect): HTMLElement =>
  field(label, select.control, [chevron(), select.tray]);

/** A small heading over a part of a section. */
const subheading = (text: string): HTMLElement =>
  element("h3", { className: "new-project-dialog__label settings__subheading", textContent: text });

/** A quiet line where a list has nothing in it. */
const emptyLine = (text: string): HTMLElement => element("p", { className: "settings__empty", textContent: text });

/** A row's small button, lit as every dialog button is, without the `>`. */
const rowAction = (label: string): HTMLButtonElement => {
  const button = dialogAction(label, undefined, "button", { cursor: false });
  button.classList.add("settings__row-action");
  return button;
};

/** Whether a field is being typed in, as `dialogKeys` marks it. */
const beingEdited = (node: EventTarget | null): boolean =>
  node instanceof HTMLElement && node.classList.contains("dialog-keys__editing");

/** Enter in a field being typed in: done with it. */
function onEnterWhileEditing(input: HTMLInputElement, act: () => void): void {
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey || !beingEdited(input)) return;
    event.preventDefault();
    act();
  });
}

/** What the dictionary takes as one word: something, with no space and no slash in it. */
const isWord = (word: string): boolean => word !== "" && !/[\s/]/.test(word);

export function openSettingsDialog(into: HTMLElement, options: SettingsDialogOptions): HTMLDialogElement {
  let current = settingsFrom(options.settings());
  const problem = element("div", { className: "new-project__problem" });
  const say = (wrong: string | undefined): void => {
    problem.replaceChildren(...(wrong === undefined ? [] : [troublePanel(wrong)]));
  };
  const update = (next: Settings): void => {
    current = settingsFrom(next);
    options.change(current).then(say, (error: unknown) => say(`Your settings could not be kept. ${message(error)}`));
  };
  /** Put right and kept, however the dialog closes. */
  const onClose: (() => void)[] = [];
  /** A text field that keeps what it holds when it is left, put right. */
  const keptText = (id: string, value: string, keep: (typed: string) => string): HTMLInputElement => {
    const input = element("input", {
      id,
      className: "new-project-dialog__input",
      type: "text",
      value,
      autocomplete: "off",
      spellcheck: false,
    });
    let last = value;
    const commit = (): void => {
      if (input.value === last) return;
      input.value = last = keep(input.value);
    };
    input.addEventListener("change", commit);
    onEnterWhileEditing(input, commit);
    onClose.push(commit);
    return input;
  };

  // --- General ---------------------------------------------------------------
  const author = (key: "name" | "email" | "phone" | "address"): HTMLInputElement =>
    keptText(idOf(`author-${key}`), current.author[key], (typed) => {
      const kept = typed.trim();
      update({ ...current, author: { ...current.author, [key]: kept } });
      return kept;
    });
  const name = author("name");
  const penNames = keptText(idOf("pen-names"), current.author.penNames.join(", "), (typed) => {
    const names = penNamesFrom(typed);
    update({ ...current, author: { ...current.author, penNames: names } });
    return names.join(", ");
  });
  const email = author("email");
  const phone = author("phone");
  const address = author("address");
  const dayEnds = keptText(idOf("day-ends-at"), timeSaid(current.dayEndsAt), (typed) => {
    // Not a time: back to the one in force, as Goals puts a number back.
    const time = timeFrom(typed) ?? current.dayEndsAt;
    update({ ...current, dayEndsAt: time });
    return timeSaid(time);
  });
  dayEnds.classList.add("settings__time");
  const general: Section = {
    body: [
      subheading("Author"),
      field("Name", name),
      field("Pen names", penNames),
      element("div", { className: "settings__pair" }, [field("Email", email), field("Phone", phone)]),
      field("Address", address),
      subheading("Goals"),
      field("Day ends at", dayEnds),
    ],
    rows: () => [[name], [penNames], [email, phone], [address], [dayEnds]],
  };
  penNames.placeholder = "Separate names with commas";

  // --- Appearance ------------------------------------------------------------
  const changeLook = (next: Partial<Appearance>): void =>
    update({ ...current, appearance: { ...current.appearance, ...next } });
  const theme = dialogSelect({
    id: idOf("theme"),
    label: "Theme",
    choices: [
      { value: "dark", label: "Dark" },
      { value: "light", label: "Light", unavailable: "soon" },
    ],
  });
  const whitePaper = dialogToggle({ id: idOf("white-paper"), onChange: (on) => changeLook({ whitePaper: on }) });
  whitePaper.set(current.appearance.whitePaper);
  const cornerChoices = [
    { value: "rounded", label: "Rounded" },
    { value: "sharp", label: "Sharp" },
  ];
  const interfaceCorners = dialogSelect({
    id: idOf("interface-corners"),
    label: "Interface corners",
    choices: cornerChoices,
    onChange: (value) => changeLook({ interfaceCorners: value === "sharp" ? "sharp" : "rounded" }),
  });
  interfaceCorners.set(current.appearance.interfaceCorners);
  const paperCorners = dialogSelect({
    id: idOf("paper-corners"),
    label: "Paper corners",
    choices: cornerChoices,
    onChange: (value) => changeLook({ paperCorners: value === "sharp" ? "sharp" : "rounded" }),
  });
  paperCorners.set(current.appearance.paperCorners);
  const appearance: Section = {
    body: [
      selectField("Theme", theme),
      switchRow("White paper", whitePaper),
      selectField("Interface corners", interfaceCorners),
      selectField("Paper corners", paperCorners),
    ],
    rows: () => [[theme.control], [whitePaper.control], [interfaceCorners.control], [paperCorners.control]],
  };

  // --- New Project Defaults ---------------------------------------------------
  let type = DEFAULTS_FOR[0]!;
  const defaultsOf = (): ProjectDefaults => current.projectDefaults[type] ?? DEFAULT_PROJECT_DEFAULTS;
  const changeDefaults = (next: Partial<ProjectDefaults>): void =>
    update({ ...current, projectDefaults: { ...current.projectDefaults, [type]: { ...defaultsOf(), ...next } } });
  const typeSelect = dialogSelect({
    id: idOf("defaults-type"),
    label: "Project type",
    choices: [
      ...DEFAULTS_FOR.map((value) => ({ value, label: value })),
      ...DEFAULTS_COMING.map((value) => ({ value, label: value, unavailable: "soon" })),
    ],
    onChange: (value) => {
      type = value;
      showDefaults();
    },
  });
  const shown = dialogToggle({ id: idOf("defaults-shown"), onChange: (on) => changeDefaults({ shown: on }) });
  const goalOn = dialogToggle({
    id: idOf("defaults-goal-on"),
    onChange: (on) => {
      changeDefaults({ dailyGoalOn: on });
      goal.disabled = !on;
    },
  });
  const numberBox = (id: string, label: string, keep: (typed: string) => number, blankAt?: number): HTMLInputElement => {
    const box = element("input", {
      id,
      className: "new-project-dialog__input settings__number",
      ariaLabel: label,
      type: "number",
      step: "1",
      autocomplete: "off",
    });
    // Typed and not yet kept: kept when the dialog closes, however quickly.
    let typed = false;
    const commit = (): void => {
      typed = false;
      const kept = keep(box.value);
      box.value = kept === blankAt ? "" : String(kept);
    };
    box.addEventListener("input", () => void (typed = true));
    box.addEventListener("change", commit);
    onEnterWhileEditing(box, commit);
    onClose.push(() => {
      if (typed) commit();
    });
    return box;
  };
  const goal = numberBox(idOf("defaults-goal"), "Daily word goal", (typed) => {
    const words = wholeNumber(typed, 1, MOST_WORDS, defaultsOf().dailyGoal);
    changeDefaults({ dailyGoal: words });
    return words;
  });
  goal.min = "1";
  goal.max = String(MOST_WORDS);
  const pages = numberBox(
    idOf("defaults-pages"),
    "Target page count",
    (typed) => {
      // Blank is "no target".
      const count = typed.trim() === "" ? 0 : wholeNumber(typed, 0, MOST_PAGES, defaultsOf().targetPages);
      changeDefaults({ targetPages: count });
      return count;
    },
    0,
  );
  pages.min = "0";
  pages.max = String(MOST_PAGES);
  pages.placeholder = "None";
  const boldHeadings = dialogToggle({ id: idOf("defaults-bold-headings"), onChange: (on) => changeDefaults({ boldSceneHeadings: on }) });
  const boldTransitions = dialogToggle({ id: idOf("defaults-bold-transitions"), onChange: (on) => changeDefaults({ boldTransitions: on }) });
  const blankLines = dialogSelect({
    id: idOf("defaults-blank-lines"),
    label: "Blank lines before scene headings",
    choices: [
      { value: "1", label: "1" },
      { value: "2", label: "2" },
    ],
    onChange: (value) => changeDefaults({ blankLinesBeforeSceneHeadings: value === "2" ? 2 : 1 }),
  });
  /** Show the chosen type's defaults. */
  function showDefaults(): void {
    const defaults = defaultsOf();
    shown.set(defaults.shown);
    goalOn.set(defaults.dailyGoalOn);
    goal.value = String(defaults.dailyGoal);
    goal.disabled = !defaults.dailyGoalOn;
    pages.value = defaults.targetPages === 0 ? "" : String(defaults.targetPages);
    boldHeadings.set(defaults.boldSceneHeadings);
    boldTransitions.set(defaults.boldTransitions);
    blankLines.set(String(defaults.blankLinesBeforeSceneHeadings));
  }
  showDefaults();
  const newProjectDefaults: Section = {
    body: [
      selectField("Project type", typeSelect),
      switchRow("Show in New Project", shown),
      element("div", { className: "new-project-dialog__field" }, [
        switchRow("Daily word goal", goalOn),
        element("div", { className: "settings__line" }, [goal, element("span", { className: "settings__unit", textContent: "words a day" })]),
      ]),
      element("div", { className: "new-project-dialog__field" }, [
        element("label", { htmlFor: pages.id, className: "new-project-dialog__label", textContent: "Target page count" }),
        element("div", { className: "settings__line" }, [pages, element("span", { className: "settings__unit", textContent: "pages" })]),
      ]),
      subheading("Screenplay"),
      switchRow("Bold scene headings", boldHeadings),
      switchRow("Bold transitions", boldTransitions),
      selectField("Blank lines before scene headings", blankLines),
    ],
    rows: () => [
      [typeSelect.control],
      [shown.control],
      [goalOn.control],
      [goal],
      [pages],
      [boldHeadings.control],
      [boldTransitions.control],
      [blankLines.control],
    ],
  };

  // --- Keyboard Shortcuts -----------------------------------------------------
  const listing = (group: ShortcutListing): HTMLElement =>
    element("section", { className: "settings__keys" }, [
      element("h3", { className: "new-project-dialog__label settings__subheading", textContent: group.name }),
      element(
        "ul",
        { className: "settings__key-rows" },
        group.rows.map((row) =>
          element("li", { className: "settings__key-row" }, [
            element("span", { textContent: row.label }),
            element("span", { className: "settings__key", textContent: row.hint }),
          ]),
        ),
      ),
    ]);
  // As the Keyboard Shortcuts dialog draws them: every group but the last down one side, the last on the other.
  const groups = options.shortcuts.filter((group) => group.rows.length > 0);
  const half = Math.max(1, groups.length - 1);
  const keyboardShortcuts: Section = {
    body: [
      element("div", { className: "settings__key-columns" }, [
        element("div", { className: "settings__key-column" }, groups.slice(0, half).map(listing)),
        element("div", { className: "settings__key-column" }, groups.slice(half).map(listing)),
      ]),
    ],
    rows: () => [],
  };

  // --- Dictionary -------------------------------------------------------------
  let words: readonly string[] = [];
  let wordRows: HTMLElement[][] = [];
  const wordBox = element("input", {
    id: idOf("dictionary-word"),
    className: "new-project-dialog__input",
    type: "text",
    placeholder: "Find or add a word",
    autocomplete: "off",
    spellcheck: false,
  });
  const add = rowAction("Add");
  const wordList = element("ul", { className: "settings__list", ariaLabel: "Your words" });
  const dictionaryProblem = element("div", { className: "new-project__problem" });
  const known = (word: string): boolean => words.some((held) => held.toLowerCase() === word.toLowerCase());
  const settleAdd = (): void => {
    const word = wordBox.value.trim();
    add.disabled = !isWord(word) || known(word);
  };
  /** Ask the disk, and say so in the section if it would not answer. */
  const dictionaryAsk = async <T>(ask: () => Promise<T>): Promise<T | undefined> => {
    dictionaryProblem.replaceChildren();
    try {
      return await ask();
    } catch (error) {
      dictionaryProblem.replaceChildren(troublePanel(`Your dictionary could not be changed or read. ${message(error)}`));
      return undefined;
    }
  };
  const reloadWords = async (): Promise<void> => {
    const listed = await dictionaryAsk(options.dictionary.words);
    if (listed !== undefined) words = listed;
    drawWords();
  };
  function drawWords(): void {
    const filter = wordBox.value.trim().toLowerCase();
    const matching = words.filter((word) => word.toLowerCase().includes(filter));
    wordRows = [];
    wordList.replaceChildren(
      ...matching.map((word) => {
        const label = element("span", { className: "settings__row-name", textContent: word });
        const edit = rowAction("Edit");
        const remove = rowAction("Remove");
        edit.setAttribute("aria-label", `Edit ${word}`);
        remove.setAttribute("aria-label", `Remove ${word}`);
        const row = element("li", { className: "settings__row" }, [label, edit, remove]);
        const controls: HTMLElement[] = [edit, remove];
        wordRows.push(controls);
        remove.addEventListener("click", () => {
          void dictionaryAsk(() => options.dictionary.remove(word)).then(async () => {
            const at = wordRows.indexOf(controls);
            await reloadWords();
            const next = wordRows[Math.min(at, wordRows.length - 1)];
            (next?.[1] ?? wordBox).focus();
          });
        });
        edit.addEventListener("click", () => editWord(row, word, controls));
        return row;
      }),
      ...(words.length === 0 ? [emptyLine("No words added yet.")] : []),
    );
    settleAdd();
    refreshRows();
  }
  /** Change a word in place: Enter keeps it, Escape leaves it as it was. */
  function editWord(row: HTMLElement, word: string, controls: HTMLElement[]): void {
    const box = element("input", {
      className: "new-project-dialog__input settings__row-input",
      type: "text",
      value: word,
      ariaLabel: `Change ${word}`,
      autocomplete: "off",
      spellcheck: false,
    });
    row.replaceChildren(box);
    controls.splice(0, controls.length, box);
    refreshRows();
    keys.edit(box);
    box.select();
    let done = false;
    const finish = async (keep: boolean): Promise<void> => {
      if (done) return;
      done = true;
      const changed = box.value.trim();
      // Added before the old one goes, so a failure never loses the word.
      if (keep && isWord(changed) && changed !== word) {
        const added = await dictionaryAsk(() => options.dictionary.add(changed));
        if (added !== undefined) await dictionaryAsk(() => options.dictionary.remove(word));
      }
      const at = wordRows.indexOf(controls);
      await reloadWords();
      (wordRows[Math.max(0, Math.min(at, wordRows.length - 1))]?.[0] ?? wordBox).focus();
    };
    box.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        void finish(true);
      } else if (event.key === "Escape") {
        // Used here: the dialog stays.
        event.preventDefault();
        void finish(false);
      }
    });
    box.addEventListener("blur", () => void finish(true));
  }
  const addWord = (): void => {
    const word = wordBox.value.trim();
    if (!isWord(word) || known(word)) return;
    void dictionaryAsk(() => options.dictionary.add(word)).then(async () => {
      wordBox.value = "";
      await reloadWords();
      keys.edit(wordBox);
    });
  };
  wordBox.addEventListener("input", drawWords);
  onEnterWhileEditing(wordBox, addWord);
  add.addEventListener("click", addWord);
  const dictionary: Section = {
    body: [
      element("div", { className: "new-project-dialog__field" }, [
        element("label", { htmlFor: wordBox.id, className: "new-project-dialog__label", textContent: "Your words" }),
        element("div", { className: "settings__line" }, [element("div", { className: "new-project-dialog__box settings__grow" }, [wordBox]), add]),
      ]),
      dictionaryProblem,
      wordList,
    ],
    rows: () => [[wordBox, add], ...wordRows],
    shown: () => void reloadWords(),
  };

  // --- Graveyard ----------------------------------------------------------------
  let buriedRows: HTMLElement[][] = [];
  const buriedList = element("ul", { className: "settings__list", ariaLabel: "The Graveyard" });
  const graveyardProblem = element("div", { className: "new-project__problem" });
  const graveyardAsk = async <T>(ask: () => Promise<T>): Promise<T | undefined> => {
    graveyardProblem.replaceChildren();
    try {
      return await ask();
    } catch (error) {
      graveyardProblem.replaceChildren(troublePanel(`The Graveyard could not be read. ${message(error)}`));
      return undefined;
    }
  };
  const reloadGraveyard = async (focusAt?: number): Promise<void> => {
    const buried = (await graveyardAsk(options.graveyard.list)) ?? [];
    buriedRows = [];
    buriedList.replaceChildren(
      ...buried.map((project) => {
        const recover = rowAction("Recover");
        const exile = rowAction("Exile");
        recover.setAttribute("aria-label", `Recover ${project.marker.name}`);
        exile.setAttribute("aria-label", `Exile ${project.marker.name}`);
        const controls = [recover, exile];
        buriedRows.push(controls);
        recover.addEventListener("click", () => {
          const at = buriedRows.indexOf(controls);
          void graveyardAsk(() => options.graveyard.recover(project)).then(async (wrong) => {
            await reloadGraveyard(at);
            if (wrong !== undefined) graveyardProblem.replaceChildren(troublePanel(wrong));
          });
        });
        exile.addEventListener("click", () => {
          const exiling = options.graveyard.exile;
          // On the body: keys inside it must not reach this dialog's.
          showExileProject(document.body, {
            name: project.marker.name,
            ...(exiling === undefined ? {} : { onExile: () => exiling(project) }),
            // Read again: back to the same row, or its neighbour if it is gone.
            onClose: () => void reloadGraveyard(buriedRows.indexOf(controls)),
          });
        });
        return element("li", { className: "settings__row" }, [
          element("span", { className: "settings__row-name", textContent: project.marker.name }),
          element("span", { className: "settings__row-aside", textContent: project.marker.format }),
          recover,
          exile,
        ]);
      }),
      ...(buried.length === 0 ? [emptyLine("The Graveyard is empty.")] : []),
    );
    refreshRows();
    // Back to the row the writer was on, or its neighbour if it has gone.
    if (focusAt !== undefined && !panels[SETTINGS_SECTIONS.indexOf("Graveyard")]!.hidden) {
      (buriedRows[Math.max(0, Math.min(focusAt, buriedRows.length - 1))]?.[0] ?? tabs[selected]!).focus();
    }
  };
  const graveyard: Section = {
    body: [graveyardProblem, buriedList],
    rows: () => buriedRows,
    shown: () => void reloadGraveyard(),
  };

  // --- The frame --------------------------------------------------------------
  const sections: Readonly<Record<SettingsSection, Section>> = {
    General: general,
    Appearance: appearance,
    "New Project Defaults": newProjectDefaults,
    "Keyboard Shortcuts": keyboardShortcuts,
    Dictionary: dictionary,
    Graveyard: graveyard,
  };
  const panels = SETTINGS_SECTIONS.map((sectionName) => {
    const panel = element("section", {
      id: `${idOf(sectionName)}-panel`,
      className: "settings__panel",
      role: "tabpanel",
      ariaLabel: sectionName,
      hidden: true,
    }, sections[sectionName].body);
    return panel;
  });
  const tabs = SETTINGS_SECTIONS.map((sectionName, index) => {
    const tab = element("button", { id: `${idOf(sectionName)}-tab`, type: "button", className: "settings__tab", role: "tab" }, [
      cursor(),
      element("span", { textContent: sectionName }),
    ]);
    tab.setAttribute("aria-controls", panels[index]!.id);
    tab.addEventListener("click", () => select(index));
    return tab;
  });
  const done = dialogAction("Done", "Esc", "button");
  const pane = element("div", { className: "settings__pane" }, panels);
  const list = element("div", { className: "settings__tabs", role: "tablist", ariaLabel: "Settings sections" }, tabs);
  list.setAttribute("aria-orientation", "vertical");
  // No heading, as New Project has none; the dialog is still named for a screen reader.
  const modal = element("dialog", { className: "new-project-dialog settings", ariaLabel: "Settings" }, [
    element("div", { className: "new-project-dialog__form" }, [
      element("div", { className: "settings__body" }, [
        list,
        element("div", { className: "settings__divider", role: "separator", ariaOrientation: "vertical" }),
        pane,
      ]),
      problem,
      element("div", { className: "new-project-dialog__actions" }, [done]),
    ]),
  ]);

  /** What the keys walk: the chosen section's tab, its controls, and Done. Rebuilt in place. */
  const rows: HTMLElement[][] = [];
  let selected = 0;
  function refreshRows(): void {
    rows.splice(0, rows.length, [tabs[selected]!], ...sections[SETTINGS_SECTIONS[selected]!].rows(), [done]);
  }
  function select(index: number): void {
    selected = index;
    tabs.forEach((tab, at) => {
      tab.setAttribute("aria-selected", String(at === index));
      tab.tabIndex = at === index ? 0 : -1;
      panels[at]!.hidden = at !== index;
    });
    pane.scrollTop = 0;
    refreshRows();
    tabs[index]!.focus();
    sections[SETTINGS_SECTIONS[index]!].shown?.();
  }
  /** The first thing in the section that can be used now, if anything. */
  const firstInPanel = (): HTMLElement | undefined =>
    rows.slice(1, -1).flat().find((control) => !control.matches(":disabled") && control.closest("[hidden]") === null);

  // Before `dialogKeys`, which leaves a used key alone.
  list.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const at = tabs.indexOf(event.target as HTMLButtonElement);
    if (at < 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      select((at + (event.key === "ArrowDown" ? 1 : -1) + tabs.length) % tabs.length);
    } else if (event.key === "ArrowRight" || (event.key === "Enter" && !event.repeat)) {
      firstInPanel()?.focus();
    } else if (event.key !== "ArrowLeft" && event.key !== "Enter") {
      return;
    }
    event.preventDefault();
  });
  // Left from the start of a row goes back to the section list.
  pane.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (beingEdited(event.target)) return;
    const row = rows.find((candidates) => candidates.includes(event.target as HTMLElement));
    if (row === undefined || row.find((control) => !control.matches(":disabled")) !== event.target) return;
    event.preventDefault();
    tabs[selected]!.focus();
  });
  const keys = dialogKeys(modal, rows);

  done.addEventListener("click", () => modal.close());
  modal.addEventListener("close", () => {
    for (const commit of onClose) commit();
    modal.remove();
    options.closed();
  });

  into.append(modal);
  modal.showModal();
  select(Math.max(0, SETTINGS_SECTIONS.indexOf(options.section ?? "General")));
  return modal;
}

interface Section {
  readonly body: readonly HTMLElement[];
  /** Its controls, as `dialogKeys` rows, top to bottom. */
  readonly rows: () => readonly HTMLElement[][];
  /** It has just been chosen: read what it lists again. */
  readonly shown?: () => void;
}
