/**
 * **The toolbox's public module** (ADR-0045): the one thing a workspace
 * imports from the application.
 *
 * A workspace is given its toolbox when it is mounted (`mount(into,
 * toolbox)`), and every system it uses — files, the writer's place,
 * spellcheck, the pills, hotkeys, settings, menus, dialogs — is a call on it.
 * What it needs besides, to write its own types and draw its own surface, is
 * here: the contract's types, and the few small pieces every screen of
 * Write-ist is drawn with. Nothing else under `app/src/` is a workspace's to
 * import; `test/app/toolbox.test.ts` holds Notes, Plan and the template to
 * that.
 *
 * The guide is `docs/WORKSPACES.md`; the folder to copy is
 * `app/src/workspaces/_template/`.
 */

// The contract.
export {
  TOOLBOX_VERSION,
  type DetailsRequest,
  type GoalPill,
  type MountedWorkspace,
  type SaveState,
  type SettingsRequest,
  type Toolbox,
  type WorkspaceHotkey,
  type WorkspaceManifest,
} from "../shell/workspace.ts";
export type { WorkspaceSetting } from "../../../src/settings/workspace-settings.ts";

// What the calls take and answer.
export type { FileWork, FolderEntry, OpenFile, WorkspaceFiles } from "../../../src/project/workspace-files.ts";
export type { FileSaveState, WorkspaceFileRead } from "../../../src/project/workspace-file.ts";
export type { WorkspacePlace } from "../../../src/project/workspace-places.ts";
export type { ProjectDetails } from "../../../src/project/details.ts";
export type { Project } from "../../../src/project/bundle.ts";
export type { PlainSpellEngine, WordAt } from "../../../src/spelling/plain.ts";
export type { ConfirmSpec } from "../screens/confirm-dialog.ts";
export type { ContextMenu, ContextMenuSpec } from "../menus/context-menu.ts";
export type { MenuAside, MenuDivider, MenuEntry, MenuItem } from "../menus/drop-menu.ts";

// The small pieces every screen is drawn with.
/** Make an element with properties and children, as every screen does. */
export { element } from "../screens/element.ts";
/** Keys: whether a press is a chord, how a chord is written beside a menu item, whether a field has the keys. */
export { chordHint, chordMatches, isCapturedKey, type Chord } from "../screens/shortcuts.ts";
/** An error's own words, for the end of a sentence about the writer's file. */
export { message } from "../screens/trouble.ts";
