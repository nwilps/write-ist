/**
 * What the Editor's three menus hold (the desk design, §2.4).
 *
 * **Only what exists.** Rename, Export and a new project are not here because
 * they are not built; a menu item that pretended would be worse than one that
 * is absent. The hints are shortcuts that really work, which is why the title
 * page items have none.
 */
import { Eye, FileDown, FileText, FolderOpen, House, Save } from "lucide";
import type { MenuEntry } from "../../menus/drop-menu.ts";

export interface EditorActions {
  readonly save: () => void;
  readonly saveCopy: () => void;
  readonly toProjects: () => void;
  readonly toHome: () => void;
  readonly editTitlePage: () => void;
  readonly viewTitlePage: () => void;
}

export function editorMenus(act: EditorActions): Readonly<Record<string, readonly MenuEntry[]>> {
  return {
    File: [
      { label: "Save Project", hint: "[Ctrl + S]", icon: Save, act: act.save },
      { label: "Save a Copy as Fountain…", icon: FileDown, act: act.saveCopy },
      { divider: true },
      { label: "Open Project", icon: FolderOpen, act: act.toProjects },
      { divider: true },
      { label: "Home", hint: "[Esc]", icon: House, act: act.toHome },
    ],
    Edit: [{ label: "Edit Title Page…", icon: FileText, act: act.editTitlePage }],
    View: [{ label: "View Title Page", icon: Eye, act: act.viewTitlePage }],
  };
}
