/**
 * The application's list of hotkeys beyond the Editor's command table: the
 * keys that switch workspaces, read from the registry, and the keys each
 * workspace adds through its toolbox (`toolbox.hotkeys.add`, ADR-0045).
 *
 * View ▸ Hotkeys and Settings ▸ Hotkeys read this, so a workspace's keys are
 * listed where every other key is, and a workspace that is not registered has
 * no row: nothing here names one. Adding a workspace adds its Alt key's row by
 * itself.
 *
 * **Conflicts are refused quietly.** A key a workspace adds is checked against
 * every key already taken — the workspace switches, Escape, the keys other
 * workspaces added, and whatever else the application says is taken
 * (`alsoTaken`: the Editor's commands and the menus' access keys). One that
 * overlaps is not added: `add` answers `undefined` and nothing is said, the way
 * a greyed menu item says nothing.
 */
import { chordsOverlap, ctrlAltAllowed, type Chord } from "../screens/shortcuts.ts";
import { NEXT_WORKSPACE, PREVIOUS_WORKSPACE, workspaceChord } from "./workspace-keys.ts";

/** A key as the Hotkeys lists show it. */
export interface HotkeyRow {
  readonly id: string;
  readonly label: string;
  readonly chord: Chord;
}

/** A key a workspace adds, and what pressing it does. */
export interface Hotkey extends HotkeyRow {
  readonly act: () => void;
}

/** A workspace as this list needs it: what it is called, and its Alt key. */
export interface OfferedWorkspace {
  readonly id: string;
  readonly name: string;
  readonly key: string;
}

/** Escape: Home, everywhere (`LEAVE`). Never a workspace's. */
const ESCAPE: Chord = { key: "Escape" };

let offered: readonly OfferedWorkspace[] = [];
/** The keys each workspace has added, by workspace id. */
const added = new Map<string, { readonly name: string; readonly keys: Hotkey[] }>();
const taken = new Set<() => readonly { readonly label: string; readonly chord: Chord }[]>();

/**
 * These are the workspaces the application offers now, in the order the bar
 * lists them: their Alt keys are listed from here. The shell says so when it
 * is put up, and the application at launch, so Settings has them from Home.
 */
export function offerWorkspaces(workspaces: readonly OfferedWorkspace[]): void {
  offered = workspaces.map(({ id, name, key }) => ({ id, name, key }));
  // A workspace no longer offered has no keys to list.
  for (const id of [...added.keys()]) if (!offered.some((workspace) => workspace.id === id)) added.delete(id);
}

/** One row a workspace tab's key: `Notes [Alt + 2]`, from its manifest. */
export function workspaceRows(): readonly HotkeyRow[] {
  return offered.map((workspace) => ({ id: `workspace-${workspace.id}`, label: workspace.name, chord: workspaceChord(workspace.key) }));
}

/** The keys workspaces have added, grouped under each workspace (its id and name), in the bar's order. */
export function addedGroups(): readonly { readonly id: string; readonly name: string; readonly rows: readonly HotkeyRow[] }[] {
  return offered.flatMap((workspace) => {
    const keys = added.get(workspace.id)?.keys ?? [];
    return keys.length === 0 ? [] : [{ id: workspace.id, name: workspace.name, rows: keys.map(({ id, label, chord }) => ({ id, label, chord })) }];
  });
}

/** The keys a workspace has added, to answer while it is on screen. */
export function keysOf(workspaceId: string): readonly Hotkey[] {
  return added.get(workspaceId)?.keys ?? [];
}

/** Keys taken elsewhere, asked each time a key is added. Answers the call that stops it. */
export function alsoTaken(source: () => readonly { readonly label: string; readonly chord: Chord }[]): () => void {
  taken.add(source);
  return () => void taken.delete(source);
}

/** Who has this key already, if anyone: a label, or `undefined` when it is free. */
export function ownerOf(chord: Chord): string | undefined {
  const fixed = [
    { label: "Home", chord: ESCAPE },
    { label: "Previous Workspace", chord: PREVIOUS_WORKSPACE },
    { label: "Next Workspace", chord: NEXT_WORKSPACE },
    ...workspaceRows(),
    ...[...added.values()].flatMap((each) => each.keys),
    ...[...taken].flatMap((source) => source()),
  ];
  return fixed.find((held) => chordsOverlap(held.chord, chord))?.label;
}

/**
 * Whether a chord may be a key at all (`shortcuts.ts`): never a bare
 * character, which is the writer typing, and Ctrl with Alt only on a named
 * key, never a character AltGr types.
 */
export function isKeyable(chord: Chord): boolean {
  const named = ctrlAltAllowed(chord.key);
  if (chord.mod === true && chord.alt === true) return named;
  return chord.mod === true || chord.alt === true || named;
}

/**
 * Add a key for a workspace. Answers how to take it away again, or
 * `undefined` — quietly — when the key is already someone's, or the id is,
 * or it is not a key a writer could press without typing (`isKeyable`).
 */
export function addHotkey(workspace: { readonly id: string; readonly name: string }, hotkey: Hotkey): (() => void) | undefined {
  if (!isKeyable(hotkey.chord) || ownerOf(hotkey.chord) !== undefined) return undefined;
  const own = added.get(workspace.id) ?? { name: workspace.name, keys: [] };
  if (own.keys.some((key) => key.id === hotkey.id)) return undefined;
  own.keys.push(hotkey);
  added.set(workspace.id, own);
  return () => {
    const at = own.keys.indexOf(hotkey);
    if (at >= 0) own.keys.splice(at, 1);
    if (own.keys.length === 0 && added.get(workspace.id) === own) added.delete(workspace.id);
  };
}
