/**
 * The Editor's command table: everything the writer can ask the Editor to do,
 * one entry each.
 *
 * An entry holds the facts about a command that used to live in four places —
 * the key that asks for it, the menu item that offers it, the hint drawn
 * beside either, and the code that does it. The key handlers (`editor.ts`),
 * the menus (`menus.ts`) and the side panels (`panels.ts`) all read this
 * table, so a command is added by writing one entry, and the hint beside it
 * cannot say a key the table does not answer: it is computed from the same
 * chord the key handler matches.
 *
 * **A flat table, deliberately.** Each entry stands alone: one key, no layers,
 * no modes, no user rebinding. Nothing here decides a key by what else is
 * bound; two commands claiming one key in one place is a test failure, not a
 * precedence rule.
 *
 * **The context menu.** ADR-0034 has Write-ist drawing its own right-click
 * menus, and says a menu item "must reach the same code as the keyboard
 * shortcut, not a second path". A command that acts at a place in the
 * manuscript (the dual-dialogue three) takes that place — `run(host, at)` — and
 * says whether it would do anything there — `isAvailable(command, host, at)` —
 * so a menu can grey it out. A command is offered on the paper's right-click
 * menu by giving it a `context` (`context-menu-items.ts` reads them): adding
 * an item to that menu is one line in this table.
 *
 * The table is data and one lookup; the work stays where it was. The commands
 * that need the window (dialogs, saving, leaving) are reached through the
 * `host` the Editor hands in, so the table can be read and tested with no
 * window at all.
 */
import {
  ClipboardPaste,
  Copy,
  Eye,
  FileDown,
  FileOutput,
  FileText,
  FolderOpen,
  House,
  MapPin,
  Save,
  Scissors,
  SpellCheck,
  Target,
  UserCheck,
  type IconNode,
} from "lucide";
import type { EditorView } from "prosemirror-view";
import {
  canMakeDualDialogue,
  canMakeNormalDialogue,
  canSwapSpeakers,
  makeDualDialogue,
  makeNormalDialogue,
  swapSpeakers,
} from "../../../../src/screenplay/dual-dialogue.ts";
import { NUMBERED_TYPES, setElementType } from "../../../../src/screenplay/element-keys.ts";
import { chordHint, chordMatches, type Chord, type KeyPress } from "../../screens/shortcuts.ts";

/** What the window does for the Editor: the parts of a command that need a window. */
export interface EditorActions {
  readonly save: () => void;
  readonly saveCopy: () => void;
  readonly exportPdf: () => void;
  readonly toProjects: () => void;
  readonly toHome: () => void;
  readonly editTitlePage: () => void;
  readonly viewTitlePage: () => void;
  /** Open the Goals dialog (ADR-0040): the same one the word count and the Goal pill open. */
  readonly editGoals: () => void;
  readonly confirmName: () => void;
  readonly confirmLocation: () => void;
  /** Confirm whichever of the two the caret is in. */
  readonly confirmHere: () => void;
  readonly toggleSpellcheck: () => void;
  /** Whether the spelling pass is on, for the tick beside the item. */
  readonly spellcheckOn: () => boolean;
  readonly search: () => void;
  /** Cut, copy, paste and select-all: the same code the keys reach. Where, if anywhere, is the writer's selection. */
  readonly cut: () => void;
  readonly copy: () => void;
  readonly paste: () => void;
  readonly selectAll: () => void;
  /** The misspelt word at a position, if the spelling pass is on and has underlined one there. */
  readonly misspellingAt: (at: number) => Misspelling | undefined;
}

/** A word the spelling pass has underlined, and what can be done about it. */
export interface Misspelling {
  /** Best first; the "Did you mean" fix for a confirmed name leads. */
  readonly suggestions: () => Promise<readonly string[]>;
  /** Replace the word: one undo step. */
  readonly replace: (text: string) => void;
  /** Make the word right from now on (ADR-0032). */
  readonly addToDictionary: () => void;
}

/** What a command is run against. */
export interface CommandHost extends EditorActions {
  /** The editor, or nothing until the manuscript has been read. */
  readonly view: () => EditorView | undefined;
}

/**
 * Who answers the command's key. `editor`: the Editor, while the paper has
 * focus. `window`: the Editor, wherever focus is. `elsewhere`: some other code
 * answers the key (the screenplay surface's keymap, the shell's Escape) and the
 * table only knows it, to draw the hint and the menu item.
 */
export type KeyPlace = "editor" | "window" | "elsewhere";

export type MenuName = "File" | "Edit" | "View";

export interface Command {
  readonly id: string;
  readonly label: string;
  /** A Lucide icon drawn before the label in a menu (ADR-0035). */
  readonly icon?: IconNode;
  /** The key that asks for it. */
  readonly chord?: Chord;
  /** The key is another command's: shown beside this one, and answered by that one. */
  readonly sameKeyAs?: string;
  /** Where the key is answered. Default `editor`. */
  readonly keys?: KeyPlace;
  /** The application menu that offers it; a rule is drawn where `group` changes. */
  readonly menu?: { readonly name: MenuName; readonly group: string };
  /**
   * The right-click menu on the paper that offers it. Items are drawn in table
   * order, a rule where `group` changes. A `contextual` group is drawn only
   * where at least one of its commands is available, so Dual Dialogue is not
   * offered in action text; inside a drawn group, an unavailable item is greyed.
   */
  readonly context?: { readonly group: string; readonly contextual?: true };
  /** For an item that is on or off. */
  readonly checked?: (host: CommandHost) => boolean;
  /**
   * Whether running it would do anything, for a command that acts at a place.
   * Absent means always. `at` is a document position, defaulting to the caret.
   */
  readonly available?: (host: CommandHost, at: number) => boolean;
  /** Do it. `at` is where, for a command that acts at a place; default the caret. */
  readonly run: (host: CommandHost, at: number) => void;
}

/** Whether the writer has anything selected: what Cut and Copy need. */
const hasSelection = (host: CommandHost): boolean => host.view()?.state.selection.empty === false;

/** The labels of the element types, which the table's rows and the panel both draw. */
const ELEMENT_LABELS: Readonly<Record<string, string>> = {
  "scene-heading": "Scene Heading",
  action: "Action",
  character: "Character",
  dialogue: "Dialogue",
  parenthetical: "Parenthetical",
  transition: "Transition",
  centered: "Centered Text",
};

/** The caret, where a command that acts at a place is not told where. */
const caretOf = (view: EditorView): number => view.state.selection.head;

/** A command that acts at a place: nothing happens until the manuscript is read. */
function atPlace(
  id: string,
  label: string,
  context: Command["context"],
  can: (state: EditorView["state"], at: number) => boolean,
  make: (at: number) => (state: EditorView["state"], dispatch: EditorView["dispatch"]) => boolean,
): Command {
  return {
    id,
    label,
    context,
    available: (host, at) => {
      const view = host.view();
      return view !== undefined && can(view.state, at);
    },
    run: (host, at) => {
      const view = host.view();
      if (view === undefined) return;
      make(at)(view.state, view.dispatch);
      view.focus();
    },
  };
}

export const COMMANDS: readonly Command[] = [
  // File
  { id: "save", label: "Save Project", icon: Save, chord: { key: "s", mod: true }, menu: { name: "File", group: "save" }, run: (host) => host.save() },
  { id: "save-copy", label: "Save a Copy as Fountain…", icon: FileDown, menu: { name: "File", group: "save" }, run: (host) => host.saveCopy() },
  { id: "export-pdf", label: "Export as PDF…", icon: FileOutput, menu: { name: "File", group: "save" }, run: (host) => host.exportPdf() },
  { id: "to-projects", label: "Open Project", icon: FolderOpen, menu: { name: "File", group: "navigate" }, run: (host) => host.toProjects() },
  // Escape is the shell's: it answers it on every screen (`LEAVE`).
  { id: "to-home", label: "Home", icon: House, chord: { key: "Escape" }, keys: "elsewhere", menu: { name: "File", group: "leave" }, run: (host) => host.toHome() },

  // Edit
  { id: "edit-title-page", label: "Edit Title Page…", icon: FileText, menu: { name: "Edit", group: "title-page" }, run: (host) => host.editTitlePage() },
  { id: "edit-goals", label: "Edit Goals…", icon: Target, menu: { name: "Edit", group: "goals" }, run: (host) => host.editGoals() },
  // Ctrl+K confirms whichever the caret is in; the two items confirm one kind
  // each, and show the same key because it is the same key.
  { id: "confirm-here", label: "Confirm Name or Location", chord: { key: "k", mod: true }, run: (host) => host.confirmHere() },
  { id: "confirm-name", label: "Confirm This Name", icon: UserCheck, sameKeyAs: "confirm-here", menu: { name: "Edit", group: "confirm" }, run: (host) => host.confirmName() },
  { id: "confirm-location", label: "Confirm This Location", icon: MapPin, sameKeyAs: "confirm-here", menu: { name: "Edit", group: "confirm" }, run: (host) => host.confirmLocation() },

  // View
  { id: "view-title-page", label: "View Title Page", icon: Eye, menu: { name: "View", group: "title-page" }, run: (host) => host.viewTitlePage() },
  {
    id: "toggle-spellcheck",
    label: "Spellcheck",
    icon: SpellCheck,
    chord: { key: ";", mod: true },
    menu: { name: "View", group: "spelling" },
    checked: (host) => host.spellcheckOn(),
    run: (host) => host.toggleSpellcheck(),
  },

  // Alt+Enter is heard wherever focus is (the desk design, §2.5).
  { id: "search", label: "Search", chord: { key: "Enter", alt: true }, keys: "window", run: (host) => host.search() },

  // Ctrl+1…7 are the screenplay surface's own keymap, built from the same
  // `NUMBERED_TYPES`: the table knows them for the panel's rows.
  ...NUMBERED_TYPES.map(
    (type, at): Command => ({
      id: `element-${type}`,
      label: ELEMENT_LABELS[type]!,
      chord: { key: String(at + 1), mod: true },
      keys: "elsewhere",
      run: (host) => {
        const view = host.view();
        if (view === undefined) return;
        setElementType(type)(view.state, view.dispatch);
        view.focus();
      },
    }),
  ),

  // The clipboard and selection. The keys are the webview's and the surface's
  // (`clipboard.ts`): the table knows them to draw the hint, and the items
  // reach that same code through the host (ADR-0034).
  { id: "cut", label: "Cut", icon: Scissors, chord: { key: "x", mod: true }, keys: "elsewhere", context: { group: "clipboard" }, available: hasSelection, run: (host) => host.cut() },
  { id: "copy", label: "Copy", icon: Copy, chord: { key: "c", mod: true }, keys: "elsewhere", context: { group: "clipboard" }, available: hasSelection, run: (host) => host.copy() },
  { id: "paste", label: "Paste", icon: ClipboardPaste, chord: { key: "v", mod: true }, keys: "elsewhere", context: { group: "clipboard" }, run: (host) => host.paste() },
  { id: "select-all", label: "Select All", chord: { key: "a", mod: true }, keys: "elsewhere", context: { group: "clipboard" }, run: (host) => host.selectAll() },

  // Dual dialogue (ADR-0037), offered on the paper's right-click menu (ADR-0034).
  atPlace("make-dual-dialogue", "Make Dual Dialogue", { group: "dual-dialogue", contextual: true }, canMakeDualDialogue, makeDualDialogue),
  atPlace("make-normal-dialogue", "Make Normal Dialogue", { group: "dual-dialogue", contextual: true }, canMakeNormalDialogue, makeNormalDialogue),
  atPlace("swap-speakers", "Swap Speakers", { group: "dual-dialogue", contextual: true }, canSwapSpeakers, swapSpeakers),
];

export function commandById(id: string): Command | undefined {
  return COMMANDS.find((command) => command.id === id);
}

/** The command a key press asks for in this place, if it asks for one. */
export function commandForKey(press: KeyPress, place: KeyPlace): Command | undefined {
  return COMMANDS.find(
    (command) =>
      command.chord !== undefined && (command.keys ?? "editor") === place && chordMatches(command.chord, press),
  );
}

/** The hint beside a command — `[Ctrl + S]` — or nothing if it has no key. */
export function hintOf(command: Command): string | undefined {
  const chord = command.chord ?? (command.sameKeyAs === undefined ? undefined : commandById(command.sameKeyAs)?.chord);
  return chord === undefined ? undefined : chordHint(chord);
}

/** Whether running it at `at` (default: the caret) would do anything. */
export function isAvailable(command: Command, host: CommandHost, at?: number): boolean {
  return command.available === undefined || command.available(host, at ?? caretAt(host));
}

/** Run it, at `at` (default: the caret). */
export function runCommand(command: Command, host: CommandHost, at?: number): void {
  command.run(host, at ?? caretAt(host));
}

function caretAt(host: CommandHost): number {
  const view = host.view();
  return view === undefined ? 0 : caretOf(view);
}
