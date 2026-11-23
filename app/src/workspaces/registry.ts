/**
 * The workspaces the application offers (ADR-0005).
 *
 * One list, and the shell hosts whatever is in it. Notes, Plan, Log, Outline and
 * Characters are candidates rather than a fixed set (`GLOSSARY.md`), and each
 * arrives as a line here plus a manifest of its own — never as a change in the
 * shell.
 *
 * **Adding a workspace is one entry here and one folder of its own**
 * (`app/src/workspaces/<id>/`): a manifest with its id, name, key and icon for
 * its tab, the files it keeps its work in, and how it is drawn (`mount`), with
 * its stylesheet beside it. Anything it keeps on disk is its own code too
 * (`src/notes/`, `src/plan/`), on the shared pieces in `src/project/` — a
 * workspace file (`workspace-file.ts`) and the writer's place in it
 * (`workspace-places.ts`). Nothing else changes: the shell, Edit Project
 * Details and the project's `details.md` all read this list. It is a list in
 * code, not a plugin system; one could read it from elsewhere one day without
 * the shell noticing.
 *
 * **Which workspaces a project shows is the project's** (Edit Project Details,
 * `src/project/details.ts`), every one but the `alwaysOn` Editor switchable
 * (ADR-0006). A project that never chose shows them all. Which a *new* project
 * starts with is the writer's, per type, in Settings ▸ New Project Defaults —
 * which reads this list too, and keeps "every one" until the writer changes it.
 */
import type { WorkspaceManifest } from "../shell/workspace.ts";
import { tauriSpellEngine } from "../spell-tauri.ts";
import { editorWorkspace } from "./editor/editor.ts";
import { notesManifest } from "./notes/notes.ts";
import { planWorkspace } from "./plan/plan.ts";

export const WORKSPACES: readonly WorkspaceManifest[] = [
  editorWorkspace,
  // The same dictionary as the Editor's spellcheck, and nothing else of it.
  notesManifest({ spellEngine: tauriSpellEngine }),
  planWorkspace,
];
