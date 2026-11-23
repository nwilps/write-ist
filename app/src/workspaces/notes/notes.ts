/**
 * The Notes workspace: one plain-text notepad per project (Noah: *"a
 * simplified Windows Notepad"*).
 *
 * What the writer types is what they see and what `notes.md` holds — no
 * formatting, no elements, nothing drawn as Markdown. It is written on a sheet
 * the size of the Editor's paper, in the interface's face rather than the
 * manuscript's (ADR-0030: Courier Prime is the screenplay's and nothing
 * else's), and it saves itself the way the manuscript does (ADR-0028).
 *
 * This file is the window's adapter over a **notes session**
 * (`src/notes/notes-session.ts`), which holds the text, the undo history, the
 * spelling pass and the file. It mounts the editing view, hands it each
 * transaction, draws what the session says, and owns the keys and the
 * right-click menu. It knows nothing of screenplays, and the shell knows
 * nothing of it beyond its manifest (ADR-0005).
 *
 * **It will not come down over a save it could not finish**, as the Editor will
 * not: `unmount` answers `false` and the words stay on screen with the trouble
 * said beside them.
 */
import { ClipboardPaste, Copy, BookPlus, Redo2, Scissors, SpellCheck, StickyNote, Undo2 } from "lucide";
import { baseKeymap } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { AllSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { readWorkspaceFile } from "../../../../src/project/workspace-file.ts";
import { NOTES_FILE, notesSession, type NotesSession } from "../../../../src/notes/notes-session.ts";
import type { PlainSpellEngine } from "../../../../src/notes/spelling.ts";
import { sliceOf, textOfSlice } from "../../../../src/notes/text.ts";
import { openContextMenu, type ContextMenu } from "../../menus/context-menu.ts";
import type { MenuEntry, MenuItem } from "../../menus/drop-menu.ts";
import { element } from "../../screens/element.ts";
import { chordHint, chordMatches, type Chord } from "../../screens/shortcuts.ts";
import { message } from "../../screens/trouble.ts";
import type { MountedWorkspace, WorkspaceContext, WorkspaceManifest } from "../../shell/workspace.ts";
import "./notes.css";

/** How long the caret rests before its place is kept. Leaving keeps it too. */
const PLACE_REST_MS = 5_000;

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

export interface NotesDependencies {
  /** The dictionary (the application's, inside it); without one, spellcheck is not offered. */
  readonly spellEngine?: PlainSpellEngine;
}

/** The Notes manifest, given what it needs from the application. */
export function notesManifest(dependencies: NotesDependencies): WorkspaceManifest {
  return {
    id: "notes",
    name: "Notes",
    key: "2",
    icon: StickyNote,
    files: [NOTES_FILE],
    mount: (into, context) => mountNotes(into, context, dependencies),
  };
}

function mountNotes(into: HTMLElement, context: WorkspaceContext, dependencies: NotesDependencies): MountedWorkspace {
  const paper = element("div", { className: "notes" });
  const reading = element("p", { className: "notes__reading", textContent: "Reading your notes…" });
  paper.append(reading);
  into.replaceChildren(element("div", { className: "notes-desk" }, [paper]));

  let session: NotesSession | undefined;
  let view: EditorView | undefined;
  let gone = false;
  let hidden = false;
  let contextMenu: ContextMenu | undefined;
  // A scroll recalled before the sheet could be scrolled to, put back when it can.
  let pendingScroll: number | undefined;
  let lastScroll = 0;

  const scroller = (): HTMLElement | undefined => scrollingAncestor(paper);

  // --- The writer's place: caret and scroll, kept in app data. ---
  let placeRest: ReturnType<typeof setTimeout> | undefined;
  let placeKept: string | undefined;
  const keepPlace = async (): Promise<void> => {
    clearTimeout(placeRest);
    placeRest = undefined;
    const places = context.workspacePlaces();
    if (places === undefined || session === undefined) return;
    const { anchor, head } = session.caret();
    const place = { anchor, head, scroll: Math.round(lastScroll) };
    const key = JSON.stringify(place);
    if (key === placeKept) return;
    try {
      await places.remember(context.project.marker.projectId, "notes", place);
      placeKept = key;
    } catch {
      // Only where the caret was, never a word: Notes opens at the top next time.
    }
  };
  const restPlace = (): void => {
    clearTimeout(placeRest);
    placeRest = setTimeout(() => void keepPlace(), PLACE_REST_MS);
  };
  const scrolled = (): void => {
    const at = scroller();
    if (hidden || at === undefined) return;
    lastScroll = at.scrollTop;
    restPlace();
  };
  document.addEventListener("scroll", scrolled, true);

  // --- What the keys and the menu do. ---
  const save = (): void => {
    void session?.save();
    view?.focus();
  };
  const toggleSpelling = (): void => {
    void session?.spelling.toggle();
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
        context.report("Write-ist could not read the clipboard from the menu. Press Ctrl+V to paste.");
      }
    })();
  };
  const selectAll = (): void => {
    if (view === undefined) return;
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
    view.focus();
  };
  const undoOrRedo = (which: "undo" | "redo"): void => {
    session?.[which]();
    if (session !== undefined) view?.updateState(session.state);
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
    contextMenu = openContextMenu({ label: "Edit", items, x, y, fromKeyboard, restoreFocus: () => editing.focus() });
  };
  const menuItems = async (at: number): Promise<MenuEntry[]> => {
    const groups: MenuItem[][] = [];
    const writing = session;
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
                view?.updateState(writing.state);
                view?.focus();
              },
            }))),
        {
          label: "Add to Dictionary",
          icon: BookPlus,
          act: () =>
            void writing.spelling.addToDictionary(wrong.word).then(
              () => view?.focus(),
              (error: unknown) => context.report(`Write-ist could not add that word to your dictionary. ${message(error)}`),
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
          checked: () => session?.spelling.isOn() === true,
          act: toggleSpelling,
        },
      ]);
    }
    return groups.flatMap((items, index) => (index === 0 ? items : [{ divider: true as const }, ...items]));
  };
  const openContextAtCaret = (): void => {
    if (view === undefined) return;
    const { empty, head, to } = view.state.selection;
    const at = empty ? head : to;
    const where = view.coordsAtPos(at);
    void openContext(where.left, where.bottom, at, true);
  };
  const onContextMenu = (event: MouseEvent): void => {
    // Suppressed whatever happens: the webview's own menu is never wanted here.
    event.preventDefault();
    if (view === undefined) return;
    const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
    const at = found === null ? view.state.selection.head : found.pos;
    // A right-click outside the selection moves the caret there first.
    const { from, to, empty } = view.state.selection;
    if (found !== null && (empty || at < from || at > to)) {
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at))));
    }
    void openContext(event.clientX, event.clientY, at, false);
  };
  paper.addEventListener("contextmenu", onContextMenu);

  // Heard on the way down, wherever focus is, while Notes is on screen.
  const windowKeys = (event: KeyboardEvent): void => {
    if (hidden || document.querySelector("dialog[open]") !== null) return;
    if (WINDOW_ZOOM.some((chord) => chordMatches(chord, event))) event.preventDefault();
  };
  window.addEventListener("keydown", windowKeys, true);

  // File ▸ Edit Project Details is the name pill's, here as in the Editor.
  const stopListeningForDetails = context.whenDetailsAsked(() => {
    if (session === undefined || into.querySelector("dialog[open]") !== null) return;
    context.editProjectDetails({ into, carryOut: session.relocate, closed: () => view?.focus() });
  });

  void (async () => {
    try {
      const [read, place] = await Promise.all([
        readWorkspaceFile(context.filesystem, context.project, NOTES_FILE),
        recallPlace(context),
      ]);
      if (gone) return;
      const writing = notesSession(
        {
          filesystem: context.filesystem,
          project: context.project,
          report: context.report,
          setSaved: context.setSaved,
          setStatus: context.setStatus,
          setSpellcheck: context.setSpellcheck,
          whenSwitchedAway: context.whenSwitchedAway,
          whenSwitchedBack: context.whenSwitchedBack,
          spellEngine: dependencies.spellEngine,
          redraw: () => view?.updateState(writing.state),
        },
        read,
      );
      session = writing;
      reading.remove();
      if (place !== undefined) {
        writing.select(place["anchor"] ?? 0, place["head"] ?? place["anchor"] ?? 0);
        placeKept = JSON.stringify({ anchor: place["anchor"], head: place["head"], scroll: place["scroll"] });
      }
      view = new EditorView(paper, {
        state: writing.state,
        dispatchTransaction: (transaction) => {
          writing.apply(transaction);
          view?.updateState(writing.state);
          if (transaction.docChanged || transaction.selectionSet) restPlace();
        },
        plugins: [
          keymap({
            "Mod-z": () => (writing.undo(), view?.updateState(writing.state), true),
            "Mod-y": () => (writing.redo(), view?.updateState(writing.state), true),
            "Shift-Mod-z": () => (writing.redo(), view?.updateState(writing.state), true),
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
        decorations: () => writing.decorations(),
        // The webview's own spellcheck is off: spelling is Write-ist's, on demand.
        attributes: { class: "notes__text", spellcheck: "false", "aria-label": "Notes", "aria-multiline": "true" },
      });
      const editing = view;
      const at = scroller();
      if (!hidden && at !== undefined && place?.["scroll"] !== undefined) at.scrollTop = place["scroll"];
      else if (place?.["scroll"] !== undefined) pendingScroll = place["scroll"];
      lastScroll = place?.["scroll"] ?? 0;
      const active = document.activeElement;
      if (!hidden && (active === null || active === document.body)) editing.focus();
    } catch (error) {
      if (gone) return;
      reading.textContent = "";
      // Words about their file. Nothing was written, because the failure was a read.
      context.report(`Write-ist could not read this project's notes, so nothing has been changed. ${message(error)}`);
    }
  })();

  const takeDown = (): void => {
    gone = true;
    clearTimeout(placeRest);
    paper.removeEventListener("contextmenu", onContextMenu);
    document.removeEventListener("scroll", scrolled, true);
    window.removeEventListener("keydown", windowKeys, true);
    stopListeningForDetails();
    contextMenu?.close(false);
    view?.destroy();
    view = undefined;
  };

  return {
    focus: () => view?.focus(),
    hide: () => {
      const at = scroller();
      if (at !== undefined && !hidden) lastScroll = at.scrollTop;
      hidden = true;
      contextMenu?.close(false);
      void session?.save();
      void keepPlace();
    },
    show: () => {
      hidden = false;
      const at = scroller();
      if (pendingScroll !== undefined && at !== undefined) {
        at.scrollTop = pendingScroll;
        pendingScroll = undefined;
      }
      view?.focus();
    },
    relocate: (move) => (session === undefined ? move() : session.relocate(move)),
    unmount: async () => {
      if (session === undefined) {
        takeDown();
        return true;
      }
      // The last save decides: the sheet comes down only once the notes are on disk.
      if (!(await session.leave())) return false;
      await keepPlace();
      takeDown();
      session = undefined;
      return true;
    },
  };
}

/** Where Notes was left in this project, or `undefined`. */
async function recallPlace(context: WorkspaceContext): Promise<Readonly<Record<string, number>> | undefined> {
  try {
    return await context.workspacePlaces()?.recall(context.project.marker.projectId, "notes");
  } catch {
    return undefined;
  }
}

/** The nearest element above this one that scrolls up and down. */
function scrollingAncestor(from: HTMLElement): HTMLElement | undefined {
  const window = from.ownerDocument.defaultView;
  for (let at = from.parentElement; at !== null && window !== null; at = at.parentElement) {
    if (/auto|scroll/.test(window.getComputedStyle(at).overflowY)) return at;
  }
  return undefined;
}
