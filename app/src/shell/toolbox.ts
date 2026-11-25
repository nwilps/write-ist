/**
 * Putting a workspace's toolbox together (ADR-0045): the calls the shell
 * already had for it (`EarlierCalls`), and around them the grouped calls,
 * each a narrow door onto a system the application already has — scoped to
 * this workspace, so it reaches its own files, its own places, its own keys
 * and settings, and no other workspace's.
 *
 * Nothing here knows what a workspace is for. It reads the manifest's id,
 * name, `files` and `settings`, and nothing else of it.
 */
import { readDetails } from "../../../src/project/details.ts";
import { workspaceFiles } from "../../../src/project/workspace-files.ts";
import { plainSpelling, type PlainSpellEngine, type WordAt } from "../../../src/spelling/plain.ts";
import { settingValue, type WorkspaceSettingValues } from "../../../src/settings/workspace-settings.ts";
import { openContextMenu } from "../menus/context-menu.ts";
import { claimMenu, releaseMenu } from "../menus/drop-menu.ts";
import { showConfirm } from "../screens/confirm-dialog.ts";
import { chordMatches, isCapturedKey } from "../screens/shortcuts.ts";
import { addHotkey } from "./hotkeys.ts";
import { TOOLBOX_VERSION, type EarlierCalls, type Toolbox, type WorkspaceManifest } from "./workspace.ts";

/** What the shell knows that the toolbox is built from. */
export interface ToolboxParts {
  readonly manifest: WorkspaceManifest;
  /** The element the workspace was drawn into: dialogs go over it. */
  readonly host: HTMLElement;
  /** The calls the context had before the toolbox, as the shell makes them for this workspace. */
  readonly earlier: EarlierCalls & Pick<Toolbox, "project" | "report" | "leave" | "ledger" | "chooseCopyLocation" | "choosePdfLocation">;
  /** Whether this workspace is the one on screen: its hotkeys answer only then. */
  readonly onScreen: () => boolean;
  /** The application's dictionary, if it has one. */
  readonly spellEngine?: PlainSpellEngine | undefined;
  /** The values of the workspaces' application-wide settings, as Settings keeps them. */
  readonly appSettings: () => WorkspaceSettingValues | undefined;
  /** The writer changed Settings. Answers how to stop listening. */
  readonly whenAppSettingsChanged: (act: () => void) => () => void;
}

/** A toolbox, and how to put it away when its workspace comes down. */
export interface BuiltToolbox {
  readonly toolbox: Toolbox;
  /** Take away its hotkeys and stop listening for them. */
  readonly dispose: () => void;
}

export function buildToolbox(parts: ToolboxParts): BuiltToolbox {
  const { manifest, earlier } = parts;
  const id = manifest.id;
  const projectId = (): string => earlier.project.marker.projectId;

  // --- Hotkeys: answered while this workspace is on screen and no dialog is open. ---
  const removals = new Set<() => void>();
  const hotkeys: Parameters<Toolbox["hotkeys"]["add"]>[0][] = [];
  const pressed = (event: KeyboardEvent): void => {
    if (!parts.onScreen() || document.querySelector("dialog[open]") !== null || isCapturedKey(event)) return;
    const found = hotkeys.find((hotkey) => chordMatches(hotkey.chord, event));
    if (found === undefined) return;
    event.preventDefault();
    if (!event.repeat) found.act();
  };
  let listening = false;

  // --- Spellcheck: the application's dictionary, as plain text asks it. ---
  const engine = parts.spellEngine;
  const check = async (text: string): Promise<readonly WordAt[]> => {
    if (engine === undefined) return [];
    // A pass of its own, on for the one question: the rule for what a word is stays the Editor's.
    const pass = plainSpelling(engine, () => {});
    await pass.setOn(true, text);
    return pass.misspelt(text);
  };

  const settingOf = (setting: string) => {
    const found = manifest.settings?.find((each) => each.id === setting);
    if (found === undefined) throw new Error(`${setting} is not one of ${manifest.name}'s settings.`);
    return found;
  };

  const toolbox: Toolbox = {
    ...earlier,
    get project() {
      return earlier.project;
    },
    version: TOOLBOX_VERSION,
    workspace: { id, name: manifest.name },
    files: workspaceFiles({
      filesystem: earlier.filesystem,
      project: () => earlier.project,
      declared: manifest.files,
      report: earlier.report,
      setSaved: earlier.setSaved,
      whenSwitchedAway: earlier.whenSwitchedAway,
      whenSwitchedBack: earlier.whenSwitchedBack,
    }),
    memory: {
      recall: async (item) => {
        try {
          return await earlier.workspacePlaces()?.recall(projectId(), id, item);
        } catch {
          return undefined;
        }
      },
      remember: async (place, item) => {
        const places = earlier.workspacePlaces();
        if (places === undefined) return false;
        await places.remember(projectId(), id, place, item);
        return true;
      },
      forget: async (item, movedTo) => {
        await earlier.workspacePlaces()?.forget(projectId(), id, item, movedTo);
      },
    },
    spelling: {
      available: engine !== undefined,
      check,
      misspelled: async (words) => (engine === undefined ? [] : engine.misspelled(words)),
      suggest: async (word) => (engine === undefined ? [] : engine.suggest(word)),
      addWord: async (word) => (engine === undefined ? false : engine.addWord(word)),
    },
    pills: {
      setStatus: earlier.setStatus,
      setGoal: earlier.setGoal,
      whenGoalsAsked: earlier.whenGoalsAsked,
      setSaved: earlier.setSaved,
      setSpellcheck: earlier.setSpellcheck,
    },
    hotkeys: {
      add: (hotkey) => {
        const remove = addHotkey(manifest, hotkey);
        if (remove === undefined) return undefined;
        hotkeys.push(hotkey);
        if (!listening) {
          window.addEventListener("keydown", pressed, true);
          listening = true;
        }
        const taken = (): void => {
          remove();
          removals.delete(taken);
          const at = hotkeys.indexOf(hotkey);
          if (at >= 0) hotkeys.splice(at, 1);
        };
        removals.add(taken);
        return taken;
      },
    },
    menus: {
      open: openContextMenu,
      claim: claimMenu,
      release: releaseMenu,
    },
    dialogs: {
      confirm: (spec) => void showConfirm(parts.host, spec),
    },
    settings: {
      read: async (setting) => {
        const found = settingOf(setting);
        if (found.place === "app") return settingValue(parts.appSettings(), id, found);
        const { details } = await readDetails(earlier.filesystem, earlier.project.path);
        return settingValue(details.workspaceSettings, id, found);
      },
      whenChanged: (act) => {
        const stopApp = parts.whenAppSettingsChanged(act);
        const stopDetails = earlier.whenDetailsChanged(() => act());
        return () => {
          stopApp();
          stopDetails();
        };
      },
      open: earlier.openSettings,
    },
    details: {
      read: async () => (await readDetails(earlier.filesystem, earlier.project.path)).details,
      edit: earlier.editProjectDetails,
      whenAsked: earlier.whenDetailsAsked,
      whenChanged: earlier.whenDetailsChanged,
    },
    window: {
      whenSwitchedAway: earlier.whenSwitchedAway,
      whenSwitchedBack: earlier.whenSwitchedBack,
    },
  };

  return {
    toolbox,
    dispose: () => {
      for (const remove of [...removals]) remove();
      if (listening) window.removeEventListener("keydown", pressed, true);
      listening = false;
    },
  };
}
