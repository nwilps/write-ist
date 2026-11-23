/**
 * The workspaces the application offers (ADR-0005).
 *
 * One list, and the shell hosts whatever is in it. Notes, Plan, Log, Outline and
 * Characters are candidates rather than a fixed set (`GLOSSARY.md`), and each
 * arrives as a line here plus a manifest of its own — never as a change in the
 * shell.
 *
 * **Adding a workspace is one entry here and one manifest of its own**: its
 * id, name, key and icon for its tab, the files it keeps its work in, and how
 * it is drawn (`mount`). Nothing else changes: the shell, Edit Project Details
 * and the project's `details.md` all read this list. It is a list in code, not
 * a plugin system; one could read it from elsewhere one day without the shell
 * noticing.
 *
 * **Which workspaces a project shows is the project's** (Edit Project Details,
 * `src/project/details.ts`), every one but the `alwaysOn` Editor switchable
 * (ADR-0006). A project that never chose shows them all. Which a *new* project
 * starts with is the writer's, per type, in Settings ▸ New Project Defaults —
 * which reads this list too, and keeps "every one" until the writer changes it.
 */
import type { WorkspaceManifest } from "../shell/workspace.ts";
import { editorWorkspace } from "./editor/editor.ts";
import { notesPlaceholder, planPlaceholder } from "./placeholders.ts";

export const WORKSPACES: readonly WorkspaceManifest[] = [
  editorWorkspace,
  // TEMPORARY: visual placeholders, no behaviour (see placeholders.ts).
  notesPlaceholder,
  planPlaceholder,
];
