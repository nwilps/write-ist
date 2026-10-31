/**
 * The Editor workspace: the manuscript, on the page, and written into (#39,
 * #41).
 *
 * `GLOSSARY.md`: *the workspace the in-progress draft is written in, running the
 * project's surface. A workspace like any other, not a frame around the
 * others.* So this is the only file in the application that knows the project
 * runs on the screenplay surface — the shell hosting it does not, which is
 * ADR-0005's seam and what `test/app/shell-knows-nothing.test.ts` holds.
 *
 * **The page is the spike's** (`nwilps/write-ist-ng`, `spike/src/style.css`): a
 * single sheet, centred on the dark ground, at the page width and margins it
 * sets. The furniture around it is the shell's.
 *
 * ## What this file does and does not do
 *
 * It reads the manuscript, maps it into ProseMirror, mounts the view, and
 * connects three wires: a keystroke to the model, the model to the save
 * routine, and the three moments ADR-0028 names to that routine. Everything
 * each of those wires carries is decided above the window — the surface's
 * schema and mapping in `src/screenplay/`, the save routine in
 * `src/project/save.ts`, the timing in `src/project/autosave.ts` — and every
 * one of them is reached by a test with no window at all. What is left here is
 * the window, which is seam 4, checked by the writer writing in it.
 *
 * ## Why the state is held here and the view is told about it
 *
 * The usual ProseMirror shape is `view.updateState(view.state.apply(tr))`,
 * which makes the view the holder of the document. It is held here instead so
 * that **the thing the save routine reads is not the view**: ADR-0024 and #37
 * both require the manuscript to be produced by the serialiser from the model,
 * *never* from ProseMirror's own format and never from the DOM, and a save
 * that reached through `view` would be one refactor away from reaching through
 * `view.dom`.
 *
 * ## Saving is asked for here and decided elsewhere
 *
 * A keystroke restarts the pause; switching to another application, asking for
 * a save, and closing the project save at once (ADR-0028). All of them call
 * `autosave`, which calls the one save routine — so there is no second path to
 * a written file and nothing here owns a timer.
 *
 * ## When something else changed the manuscript
 *
 * Switching back to Write-ist asks for a save, and a save compares the disk
 * with what Write-ist last read or wrote (#42, ADR-0028). The session decides;
 * this does what it is told. **Reloaded:** the view is given the new version,
 * silently. **Both kept:** the dated copy is written and nothing is said
 * (ADR-0031). Only failures are reported, through `trouble`.
 *
 * ## It will not come down over a save it could not finish
 *
 * `unmount` answers whether the workspace came down, and answers `false` when
 * the last save failed. The words are still on screen and nowhere else, so
 * destroying the view would destroy them — the silent destruction ADR-0008 was
 * written from, arrived at by a different road. It says what happened beside
 * the page, which it still has because it is still up, and the writer can try
 * again.
 */
import { PenLine } from "lucide";
import { TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { autosave } from "../../../../src/project/autosave.ts";
import { openProject } from "../../../../src/project/open.ts";
import { editingSession } from "../../../../src/project/save.ts";
import { editorStateFor, manuscriptOf } from "../../../../src/screenplay/editing.ts";
import { manuscriptElementAt } from "../../../../src/screenplay/place.ts";
import { layout, type Layout } from "../../../../src/screenplay/layout.ts";
import { pageAtElement, pageStatusText } from "../../../../src/screenplay/paginate.ts";
import { sheetDecorations } from "../../../../src/screenplay/sheets.ts";
import { sidePanels } from "./panels.ts";
import { drawSheetBreak } from "./sheet-break.ts";
import { openSearch, type SearchDialog } from "./search-dialog.ts";
import { element } from "../../screens/element.ts";
import { asksToSave, asksToSearch } from "../../screens/shortcuts.ts";
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
  // The paper with a column of panels either side (the desk design, §2.2).
  let startSearch = (): void => {};
  const panels = sidePanels(() => startSearch());
  into.replaceChildren(element("div", { className: "desk" }, [panels.left, page, panels.right]));

  let view: EditorView | undefined;
  /** How to finish and let go. Undefined until the manuscript has been read. */
  let leave: (() => Promise<boolean>) | undefined;
  let gone = false;
  let searching: SearchDialog | undefined;
  let stopListeningForSearch: (() => void) | undefined;

  void (async () => {
    try {
      const opened = await openProject(context.filesystem, context.project);
      // Closed while the file was being read. A view mounted now would be a
      // view nobody takes down.
      if (gone) return;

      // The model, as the writer has it. Replaced on every transaction, and
      // read by the save routine — never by the view (see the head of this
      // file).
      let state = editorStateFor(opened.document);
      let unfinished: unknown;
      let leaving = false;
      // Held here so a silent reload (#42) can refresh the count too.
      let laid: Layout = layout(opened.document);
      // The seams between sheets, drawn from the layout (ADR-0033). Decorations,
      // so they are never part of the document and never reach the file.
      let seams = sheetDecorations(state.doc, laid, drawSheetBreak);
      const showPages = (): void => {
        const current = pageAtElement(
          laid.pagination,
          manuscriptElementAt(state.doc, state.selection.head),
        );
        context.setStatus(pageStatusText(current, laid.totalPages));
      };
      const session = editingSession(context.filesystem, opened, () => manuscriptOf(state.doc), {
        // Changed elsewhere, and nothing typed here: the other version is the
        // screenplay now. A fresh state, so undo cannot walk back into the
        // version that was replaced.
        reload: (imported) => {
          state = editorStateFor(imported.document);
          laid = layout(imported.document);
          seams = sheetDecorations(state.doc, laid, drawSheetBreak);
          view?.updateState(state);
          panels.update(state);
          showPages();
        },
        // The dated copy is already beside the manuscript. Nothing is said:
        // ADR-0031. A copy that could not be written is not here — that stops
        // the save, and arrives through `trouble` below.
        keptBoth: () => {},
      });
      /** A save that failed, in the writer's words. */
      const failure = (error: unknown): string =>
        `Write-ist could not save your screenplay, so your last few words are ` +
        `only on screen. ${message(error)}`;

      const saving = autosave({
        save: session.save,
        // Autosave is the thing the writer is not watching, so a failure it
        // swallowed would be a failure nobody ever learned about (ADR-0008
        // rule 4). Their words are still on screen and still unsaved, and the
        // next save will try again — which is what this says.
        //
        // **Except on the way out**, where there is no next save and the words
        // are handed back to `leave` to say something truer about instead. Two
        // panels for one failure would be the application talking over itself.
        trouble: (error) => {
          if (leaving) {
            unfinished = error;
            return;
          }
          // A save with nothing typed still reads the disk to compare it
          // (#42), and a read that failed then put nothing at risk — so it
          // says so, rather than that words are only on screen.
          context.report(
            session.unsaved()
              ? `${failure(error)} It will try again.`
              : `Write-ist could not check whether your screenplay was changed outside it. ` +
                  `Nothing has been changed. ${message(error)}`,
          );
        },
      });

      // Switching to another application (ADR-0028).
      const stopSwitchingAway = context.whenSwitchedAway(() => void saving.now());
      // And back, which is when something else is most likely to have changed
      // the manuscript. The save compares before it writes anything (#42).
      const stopSwitchingBack = context.whenSwitchedBack(() => void saving.now());

      leave = async () => {
        // Closing the project (ADR-0028), through the same routine as every
        // other save.
        unfinished = undefined;
        leaving = true;
        await saving.now();
        leaving = false;
        // **The one save with nothing after it.** There is no later autosave
        // to try again, because the page is about to go — so it does not go.
        if (unfinished !== undefined) {
          context.report(
            `${failure(unfinished)} This project stays open until it saves, ` +
              `so nothing you have written is lost.`,
          );
          return false;
        }
        // The ledger (ADR-0017): Tuesday's words and pages cannot be worked
        // out later, so they are written now, before the page goes. A failure
        // here costs a chart, never the manuscript — so the project still leaves.
        const ledger = context.ledger();
        if (ledger === undefined) {
          context.report(
            `Write-ist could not record today's writing in the ledger. ` +
              `Your screenplay is saved. The record of your writing days did not start.`,
          );
        } else {
          try {
            await ledger.recordDay(
              {
                id: context.project.marker.projectId,
                name: context.project.marker.name,
              },
              manuscriptOf(state.doc),
            );
          } catch (error) {
            context.report(
              `Write-ist could not record today's writing in the ledger. ` +
                `Your screenplay is saved. ${message(error)}`,
            );
          }
        }
        stopSwitchingAway();
        stopSwitchingBack();
        return true;
      };

      reading.remove();

      // #48 / #49 — page count from the model, never the DOM. Open and reload
      // take a full paginate; each edit re-packs from the affected page onward.
      view = new EditorView(page, {
        state,
        dispatchTransaction: (transaction) => {
          state = state.apply(transaction);
          if (transaction.docChanged) {
            session.changed();
            saving.typed();
            const dirty = manuscriptElementAt(state.doc, state.selection.head);
            laid = layout(manuscriptOf(state.doc), laid, dirty);
            // Before the view is told, so it draws the seams for this state
            // and not the last one.
            seams = sheetDecorations(state.doc, laid, drawSheetBreak);
          }
          view?.updateState(state);
          panels.update(state);
          // Selection moves still refresh the current page; the total only
          // moves when the manuscript does.
          if (transaction.docChanged || transaction.selectionSet) showPages();
        },
        // The explicit save ADR-0028 pairs with autosave — the same routine,
        // asked for rather than waited for. It is held here rather than in the
        // surface's keymap because *when to save* belongs to the workspace
        // that owns the project, not to the screenplay surface.
        handleKeyDown: (_editor, event) => {
          if (!asksToSave(event)) return false;
          void saving.now();
          return true;
        },
        decorations: () => seams,
        // Courier Prime and the page's geometry come from the stylesheet
        // (ADR-0030); this is only the hook it selects on.
        attributes: { class: "manuscript" },
      });
      panels.attach(view);
      panels.update(state);
      showPages();

      // Alt+Enter asks to search (the desk design, §2.5), wherever focus is.
      // Capture, so the editor's own Enter handling never sees it.
      startSearch = (): void => {
        if (searching !== undefined || view === undefined) return;
        searching = openSearch(into, {
          doc: () => state.doc,
          pageOf: (index) => laid.pagination.pageOfElement[index],
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
      if (leave === undefined) {
        gone = true;
        return true;
      }
      // The final save first, and it decides: the page comes down only once
      // the writer's last sentence is on disk.
      if (!(await leave())) return false;

      gone = true;
      leave = undefined;
      stopListeningForSearch?.();
      searching?.close();
      view?.destroy();
      view = undefined;
      return true;
    },
  };
}
