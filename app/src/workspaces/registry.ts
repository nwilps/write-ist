/**
 * The workspaces the application offers (ADR-0005).
 *
 * One list, and the shell hosts whatever is in it. Notes, Plan, Log, Outline and
 * Characters are candidates rather than a fixed set (`GLOSSARY.md`), and each
 * arrives as a line here plus a manifest of its own — never as a change in the
 * shell.
 *
 * **Adding a workspace is one entry here and one folder of its own**
 * (`app/src/workspaces/<id>/`, copied from `_template/`): a manifest with its
 * id, name, key and icon for its tab, the files it keeps its work in, any
 * settings of its own, and how it is drawn (`mount`), with its stylesheet
 * beside it. Everything it asks of the application is a call on the toolbox it
 * is mounted with (ADR-0045, `docs/WORKSPACES.md`): its files, the writer's
 * place, spellcheck, the pills, hotkeys, settings, menus and dialogs. Anything
 * particular to its own file format is its own code (`src/notes/`,
 * `src/plan/`). Nothing else changes: the shell, the Hotkeys lists, Settings,
 * Edit Project Details and the project's `details.md` all read this list. It
 * is a list in code, not a plugin system; one could read it from elsewhere one
 * day without the shell noticing.
 *
 * **Which workspaces a project shows is the project's** (Edit Project Details,
 * `src/project/details.ts`), every one but the `alwaysOn` Editor switchable
 * (ADR-0006). A project that never chose shows them all. Which a *new* project
 * starts with is the writer's, per type, in Settings ▸ New Project Defaults —
 * which reads this list too, and keeps "every one" until the writer changes it.
 */
import type { WorkspaceManifest } from "../shell/workspace.ts";
import { editorWorkspace } from "./editor/editor.ts";
import { notesWorkspace } from "./notes/notes.ts";
import { planWorkspace } from "./plan/plan.ts";

/**
 * A plain list of manifests, and nothing else: what a workspace needs of the
 * application — the dictionary among it — arrives in its toolbox (ADR-0045),
 * never through here. `_template/` is not in it, and never is.
 */
export const WORKSPACES: readonly WorkspaceManifest[] = [editorWorkspace, notesWorkspace, planWorkspace];
