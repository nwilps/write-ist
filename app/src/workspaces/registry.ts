/**
 * The workspaces the application offers (ADR-0005).
 *
 * One list, and the shell hosts whatever is in it. Notes, Plan, Log, Outline and
 * Characters are candidates rather than a fixed set (`GLOSSARY.md`), and each
 * arrives as a line here plus a manifest of its own — never as a change in the
 * shell.
 *
 * Slice 1 has one. **Which workspaces a project shows is a format's default to
 * set**, and a format is data (ADR-0005, ADR-0006); with one workspace and one
 * format there is nothing yet to choose between, so nothing here chooses.
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
