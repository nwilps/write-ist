/**
 * TEMPORARY placeholders: the Notes and Plan tabs.
 *
 * They exist only so the workspace bar can be seen with more than one tab in it
 * (the desk design, §2.3). They have no behaviour — nothing mounts in them, and
 * selecting their tab leaves the Editor mounted and on screen. Delete this file when the real Notes and
 * Plan workspaces arrive, each as a manifest of its own (ADR-0005).
 */
import { ListChecks, StickyNote } from "lucide";
import type { WorkspaceManifest } from "../shell/workspace.ts";

function placeholder(id: string, name: string, key: string, icon: WorkspaceManifest["icon"], file: string): WorkspaceManifest {
  return { id, name, key, icon, files: [file], mount: () => ({ unmount: async () => true }) };
}

// Their files are ADR-0025's, named now so turning a tab off is known to leave them be.
export const notesPlaceholder = placeholder("notes", "Notes", "2", StickyNote, "notes.md");
export const planPlaceholder = placeholder("plan", "Plan", "3", ListChecks, "plan.md");
