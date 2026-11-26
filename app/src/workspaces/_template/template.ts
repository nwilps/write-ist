/**
 * **A starter workspace — copy this folder to begin a new one** (ADR-0045,
 * `docs/WORKSPACES.md`). It is not in the registry and never is: nothing
 * draws it until a copy of it is added there.
 *
 * To make one:
 *
 * 1. Copy `app/src/workspaces/_template/` to `app/src/workspaces/<your-id>/`,
 *    and rename this file and `templateWorkspace`.
 * 2. Fill in the manifest below: an id, a name for the tab, a free Alt key, a
 *    Lucide icon (ADR-0035), and the files and folders your work is kept in.
 * 3. Add the manifest to `WORKSPACES` in `app/src/workspaces/registry.ts`.
 *    That is the only line outside your folder.
 *
 * **Import from `../../toolbox/index.ts` and nothing else of the
 * application's** — `test/app/toolbox.test.ts` holds this folder to that.
 * Your own file format, if you have one, goes in `src/<your-id>/`, where a
 * test can reach it without a window (`src/notes/`, `src/plan/`).
 *
 * A stylesheet, if you want one, sits beside this file and is imported here
 * (`import "./template.css"`). **Every value in it is a token** from
 * `app/src/style/tokens.css` (ADR-0030); `notes.css` is a good one to read.
 *
 * What this one does, so each toolbox call is shown once: a plain box of text
 * kept in `scratch.md`, saved by itself, its scroll remembered, its length in
 * the counts pill, a key and a right-click menu of its own, and a confirm
 * before it is emptied.
 */
import { FileText, Eraser } from "lucide";
import {
  element,
  message,
  type MountedWorkspace,
  type OpenFile,
  type Toolbox,
  type WorkspaceManifest,
} from "../../toolbox/index.ts";

/** Your work's file, inside the project's folder. Declared in the manifest, so `toolbox.files` lets you touch it. */
const FILE = "scratch.md";

export const templateWorkspace: WorkspaceManifest = {
  // Stable, lower case, never shown. Also the key your places and settings are kept under.
  id: "template",
  // What the workspace bar calls it.
  name: "Template",
  // Alt and this selects its tab. Pick one no other workspace has.
  key: "9",
  icon: FileText,
  // Files by name; a folder ends with "/" and means everything directly in it ("sketches/").
  files: [FILE],
  // Settings of your own, if any: switches the application draws for you (`toolbox.settings`).
  // settings: [{ id: "wrap", label: "Wrap long lines", place: "app", default: true }],
  mount,
};

function mount(into: HTMLElement, toolbox: Toolbox): MountedWorkspace {
  const box = element("textarea", { className: "template__text", ariaLabel: "Scratch" });
  box.spellcheck = false;
  into.replaceChildren(box);

  let text = "";
  let file: OpenFile | undefined;
  const count = (): void => toolbox.pills.setStatus(`${text.length} characters`);

  // Read the file, then open it for saving: autosave, the safe save and the save pill are the toolbox's.
  void (async () => {
    try {
      const read = await toolbox.files.read(FILE);
      text = read.text;
      box.value = text;
      file = toolbox.files.open(FILE, {
        noun: "your scratch",
        text: () => text,
        // Changed outside Write-ist while nothing was typed here: this is the text now.
        reload: (found) => {
          text = found;
          box.value = found;
          count();
        },
      }, read);
      count();
    } catch (error) {
      // A file that will not read is never written over: say so, and leave it.
      toolbox.report(`Write-ist could not read ${FILE}, so nothing has been changed. ${message(error)}`);
      return;
    }
    // Where the writer was, kept in app data, never in the project.
    const place = await toolbox.memory.recall();
    if (typeof place?.["scroll"] === "number") box.scrollTop = place["scroll"];
  })();

  box.addEventListener("input", () => {
    text = box.value;
    file?.changed();
    count();
  });

  // Write-ist's own right-click menu, never the webview's (ADR-0034).
  const empty = (): void =>
    toolbox.dialogs.confirm({
      label: "Empty Scratch",
      question: "Empty the scratch?",
      lines: ["Everything in it is taken out. Undo will not bring it back."],
      confirm: "Empty",
      alarm: true,
      failed: "The scratch could not be emptied, so it is as it was.",
      act: async () => {
        text = "";
        box.value = "";
        file?.changed();
        count();
        return undefined;
      },
      closed: () => box.focus(),
    });
  const onMenu = (event: MouseEvent): void => {
    event.preventDefault();
    toolbox.menus.open({
      label: toolbox.workspace.name,
      items: [{ label: "Empty…", icon: Eraser, act: empty }],
      x: event.clientX,
      y: event.clientY,
      restoreFocus: () => box.focus(),
    });
  };
  box.addEventListener("contextmenu", onMenu);

  // A key of its own, listed in View ▸ Hotkeys. `undefined` means someone has it already: pick another.
  toolbox.hotkeys.add({ id: "empty", label: "Empty Scratch", chord: { key: "e", mod: true }, act: empty });

  // The project name pill at the foot of the desk opens Edit Project Details over the workspace.
  const stopDetails = toolbox.details.whenAsked(() => {
    if (into.querySelector("dialog[open]") !== null) return;
    toolbox.details.edit({ into, carryOut: (move) => (file === undefined ? move() : file.relocate(move)), closed: () => box.focus() });
  });

  const keepPlace = async (): Promise<void> => {
    try {
      await toolbox.memory.remember({ scroll: Math.round(box.scrollTop) });
    } catch {
      // Only a place: it opens at the top next time.
    }
  };

  return {
    focus: () => box.focus(),
    // Leaving for another workspace is one of the moments work is saved.
    hide: () => {
      void file?.save();
      void keepPlace();
    },
    show: () => box.focus(),
    // A rename of the project moves its folder: let the save that is running finish first.
    relocate: (move) => (file === undefined ? move() : file.relocate(move)),
    // Come down only once the work is on disk; `false` keeps it on screen, with the trouble said.
    unmount: async () => {
      if (file !== undefined && !(await file.leave())) return false;
      await keepPlace();
      box.removeEventListener("contextmenu", onMenu);
      stopDetails();
      return true;
    },
  };
}
