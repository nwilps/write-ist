/**
 * The Notes workspace: plain-text notes, each its own file in the project's
 * `notes/` folder, in tabs (Noah: *"a simplified Windows Notepad"*; several
 * notes, 2026-11-23).
 *
 * What the writer types is what they see and what a note's `.md` file holds —
 * no formatting, no elements, nothing drawn as Markdown. Notes are written in a
 * window floating on the desk, 16:9 like a laptop's screen, that scrolls inside
 * itself rather than growing with the note; in the interface's face rather than
 * the manuscript's (ADR-0030: Courier Prime is the screenplay's and nothing
 * else's); and each note saves itself the way the manuscript does (ADR-0028).
 *
 * Above the window, and never wider than it, is a bar of pills: the **folder**
 * at the left lists every note in the folder (open one, or delete one), the
 * open notes are **tabs** after it — every one the same width, scrolling
 * sideways on a window too narrow for them — and **+** right beside the last
 * tab makes a new one. Double-click the tab in front to rename its note; ×
 * closes a tab and keeps the note. With no tab open the window says so,
 * quietly, and waits.
 *
 * **Six tabs at the most** (`src/notes/tabs.ts`). With six open, + is greyed
 * and so are the closed notes in the folder menu, until a tab is closed; a
 * note already open is still brought forward from the menu, and any note can
 * still be deleted from it. Nothing is said: the grey is the answer.
 *
 * This file is the window's adapter over one **notes session** per open note
 * (`src/notes/notes-session.ts`), which holds the text, the undo history, the
 * spelling pass and the file; the folder and its names are
 * `src/notes/notes-folder.ts`'s. One editing view shows whichever note is in
 * front. It knows nothing of screenplays, and the shell knows nothing of it
 * beyond its manifest (ADR-0005).
 *
 * **It will not come down over a save it could not finish**, as the Editor will
 * not: `unmount` answers `false` and the words stay on screen with the trouble
 * said beside them. Closing a tab is the same: a note that could not save keeps
 * its tab.
 *
 * Where the writer was — which tabs were open, which was in front, and each
 * note's caret and scroll — is kept in `workspace-places.txt` in app data,
 * never in the project (ADR-0009, ADR-0012).
 *
 * **Everything it asks of the application is a toolbox call** (ADR-0045,
 * `docs/WORKSPACES.md`, where Notes is the worked example): its files
 * (`toolbox.files`, which keep it to the notes folder), the writer's place
 * (`toolbox.memory`), the dictionary (`toolbox.spelling`), the pills, its
 * menus and the delete confirm. It imports nothing else of the application's.
 */
import {
  BookPlus,
  ClipboardPaste,
  Copy,
  createElement,
  FileText,
  Folder,
  Plus,
  Redo2,
  Scissors,
  SpellCheck,
  StickyNote,
  Trash2,
  Undo2,
  X,
  type IconNode,
} from "lucide";
import { baseKeymap } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { AllSelection, TextSelection } from "prosemirror-state";
import { DecorationSet, EditorView } from "prosemirror-view";
import { notesSession, type NotesSession } from "../../../../src/notes/notes-session.ts";
import {
  bringInLegacyNotes,
  createNote,
  deleteNote,
  listNotes,
  nameForRename,
  notePath,
  NOTES_FILES,
} from "../../../../src/notes/notes-folder.ts";
import { MOST_OPEN_NOTES, tabsToReopen } from "../../../../src/notes/tabs.ts";
import { sliceOf, textOfSlice } from "../../../../src/notes/text.ts";
import {
  chordHint,
  chordMatches,
  element,
  message,
  type Chord,
  type ContextMenu,
  type FileSaveState,
  type MenuEntry,
  type MenuItem,
  type MountedWorkspace,
  type Project,
  type Toolbox,
  type WorkspaceManifest,
  type WorkspacePlace,
} from "../../toolbox/index.ts";
import "./notes.css";

/** How long the caret rests before its place is kept. Leaving keeps it too. */
const PLACE_REST_MS = 5_000;

/** The workspace's id, which its places in `workspace-places.txt` are kept under. */
const NOTES = "notes";

/** The keys Notes answers itself. The standard ones, as in every editor. */
const KEYS = {
  save: { key: "s", mod: true },
  spellcheck: { key: ";", mod: true },
  contextMenu: { key: "Enter", mod: true, alt: true },
  cut: { key: "x", mod: true },
  copy: { key: "c", mod: true },
  paste: { key: "v", mod: true },
  selectAll: { key: "a", mod: true },
  undo: { key: "z", mod: true },
  redo: { key: "y", mod: true },
} as const satisfies Record<string, Chord>;

/**
 * The webview's own zoom keys. The Editor answers them with its paper's zoom;
 * here they do nothing, rather than zooming the whole window.
 */
const WINDOW_ZOOM: readonly Chord[] = [
  { key: "=", alsoKeys: ["+", "Add"], mod: true },
  { key: "-", alsoKeys: ["Subtract"], mod: true },
  { key: "0", mod: true },
];

/** The Notes manifest. Everything it needs of the application arrives in its toolbox. */
export const notesWorkspace: WorkspaceManifest = {
  id: NOTES,
  name: "Notes",
  key: "2",
  icon: StickyNote,
  // The notes folder, and the old single `notes.md`, which Notes brings into it once.
  files: NOTES_FILES,
  mount: (into, toolbox) => mountNotes(into, toolbox),
};

/** A note open in a tab. */
interface OpenNote {
  name: string;
  readonly session: NotesSession;
  readonly tab: HTMLElement;
  readonly label: HTMLElement;
  /** Where its window was scrolled to, kept while it is behind another tab. */
  scroll: number;
  saved: FileSaveState;
  /** Its word count, for the counts pill when it is in front. */
  status: string;
  /** Its caret and scroll as last kept in app data, so an unchanged place is not written again. */
  kept: string | undefined;
}

function mountNotes(into: HTMLElement, toolbox: Toolbox): MountedWorkspace {
  // --- The window: the bar of pills, and under it the notepad, which is also what scrolls. ---
  const folderPill = element("button", { type: "button", className: "notes-bar__pill notes-bar__folder", ariaLabel: "All Notes" });
  folderPill.append(icon(Folder));
  folderPill.setAttribute("aria-haspopup", "menu");
  const newPill = element("button", { type: "button", className: "notes-bar__pill notes-bar__new", ariaLabel: "New Note" });
  newPill.append(icon(Plus));
  const strip = element("div", { className: "notes-tabs", role: "tablist", ariaLabel: "Open notes" });
  const bar = element("div", { className: "notes-bar" }, [folderPill, strip, newPill]);
  const pad = element("div", { className: "notes" });
  const reading = element("p", { className: "notes__reading", textContent: "Reading your notes…" });
  const empty = element("div", { className: "notes__empty", hidden: true }, [
    element("p", { className: "notes__empty-lead", textContent: "No note open." }),
    element("p", { textContent: "Choose one from the folder, or start a new one with +." }),
  ]);
  pad.append(reading, empty);
  into.replaceChildren(element("div", { className: "notes-desk" }, [element("div", { className: "notes-window" }, [bar, pad])]));

  const open: OpenNote[] = [];
  let active: OpenNote | undefined;
  let view: EditorView | undefined;
  let ready = false;
  let gone = false;
  let hidden = false;
  let contextMenu: ContextMenu | undefined;
  /** The folder menu, apart from the right-click menu: bringing a note forward closes only the latter. */
  let folderList: ContextMenu | undefined;
  /** Spellcheck is the workspace's: on for one note is on for every note brought to the front. */
  let spellingOn = false;
  /** Notes being opened just now, so two quick asks for one note open one tab. */
  const opening = new Map<string, Promise<OpenNote | undefined>>();

  // --- Six tabs at the most: + is greyed while there is no room for another. ---
  /** New notes being made just now, each on its way to a tab. */
  let making = 0;
  /** Every note open in a tab or on its way to one. */
  const taken = (): number => new Set([...open.map((note) => note.name), ...opening.keys()]).size + making;
  const full = (): boolean => taken() >= MOST_OPEN_NOTES;
  const showRoom = (): void => {
    newPill.disabled = full();
  };

  // --- The save pill: the workspace is saved only when every open note is. ---
  const showSaved = (): void => {
    const states = open.map((note) => note.saved);
    toolbox.pills.setSaved(states.includes("saving") ? "saving" : states.includes("unsaved") ? "unsaved" : "saved");
  };

  // --- Where the writer was: the tabs, and each note's caret and scroll, kept in app data. ---
  let tabsKept: string | undefined;
  const keepTabs = async (): Promise<void> => {
    if (!ready) return;
    const place: Record<string, number | string> = { open: open.length };
    open.forEach((note, index) => (place[`tab-${index + 1}`] = note.name));
    if (active !== undefined) place["active"] = active.name;
    const key = JSON.stringify(place);
    if (key === tabsKept) return;
    try {
      if (await toolbox.memory.remember(place)) tabsKept = key;
    } catch {
      // Only which tabs were open, never a word: Notes opens as it can next time.
    }
  };

  let placeRest: ReturnType<typeof setTimeout> | undefined;
  const keepPlace = async (note: OpenNote | undefined): Promise<void> => {
    if (note === undefined) return;
    if (note === active && !hidden) note.scroll = pad.scrollTop;
    const { anchor, head } = note.session.caret();
    const place = { anchor, head, scroll: Math.round(note.scroll) };
    const key = JSON.stringify(place);
    if (key === note.kept) return;
    try {
      if (await toolbox.memory.remember(place, note.name)) note.kept = key;
    } catch {
      // Only where the caret was, never a word: the note opens at the top next time.
    }
  };
  const restPlace = (): void => {
    clearTimeout(placeRest);
    const note = active;
    placeRest = setTimeout(() => void keepPlace(note), PLACE_REST_MS);
  };
  const scrolled = (): void => {
    if (hidden || active === undefined) return;
    active.scroll = pad.scrollTop;
    restPlace();
  };
  pad.addEventListener("scroll", scrolled);

  // --- What the keys and the menu do. ---
  const save = (): void => {
    void active?.session.save();
    view?.focus();
  };
  const toggleSpelling = (): void => {
    if (active === undefined) return;
    void active.session.spelling.toggle();
    view?.focus();
  };
  const viaWebview = (command: "cut" | "copy"): void => {
    if (view === undefined) return;
    view.focus();
    document.execCommand(command);
  };
  const paste = (): void => {
    const target = view;
    if (target === undefined) return;
    void (async () => {
      try {
        const text = await navigator.clipboard.readText();
        target.focus();
        target.dispatch(target.state.tr.replaceSelection(sliceOf(text)).scrollIntoView());
      } catch {
        // The webview may refuse a read that no key press asked for.
        toolbox.report("Write-ist could not read the clipboard from the menu. Press Ctrl+V to paste.");
      }
    })();
  };
  const selectAll = (): void => {
    if (view === undefined) return;
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
    view.focus();
  };
  const undoOrRedo = (which: "undo" | "redo"): void => {
    const writing = active?.session;
    if (writing === undefined) return;
    writing[which]();
    view?.updateState(writing.state);
    view?.focus();
  };

  /** ADR-0034: Write-ist's own right-click menu, never the webview's. */
  let contextAsks = 0;
  const openContext = async (x: number, y: number, at: number, fromKeyboard: boolean): Promise<void> => {
    const ask = ++contextAsks;
    contextMenu?.close(false);
    const items = await menuItems(at);
    if (ask !== contextAsks || gone || view === undefined) return;
    const editing = view;
    contextMenu = toolbox.menus.open({ label: "Edit", items, x, y, fromKeyboard, restoreFocus: () => editing.focus() });
  };
  const menuItems = async (at: number): Promise<MenuEntry[]> => {
    const groups: MenuItem[][] = [];
    const writing = active?.session;
    const wrong = writing?.spelling.at(at);
    if (writing !== undefined && wrong !== undefined) {
      const suggestions = await writing.spelling.suggestions(wrong.word).then(
        (found) => found.slice(0, 5),
        () => [] as string[],
      );
      groups.push([
        ...(suggestions.length === 0
          ? [{ label: "No Suggestions", unavailable: true, act: () => {} }]
          : suggestions.map((text) => ({
              label: text,
              act: () => {
                writing.spelling.replace(wrong, text);
                if (active?.session === writing) view?.updateState(writing.state);
                view?.focus();
              },
            }))),
        {
          label: "Add to Dictionary",
          icon: BookPlus,
          act: () =>
            void writing.spelling.addToDictionary(wrong.word).then(
              () => view?.focus(),
              (error: unknown) => toolbox.report(`Write-ist could not add that word to your dictionary. ${message(error)}`),
            ),
        },
      ]);
    }
    const selected = view !== undefined && !view.state.selection.empty;
    groups.push([
      { label: "Cut", icon: Scissors, hint: chordHint(KEYS.cut), ...(selected ? {} : { unavailable: true }), act: () => viaWebview("cut") },
      { label: "Copy", icon: Copy, hint: chordHint(KEYS.copy), ...(selected ? {} : { unavailable: true }), act: () => viaWebview("copy") },
      { label: "Paste", icon: ClipboardPaste, hint: chordHint(KEYS.paste), act: paste },
      { label: "Select All", hint: chordHint(KEYS.selectAll), act: selectAll },
    ]);
    groups.push([
      { label: "Undo", icon: Undo2, hint: chordHint(KEYS.undo), act: () => undoOrRedo("undo") },
      { label: "Redo", icon: Redo2, hint: chordHint(KEYS.redo), act: () => undoOrRedo("redo") },
    ]);
    if (writing?.spelling.available() === true) {
      groups.push([
        {
          label: "Spellcheck",
          icon: SpellCheck,
          hint: chordHint(KEYS.spellcheck),
          checked: () => active?.session.spelling.isOn() === true,
          act: toggleSpelling,
        },
      ]);
    }
    return groups.flatMap((items, index) => (index === 0 ? items : [{ divider: true as const }, ...items]));
  };
  const openContextAtCaret = (): void => {
    if (view === undefined) return;
    const { empty: nothing, head, to } = view.state.selection;
    const at = nothing ? head : to;
    const where = view.coordsAtPos(at);
    void openContext(where.left, where.bottom, at, true);
  };
  const onContextMenu = (event: MouseEvent): void => {
    // Suppressed whatever happens: the webview's own menu is never wanted here.
    event.preventDefault();
    if (view === undefined || active === undefined || !(event.target instanceof Node) || !view.dom.contains(event.target)) return;
    const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
    const at = found === null ? view.state.selection.head : found.pos;
    // A right-click outside the selection moves the caret there first.
    const { from, to, empty: nothing } = view.state.selection;
    if (found !== null && (nothing || at < from || at > to)) {
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at))));
    }
    void openContext(event.clientX, event.clientY, at, false);
  };
  pad.addEventListener("contextmenu", onContextMenu);
  // The bar has no menu of its own, and never the webview's.
  const quietMenu = (event: MouseEvent): void => event.preventDefault();
  bar.addEventListener("contextmenu", quietMenu);

  // Heard on the way down, wherever focus is, while Notes is on screen.
  const windowKeys = (event: KeyboardEvent): void => {
    if (hidden || document.querySelector("dialog[open]") !== null) return;
    if (WINDOW_ZOOM.some((chord) => chordMatches(chord, event))) event.preventDefault();
  };
  window.addEventListener("keydown", windowKeys, true);

  // File ▸ Edit Project Details is the name pill's, here as in the Editor.
  const stopListeningForDetails = toolbox.details.whenAsked(() => {
    if (!ready || into.querySelector("dialog[open]") !== null) return;
    toolbox.details.edit({ into, carryOut: relocate, closed: () => focus() });
  });

  // --- The editing view: one, showing whichever note is in front. ---
  const viewFor = (note: OpenNote): EditorView => {
    if (view !== undefined) {
      view.updateState(note.session.state);
      return view;
    }
    view = new EditorView(pad, {
      state: note.session.state,
      dispatchTransaction: (transaction) => {
        const writing = active?.session;
        if (writing === undefined || view === undefined) return;
        writing.apply(transaction);
        view.updateState(writing.state);
        if (transaction.docChanged || transaction.selectionSet) restPlace();
      },
      plugins: [
        keymap({
          "Mod-z": () => (undoOrRedo("undo"), true),
          "Mod-y": () => (undoOrRedo("redo"), true),
          "Shift-Mod-z": () => (undoOrRedo("redo"), true),
          // A notepad's Tab types a tab.
          Tab: (state, dispatch) => (dispatch?.(state.tr.insertText("\t")), true),
        }),
        keymap(baseKeymap),
      ],
      handleKeyDown: (_editing, event) => {
        if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey) || chordMatches(KEYS.contextMenu, event)) {
          event.preventDefault();
          openContextAtCaret();
          return true;
        }
        if (chordMatches(KEYS.save, event)) {
          event.preventDefault();
          save();
          return true;
        }
        if (chordMatches(KEYS.spellcheck, event)) {
          event.preventDefault();
          toggleSpelling();
          return true;
        }
        return false;
      },
      // Plain text in, plain text out: what is pasted arrives as the
      // characters it was, never as another program's formatting.
      handlePaste: (editing, event, slice) => {
        const text = event.clipboardData?.getData("text/plain") ?? textOfSlice(slice);
        editing.dispatch(editing.state.tr.replaceSelection(sliceOf(text)).scrollIntoView());
        return true;
      },
      handleDrop: (editing, event, _slice, moved) => {
        if (moved) return false;
        const text = event.dataTransfer?.getData("text/plain") ?? "";
        const found = editing.posAtCoords({ left: event.clientX, top: event.clientY });
        if (text === "" || found === null) return false;
        event.preventDefault();
        const at = TextSelection.near(editing.state.doc.resolve(found.pos));
        editing.dispatch(editing.state.tr.setSelection(at).replaceSelection(sliceOf(text)));
        return true;
      },
      clipboardTextSerializer: textOfSlice,
      clipboardTextParser: (text) => sliceOf(text),
      decorations: () => active?.session.decorations() ?? DecorationSet.empty,
      // The webview's own spellcheck is off: spelling is Write-ist's, on demand.
      attributes: { class: "notes__text", spellcheck: "false", "aria-label": "Note", "aria-multiline": "true" },
    });
    return view;
  };

  // --- Tabs. ---
  /** Put `note` in front: the one it leaves is saved and its place kept. */
  const activate = (note: OpenNote | undefined, { focus: focusIt = true } = {}): void => {
    if (note !== active && active !== undefined) {
      if (!hidden) active.scroll = pad.scrollTop;
      void active.session.save();
      void keepPlace(active);
    }
    clearTimeout(placeRest);
    active = note;
    for (const each of open) {
      each.tab.setAttribute("aria-selected", String(each === note));
      each.tab.tabIndex = each === note ? 0 : -1;
    }
    contextMenu?.close(false);
    if (note === undefined) {
      if (view !== undefined) view.dom.hidden = true;
      empty.hidden = false;
      toolbox.pills.setStatus("");
      toolbox.pills.setSpellcheck(false);
    } else {
      empty.hidden = true;
      const editing = viewFor(note);
      editing.dom.hidden = false;
      if (note.session.spelling.available() && note.session.spelling.isOn() !== spellingOn) void note.session.spelling.toggle();
      toolbox.pills.setSpellcheck(spellingOn && note.session.spelling.available());
      toolbox.pills.setStatus(note.status);
      if (!hidden) pad.scrollTop = note.scroll;
      note.tab.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      if (focusIt && !hidden) editing.focus();
    }
    void keepTabs();
  };

  const tabFor = (name: string): { tab: HTMLElement; label: HTMLElement; close: HTMLButtonElement } => {
    const label = element("span", { className: "notes-tab__name", textContent: name });
    const close = element("button", { type: "button", className: "notes-tab__close", ariaLabel: `Close ${name}` });
    close.tabIndex = -1;
    close.append(icon(X));
    const tab = element("div", { className: "notes-tab", role: "tab" }, [label, close]);
    tab.setAttribute("aria-selected", "false");
    return { tab, label, close };
  };

  /**
   * Open a note in a tab, or bring its tab to the front if it has one.
   * Answers the tab, or `undefined` if the note could not be read — said, and
   * nothing written.
   */
  const openNote = (name: string, { place, focus: focusIt = true, front = true }: { place?: WorkspacePlace | undefined; focus?: boolean; front?: boolean } = {}): Promise<OpenNote | undefined> => {
    const there = open.find((note) => note.name === name);
    if (there !== undefined) {
      if (front) activate(there, { focus: focusIt });
      return Promise.resolve(there);
    }
    const already = opening.get(name);
    if (already !== undefined) return already;
    // No room for another tab: nothing happens, quietly, as the grey said.
    if (full()) return Promise.resolve(undefined);
    const opened = (async (): Promise<OpenNote | undefined> => {
      let read;
      try {
        read = await toolbox.files.read(notePath(name));
      } catch (error) {
        // Words about their file. Nothing was written, because the failure was a read.
        if (!gone) toolbox.report(`Write-ist could not read the note “${name}”, so nothing has been changed. ${message(error)}`);
        return undefined;
      }
      if (gone) return undefined;
      const { tab, label, close } = tabFor(name);
      let note: OpenNote | undefined;
      // The session says its word count as it opens, before the tab holds it.
      let said = "";
      const session = notesSession(
        {
          files: toolbox.files,
          file: notePath(name),
          report: toolbox.report,
          setSaved: (state) => {
            if (note === undefined) return;
            note.saved = state;
            showSaved();
          },
          setStatus: (text) => {
            said = text;
            if (note === undefined) return;
            note.status = text;
            if (note === active) toolbox.pills.setStatus(text);
          },
          setSpellcheck: (on) => {
            if (note !== active) return;
            spellingOn = on;
            toolbox.pills.setSpellcheck(on);
          },
          // The same dictionary as the Editor's spellcheck, and nothing else of it.
          spellEngine: toolbox.spelling.available ? toolbox.spelling : undefined,
          redraw: () => {
            if (note !== undefined && note === active) view?.updateState(note.session.state);
          },
        },
        read,
      );
      const anchor = place?.["anchor"];
      const head = place?.["head"];
      if (typeof anchor === "number") session.select(anchor, typeof head === "number" ? head : anchor);
      const scroll = place?.["scroll"];
      note = {
        name,
        session,
        tab,
        label,
        scroll: typeof scroll === "number" ? scroll : 0,
        saved: "saved",
        status: said,
        kept: place === undefined ? undefined : JSON.stringify({ anchor, head, scroll }),
      };
      const made = note;
      tab.addEventListener("mousedown", (event) => {
        // A press on the tab is not a press on the page: the caret stays where it was.
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      });
      tab.addEventListener("click", (event) => {
        if (event.target instanceof Node && close.contains(event.target)) return;
        if (made.tab.querySelector("input") !== null) return;
        activate(made);
      });
      tab.addEventListener("dblclick", (event) => {
        if (event.target instanceof Node && close.contains(event.target)) return;
        if (made === active) renameInline(made);
      });
      tab.addEventListener("auxclick", (event) => {
        // The middle button closes a tab, as in every tabbed program.
        if (event.button !== 1) return;
        event.preventDefault();
        void closeNote(made);
      });
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        void closeNote(made);
      });
      tab.addEventListener("keydown", (event) => {
        if (event.target !== tab) return;
        if (event.key === "Enter" || event.key === "F2") {
          event.preventDefault();
          if (made === active) renameInline(made);
          else activate(made);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const at = open.indexOf(made) + (event.key === "ArrowLeft" ? -1 : 1);
          const next = open[(at + open.length) % open.length];
          if (next !== undefined) {
            activate(next, { focus: false });
            next.tab.focus();
          }
        }
      });
      open.push(made);
      strip.append(tab);
      showRoom();
      showSaved();
      if (front) activate(made, { focus: focusIt });
      else void keepTabs();
      return made;
    })();
    opening.set(name, opened);
    showRoom();
    void opened.finally(() => {
      opening.delete(name);
      showRoom();
    });
    return opened;
  };

  /** Take a tab away, leaving its note's file as it is. */
  const dropTab = (note: OpenNote): void => {
    const at = open.indexOf(note);
    if (at < 0) return;
    open.splice(at, 1);
    note.tab.remove();
    showRoom();
    showSaved();
    if (note === active) {
      active = undefined;
      activate(open[at] ?? open[at - 1]);
    } else void keepTabs();
  };

  /** × on a tab: save the note, keep its place, close the tab. The file stays in the folder. */
  const closeNote = async (note: OpenNote): Promise<void> => {
    if (note === active && !hidden) note.scroll = pad.scrollTop;
    await keepPlace(note);
    // A note that could not save keeps its tab, with the trouble said.
    if (!(await note.session.leave())) return;
    dropTab(note);
  };

  /** Rename the note in front, typed straight onto its tab. Enter keeps it, Escape leaves it as it was. */
  const renameInline = (note: OpenNote): void => {
    if (note.tab.querySelector("input") !== null) return;
    const input = element("input", { type: "text", className: "notes-tab__rename", value: note.name, autocomplete: "off" });
    input.setAttribute("aria-label", "Note name");
    input.spellcheck = false;
    const size = (): void => void (input.size = Math.max(1, input.value.length));
    size();
    input.addEventListener("input", size);
    note.label.replaceWith(input);
    input.focus();
    input.select();
    let finished = false;
    const finish = (keep: boolean): void => {
      if (finished) return;
      finished = true;
      const typed = input.value;
      input.replaceWith(note.label);
      if (keep) void rename(note, typed);
      if (!hidden) view?.focus();
    };
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        // The rename's, not the window's: Escape here is not Home.
        event.preventDefault();
        finish(false);
      }
    });
  };

  /**
   * Rename a note and its file. What was typed is made safe and, if another
   * note has it, numbered — quietly. If the disk refuses, the note keeps its name.
   */
  const rename = async (note: OpenNote, typed: string): Promise<void> => {
    let to: string;
    try {
      to = await nameForRename(toolbox.files, note.name, typed);
    } catch {
      return;
    }
    if (to === note.name || !open.includes(note)) return;
    const from = note.name;
    try {
      await note.session.moveTo(notePath(to));
    } catch {
      // The file is where it was, under its old name; so is the tab.
      return;
    }
    note.name = to;
    note.label.textContent = to;
    note.tab.querySelector(".notes-tab__close")?.setAttribute("aria-label", `Close ${to}`);
    note.kept = undefined;
    try {
      await toolbox.memory.forget(from, to);
    } catch {
      // Only a place.
    }
    void keepTabs();
  };

  // --- The folder menu: every note in the folder; choose one to open it, or delete it. ---
  let folderAsks = 0;
  const openFolder = async (): Promise<void> => {
    const ask = ++folderAsks;
    let names: string[];
    try {
      names = await listNotes(toolbox.files);
    } catch (error) {
      toolbox.report(`Write-ist could not read this project's notes folder. ${message(error)}`);
      return;
    }
    if (ask !== folderAsks || gone) return;
    // With six tabs open, a closed note is greyed until one closes; an open one is still brought forward.
    const noRoom = full();
    const items: MenuEntry[] =
      names.length === 0
        ? [{ label: "No notes yet", unavailable: true, act: () => {} }]
        : names.map((name) => ({
            label: name,
            icon: FileText,
            ...(noRoom && !open.some((note) => note.name === name) ? { unavailable: true } : {}),
            act: () => void openNote(name),
            aside: { label: `Delete ${name}`, icon: Trash2, alarm: true, act: () => askToDelete(name) },
          }));
    const box = folderPill.getBoundingClientRect();
    folderList?.close(false);
    folderList = toolbox.menus.open({
      label: "Notes",
      items,
      x: box.left,
      y: box.bottom,
      fromKeyboard: folderKeyed,
      restoreFocus: () => folderPill.focus(),
    });
  };
  let folderKeyed = false;
  folderPill.addEventListener("keydown", (event) => {
    folderKeyed = event.key === "Enter" || event.key === " " || event.key === "ArrowDown";
    if (event.key === "ArrowDown") {
      event.preventDefault();
      void openFolder();
    }
  });
  folderPill.addEventListener("click", () => {
    void openFolder();
    folderKeyed = false;
  });

  /** Delete a note, once the writer has said so in the alarm-coloured confirm (`toolbox.dialogs`). */
  const askToDelete = (name: string): void => {
    if (into.querySelector("dialog[open]") !== null) return;
    toolbox.dialogs.confirm({
      label: "Delete Note",
      question: `Delete "${name}"?`,
      lines: ["This permanently deletes the note from your project's notes folder. It cannot be recovered."],
      confirm: "Delete",
      // For good, so in the alarm colour, with Cancel under the writer's hand.
      alarm: true,
      failed: `“${name}” could not be deleted, so it is still in your notes.`,
      act: async () => {
        const note = open.find((each) => each.name === name);
        if (note !== undefined) {
          // Its last words go to disk first, so a delete that fails loses nothing.
          await note.session.save();
          if (note.session.unsaved()) return `“${name}” could not be saved first, so it has not been deleted.`;
          note.session.discard();
          dropTab(note);
        }
        try {
          await deleteNote(toolbox.files, name);
        } catch (error) {
          // Still in the folder, so back in its tab.
          if (note !== undefined) void openNote(name, { focus: false });
          throw error;
        }
        try {
          await toolbox.memory.forget(name);
        } catch {
          // Only a place.
        }
        return undefined;
      },
      closed: () => focus(),
    });
  };

  // --- New notes. ---
  newPill.addEventListener("click", () => {
    if (full()) return;
    making += 1;
    showRoom();
    void (async () => {
      let name: string;
      try {
        name = await createNote(toolbox.files);
      } catch (error) {
        toolbox.report(`Write-ist could not make a new note. ${message(error)}`);
        return;
      } finally {
        making -= 1;
      }
      if (!gone) await openNote(name);
    })().finally(showRoom);
  });

  // The wheel runs along the tabs, which are a row, not a column.
  strip.addEventListener(
    "wheel",
    (event) => {
      const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : 0;
      if (delta === 0) return;
      event.preventDefault();
      strip.scrollLeft += delta;
    },
    { passive: false },
  );

  // --- Opening: the old notes.md brought in, then the tabs as the writer left them. ---
  void (async () => {
    let brought: string | undefined;
    try {
      brought = await bringInLegacyNotes(toolbox.files);
    } catch (error) {
      if (gone) return;
      toolbox.report(
        `Write-ist could not move notes.md into this project's notes folder, so it is where it was and will be tried again. ${message(error)}`,
      );
    }
    let names: string[];
    try {
      names = await listNotes(toolbox.files);
    } catch (error) {
      if (gone) return;
      reading.textContent = "";
      toolbox.report(`Write-ist could not read this project's notes folder, so nothing has been changed. ${message(error)}`);
      return;
    }
    const kept = await toolbox.memory.recall();
    if (gone) return;
    let tabs: string[];
    let front: string | undefined;
    let legacyPlace: WorkspacePlace | undefined;
    if (typeof kept?.["open"] === "number") {
      const count = kept["open"];
      tabs = Array.from({ length: count }, (_, index) => kept[`tab-${index + 1}`]).filter(
        (name): name is string => typeof name === "string" && names.includes(name),
      );
      const wanted = kept["active"];
      front = typeof wanted === "string" && tabs.includes(wanted) ? wanted : tabs[0];
      // Kept before there was a limit: six at the most, the one in front among them.
      tabs = tabsToReopen(tabs, front);
    } else {
      // Never left in tabs: the old notes, brought in just now, or the first note.
      front = brought ?? names[0];
      tabs = front === undefined ? [] : [front];
      // The one notepad's caret and scroll, from before there were tabs, are the old notes'.
      if (brought !== undefined && kept !== undefined && typeof kept["anchor"] === "number") legacyPlace = kept;
    }
    for (const name of tabs) {
      const place = name === front && legacyPlace !== undefined ? legacyPlace : await toolbox.memory.recall(name);
      if (gone) return;
      await openNote(name, { place, front: false });
    }
    if (gone) return;
    reading.remove();
    ready = true;
    const shown = open.find((note) => note.name === front) ?? open[0];
    const focusNow = !hidden && (document.activeElement === null || document.activeElement === document.body);
    activate(shown, { focus: focusNow });
    if (legacyPlace !== undefined && shown !== undefined) void keepPlace(shown);
  })();

  /** A rename of the project waits for every note's save, and moves the folder once. */
  const relocate = (move: () => Promise<Project>): Promise<Project> =>
    open.reduceRight<() => Promise<Project>>((inner, note) => () => note.session.relocate(inner), move)();

  const focus = (): void => {
    if (active !== undefined) view?.focus();
    else folderPill.focus();
  };

  const takeDown = (): void => {
    gone = true;
    clearTimeout(placeRest);
    pad.removeEventListener("contextmenu", onContextMenu);
    pad.removeEventListener("scroll", scrolled);
    bar.removeEventListener("contextmenu", quietMenu);
    window.removeEventListener("keydown", windowKeys, true);
    stopListeningForDetails();
    contextMenu?.close(false);
    folderList?.close(false);
    view?.destroy();
    view = undefined;
  };

  return {
    focus,
    hide: () => {
      if (!hidden && active !== undefined) active.scroll = pad.scrollTop;
      hidden = true;
      contextMenu?.close(false);
      folderList?.close(false);
      // A name being typed is kept, as a click away would keep it.
      (bar.querySelector(".notes-tab__rename") as HTMLInputElement | null)?.blur();
      for (const note of open) void note.session.save();
      void keepPlace(active);
    },
    show: () => {
      hidden = false;
      if (active !== undefined) pad.scrollTop = active.scroll;
      focus();
    },
    relocate,
    unmount: async () => {
      (bar.querySelector(".notes-tab__rename") as HTMLInputElement | null)?.blur();
      // The last save decides: the window comes down only once every note is on disk.
      const left = await Promise.all(open.map((note) => note.session.leave()));
      if (left.includes(false)) return false;
      await keepPlace(active);
      await keepTabs();
      takeDown();
      return true;
    },
  };
}

function icon(node: IconNode): SVGElement {
  const drawn = createElement(node, { class: "notes-bar__icon" });
  drawn.setAttribute("aria-hidden", "true");
  return drawn;
}
