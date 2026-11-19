/**
 * The keys that switch the workspace bar's tab: Alt and a workspace's own key
 * from its manifest (Alt+1 for the first), and Alt+Left and Alt+Right to step
 * to the tab either side, going round at the ends.
 *
 * The shell answers them. They are written here, as data, so the Keyboard
 * Shortcuts list can show the same chords the shell matches: it reads these
 * rather than keeping a second copy.
 */
import { chordMatches, type Chord, type KeyPress } from "../screens/shortcuts.ts";
import type { WorkspaceManifest } from "./workspace.ts";

/** The chord that selects the workspace with this manifest key. */
export const workspaceChord = (key: string): Chord => ({ key, alt: true });

/** Step to the tab on the left, or the last from the first. */
export const PREVIOUS_WORKSPACE: Chord = { key: "ArrowLeft", alt: true };

/** Step to the tab on the right, or the first from the last. */
export const NEXT_WORKSPACE: Chord = { key: "ArrowRight", alt: true };

/**
 * Which tab a key press asks for, counting from `from` (the tab selected now),
 * or `undefined` if it asks for none.
 */
export function workspaceAsked(
  workspaces: readonly Pick<WorkspaceManifest, "key">[],
  from: number,
  press: KeyPress,
): number | undefined {
  const count = workspaces.length;
  if (count === 0) return undefined;
  if (chordMatches(PREVIOUS_WORKSPACE, press)) return (from - 1 + count) % count;
  if (chordMatches(NEXT_WORKSPACE, press)) return (from + 1) % count;
  const found = workspaces.findIndex((workspace) => chordMatches(workspaceChord(workspace.key), press));
  return found === -1 ? undefined : found;
}
