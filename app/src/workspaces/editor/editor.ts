/**
 * The Editor workspace: the manuscript, on the page, and written into (#39,
 * #41).
 *
 * `CONTEXT.md`: *the workspace the in-progress draft is written in, running the
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
 * A keystroke restarts the pause; losing the window and closing the project
 * save at once (ADR-0028). All three call `autosave`, which calls the one save
 * routine — so there is no second path to a written file and nothing here owns
 * a timer.
 */
import { EditorView } from "prosemirror-view";
import { autosave } from "../../../../src/project/autosave.ts";
import { openProject } from "../../../../src/project/open.ts";
import { editingSession } from "../../../../src/project/save.ts";
import { editorStateFor, manuscriptOf } from "../../../../src/screenplay/editing.ts";
import { element } from "../../screens/element.ts";
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
  mount,
};

function mount(into: HTMLElement, context: WorkspaceContext): MountedWorkspace {
  const page = element("div", { className: "page" });
  const reading = element("p", {
    className: "page__reading",
    textContent: "Reading your screenplay…",
  });
  page.append(reading);
  into.replaceChildren(page);

  let view: EditorView | undefined;
  let leave: (() => Promise<void>) | undefined;
  let gone = false;

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
      const session = editingSession(context.filesystem, opened, () =>
        manuscriptOf(state.doc),
      );
      const saving = autosave({
        save: session.save,
        // Autosave is the thing the writer is not watching, so a failure it
        // swallowed would be a failure nobody ever learned about (ADR-0008
        // rule 4). Their words are still on screen and still unsaved, and the
        // next save will try again — which is what this says.
        trouble: (error) =>
          context.report(
            `Write-ist could not save your screenplay, so your last few words are ` +
              `only on screen. It will try again. ${message(error)}`,
          ),
      });

      // Switching to another application (ADR-0028). The window's own blur,
      // rather than a Tauri listener, because it is the same event on all
      // three platforms and needs no capability.
      const switchedAway = (): void => void saving.now();
      window.addEventListener("blur", switchedAway);
      leave = async () => {
        window.removeEventListener("blur", switchedAway);
        // Closing the project (ADR-0028). Awaited, so that a writer who
        // closes and quits has the save land before the window goes.
        await saving.now();
      };

      reading.remove();
      view = new EditorView(page, {
        state,
        dispatchTransaction: (transaction) => {
          state = state.apply(transaction);
          view?.updateState(state);
          // A selection move is not a change to the screenplay, so it neither
          // marks the manuscript unsaved nor restarts the pause.
          if (!transaction.docChanged) return;
          session.changed();
          saving.typed();
        },
        // Courier Prime and the page's geometry come from the stylesheet
        // (ADR-0030); this is only the hook it selects on.
        attributes: { class: "manuscript" },
      });
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
      gone = true;
      // The final save first: taking the view down destroys nothing the model
      // needs, but there is no reason to have the page disappear before the
      // writer's last sentence is on disk.
      await leave?.();
      leave = undefined;
      view?.destroy();
      view = undefined;
    },
  };
}
