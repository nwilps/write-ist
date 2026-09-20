/**
 * The Editor workspace: the manuscript, on the page (#39).
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
 * It reads the manuscript, maps it into ProseMirror, and mounts the view.
 * Everything about *what the page holds* is decided by the surface's schema in
 * `src/screenplay/schema.ts` and its mapping in `src/screenplay/editor.ts`,
 * both of which are reached by tests with no window at all. What is left here is
 * the window, which is seam 4 — checked by the writer, writing in it.
 *
 * **Nothing is typed into yet.** The view is not editable, deliberately: typing
 * and saving are one ticket (#41), and an editable page that dropped every
 * keystroke on the floor would be a quieter failure than a page that plainly
 * does not take them. #41 turns this on with the transaction handler and the
 * save routine that make a keystroke mean something.
 */
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { openProject } from "../../../../src/project/open.ts";
import { toEditorDocument } from "../../../../src/screenplay/editor.ts";
import { screenplaySchema } from "../../../../src/screenplay/schema.ts";
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
  let gone = false;

  void (async () => {
    try {
      const opened = await openProject(context.filesystem, context.project);
      // Closed while the file was being read. A view mounted now would be a
      // view nobody takes down.
      if (gone) return;

      reading.remove();
      view = new EditorView(page, {
        state: EditorState.create({ doc: toEditorDocument(opened.document) }),
        // #41. See the note at the head of this file.
        editable: () => false,
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
    unmount: () => {
      gone = true;
      view?.destroy();
      view = undefined;
    },
  };
}
