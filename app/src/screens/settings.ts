/**
 * Settings: one dialog for the whole application, opened from Home (`[s]`) and
 * from an open project (File ▸ Settings…). It has no key of its own.
 *
 * A list of sections down the left and the one chosen on the right, so the
 * dialog keeps one size and fits the window: General (with Appearance inside
 * it), New Project Defaults, Hotkeys, Dictionary and Graveyard
 * (Noah's notes, *INT. SETTINGS - DAY*). Nothing is "saved" with a button, as
 * in Goals: a choice changes the setting at once and **Done** only puts the
 * dialog away. A field is put right quietly when it is left, and never says it
 * was wrong. The one message a section says of its own is Hotkeys'
 * "already used", for a key another command has.
 *
 * **Every list is one column of cells**, each a pill the width of the section
 * (`.settings__cell`): the keys, the defaults for each project type, the
 * writer's words and the Graveyard.
 *
 * New Project's dialog, built from its pieces: a modal `<dialog>` with no
 * heading, Escape closes it natively, and the shared button, drop-down, switch
 * and keys. The section list is a vertical tab list: Up and Down choose a
 * section, Right or Enter step into it, and Left from the start of a row comes
 * back out. Tab goes round everything that can be used.
 *
 * Here, not in the shell: the shell knows nothing about what it hosts
 * (ADR-0005), and Settings is reached before any project is open. Everything
 * that touches the disk arrives as a port, and the commands and their keys
 * arrive as data, so this draws and listens.
 */
import { ChevronRight, CirclePlus, createElement, RotateCcw, X, type IconNode } from "lucide";
import type { Project } from "../../../src/project/bundle.ts";
import {
  DEFAULTS_ALL,
  DEFAULTS_FOR,
  DEFAULT_PROJECT_DEFAULTS,
  MOST_BINDINGS,
  MOST_PAGES,
  MOST_WORDS,
  penNamesFrom,
  sameBinding,
  settingsFrom,
  timeFrom,
  timeSaid,
  wholeNumber,
  presetOf,
  type Appearance,
  type KeyBinding,
  type ProjectDefaults,
  type Settings,
} from "../../../src/settings/settings.ts";
import { LOOKS } from "../background/presets.ts";
import { dialogAction } from "./dialog-action.ts";
import { dialogKeys } from "./dialog-keys.ts";
import { dialogSelect, type DialogSelect } from "./dialog-select.ts";
import { dialogToggle, type DialogToggle } from "./dialog-toggle.ts";
import { element } from "./element.ts";
import { cursor } from "./menu.ts";
import { chevron, field } from "./new-project.ts";
import { showExileProject } from "./project-dialogs.ts";
import { CAPTURES_KEYS, chordName, chordOf, chordsOverlap, type Chord } from "./shortcuts.ts";
import { message, trouble as troublePanel } from "./trouble.ts";

/** The sections, in the order the list draws them. */
export const SETTINGS_SECTIONS = [
  "General",
  "New Project Defaults",
  "Hotkeys",
  "Dictionary",
  "Graveyard",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** A command Hotkeys lists, as the application's command table gives it. */
export interface ShortcutCommand {
  readonly id: string;
  readonly label: string;
  /** Its own keys, before the writer changed any. */
  readonly defaults: readonly Chord[];
  /** Standard keys (Copy, Save, Escape…): shown, and never changed. */
  readonly fixed: boolean;
}

/** What Hotkeys edits: the commands, and the keys no command may take. */
export interface SettingsShortcuts {
  readonly commands: readonly ShortcutCommand[];
  /** Keys that are taken without being a command's here: the menus' Alt+F, the surface's Ctrl+B. */
  readonly reserved: readonly { readonly label: string; readonly chord: Chord }[];
}

/** The writer's own words (ADR-0032): the custom dictionary, never the shipped one. */
export interface SettingsDictionary {
  readonly words: () => Promise<readonly string[]>;
  /** Answers whether the word was new. */
  readonly add: (word: string) => Promise<boolean>;
  /** Answers whether the word was there. */
  readonly remove: (word: string) => Promise<boolean>;
}

/** The Graveyard (ADR-0044): what is in it, bringing a project back, and Exile. */
export interface SettingsGraveyard {
  readonly list: () => Promise<readonly Project[]>;
  /** Move it back to the projects folder. Resolves to words for the writer when refused. */
  readonly recover: (project: Project) => Promise<string | undefined>;
  /** Erase it for good, after the confirm. Resolves to words for the writer when refused. */
  readonly exile: (project: Project) => Promise<string | undefined>;
}

export interface SettingsDialogOptions {
  /** The settings as they stand now. */
  readonly settings: () => Settings;
  /** Use these from now on, and keep them. Resolves to words for the writer when they could not be kept. */
  readonly change: (settings: Settings) => Promise<string | undefined>;
  readonly shortcuts: SettingsShortcuts;
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

/** A Lucide icon on a button, which a screen reader skips for the button's own name. */
function icon(node: IconNode, className: string): SVGElement {
  const drawn = createElement(node, { class: className });
  drawn.setAttribute("aria-hidden", "true");
  return drawn;
}

/** One cell of a list: a pill the width of the section (`.settings__cell`). */
const cell = (children: readonly Node[], className = ""): HTMLLIElement =>
  element("li", { className: `settings__cell ${className}`.trim() }, children);

/** Whether two lists of keys are the same keys, in the same order. */
const sameKeys = (one: readonly KeyBinding[], other: readonly KeyBinding[]): boolean =>
  one.length === other.length && one.every((binding, at) => sameBinding(binding, other[at]!));

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

  // --- General, with Appearance inside it -------------------------------------
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
  penNames.placeholder = "Separate names with commas";

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
  // Reactive or Ambient: dimmed while the animation is off, and kept as it was.
  const backgroundMotion = dialogSelect({
    id: idOf("background-motion"),
    label: "Background motion",
    choices: [
      { value: "reactive", label: "Reactive" },
      { value: "ambient", label: "Ambient" },
    ],
    onChange: (value) => changeLook({ backgroundMotion: value === "ambient" ? "ambient" : "reactive" }),
  });
  backgroundMotion.set(current.appearance.backgroundMotion);
  // Which look: Drift first, then the rest by name, in one list. Dimmed
  // with the motion while the animation is off, and kept as it was.
  const backgroundPreset = dialogSelect({
    id: idOf("background-preset"),
    label: "Background",
    choices: LOOKS.map((look) => ({ value: look.id, label: look.label })),
    onChange: (value) => changeLook({ backgroundPreset: presetOf(value) }),
  });
  backgroundPreset.set(current.appearance.backgroundPreset);
  const backgroundAnimation = dialogToggle({
    id: idOf("background-animation"),
    onChange: (on) => {
      backgroundPreset.control.disabled = !on;
      backgroundMotion.control.disabled = !on;
      changeLook({ backgroundAnimation: on });
    },
  });
  backgroundAnimation.set(current.appearance.backgroundAnimation);
  backgroundPreset.control.disabled = !current.appearance.backgroundAnimation;
  backgroundMotion.control.disabled = !current.appearance.backgroundAnimation;

  const general: Section = {
    body: [
      subheading("Author"),
      field("Name", name),
      field("Pen names", penNames),
      field("Email", email),
      field("Phone", phone),
      field("Address", address),
      subheading("Goals"),
      field("Day ends at", dayEnds),
      subheading("Appearance"),
      selectField("Theme", theme),
      switchRow("White paper", whitePaper),
      selectField("Interface corners", interfaceCorners),
      selectField("Paper corners", paperCorners),
      switchRow("Background animation", backgroundAnimation),
      selectField("Background", backgroundPreset),
      selectField("Background motion", backgroundMotion),
    ],
    rows: () => [
      [name],
      [penNames],
      [email],
      [phone],
      [address],
      [dayEnds],
      [theme.control],
      [whitePaper.control],
      [interfaceCorners.control],
      [paperCorners.control],
      [backgroundAnimation.control],
      [backgroundPreset.control],
      [backgroundMotion.control],
    ],
  };

  // --- New Project Defaults: a cell for every type, each opened on its own ---------
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
  /** Which types are open. Each stays as the writer left it until the dialog closes. */
  const expanded = new Set<string>();
  const typeCells = DEFAULTS_ALL.map((type) => defaultsCell(type));
  /** One type's cell: its name, a chevron, and, opened, the options New Project will start it with. */
  function defaultsCell(type: string): { readonly cell: HTMLLIElement; readonly rows: () => HTMLElement[][] } {
    const key = idOf(`defaults-${type}`);
    const defaultsOf = (): ProjectDefaults => current.projectDefaults[type] ?? DEFAULT_PROJECT_DEFAULTS;
    const change = (next: Partial<ProjectDefaults>): void =>
      update({ ...current, projectDefaults: { ...current.projectDefaults, [type]: { ...defaultsOf(), ...next } } });
    const coming = !DEFAULTS_FOR.includes(type);
    const screenplay = !coming;

    const shown = dialogToggle({ id: `${key}-shown`, onChange: (on) => change({ shown: on }) });
    const goalOn = dialogToggle({
      id: `${key}-goal-on`,
      onChange: (on) => {
        change({ dailyGoalOn: on });
        goal.disabled = !on;
      },
    });
    const goal = numberBox(`${key}-goal`, `Daily word goal for ${type}`, (typed) => {
      const words = wholeNumber(typed, 1, MOST_WORDS, defaultsOf().dailyGoal);
      change({ dailyGoal: words });
      return words;
    });
    goal.min = "1";
    goal.max = String(MOST_WORDS);
    const pages = numberBox(
      `${key}-pages`,
      `Target page count for ${type}`,
      (typed) => {
        // Blank is "no target".
        const count = typed.trim() === "" ? 0 : wholeNumber(typed, 0, MOST_PAGES, defaultsOf().targetPages);
        change({ targetPages: count });
        return count;
      },
      0,
    );
    pages.min = "0";
    pages.max = String(MOST_PAGES);
    pages.placeholder = "None";
    const boldHeadings = dialogToggle({ id: `${key}-bold-headings`, onChange: (on) => change({ boldSceneHeadings: on }) });
    const boldTransitions = dialogToggle({ id: `${key}-bold-transitions`, onChange: (on) => change({ boldTransitions: on }) });
    const blankLines = dialogSelect({
      id: `${key}-blank-lines`,
      label: "Blank lines before scene headings",
      choices: [
        { value: "1", label: "1" },
        { value: "2", label: "2" },
      ],
      onChange: (value) => change({ blankLinesBeforeSceneHeadings: value === "2" ? 2 : 1 }),
    });
    const defaults = defaultsOf();
    shown.set(defaults.shown);
    goalOn.set(defaults.dailyGoalOn);
    goal.value = String(defaults.dailyGoal);
    goal.disabled = !defaults.dailyGoalOn;
    pages.value = defaults.targetPages === 0 ? "" : String(defaults.targetPages);
    boldHeadings.set(defaults.boldSceneHeadings);
    boldTransitions.set(defaults.boldTransitions);
    blankLines.set(String(defaults.blankLinesBeforeSceneHeadings));

    const options = element("div", { id: `${key}-options`, className: "settings__cell-body", hidden: true }, [
      switchRow("Show in New Project", shown),
      element("div", { className: "new-project-dialog__field" }, [
        switchRow("Daily word goal", goalOn),
        element("div", { className: "settings__line" }, [goal, element("span", { className: "settings__unit", textContent: "words a day" })]),
      ]),
      element("div", { className: "new-project-dialog__field" }, [
        element("label", { htmlFor: pages.id, className: "new-project-dialog__label", textContent: "Target page count" }),
        element("div", { className: "settings__line" }, [pages, element("span", { className: "settings__unit", textContent: "pages" })]),
      ]),
      ...(screenplay
        ? [
            subheading("Screenplay"),
            switchRow("Bold scene headings", boldHeadings),
            switchRow("Bold transitions", boldTransitions),
            selectField("Blank lines before scene headings", blankLines),
          ]
        : []),
    ]);
    const head = element("button", { id: `${key}-head`, type: "button", className: "settings__cell-head" }, [
      icon(ChevronRight, "settings__cell-chevron"),
      element("span", { className: "settings__row-name", textContent: type }),
      ...(coming ? [element("span", { className: "settings__row-aside", textContent: "Coming soon" })] : []),
    ]);
    head.setAttribute("aria-expanded", "false");
    head.setAttribute("aria-controls", options.id);
    head.addEventListener("click", () => {
      const open = !expanded.has(type);
      if (open) expanded.add(type);
      else expanded.delete(type);
      head.setAttribute("aria-expanded", String(open));
      options.hidden = !open;
      refreshRows();
    });
    return {
      cell: cell([head, options], "settings__cell--collapsible"),
      rows: () => [
        [head],
        ...(expanded.has(type)
          ? [
              [shown.control],
              [goalOn.control],
              [goal],
              [pages],
              ...(screenplay ? [[boldHeadings.control], [boldTransitions.control], [blankLines.control]] : []),
            ]
          : []),
      ],
    };
  }
  const newProjectDefaults: Section = {
    body: [element("ul", { className: "settings__list", ariaLabel: "Project types" }, typeCells.map((type) => type.cell))],
    rows: () => typeCells.flatMap((type) => type.rows()),
  };

  // --- Hotkeys: one list, each command's keys changed in place --------
  const commands = options.shortcuts.commands;
  /** The keys a command answers now: the writer's, where they changed them. */
  const keysOf = (command: ShortcutCommand): readonly KeyBinding[] =>
    (command.fixed ? undefined : current.keyBindings[command.id]) ?? command.defaults;
  /** Who has this key now, if anyone but `except`: a command, or a reserved key. */
  const ownerOf = (chord: Chord, except: ShortcutCommand): string | undefined =>
    commands.find((command) => command !== except && keysOf(command).some((held) => chordsOverlap(held, chord)))?.label ??
    options.shortcuts.reserved.find((reserved) => chordsOverlap(reserved.chord, chord))?.label;
  /** Keep a command's keys: dropped from the file when they are its own again. */
  const setKeys = (command: ShortcutCommand, keys: readonly KeyBinding[]): void => {
    const { [command.id]: _old, ...others } = current.keyBindings;
    update({ ...current, keyBindings: sameKeys(keys, command.defaults) ? others : { ...others, [command.id]: keys } });
  };
  const keyCells = commands.map((command) => keyCell(command));
  /**
   * One command's cell: its name, and at the far right its keys as chips, or
   * `Blank`; then + to add a key, and ↺ to put back its own keys when they
   * have changed. A fixed command's chips are only words.
   */
  function keyCell(command: ShortcutCommand): { readonly cell: HTMLLIElement; readonly rows: () => HTMLElement[][] } {
    const chips = element("div", { className: "settings__chips" });
    const note = element("p", { className: "settings__cell-note", hidden: true });
    note.setAttribute("aria-live", "polite");
    let controls: HTMLElement[] = [];
    const say = (words: string | undefined): void => {
      note.textContent = words ?? "";
      note.hidden = words === undefined;
    };

    /** Draw the chips again, and put focus on the one at `focusAt` (an index in `controls`, or `"add"`). */
    const draw = (focusAt?: number | "add"): void => {
      if (command.fixed) {
        chips.replaceChildren(
          ...command.defaults.map((chord) => element("span", { className: "settings__chip settings__chip--fixed", textContent: chordName(chord) })),
        );
        controls = [];
        return;
      }
      const keys = keysOf(command);
      controls = [];
      const drawn: HTMLElement[] = keys.map((chord, at) => {
        const chip = element("button", { type: "button", className: "settings__chip", textContent: chordName(chord) });
        chip.setAttribute("aria-label", `Change ${command.label}: ${chordName(chord)}`);
        chip.addEventListener("click", () => capture(chip, at));
        const remove = element("button", { type: "button", className: "settings__chip-remove", ariaLabel: `Remove ${chordName(chord)} from ${command.label}` }, [
          icon(X, "settings__chip-icon"),
        ]);
        remove.addEventListener("click", () => {
          say(undefined);
          setKeys(command, keys.filter((_key, other) => other !== at));
          draw(keys.length > 1 ? Math.max(0, at - 1) * 2 : "add");
        });
        controls.push(chip, remove);
        return element("span", { className: "settings__chip-pair" }, [chip, remove]);
      });
      if (keys.length === 0) {
        const blank = element("button", { type: "button", className: "settings__chip settings__chip--blank", textContent: "Blank" });
        blank.setAttribute("aria-label", `Set a key for ${command.label}`);
        blank.addEventListener("click", () => capture(blank, 0));
        controls.push(blank);
        drawn.push(blank);
      }
      const add = element("button", { type: "button", className: "settings__icon-button", ariaLabel: `Add a key for ${command.label}` }, [
        icon(CirclePlus, "settings__icon"),
      ]);
      add.disabled = keys.length >= MOST_BINDINGS;
      add.addEventListener("click", () => capture(add, keys.length));
      controls.push(add);
      drawn.push(add);
      if (!sameKeys(keys, command.defaults)) {
        const reset = element("button", { type: "button", className: "settings__icon-button settings__icon-button--quiet", ariaLabel: `Reset ${command.label} to its own keys` }, [
          icon(RotateCcw, "settings__icon"),
        ]);
        reset.addEventListener("click", () => {
          say(undefined);
          setKeys(command, command.defaults);
          draw(0);
        });
        controls.push(reset);
        drawn.push(reset);
      }
      chips.replaceChildren(...drawn);
      // Drawn the first time before the dialog has rows to refresh.
      if (focusAt === undefined) return;
      refreshRows();
      if (focusAt === "add") add.focus();
      else if (focusAt !== undefined) (controls[focusAt] ?? add).focus();
    };

    /**
     * Listen for a new key in place of `from`: the key at `at` replaced, or
     * one more added when `at` is past the last. Escape leaves it as it was,
     * and the dialog open. A key another command has is refused, and its name
     * said in the cell.
     */
    function capture(from: HTMLElement, at: number): void {
      say(undefined);
      const listening = element("button", { type: "button", className: "settings__chip settings__chip--capturing", textContent: "Press keys…" });
      listening.setAttribute(CAPTURES_KEYS, "");
      listening.setAttribute("aria-label", `Press the new key for ${command.label}, or Escape to cancel`);
      const swapped = from.closest(".settings__chip-pair") ?? from;
      swapped.replaceWith(listening);
      controls = [listening];
      refreshRows();
      listening.focus();
      let done = false;
      const finish = (focusAt: number | "add"): void => {
        if (done) return;
        done = true;
        draw(focusAt);
      };
      listening.addEventListener("keydown", (event) => {
        // Recorded here: never a step through the dialog, and never the dialog's Escape.
        event.preventDefault();
        if (event.key === "Escape" && !event.altKey && !event.ctrlKey && !event.metaKey) {
          finish(Math.min(at, keysOf(command).length) * 2);
          return;
        }
        const chord = chordOf(event);
        // A modifier on its own, or a key with none: still listening.
        if (chord === undefined) return;
        const keys = keysOf(command);
        if (keys.some((held, other) => other !== at && sameBinding(held, chord))) {
          // Already this command's: nothing changes.
          finish(at * 2);
          return;
        }
        const owner = ownerOf(chord, command);
        if (owner !== undefined) {
          finish(Math.min(at, keys.length) * 2);
          say(`${chordName(chord)} is already used by ${owner}.`);
          return;
        }
        const next = [...keys];
        next.splice(at, at < keys.length ? 1 : 0, chord);
        setKeys(command, next);
        finish(at * 2);
      });
      // Leaving it is Escape.
      listening.addEventListener("blur", () => {
        if (!done) finish(Math.min(at, keysOf(command).length) * 2);
      });
    }

    draw();
    return {
      cell: cell(
        [
          element("div", { className: "settings__cell-line" }, [
            element("span", { className: "settings__row-name", textContent: command.label }),
            chips,
          ]),
          note,
        ],
        command.fixed ? "settings__cell--fixed" : "",
      ),
      rows: () => (controls.length === 0 ? [] : [controls]),
    };
  }
  const keyboardShortcuts: Section = {
    body: [element("ul", { className: "settings__list", ariaLabel: "Commands and their keys" }, keyCells.map((key) => key.cell))],
    rows: () => keyCells.flatMap((key) => key.rows()),
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
        const row = cell([label, edit, remove]);
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
        exile.classList.add("settings__row-action--alarm");
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
          // On the body: keys inside it must not reach this dialog's.
          showExileProject(document.body, {
            name: project.marker.name,
            onExile: () => options.graveyard.exile(project),
            // Read again: back to the same row, or its neighbour if it is gone.
            onClose: () => void reloadGraveyard(buriedRows.indexOf(controls)),
          });
        });
        return cell([
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
    "New Project Defaults": newProjectDefaults,
    Hotkeys: keyboardShortcuts,
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
