/**
 * The Editor workspace: the manuscript, on the paper, and written into (#39,
 * #41).
 *
 * `GLOSSARY.md`: *the workspace the in-progress draft is written in, running the
 * project's surface. A workspace like any other, not a frame around the
 * others.* So this is the only file in the application that knows the project
 * runs on the screenplay surface — the shell hosting it does not, which is
 * ADR-0005's seam and what `test/app/shell-knows-nothing.test.ts` holds.
 *
 * **The paper is the spike's** (`nwilps/write-ist-ng`, `spike/src/style.css`): a
 * single sheet, centred on the dark ground, at the page width and margins it
 * sets. The furniture around it is the shell's.
 *
 * ## What this file does and does not do
 *
 * It is the window's adapter over a **manuscript session**
 * (`src/project/manuscript-session.ts`). The session holds the model and
 * decides everything — the layout and seams, the name lists, saving, leaving,
 * the ledger, confirming a name — and is reached by tests with no window at
 * all. This file mounts the ProseMirror view, hands each transaction to the
 * session, draws what the session says to draw, and owns the dialogs and the
 * keys. What is left is the window, which is seam 4, checked by the writer
 * writing in it.
 *
 * ## Why the view is told and is not the holder
 *
 * The session holds the state, so **the thing the save routine reads is not the
 * view**: ADR-0024 and #37 both require the manuscript to be produced by the
 * serialiser from the model, *never* from ProseMirror's own format and never
 * from the DOM.
 *
 * ## It will not come down over a save it could not finish
 *
 * `unmount` answers whether the workspace came down, and answers `false` when
 * the last save failed. The words are still on screen and nowhere else, so
 * destroying the view would destroy them — the silent destruction ADR-0008 was
 * written from, arrived at by a different road. The session says what happened
 * beside the paper, which is still up, and the writer can try again.
 */
import { PenLine } from "lucide";
import { Selection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { EXPORT_FORMATS, exportScript } from "../../../../src/project/export-formats.ts";
import { MANUSCRIPT_FILE } from "../../../../src/project/bundle.ts";
import type { CourierPrimeFaces } from "../../../../src/pdf/render.ts";
import {
  manuscriptSession,
  readManuscript,
  type ManuscriptSession,
} from "../../../../src/project/manuscript-session.ts";
import { printedPageCount } from "../../../../src/screenplay/pdf-pages.ts";
import { hiddenTitlePage, setTitlePage, titlePageOf } from "../../../../src/screenplay/title-page-editing.ts";
import { pasteInto } from "../../../../src/screenplay/clipboard.ts";
import { caretPlaceOf, selectionAtPlace, type CaretPlace } from "../../../../src/screenplay/caret-place.ts";
import { commandForKey, keyTakenAway, runCommand, type CommandHost } from "./commands.ts";
import { contextMenuItems } from "./context-menu-items.ts";
import { openContextMenu, type ContextMenu } from "../../menus/context-menu.ts";
import { editorMenus } from "./menus.ts";
import { sidePanels } from "./panels.ts";
import { drawOffer, placeOffer } from "./autocomplete-draw.ts";
import { placeOnBreak } from "../../../../src/screenplay/page-break-editing.ts";
import { formattingOf, readDetails } from "../../../../src/project/details.ts";
import { formattingAttributes } from "./paper-formatting.ts";
import { openNameListDialog } from "./name-list-dialog.ts";
import type { NameKind } from "../../../../src/screenplay/names.ts";
import { DEFAULT_FORMATTING, type Formatting } from "../../../../src/screenplay/formatting.ts";
import { drawSheetBreak } from "./sheet-break.ts";
import { caretFromMargins } from "./margin-click.ts";
import { caretScrolling, centrePaper, holdCaretWhile, measureCaretRoom, scrollCaretIntoView, scrollerOf } from "./caret-margin.ts";
import { centreCaretLine } from "./caret-centre.ts";
import {
  drawPaperZoom,
  measureZoomRoom,
  paperZoomLevel,
  setPaperZoomLevel,
  zoomedIn,
  zoomedOut,
  zoomScales,
  ZOOM_DEFAULT,
} from "./paper-zoom.ts";
import { openExportDialog } from "./export-dialog.ts";
import { openGoalsDialog } from "./goals-dialog.ts";
import { openKeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog.ts";
import { openTitlePageDialog } from "./title-page-dialog.ts";
import { openSearch, type SearchDialog } from "./search-dialog.ts";
import { element } from "../../screens/element.ts";
import { tauriSpellEngine } from "../../spell-tauri.ts";
import { message } from "../../screens/trouble.ts";
import { isCapturedKey } from "../../screens/shortcuts.ts";
import type {
  MountedWorkspace,
  WorkspaceContext,
  WorkspaceManifest,
} from "../../shell/workspace.ts";
/** How often the Goal pill looks at the clock, to notice the day has turned over. */
const GOAL_REFRESH_MS = 60_000;
/**
 * How long the caret rests before its place is kept, so a crash costs at most
 * this much of where the writer was. Leaving the project keeps it too.
 */
const PLACE_REST_MS = 5_000;

export const editorWorkspace: WorkspaceManifest = {
  id: "editor",
  name: "Editor",
  // The Editor is the workspace bar's first tab, as it is in the prototype.
  // Notes and Plan sit beside it as temporary placeholders
  // (`../placeholders.ts`): selecting one leaves the Editor where it is.
  key: "1",
  icon: PenLine,
  // The manuscript is written here, so a project always has it.
  alwaysOn: true,
  files: [MANUSCRIPT_FILE],
  mount,
};

function mount(into: HTMLElement, context: WorkspaceContext): MountedWorkspace {
  const page = element("div", { className: "page" });
  const reading = element("p", {
    className: "page__reading",
    textContent: "Reading your screenplay…",
  });
  page.append(reading);
  // Until the manuscript has been read there is nothing to do with it, and
  // each of these asked for then is rightly nothing. The menus are built
  // before the manuscript is read, so they reach it through the session.
  let session: ManuscriptSession | undefined;
  let view: EditorView | undefined;
  // The project's own formatting, read with the manuscript; as until now until then.
  let formatting: Formatting = DEFAULT_FORMATTING;
  let gone = false;
  let searching: SearchDialog | undefined;
  let stopListeningForSearch: (() => void) | undefined;
  let fitCaretRoom: (() => void) | undefined;

  // View ▸ Zoom: the paper drawn at the level this run of the app last left it
  // (`paper-zoom.ts`), its size measured from the window as it is now, and
  // again whenever the window changes size. The caret's line stays where it
  // was in the window, the paper is centred across it (never following the
  // caret sideways), and the room kept around the caret is measured again at
  // the new size.
  const root = into.ownerDocument.documentElement;
  let scale = 1;
  const drawZoom = (): void => {
    scale = zoomScales(measureZoomRoom(root, scrollerOf(page)))[paperZoomLevel()] ?? 1;
    drawPaperZoom(root, scale);
    fitCaretRoom?.();
  };
  const redrawZoom = (): void => {
    if (view === undefined) drawZoom();
    else holdCaretWhile(view, drawZoom);
    const scroller = scrollerOf(page);
    if (scroller !== undefined) centrePaper(page, scroller);
  };
  const zoomTo = (level: number): void => {
    setPaperZoomLevel(level);
    redrawZoom();
  };

  const startSearch = (): void => {
    if (searching !== undefined || session === undefined || view === undefined) return;
    // The window hears Alt+Enter first, and the screen behind a dialog hears nothing.
    if (into.querySelector("dialog[open]") !== null) return;
    const writing = session;
    // Alt+Enter asks to search (the desk design, §2.5), wherever focus is.
    searching = openSearch(into, {
      doc: () => writing.state.doc,
      pageOf: (index) => writing.layout.pagination.pageOfElement[index],
      // A result is a jump: its line in the middle of the window (`caret-centre.ts`).
      jump: ({ from, to }) => {
        if (view === undefined) return;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
        centreCaretLine(view);
      },
      closed: () => {
        searching = undefined;
        view?.focus();
      },
    });
  };

  // ADR-0034: the right-click menu is Write-ist's own. Cut, Copy and Select All
  // ask the webview to do what the key does (so the same clipboard code runs),
  // and Paste reads the clipboard and goes through the same `pasteInto` as Ctrl+V.
  const viaWebview = (command: "cut" | "copy" | "selectAll"): void => {
    if (view === undefined) return;
    view.focus();
    document.execCommand(command);
  };
  // Edit ▸ Undo and Redo run what Ctrl+Z and Ctrl+Y run, Add to Dictionary's steps included.
  const undoOrRedo = (which: "undo" | "redo"): void => {
    const writing = session;
    const editing = view;
    if (writing === undefined || editing === undefined) return;
    writing[which](editing.state, editing.dispatch, editing);
    editing.focus();
  };
  const pasteFromClipboard = (): void => {
    const target = view;
    if (target === undefined) return;
    void (async () => {
      try {
        const incoming = await readClipboard();
        target.focus();
        pasteInto(target, incoming);
      } catch {
        // The webview may refuse a read that no key press asked for.
        context.report("Write-ist could not read the clipboard from the menu. Press Ctrl+V to paste.");
      }
    })();
  };

  let contextMenu: ContextMenu | undefined;
  let contextAsks = 0;
  /** Open the right-click menu at a point of the window, for a position of the manuscript. */
  const openContext = async (x: number, y: number, at: number, fromKeyboard: boolean): Promise<void> => {
    const ask = ++contextAsks;
    contextMenu?.close(false);
    const items = await contextMenuItems(host, at);
    // A newer right-click, or leaving, came while the dictionary was answering.
    if (ask !== contextAsks || gone || view === undefined) return;
    const editing = view;
    contextMenu = openContextMenu({
      label: "Edit",
      items,
      x,
      y,
      fromKeyboard,
      restoreFocus: () => editing.focus(),
    });
  };
  /**
   * The right-click menu as if the writer had right-clicked at the caret, or at
   * the end of a selection, which stays for Cut and Copy: the Menu key's,
   * Shift+F10's and Ctrl+Alt+Enter's, with the first item lit.
   */
  const openContextAtCaret = (): void => {
    if (view === undefined || session === undefined) return;
    const { empty, head, to } = view.state.selection;
    const at = empty ? head : to;
    const where = view.coordsAtPos(at);
    void openContext(where.left, where.bottom, at, true);
  };
  const onContextMenu = (event: MouseEvent): void => {
    // Suppressed whatever happens: the webview's own menu is never wanted here.
    event.preventDefault();
    if (view === undefined || session === undefined) return;
    const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
    const at = found === null ? view.state.selection.head : placeOnBreak(view.state.doc, found);
    // As in any editor, a right-click outside the selection moves the caret
    // there first, so the menu acts on what was pointed at; inside it, the
    // selection stays for Cut and Copy.
    const { from, to, empty } = view.state.selection;
    if (found !== null && (empty || at < from || at > to)) {
      view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(at))));
    }
    void openContext(event.clientX, event.clientY, at, false);
  };
  page.addEventListener("contextmenu", onContextMenu);
  // A click in the paper's left or right margin: the caret to that line's start or end.
  const stopMarginClicks = caretFromMargins(page, () => view);

  const toggleSpelling = (): void => {
    if (session === undefined || view === undefined) return;
    session.spellcheck.toggle(view);
    view.focus();
  };

  const saveNow = (): void => {
    void session?.save();
    view?.focus();
  };

  // Every export, in one dialog. Each is a finished-product file outside the
  // bundle, read from the model as it is *now* and nowhere near the save
  // routine, so an unsaved edit is in the file and nothing is saved as a side
  // effect. Cancelling writes nothing; success is silent (ADR-0031).
  const exportAs = (): void => {
    if (session === undefined || view === undefined || into.querySelector("dialog[open]") !== null) return;
    const writing = session;
    openExportDialog(into, {
      formats: EXPORT_FORMATS,
      pageCount: () => printedPageCount(writing.manuscript(), formatting),
      write: (format, range) =>
        exportScript(format, {
          filesystem: context.filesystem,
          project: context.project,
          places: context,
          document: writing.manuscript,
          faces: courierPrimeFaces,
          range,
          formatting,
        }),
      report: context.report,
      closed: () => view?.focus(),
    });
  };

  // Step 4 and 6: the title page is edited in a form and viewed as it
  // prints; it is never on the paper. Save is one transaction, so autosave
  // sees it as any edit and Undo takes it back in one step.
  const openTitlePage = (opensOn: "edit" | "view"): void => {
    if (session === undefined || view === undefined || into.querySelector("dialog[open]") !== null) return;
    const writing = session;
    openTitlePageDialog(into, {
      titlePage: titlePageOf(writing.state.doc),
      save: (titlePage) => view?.dispatch(setTitlePage(writing.state, titlePage)),
      closed: () => view?.focus(),
      opensOn,
    });
  };
  // ADR-0040: the Goals dialog, from the Edit menu, the counts pill or the Goal
  // pill. It changes the goals as the writer chooses, so there is nothing to save.
  const editGoals = (): void => {
    if (session === undefined || view === undefined || into.querySelector("dialog[open]") !== null) return;
    const writing = session;
    openGoalsDialog(into, {
      view: writing.goalsView,
      setDaily: writing.setDailyGoal,
      startSprint: writing.startSprint,
      endSprint: writing.endSprint,
      closed: () => view?.focus(),
    });
  };
  const stopListeningForGoals = context.whenGoalsAsked(editGoals);
  // Edit ▸ Character List and Location List: the names autocomplete offers.
  // Adding and removing say nothing; the list redrawn is the answer.
  const editNameList = (kind: NameKind): void => {
    if (session === undefined || view === undefined || into.querySelector("dialog[open]") !== null) return;
    const writing = session;
    openNameListDialog(into, {
      title: kind === "character" ? "Character List" : "Location List",
      noun: kind,
      names: () => writing.nameList(kind),
      add: (name) => writing.addName(kind, name),
      remove: (name) => writing.removeName(kind, name),
      closed: () => view?.focus(),
    });
  };
  // View ▸ Hotkeys and Ctrl+K: the key that opens it closes it, and
  // it never opens over another dialog.
  let shortcuts: HTMLDialogElement | undefined;
  const keyboardShortcuts = (): void => {
    if (shortcuts !== undefined) {
      shortcuts.close();
      return;
    }
    if (searching !== undefined || into.querySelector("dialog[open]") !== null) return;
    shortcuts = openKeyboardShortcutsDialog(into, {
      closed: () => {
        shortcuts = undefined;
        view?.focus();
      },
    });
  };
  // File ▸ Edit Project Details… and a click on the name pill. The session fits a
  // rename's move between its writes; the paper, the caret and the undo history
  // stay as they are.
  const editProjectDetails = (): void => {
    if (session === undefined || view === undefined || into.querySelector("dialog[open]") !== null) return;
    context.editProjectDetails({ into, carryOut: session.moveProject, closed: () => view?.focus() });
  };
  const stopListeningForDetails = context.whenDetailsAsked(editProjectDetails);
  // File ▸ Settings…: the application's, over the paper, never over another dialog.
  const openSettings = (): void => {
    if (searching !== undefined || into.querySelector("dialog[open]") !== null) return;
    context.openSettings({ into, closed: () => view?.focus() });
  };
  // The day turns over without a keystroke: the pill is refreshed each minute.
  const goalClock = setInterval(() => session?.showGoal(), GOAL_REFRESH_MS);
  // Where the caret is, kept in app data so reopening the project puts the
  // writer back there (`src/project/places.ts`). After a rest, and on leaving.
  let placeRest: ReturnType<typeof setTimeout> | undefined;
  let placeKept: string | undefined;
  const keepPlace = async (): Promise<void> => {
    clearTimeout(placeRest);
    placeRest = undefined;
    const places = context.places();
    if (places === undefined || session === undefined) return;
    const place = caretPlaceOf(session.state.doc, session.state.selection.head);
    if (place === undefined) return;
    const key = JSON.stringify(place);
    if (key === placeKept) return;
    try {
      await places.remember(context.project.marker.projectId, place);
      placeKept = key;
    } catch {
      // Only where the caret was, never a word: the project opens at the top
      // of its script next time, and the file that would not read is left as
      // it was rather than written over.
    }
  };
  const restPlace = (): void => {
    clearTimeout(placeRest);
    placeRest = setTimeout(() => void keepPlace(), PLACE_REST_MS);
  };

  // What the command table (`commands.ts`) runs against: the menus, the keys
  // and the panels all go through it.
  const host: CommandHost = {
    save: saveNow,
    exportAs,
    toProjects: context.leave.toProjects,
    editProjectDetails,
    openSettings,
    toHome: context.leave.toHome,
    editTitlePage: () => openTitlePage("edit"),
    viewTitlePage: () => openTitlePage("view"),
    editGoals,
    editNameList,
    toggleSpellcheck: toggleSpelling,
    spellcheckOn: () => view !== undefined && session?.spellcheck.isOn(view.state) === true,
    zoomIn: () => zoomTo(zoomedIn(paperZoomLevel())),
    zoomOut: () => zoomTo(zoomedOut(paperZoomLevel())),
    resetZoom: () => zoomTo(ZOOM_DEFAULT),
    zoomLevel: paperZoomLevel,
    keyboardShortcuts,
    search: startSearch,
    cut: () => viaWebview("cut"),
    copy: () => viaWebview("copy"),
    paste: pasteFromClipboard,
    selectAll: () => viaWebview("selectAll"),
    undo: () => undoOrRedo("undo"),
    redo: () => undoOrRedo("redo"),
    openContextMenu: openContextAtCaret,
    misspellingAt: (at) => {
      const writing = session;
      const editing = view;
      const issue = writing !== undefined && editing !== undefined ? writing.spellcheck.issueAt(editing.state, at) : undefined;
      if (writing === undefined || editing === undefined || issue === undefined) return undefined;
      return {
        suggestions: async () => (await writing.spellcheck.suggestionsAt(editing.state, at)).map((offered) => offered.text),
        replace: (text) => {
          writing.spellcheck.replaceWord(editing, issue, text);
          editing.focus();
        },
        addToDictionary: () => {
          // On a cue's name or a heading's location, the name joins its list too.
          void writing.addToDictionary(editing, issue).then(
            () => editing.focus(),
            (error: unknown) =>
              context.report(`Write-ist could not add that word to your dictionary. ${message(error)}`),
          );
        },
      };
    },
    view: () => view,
  };

  // The paper with a column of panels either side (the desk design, §2.2).
  const panels = sidePanels(startSearch, editorMenus(host));
  // After every change of state: the panels, and the spellcheck pill, which
  // shows only while the pass is on — however it was turned on or off.
  const shown = (writing: ManuscriptSession): void => {
    panels.update(writing.state);
    context.setSpellcheck(writing.spellcheck.isOn(writing.state));
  };
  into.replaceChildren(element("div", { className: "desk" }, [panels.left, page, panels.right]));
  drawZoom();
  window.addEventListener("resize", redrawZoom);
  // The paper never scrolls sideways (`centrePaper`): whatever moved the window
  // across, it goes straight back. A scroll does not bubble, so it is heard on
  // the way down, from whichever window the paper is in.
  const holdCentred = (event: Event): void => {
    const scroller = scrollerOf(page);
    if (scroller !== undefined && event.target === scroller) centrePaper(page, scroller);
  };
  document.addEventListener("scroll", holdCentred, true);

  void (async () => {
    try {
      const [read, place, details] = await Promise.all([
        readManuscript(context.filesystem, context.project, context.report),
        recallPlace(context),
        // The project's own formatting (`details.md`); never throws.
        readDetails(context.filesystem, context.project.path),
      ]);
      // Closed while the file was being read. A view mounted now would be a
      // view nobody takes down.
      if (gone) return;
      formatting = formattingOf(details.details);

      const writing = manuscriptSession(
        {
          filesystem: context.filesystem,
          project: context.project,
          report: context.report,
          setSaved: context.setSaved,
          setStatus: context.setStatus,
          setGoal: context.setGoal,
          ledger: context.ledger,
          whenSwitchedAway: context.whenSwitchedAway,
          whenSwitchedBack: context.whenSwitchedBack,
          spellEngine: tauriSpellEngine,
          drawSeam: drawSheetBreak,
          drawOffer,
          placeOffer,
          formatting,
          reloaded: (spellingWasOn) => {
            view?.updateState(writing.state);
            if (spellingWasOn && view !== undefined) writing.spellcheck.setOn(view, true);
            shown(writing);
          },
        },
        read,
      );
      session = writing;
      reading.remove();

      // Back where the writer left the caret, if that place is still in this
      // script; otherwise the top of the script, where the session started it.
      const resumed = place === undefined ? undefined : selectionAtPlace(writing.state.doc, place);
      if (resumed !== undefined) writing.apply(writing.state.tr.setSelection(resumed));
      placeKept = place === undefined ? undefined : JSON.stringify(place);

      // #48 / #49 — page count from the model, never the DOM. Open and reload
      // take a full paginate; each edit re-packs from the affected page onward.
      view = new EditorView(page, {
        state: writing.state,
        dispatchTransaction: (transaction) => {
          writing.apply(transaction);
          view?.updateState(writing.state);
          shown(writing);
          if (transaction.docChanged || transaction.selectionSet) restPlace();
        },
        // The explicit save ADR-0028 pairs with autosave, and the other keys
        // the Editor answers while the paper has focus — all from the command
        // table. They are held here rather than in the surface's keymap because
        // *when to save* belongs to the workspace that owns the project, not to
        // the screenplay surface.
        handleKeyDown: (_editor, event) => {
          // The Menu key and Shift+F10 open the right-click menu at the caret,
          // as a native one would (ADR-0034's accessibility cost). Ctrl+Alt+Enter,
          // or the writer's own key for it, is the table's `context-menu`.
          if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
            event.preventDefault();
            openContextAtCaret();
            return true;
          }
          const asked = commandForKey(event, "editor");
          // A key the writer took away does nothing, not what the surface did with it.
          if (asked === undefined) return keyTakenAway(event, "editor");
          runCommand(asked, host);
          return true;
        },
        decorations: () => writing.seams,
        handleScrollToSelection: scrollCaretIntoView,
        // The title page is in the document and not on the paper. A forced
        // page break's `===` is, faintly, and the seam to a new sheet after it.
        nodeViews: hiddenTitlePage,
        // Courier Prime and the page's geometry come from the stylesheet
        // (ADR-0030); this is only the hook it selects on.
        // The webview's own spellcheck is off: spelling is Write-ist's, on
        // demand, from the dictionaries inside the application (ADR-0032).
        // The project's own formatting is the stylesheet's to draw, by these.
        attributes: { class: "manuscript", spellcheck: "false", ...formattingAttributes(formatting) },
      });
      // Typing and the arrows keep the caret clear of the fades (`caret-margin.ts`).
      const editing = view;
      // Measured again when the zoom is redrawn, which a resize does too.
      fitCaretRoom = (): void => editing.setProps(caretScrolling(measureCaretRoom(editing.dom, scale)));
      fitCaretRoom();
      // The writer can start typing at once, unless a menu opened while the
      // script was being read has the keys.
      const active = document.activeElement;
      if (active === null || active === document.body) editing.focus();
      // And the caret it opened at is on screen: where the writer left it, in
      // the middle of the window, at once rather than gliding down from the top
      // (`caret-centre.ts`); at the top of the script, with the usual room.
      // Asked for directly: ProseMirror's `scrollIntoView` does nothing for a
      // view without focus.
      if (resumed !== undefined) centreCaretLine(editing, { smooth: false });
      else scrollCaretIntoView(editing);
      panels.attach(view);
      shown(writing);
      writing.showCounts();
      writing.showGoal();

      // Capture, so the editor's own Enter handling never sees it.
      const asksForSearch = (event: KeyboardEvent): void => {
        // A key Settings is recording is the writer's new key, not a command.
        if (isCapturedKey(event)) return;
        const asked = commandForKey(event, "window");
        if (asked === undefined) {
          if (keyTakenAway(event, "window")) event.preventDefault();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        // Not a held key: a dialog this opens must not flicker while it is
        // down. A zoom steps on while its key is held.
        if (!event.repeat || asked.repeats === true) runCommand(asked, host);
      };
      window.addEventListener("keydown", asksForSearch, true);
      stopListeningForSearch = () => window.removeEventListener("keydown", asksForSearch, true);
    } catch (error) {
      if (gone) return;
      reading.remove();
      // Words about their file, never a stack trace. Nothing was written,
      // because the failure was a read (ADR-0008 rule 3).
      context.report(
        `Write-ist could not read this project's screenplay, so nothing has been changed. ${message(error)}`,
      );
    }
  })();

  return {
    focus: () => view?.focus(),
    unmount: async () => {
      // Still reading, so there is nothing to save and nothing but a line of
      // text to take down. The read's own continuation sees this and stops.
      if (session === undefined) {
        gone = true;
        clearTimeout(placeRest);
        clearInterval(goalClock);
        stopListeningForGoals();
        stopListeningForDetails();
        page.removeEventListener("contextmenu", onContextMenu);
        stopMarginClicks();
        contextMenu?.close(false);
        panels.dispose();
        window.removeEventListener("resize", redrawZoom);
        document.removeEventListener("scroll", holdCentred, true);
        drawPaperZoom(root, 1);
        return true;
      }
      // The final save first, and it decides: the paper comes down only once
      // the writer's last sentence is on disk.
      if (!(await session.leave())) return false;
      await keepPlace();

      gone = true;
      clearTimeout(placeRest);
      window.removeEventListener("resize", redrawZoom);
      document.removeEventListener("scroll", holdCentred, true);
      clearInterval(goalClock);
      stopListeningForGoals();
      stopListeningForDetails();
      session = undefined;
      page.removeEventListener("contextmenu", onContextMenu);
      stopMarginClicks();
      contextMenu?.close(false);
      stopListeningForSearch?.();
      panels.dispose();
      searching?.close();
      view?.destroy();
      view = undefined;
      drawPaperZoom(root, 1);
      return true;
    },
  };
}

/** Where the caret was left in this project, or `undefined` when nothing is kept or it will not read. */
async function recallPlace(context: WorkspaceContext): Promise<CaretPlace | undefined> {
  try {
    return await context.places()?.recall(context.project.marker.projectId);
  } catch {
    return undefined;
  }
}

/**
 * The clipboard as the paste rules (#47) take it: the model's own HTML when it
 * came from Write-ist, and the plain text either way.
 */
async function readClipboard(): Promise<{ text: string; html: string }> {
  let text = "";
  let html = "";
  for (const item of await navigator.clipboard.read()) {
    if (item.types.includes("text/html")) html = await (await item.getType("text/html")).text();
    if (item.types.includes("text/plain")) text = await (await item.getType("text/plain")).text();
  }
  return { text, html };
}

/** The four bundled Courier Prime faces, as the PDF embeds them. */
async function courierPrimeFaces(): Promise<CourierPrimeFaces> {
  const read = async (name: string): Promise<Uint8Array> => {
    const response = await fetch(`/fonts/CourierPrime-${name}.ttf`);
    if (!response.ok) throw new Error(`The bundled font ${name} could not be read.`);
    return new Uint8Array(await response.arrayBuffer());
  };
  const [regular, bold, italic, boldItalic] = await Promise.all(
    ["Regular", "Bold", "Italic", "BoldItalic"].map(read),
  );
  return { regular: regular!, bold: bold!, italic: italic!, boldItalic: boldItalic! };
}
