/**
 * TEMPORARY placeholders: the Notes and Plan tabs.
 *
 * They exist only so the workspace bar can be seen with more than one tab in it
 * (the desk design, §2.3). They have no behaviour — nothing mounts in them and
 * the bar cannot yet switch to them. Delete this file when the real Notes and
 * Plan workspaces arrive, each as a manifest of its own (ADR-0005).
 */
import { ListChecks, StickyNote } from "lucide";
import type { WorkspaceManifest } from "../shell/workspace.ts";

function placeholder(id: string, name: string, key: string, icon: WorkspaceManifest["icon"]): WorkspaceManifest {
  return { id, name, key, icon, mount: () => ({ unmount: async () => true }) };
}

export const notesPlaceholder = placeholder("notes", "Notes", "2", StickyNote);
export const planPlaceholder = placeholder("plan", "Plan", "3", ListChecks);
