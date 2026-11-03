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
import { TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { saveFountainCopy, suggestedCopyName } from "../../../../src/project/copy.ts";
import { exportPdf, suggestedPdfName } from "../../../../src/project/export-pdf.ts";
import type { CourierPrimeFaces } from "../../../../src/pdf/render.ts";
import {
  manuscriptSession,
  readManuscript,
  type ManuscriptSession,
} from "../../../../src/project/manuscript-session.ts";
import type { NameKind } from "../../../../src/screenplay/names.ts";
import { hiddenTitlePage, setTitlePage, titlePageOf } from "../../../../src/screenplay/title-page-editing.ts";
import { editorMenus } from "./menus.ts";
import { sidePanels } from "./panels.ts";
import { drawOffer } from "./autocomplete-draw.ts";
import { drawSheetBreak } from "./sheet-break.ts";
import { openTitlePageDialog } from "./title-page-dialog.ts";
import { showTitlePagePreview } from "./title-page-preview.ts";
import { openSearch, type SearchDialog } from "./search-dialog.ts";
import { element } from "../../screens/element.ts";
import { asksToConfirm, asksToSave, asksToSearch, asksToToggleSpelling } from "../../screens/shortcuts.ts";
import { tauriSpellEngine } from "../../spell-tauri.ts";
import { message } from "../../screens/trouble.ts";
import type {
  MountedWorkspace,
  WorkspaceContext,
  WorkspaceManifest,
} from "../../shell/workspace.ts";
export const editorWorkspace: WorkspaceManifest = {
  id: "editor",
  name: "Editor",
  // The workspace bar is not built (#37), and when it is, the Editor is its
  // first tab — as it is in the prototype.
  key: "1",
  icon: PenLine,
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
  let gone = false;
  let searching: SearchDialog | undefined;
  let stopListeningForSearch: (() => void) | undefined;

  const startSearch = (): void => {
    if (searching !== undefined || session === undefined || view === undefined) return;
    const writing = session;
    // Alt+Enter asks to search (the desk design, §2.5), wherever focus is.
    searching = openSearch(into, {
      doc: () => writing.state.doc,
      pageOf: (index) => writing.layout.pagination.pageOfElement[index],
      jump: ({ from, to }) => {
        if (view === undefined) return;
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)).scrollIntoView(),
        );
      },
      closed: () => {
        searching = undefined;
        view?.focus();
      },
    });
  };

  const toggleSpelling = (): void => {
    if (session === undefined || view === undefined) return;
    session.spellcheck.toggle(view);
    view.focus();
  };

  // Step 8: the writer says the name or location the caret is in is right.
  const confirmHere = (kind: NameKind): void => {
    if (session === undefined || view === undefined) return;
    if (!session.confirm(kind)) return;
    // A confirmed name is a known word now, and a near-match of it a typo.
    session.spellcheck.refresh(view);
    view.focus();
  };

  const saveNow = (): void => {
    void session?.save();
    view?.focus();
  };

  // Step 7: a finished-product copy, outside the bundle. It reads the model
  // as it is *now* and goes nowhere near the save routine, so an unsaved
  // edit is in the copy and nothing is saved as a side effect. Cancelling
  // writes nothing; success is silent (ADR-0031).
  const saveCopy = (): void => {
    const writing = session;
    if (writing === undefined) return;
    void (async () => {
      try {
        const destination = await context.chooseCopyLocation(suggestedCopyName(context.project));
        if (destination === undefined) return;
        await saveFountainCopy(
          context.filesystem,
          context.project,
          writing.manuscript(),
          destination,
        );
      } catch (error) {
        context.report(
          `Write-ist could not save the copy. Your screenplay is unchanged. ${message(error)}`,
        );
      } finally {
        view?.focus();
      }
    })();
  };

  // Step 5: the PDF, built from the layout of the model as it is *now* and
  // written outside the bundle. Like the copy it never goes near the save
  // routine. The fonts are the bundled files, read from the application.
  const exportAsPdf = (): void => {
    const writing = session;
    if (writing === undefined) return;
    void (async () => {
      try {
        const destination = await context.choosePdfLocation(suggestedPdfName(context.project));
        if (destination === undefined) return;
        await exportPdf(
          context.filesystem,
          context.project,
          writing.manuscript(),
          await courierPrimeFaces(),
          destination,
        );
      } catch (error) {
        context.report(
          `Write-ist could not export the PDF. Your screenplay is unchanged. ${message(error)}`,
        );
      } finally {
        view?.focus();
      }
    })();
  };

  // Step 4 and 6: the title page is edited in a form and viewed as it
  // prints; it is never on the paper. Save is one transaction, so autosave
  // sees it as any edit and Undo takes it back in one step.
  const editTitlePage = (): void => {
    if (session === undefined || view === undefined || into.querySelector("dialog[open]") !== null) return;
    const writing = session;
    openTitlePageDialog(into, {
      titlePage: titlePageOf(writing.state.doc),
      save: (titlePage) => view?.dispatch(setTitlePage(writing.state, titlePage)),
      closed: () => view?.focus(),
    });
  };
  const viewTitlePage = (): void => {
    if (session === undefined || view === undefined || into.querySelector("dialog[open]") !== null) return;
    showTitlePagePreview(into, titlePageOf(session.state.doc), () => view?.focus());
  };

  // The paper with a column of panels either side (the desk design, §2.2).
  const panels = sidePanels(
    startSearch,
    editorMenus({
      save: saveNow,
      saveCopy,
      exportPdf: exportAsPdf,
      toProjects: context.leave.toProjects,
      toHome: context.leave.toHome,
      editTitlePage,
      viewTitlePage,
      confirmName: () => confirmHere("character"),
      confirmLocation: () => confirmHere("location"),
      toggleSpellcheck: toggleSpelling,
      spellcheckOn: () => view !== undefined && session?.spellcheck.isOn(view.state) === true,
    }),
  );
  into.replaceChildren(element("div", { className: "desk" }, [panels.left, page, panels.right]));

  void (async () => {
    try {
      const read = await readManuscript(context.filesystem, context.project, context.report);
      // Closed while the file was being read. A view mounted now would be a
      // view nobody takes down.
      if (gone) return;

      const writing = manuscriptSession(
        {
          filesystem: context.filesystem,
          project: context.project,
          report: context.report,
          setSaved: context.setSaved,
          setStatus: context.setStatus,
          ledger: context.ledger,
          whenSwitchedAway: context.whenSwitchedAway,
          whenSwitchedBack: context.whenSwitchedBack,
          spellEngine: tauriSpellEngine,
          drawSeam: drawSheetBreak,
          drawOffer,
          reloaded: (spellingWasOn) => {
            view?.updateState(writing.state);
            if (spellingWasOn && view !== undefined) writing.spellcheck.setOn(view, true);
            panels.update(writing.state);
          },
        },
        read,
      );
      session = writing;
      reading.remove();

      // #48 / #49 — page count from the model, never the DOM. Open and reload
      // take a full paginate; each edit re-packs from the affected page onward.
      view = new EditorView(page, {
        state: writing.state,
        dispatchTransaction: (transaction) => {
          writing.apply(transaction);
          view?.updateState(writing.state);
          panels.update(writing.state);
        },
        // The explicit save ADR-0028 pairs with autosave — the same routine,
        // asked for rather than waited for. It is held here rather than in the
        // surface's keymap because *when to save* belongs to the workspace
        // that owns the project, not to the screenplay surface.
        handleKeyDown: (_editor, event) => {
          if (asksToToggleSpelling(event)) {
            toggleSpelling();
            return true;
          }
          if (asksToConfirm(event)) {
            confirmHere(writing.confirmableKind());
            return true;
          }
          if (!asksToSave(event)) return false;
          void writing.save();
          return true;
        },
        decorations: () => writing.seams,
        // The title page is in the document and not on the paper.
        nodeViews: hiddenTitlePage,
        // Courier Prime and the page's geometry come from the stylesheet
        // (ADR-0030); this is only the hook it selects on.
        // The webview's own spellcheck is off: spelling is Write-ist's, on
        // demand, from the dictionaries inside the application (ADR-0032).
        attributes: { class: "manuscript", spellcheck: "false" },
      });
      panels.attach(view);
      panels.update(writing.state);
      writing.showCounts();

      // Capture, so the editor's own Enter handling never sees it.
      const asksForSearch = (event: KeyboardEvent): void => {
        if (!asksToSearch(event)) return;
        event.preventDefault();
        event.stopPropagation();
        startSearch();
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
    unmount: async () => {
      // Still reading, so there is nothing to save and nothing but a line of
      // text to take down. The read's own continuation sees this and stops.
      if (session === undefined) {
        gone = true;
        panels.dispose();
        return true;
      }
      // The final save first, and it decides: the paper comes down only once
      // the writer's last sentence is on disk.
      if (!(await session.leave())) return false;

      gone = true;
      session = undefined;
      stopListeningForSearch?.();
      panels.dispose();
      searching?.close();
      view?.destroy();
      view = undefined;
      return true;
    },
  };
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
