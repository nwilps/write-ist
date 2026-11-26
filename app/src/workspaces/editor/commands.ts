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
 * **A flat table, deliberately.** Each entry stands alone: its own keys, no
 * layers, no modes. Nothing here decides a key by what else is bound; two
 * commands claiming one key in one place is a test failure, not a precedence
 * rule.
 *
 * **The writer's own keys** (Settings ▸ Hotkeys). The table holds
 * each command's own keys; the writer may change the keys of any command that
 * is not `fixed`, and those changes (`useKeyBindings`) are what the key
 * handlers, the menus' hints and the Hotkeys dialog read, live,
 * through `chordsOf`. The standard keys — the clipboard, Undo, Redo, Save and
 * Escape — are fixed, and so are the keys other code answers (the workspace
 * tabs are the shell's). A key one command has is never given to another, nor
 * one of the `RESERVED_KEYS`: Settings refuses it, and says whose it is.
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
  FileOutput,
  FileText,
  FolderOpen,
  House,
  Keyboard,
  MapPin,
  MessageSquareText,
  Pencil,
  Redo2,
  Save,
  Scissors,
  Search,
  Settings,
  SpellCheck,
  Target,
  Undo2,
  Users,
  ZoomIn,
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
import { NUMBERED_TYPES, removePageBreak, setElementType } from "../../../../src/screenplay/element-keys.ts";
import { canRemovePageBreak } from "../../../../src/screenplay/page-break-editing.ts";
import { commentRange } from "../../../../src/screenplay/comment-editing.ts";
import type { NameKind } from "../../../../src/screenplay/names.ts";
import { chordHint, chordMatches, type Chord, type KeyPress } from "../../screens/shortcuts.ts";
import { addedGroups, keysOf, workspaceRows } from "../../shell/hotkeys.ts";
import { NEXT_WORKSPACE, PREVIOUS_WORKSPACE } from "../../shell/workspace-keys.ts";
import { ZOOM_LEVELS } from "./paper-zoom.ts";
import { jumpToScene } from "./scene-jump.ts";

/** What the window does for the Editor: the parts of a command that need a window. */
export interface EditorActions {
  /** Undo and redo: the same commands the keys run, so Add to Dictionary is undone in its turn. */
  readonly undo: () => void;
  readonly redo: () => void;
  readonly save: () => void;
  /** Open the Export As dialog, which offers every format the script can leave in. */
  readonly exportAs: () => void;
  readonly toProjects: () => void;
  /** Open Edit Project Details: the name, type, target page count and workspaces. */
  readonly editProjectDetails: () => void;
  /** Open the Settings dialog, the one Home's `[s]` opens. */
  readonly openSettings: () => void;
  readonly toHome: () => void;
  readonly editTitlePage: () => void;
  readonly viewTitlePage: () => void;
  /** Open the Goals dialog (ADR-0040): the same one the word count and the Goal pill open. */
  readonly editGoals: () => void;
  /** Edit ▸ Character List or Location List: the names autocomplete offers, to add to or remove from. */
  readonly editNameList: (kind: NameKind) => void;
  readonly toggleSpellcheck: () => void;
  /** Whether the spelling pass is on, for the tick beside the item. */
  readonly spellcheckOn: () => boolean;
  /** Draw the paper one level larger or smaller, or back at 100% (`paper-zoom.ts`). */
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly resetZoom: () => void;
  /** Which of the zoom levels the paper is drawn at, smallest first, for View ▸ Zoom's dots. */
  readonly zoomLevel: () => number;
  /** Open the Hotkeys dialog, or close it if it is open. */
  readonly keyboardShortcuts: () => void;
  readonly search: () => void;
  /** Cut, copy, paste and select-all: the same code the keys reach. Where, if anywhere, is the writer's selection. */
  readonly cut: () => void;
  readonly copy: () => void;
  readonly paste: () => void;
  readonly selectAll: () => void;
  /** The misspelt word at a position, if the spelling pass is on and has underlined one there. */
  readonly misspellingAt: (at: number) => Misspelling | undefined;
  /**
   * Open the paper's right-click menu at the caret (the end of a selection),
   * as if the writer had right-clicked there: the Menu key's and Shift+F10's
   * menu (ADR-0034), on a key the writer can change.
   */
  readonly openContextMenu: () => void;
  /** Add Comment: a card over the selection, or the caret's line, ready to type in (`comment-cards.ts`). */
  readonly addComment: () => void;
}

/** A word the spelling pass has underlined, and what can be done about it. */
export interface Misspelling {
  /** The dictionary's, best first. */
  readonly suggestions: () => Promise<readonly string[]>;
  /** Replace the word: one undo step. */
  readonly replace: (text: string) => void;
  /**
   * Make the word right from now on (ADR-0032). On a cue's character name or a
   * heading's location, that name joins this project's list too.
   */
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
  /** The key that asks for it: the first of its own keys, the one a hint shows. */
  readonly chord?: Chord;
  /**
   * More keys of its own that ask for it too, each on its own, with any
   * modifier: Search is Alt+Enter and Ctrl+F. (`alsoKeys`, inside a chord, is
   * another name for the same key under the same modifier.)
   */
  readonly alsoChords?: readonly Chord[];
  /**
   * Its keys are not the writer's to change: the standard ones (the clipboard,
   * Undo, Redo, Save, Escape). Listed in Settings, locked.
   */
  readonly fixed?: true;
  /** Never given a key, and not listed in Settings ▸ Hotkeys (Settings itself). */
  readonly keyless?: true;
  /** The key is another command's: shown beside this one, and answered by that one. */
  readonly sameKeyAs?: string;
  /**
   * The key is one the Editor added through its toolbox (`toolbox.hotkeys`,
   * ADR-0045), under this id: shown beside this one, answered and listed there.
   */
  readonly addedKey?: string;
  /** Where the key is answered. Default `editor`. */
  readonly keys?: KeyPlace;
  /**
   * A held key asks again, as it repeats. Only for a `window` key, which
   * otherwise answers a held key once so a dialog it opens does not flicker.
   */
  readonly repeats?: true;
  /** The application menu that offers it; a rule is drawn where `group` changes. */
  readonly menu?: { readonly name: MenuName; readonly group: string };
  /** Where the Hotkeys dialog lists a command no menu offers. Default Writing. */
  readonly listedUnder?: MenuName;
  /**
   * Drawn in its menu as a row of steps rather than an item (View ▸ Zoom): −
   * and + run the two commands named, and a dot for each step shows which
   * the writer is on. It has no key of its own; the two commands have theirs.
   */
  readonly steps?: {
    readonly less: string;
    readonly more: string;
    readonly count: number;
    readonly at: (host: CommandHost) => number;
  };
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

/** Previous or Next Scene, once the manuscript has been read. */
function toScene(host: CommandHost, direction: -1 | 1): void {
  const view = host.view();
  if (view !== undefined) jumpToScene(view, direction);
}

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
  { id: "save", label: "Save Project", icon: Save, chord: { key: "s", mod: true }, fixed: true, menu: { name: "File", group: "save" }, run: (host) => host.save() },
  { id: "export-as", label: "Export As…", icon: FileOutput, menu: { name: "File", group: "save" }, run: (host) => host.exportAs() },
  { id: "to-projects", label: "Open Project", icon: FolderOpen, menu: { name: "File", group: "project" }, run: (host) => host.toProjects() },
  { id: "edit-project-details", label: "Edit Project Details…", icon: Pencil, menu: { name: "File", group: "project" }, run: (host) => host.editProjectDetails() },
  // No key, by Noah's choice: Home's [s] and this item open it. (Ctrl+, is the
  // usual one, and here it is Previous Scene's.)
  { id: "settings", label: "Settings…", icon: Settings, keyless: true, menu: { name: "File", group: "settings" }, run: (host) => host.openSettings() },
  // Escape is the shell's: it answers it on every screen (`LEAVE`).
  { id: "to-home", label: "Home", icon: House, chord: { key: "Escape" }, keys: "elsewhere", fixed: true, menu: { name: "File", group: "leave" }, run: (host) => host.toHome() },

  // Edit. Undo's keys are the screenplay surface's keymap (`editing.ts`), which
  // runs the same commands; Ctrl+Shift+Z redoes too.
  { id: "undo", label: "Undo", icon: Undo2, chord: { key: "z", mod: true }, keys: "elsewhere", fixed: true, menu: { name: "Edit", group: "undo" }, run: (host) => host.undo() },
  { id: "redo", label: "Redo", icon: Redo2, chord: { key: "y", mod: true }, keys: "elsewhere", fixed: true, menu: { name: "Edit", group: "undo" }, run: (host) => host.redo() },
  { id: "edit-title-page", label: "Edit Title Page…", icon: FileText, menu: { name: "Edit", group: "title-page" }, run: (host) => host.editTitlePage() },
  { id: "edit-goals", label: "Edit Goals…", icon: Target, menu: { name: "Edit", group: "goals" }, run: (host) => host.editGoals() },
  { id: "character-list", label: "Character List", icon: Users, menu: { name: "Edit", group: "names" }, run: (host) => host.editNameList("character") },
  { id: "location-list", label: "Location List", icon: MapPin, menu: { name: "Edit", group: "names" }, run: (host) => host.editNameList("location") },

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
  // Zoom is heard wherever focus is, so the webview never takes the key and
  // zooms the whole window; holding it walks the levels. Ctrl+Shift+= is `+`.
  // View offers the two as the Zoom row's − and +, so they are listed there.
  { id: "zoom-in", label: "Zoom In", chord: { key: "=", alsoKeys: ["+", "Add"], mod: true }, keys: "window", repeats: true, listedUnder: "View", run: (host) => host.zoomIn() },
  { id: "zoom-out", label: "Zoom Out", chord: { key: "-", alsoKeys: ["Subtract"], mod: true }, keys: "window", repeats: true, listedUnder: "View", run: (host) => host.zoomOut() },
  { id: "zoom", label: "Zoom", icon: ZoomIn, steps: { less: "zoom-out", more: "zoom-in", count: ZOOM_LEVELS, at: (host) => host.zoomLevel() }, menu: { name: "View", group: "zoom" }, run: () => {} },
  { id: "reset-zoom", label: "Reset Zoom", icon: Search, chord: { key: "0", mod: true }, keys: "window", menu: { name: "View", group: "zoom" }, run: (host) => host.resetZoom() },
  // Heard wherever focus is, so it closes the dialog it opened as well.
  { id: "keyboard-shortcuts", label: "Hotkeys", icon: Keyboard, chord: { key: "k", mod: true }, keys: "window", menu: { name: "View", group: "shortcuts" }, run: (host) => host.keyboardShortcuts() },

  // The workspace bar's tabs, Alt and each manifest's key, are listed here too,
  // just before these two — read from the registry, not written in this table
  // (`withWorkspaceTabs`), so a workspace added or taken away is listed or not
  // without a line here. The shell answers all of them (`workspace-keys.ts`).
  { id: "previous-workspace", label: "Previous Workspace", chord: PREVIOUS_WORKSPACE, keys: "elsewhere", listedUnder: "View", run: () => {} },
  { id: "next-workspace", label: "Next Workspace", chord: NEXT_WORKSPACE, keys: "elsewhere", listedUnder: "View", run: () => {} },

  // Alt+Enter is heard wherever focus is (the desk design, §2.5), and Ctrl+F
  // too: the key a writer from anywhere else will reach for first (Noah).
  { id: "search", label: "Search", chord: { key: "Enter", alt: true }, alsoChords: [{ key: "f", mod: true }], keys: "window", run: (host) => host.search() },

  // The caret to the previous or next scene heading (`scene-jump.ts`). `<` and
  // `>` are Shift+, and Shift+. on a US keyboard, so either is heard.
  { id: "previous-scene", label: "Previous Scene", chord: { key: "<", alsoKeys: [","], mod: true }, run: (host) => toScene(host, -1) },
  { id: "next-scene", label: "Next Scene", chord: { key: ">", alsoKeys: ["."], mod: true }, run: (host) => toScene(host, 1) },

  // Ctrl+1…7. The Editor answers them, before the screenplay surface's own
  // keymap (built from the same `NUMBERED_TYPES`) would, so the writer's keys
  // for them are the ones that work.
  ...NUMBERED_TYPES.map(
    (type, at): Command => ({
      id: `element-${type}`,
      label: ELEMENT_LABELS[type]!,
      chord: { key: String(at + 1), mod: true },
      run: (host) => {
        const view = host.view();
        if (view === undefined) return;
        setElementType(type)(view.state, view.dispatch);
        view.focus();
      },
    }),
  ),

  // The right-click menu, at the caret, from the keyboard (Noah). The Menu key
  // and Shift+F10 open it too, as a native menu opens (ADR-0034); those two are
  // fixed and the Editor answers them itself, and this one the writer may
  // change. Ctrl with Alt is allowed here because Enter is a named key, never a
  // character AltGr types (`ctrlAltAllowed`).
  { id: "context-menu", label: "Right-Click Menu", chord: { key: "Enter", mod: true, alt: true }, run: (host) => host.openContextMenu() },

  // The clipboard and selection. The keys are the webview's and the surface's
  // (`clipboard.ts`): the table knows them to draw the hint, and the items
  // reach that same code through the host (ADR-0034).
  { id: "cut", label: "Cut", icon: Scissors, chord: { key: "x", mod: true }, keys: "elsewhere", fixed: true, context: { group: "clipboard" }, available: hasSelection, run: (host) => host.cut() },
  { id: "copy", label: "Copy", icon: Copy, chord: { key: "c", mod: true }, keys: "elsewhere", fixed: true, context: { group: "clipboard" }, available: hasSelection, run: (host) => host.copy() },
  { id: "paste", label: "Paste", icon: ClipboardPaste, chord: { key: "v", mod: true }, keys: "elsewhere", fixed: true, context: { group: "clipboard" }, run: (host) => host.paste() },
  { id: "select-all", label: "Select All", chord: { key: "a", mod: true }, keys: "elsewhere", fixed: true, context: { group: "clipboard" }, run: (host) => host.selectAll() },

  // A comment over the selection, or the caret's line (ADR-0018). Its key,
  // Ctrl+M, is the Editor's through its toolbox (`editor.ts`), so it is
  // listed under the Editor and answered wherever focus is but a card.
  {
    id: "add-comment",
    label: "Add Comment",
    icon: MessageSquareText,
    addedKey: "add-comment",
    context: { group: "comment" },
    available: (host, at) => {
      const view = host.view();
      return view !== undefined && commentRange(view.state, at) !== undefined;
    },
    run: (host) => host.addComment(),
  },

  // Dual dialogue (ADR-0037), offered on the paper's right-click menu (ADR-0034).
  atPlace("make-dual-dialogue", "Make Dual Dialogue", { group: "dual-dialogue", contextual: true }, canMakeDualDialogue, makeDualDialogue),
  atPlace("make-normal-dialogue", "Make Normal Dialogue", { group: "dual-dialogue", contextual: true }, canMakeNormalDialogue, makeNormalDialogue),
  atPlace("swap-speakers", "Swap Speakers", { group: "dual-dialogue", contextual: true }, canSwapSpeakers, swapSpeakers),

  // A forced page break, offered where the caret or the click is on its `===`.
  atPlace("remove-page-break", "Remove Page Break", { group: "page-break", contextual: true }, canRemovePageBreak, removePageBreak),
];

/**
 * The table as the Hotkeys lists read it: with a row for each workspace tab's
 * key — `Notes [Alt + 2]`, from the workspaces the application offers now
 * (`hotkeys.ts`, ADR-0045) — just before Previous Workspace. Listed only: the
 * shell answers those keys, and there is nothing for the Editor to run.
 */
export function withWorkspaceTabs(): readonly Command[] {
  const tabs = workspaceRows().map(
    (row): Command => ({ id: row.id, label: row.label, chord: row.chord, keys: "elsewhere", listedUnder: "View", run: () => {} }),
  );
  const at = COMMANDS.findIndex((command) => command.id === "previous-workspace");
  return [...COMMANDS.slice(0, at), ...tabs, ...COMMANDS.slice(at)];
}

export function commandById(id: string): Command | undefined {
  return COMMANDS.find((command) => command.id === id);
}

// --- Keys: the table's, and the writer's -----------------------------------------

/** The writer's own keys, by command id: only the commands whose keys they changed. */
let writersKeys: Readonly<Record<string, readonly Chord[]>> = {};
const keysChanged = new Set<() => void>();

/**
 * Use the writer's own keys from now on (`Settings.keyBindings`), and tell
 * whatever draws a hint. A command not in `bindings`, or whose keys are
 * fixed, keeps its own.
 */
export function useKeyBindings(bindings: Readonly<Record<string, readonly Chord[]>>): void {
  writersKeys = bindings;
  for (const told of keysChanged) told();
}

/** Be told when the writer's keys change. Answers the call that stops it. */
export function whenKeyBindingsChange(told: () => void): () => void {
  keysChanged.add(told);
  return () => keysChanged.delete(told);
}

/** A command's own keys, as the table gives them. */
export function defaultChords(command: Command): readonly Chord[] {
  return command.chord === undefined ? [] : [command.chord, ...(command.alsoChords ?? [])];
}

/** Listed in Settings ▸ Hotkeys: in a menu or with a key, and never Settings itself. */
export function isListed(command: Command): boolean {
  return command.keyless !== true && command.steps === undefined && (command.menu !== undefined || command.chord !== undefined);
}

/**
 * Whether the writer may change its keys: listed, not fixed, and answered by
 * the Editor (a key other code answers — the shell's tabs — is that code's).
 */
export function isRebindable(command: Command): boolean {
  return isListed(command) && command.fixed !== true && command.keys !== "elsewhere";
}

/** Every key that asks for it now: the writer's, where they changed them, else its own. */
export function chordsOf(command: Command): readonly Chord[] {
  return (isRebindable(command) ? writersKeys[command.id] : undefined) ?? defaultChords(command);
}

/** The command a key press asks for in this place, if it asks for one. */
export function commandForKey(press: KeyPress, place: KeyPlace): Command | undefined {
  return COMMANDS.find(
    (command) => (command.keys ?? "editor") === place && chordsOf(command).some((chord) => chordMatches(chord, press)),
  );
}

/**
 * Whether a key press is one of a command's own keys that the writer took
 * away, and that nothing in this place answers now. Swallowed, so the code
 * underneath (the surface's Ctrl+1…7) does not answer it either: a key the
 * writer took away does nothing.
 */
export function keyTakenAway(press: KeyPress, place: KeyPlace): boolean {
  return (
    commandForKey(press, place) === undefined &&
    COMMANDS.some(
      (command) =>
        isRebindable(command) &&
        (command.keys ?? "editor") === place &&
        defaultChords(command).some((chord) => chordMatches(chord, press)),
    )
  );
}

/**
 * Keys that are no command's in the table and are still taken: the menus'
 * access keys and the screenplay surface's own. Never given to a command.
 */
export const RESERVED_KEYS: readonly { readonly label: string; readonly chord: Chord }[] = [
  { label: "File menu", chord: { key: "f", alt: true } },
  { label: "Edit menu", chord: { key: "e", alt: true } },
  { label: "View menu", chord: { key: "v", alt: true } },
  { label: "Bold", chord: { key: "b", mod: true } },
  { label: "Italic", chord: { key: "i", mod: true } },
  { label: "Underline", chord: { key: "u", mod: true } },
  { label: "New element", chord: { key: "Enter", mod: true } },
  { label: "Join with the element before", chord: { key: "Backspace", mod: true } },
  { label: "Join with the element after", chord: { key: "Delete", mod: true } },
];

/**
 * The commands Settings ▸ Hotkeys lists, in table order: each with
 * its own keys, and whether they are locked.
 */
export function shortcutCommands(): readonly {
  readonly id: string;
  readonly label: string;
  readonly defaults: readonly Chord[];
  readonly fixed: boolean;
}[] {
  const own = withWorkspaceTabs()
    .filter(isListed)
    .map((command) => ({
      id: command.id,
      label: command.label,
      defaults: defaultChords(command),
      fixed: !isRebindable(command),
    }));
  // The keys workspaces added through their toolbox, after the table's: theirs, so not the writer's to change here.
  const added = addedGroups().flatMap((group) =>
    // Named by workspace, so two workspaces' keys of one id are two rows.
    group.rows.map((row) => ({ id: `${group.id}-${row.id}`, label: `${row.label} (${group.name})`, defaults: [row.chord], fixed: true })),
  );
  return [...own, ...added];
}

/** Every key the table and the writer have given its commands, for `hotkeys.ts` to refuse to a workspace. */
export function takenKeys(): readonly { readonly label: string; readonly chord: Chord }[] {
  return [...COMMANDS.flatMap((command) => chordsOf(command).map((chord) => ({ label: command.label, chord }))), ...RESERVED_KEYS];
}

/** The hint beside a command — `[Ctrl + S]` — or nothing if it has no key. */
export function hintOf(command: Command): string | undefined {
  const chord =
    command.addedKey !== undefined
      ? keysOf("editor").find((key) => key.id === command.addedKey)?.chord
      : command.sameKeyAs === undefined
        ? chordsOf(command)[0]
        : chordsOf(commandById(command.sameKeyAs) ?? command)[0];
  return chord === undefined ? undefined : chordHint(chord);
}

/** Every hint for a command, one for each key that asks for it: `[Alt + Enter]`, `[Ctrl + F]`. */
export function hintsOf(command: Command): readonly string[] {
  return chordsOf(command).map(chordHint);
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
