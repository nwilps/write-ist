/**
 * What a workspace declares to the shell (ADR-0005).
 *
 * > Workspaces use the same shape. The shell hosts them through a uniform
 * > registry; each declares itself — its name, its place in the workspace bar,
 * > which formats show it by default — and the shell hosts it without knowing
 * > what it is. […] Get this right and a new workspace is a manifest; get it
 * > wrong and every workspace is surgery in the shell.
 *
 * Three workspaces come through it: the Editor, Notes and Plan
 * (`app/src/workspaces/registry.ts`), each a manifest and a folder of its own.
 * Which of them a project shows is the project's (Edit Project Details,
 * `src/project/details.ts`); the shell shows those, and every workspace that is
 * `alwaysOn`. That is the whole point of the manifest: the next workspace (the
 * Log, say) arrives as an entry in the registry rather than as a change in
 * here. ADR-0005 records that stating this rule is what failed last time —
 * v1's architecture document already said modes must never be hard-coded into
 * the shell, and v1 still produced a 3,535-line `Draft.tsx`.
 *
 * **This is a doorway, not a plugin system.** It is a list in code and a typed
 * shape; nothing is loaded from anywhere. Everything below is what a workspace
 * may be given or asked, and none of it names what a workspace holds.
 *
 * **What a workspace is given is the toolbox** (`Toolbox`, ADR-0045): one
 * versioned object, handed to `mount`, through which a workspace reaches
 * everything the application already does — its files, the writer's place,
 * spellcheck, the pills, hotkeys, settings, menus and dialogs. It is a public
 * contract: a call is added freely, and is removed or renamed only by a dated
 * amendment to ADR-0045. `docs/WORKSPACES.md` is the guide, and
 * `app/src/workspaces/_template/` the folder to copy. A workspace imports from
 * `app/src/toolbox/` and nothing else of the application's.
 *
 * So the rule has a form a test can fail on, and
 * `test/app/shell-knows-nothing.test.ts` is it.
 */
import type { IconNode } from "lucide";
import type { Project } from "../../../src/project/bundle.ts";
import type { Filesystem } from "../../../src/project/filesystem.ts";
import type { Ledger } from "../../../src/project/ledger.ts";
import type { Places } from "../../../src/project/places.ts";
import type { ProjectDetails } from "../../../src/project/details.ts";
import type { WorkspaceFiles } from "../../../src/project/workspace-files.ts";
import type { WorkspacePlace, WorkspacePlaces } from "../../../src/project/workspace-places.ts";
import type { WordAt } from "../../../src/spelling/plain.ts";
import type { WorkspaceSetting } from "../../../src/settings/workspace-settings.ts";
import type { ContextMenu, ContextMenuSpec } from "../menus/context-menu.ts";
import type { ConfirmSpec } from "../screens/confirm-dialog.ts";
import type { ProjectDetailsRoute } from "../screens/project-dialogs.ts";
import type { Chord } from "../screens/shortcuts.ts";

/**
 * How a workspace has the open project's details edited (Edit Project
 * Details): where the dialog goes, how a rename's move fits around the
 * workspace's own writing, and what to do when it closes. The shell follows
 * the name and the workspaces shown itself.
 */
export type DetailsRequest = Omit<ProjectDetailsRoute, "renamed" | "detailsChanged">;

/** Where the Settings dialog goes, and what to do when it closes. */
export interface SettingsRequest {
  readonly into: HTMLElement;
  readonly closed: () => void;
}

/** Where a workspace's work stands against the disk. */
export type SaveState = "saved" | "unsaved" | "saving";

/**
 * The toolbox's version. **A public contract** (ADR-0045): calls are added
 * without changing it; a call removed or renamed, or one whose promise
 * changes, raises it — and only by a dated amendment to ADR-0045.
 */
export const TOOLBOX_VERSION = 1;

/** A hotkey a workspace adds (`toolbox.hotkeys.add`). */
export interface WorkspaceHotkey {
  /** Stable within the workspace; never shown. */
  readonly id: string;
  /** What the Hotkeys lists call it. */
  readonly label: string;
  readonly chord: Chord;
  /** Pressed while this workspace is on screen and no dialog is open. */
  readonly act: () => void;
}

/** A goal for the Goal pill: what it says, and the hooks the stylesheet colours it by. */
export interface GoalPill {
  readonly text: string;
  readonly kind: string;
  readonly state: string;
}

/**
 * **The toolbox: everything a workspace is given** (ADR-0045), version
 * `TOOLBOX_VERSION`. Nothing in it names a surface or a workspace.
 *
 * Grouped by what it is for; each call is one line (`docs/WORKSPACES.md`
 * has an example of every one). After the groups come the calls the context
 * had before the toolbox, which the Editor still uses (`EarlierCalls`).
 */
export interface Toolbox extends EarlierCalls {
  /** Which version of this contract it is. */
  readonly version: typeof TOOLBOX_VERSION;
  /** Which workspace this toolbox is for: its manifest's id and name. */
  readonly workspace: { readonly id: string; readonly name: string };
  /**
   * Which project is open — a path and what its marker says (ADR-0015). **As it
   * is now**: a rename moves the folder while the workspace stays up, so read
   * this when it is needed rather than keeping it.
   */
  readonly project: Project;

  /**
   * **Files** — the files and folders the manifest declares (`files`), and
   * nothing else: paths inside the project's folder, `"notes/Ideas.md"`.
   * Read, open for saving (the safe save, autosave and the save pill), list,
   * make, move (never over another file) and delete (for good: ask first).
   * See `src/project/workspace-files.ts`.
   */
  readonly files: WorkspaceFiles;

  /**
   * **Place memory** — where the writer was in this workspace of this project
   * (a caret, a scroll, which tabs), kept in `workspace-places.txt` in app
   * data, never in the project (ADR-0009, ADR-0012). A place is a few named
   * whole numbers and short texts; `item` keeps one for each thing in the
   * workspace (each note, by name).
   */
  readonly memory: {
    /** The place kept, or `undefined`. Never rejects. */
    readonly recall: (item?: string) => Promise<WorkspacePlace | undefined>;
    /**
     * Keep it. Answers `false`, keeping nothing, when there is nowhere to keep
     * it yet; rejects, writing nothing, when the file there will not read.
     */
    readonly remember: (place: WorkspacePlace, item?: string) => Promise<boolean>;
    /** Forget an item's place, or move it to a new name. */
    readonly forget: (item: string, movedTo?: string) => Promise<void>;
  };

  /**
   * **Spellcheck** — the application's dictionary, the one the Editor uses
   * (ADR-0032): offline, and a word added here is added everywhere.
   * `available` is false when there is none; then nothing else answers.
   */
  readonly spelling: {
    readonly available: boolean;
    /** The words in `text` the dictionary does not know, where they are. */
    readonly check: (text: string) => Promise<readonly WordAt[]>;
    /** Which of these words the dictionary does not know. */
    readonly misspelled: (words: readonly string[]) => Promise<readonly string[]>;
    readonly suggest: (word: string) => Promise<readonly string[]>;
    /** Add a word to the writer's own dictionary. Answers whether it was new. */
    readonly addWord: (word: string) => Promise<boolean>;
  };

  /**
   * **Pills** — the furniture at the foot of the desk. The shell draws them;
   * what they say is the workspace's, and each workspace's are its own.
   */
  readonly pills: {
    /** The counts pill, bottom right: a short line. `""` hides it. */
    readonly setStatus: (text: string) => void;
    /** The Goal pill, bottom left, or hide it with `undefined` (ADR-0040). */
    readonly setGoal: (pill: GoalPill | undefined) => void;
    /** The writer pressed the counts pill or the Goal pill. Answers how to stop listening. */
    readonly whenGoalsAsked: (act: () => void) => () => void;
    /** The save pill. A workspace that opens its files through `files` need not call this. */
    readonly setSaved: (state: SaveState) => void;
    /** The spellcheck pill: shown while this workspace's spellcheck is on. */
    readonly setSpellcheck: (on: boolean) => void;
  };

  /**
   * **Hotkeys** — add a key, listed in View ▸ Hotkeys and Settings ▸ Hotkeys
   * under the workspace's name, and answered while it is on screen. A key
   * someone already has is refused, quietly: `add` answers `undefined`.
   * Otherwise it answers how to take the key away; it goes by itself when
   * the workspace comes down.
   */
  readonly hotkeys: {
    readonly add: (hotkey: WorkspaceHotkey) => (() => void) | undefined;
  };

  /**
   * **Menus** — Write-ist's own (ADR-0034), never the system's: the menu File,
   * Edit and View are drawn with, opened where the workspace says.
   */
  readonly menus: {
    /** Open a menu of items at a point; answers it, to close. */
    readonly open: (spec: ContextMenuSpec) => ContextMenu;
    /** A menu-like thing of the workspace's own (a picker) is open: any other closes. */
    readonly claim: (menu: { readonly close: (returnFocus?: boolean) => void }) => void;
    /** …and is closed again. */
    readonly release: (menu: { readonly close: (returnFocus?: boolean) => void }) => void;
  };

  /**
   * **Dialogs** — the application's confirm, in the workspace's own words:
   * Cancel [Esc] and one action [Enter], over the workspace. `alarm` is the
   * alarm colour Exile uses, with focus on Cancel, for what cannot be undone.
   * Never the system's `confirm()` or `alert()` (ADR-0034).
   */
  readonly dialogs: {
    readonly confirm: (spec: ConfirmSpec) => void;
  };

  /**
   * **Settings** — the workspace's own switches, declared in its manifest
   * (`settings`) and drawn by the application in Settings, Edit Project
   * Details and New Project Defaults (`WorkspaceSetting`).
   */
  readonly settings: {
    /** A setting's value now: kept, or its default. */
    readonly read: (id: string) => Promise<boolean>;
    /** The writer changed one of them. Answers how to stop listening. */
    readonly whenChanged: (act: () => void) => () => void;
    /** Open the application's Settings dialog over the workspace. */
    readonly open: (request: SettingsRequest) => void;
  };

  /**
   * **Project details** — the open project's name, type, target page count
   * and workspaces (Edit Project Details).
   */
  readonly details: {
    /** As `details.md` holds them now. Never rejects: unreadable reads as the defaults. */
    readonly read: () => Promise<ProjectDetails>;
    /** Open Edit Project Details over the workspace (`editProjectDetails`). */
    readonly edit: (request: DetailsRequest) => void;
    /** The writer clicked the project's name pill. Answers how to stop listening. */
    readonly whenAsked: (act: () => void) => () => void;
    /** The details were saved, from any workspace. Answers how to stop listening. */
    readonly whenChanged: (act: (details: ProjectDetails) => void) => () => void;
  };

  /** **The window** — the writer switched to another application, or came back. */
  readonly window: {
    readonly whenSwitchedAway: (act: () => void) => () => void;
    readonly whenSwitchedBack: (act: () => void) => () => void;
  };

  /**
   * Something went wrong that the writer must see, in words about their file.
   *
   * A workspace reports rather than drawing its own alarm, because trouble
   * belongs to the frame the writer is looking at and the shell is what knows
   * which that is.
   */
  readonly report: (trouble: string) => void;
  /**
   * Where the writer can go from here. Both close this project first — saving
   * it, and staying open if that fails (ADR-0028) — so a workspace offers them
   * without knowing how, and without a second path to closing.
   */
  readonly leave: {
    /** To the list of projects. */
    readonly toProjects: () => void;
    /** To the home screen, which is also where Esc goes. */
    readonly toHome: () => void;
  };
  /**
   * The writer's days (ADR-0017). One ledger for the whole application, opened
   * at launch. A workspace records a day when a project closes; the shell
   * passes the ledger through and does not read it.
   *
   * A function, not the ledger itself: launch opens it in the background, and
   * a project may be on screen before that finishes. Asking at close sees
   * whichever answer launch arrived at.
   */
  readonly ledger: () => Ledger | undefined;
  /**
   * Ask the writer where a copy of their work should go (a save dialog), given
   * the name to offer. Answers the chosen path, or `undefined` if they
   * cancelled. Given rather than found, like the window events: the dialog is
   * the application's, and the choice is the only permission it carries.
   */
  readonly chooseCopyLocation: (suggestedName: string) => Promise<string | undefined>;
  /** The same for the PDF export: a save dialog, the chosen path or `undefined`. */
  readonly choosePdfLocation: (suggestedName: string) => Promise<string | undefined>;
}

/**
 * **The calls the context had before the toolbox** — part of version 1, and
 * kept. The Editor reaches the manuscript through them (`filesystem` is the
 * whole disk, which the manuscript, its names and its exports need); each of
 * the others is the same as a grouped call above. **A new workspace uses the
 * groups**, never these: `files` keeps it to its own files, where
 * `filesystem` would not. `test/app/toolbox.test.ts` holds Notes and Plan to
 * that. Retiring these, once the Editor has moved, is a dated amendment to
 * ADR-0045.
 */
export interface EarlierCalls {
  /** The disk, unscoped: the Editor's manuscript. A new workspace uses `files`. */
  readonly filesystem: Filesystem;
  /** `window.whenSwitchedAway`. */
  readonly whenSwitchedAway: (act: () => void) => () => void;
  /** `window.whenSwitchedBack`. */
  readonly whenSwitchedBack: (act: () => void) => () => void;
  /** `pills.setStatus`. */
  readonly setStatus: (text: string) => void;
  /** `pills.setGoal`. */
  readonly setGoal: (pill: GoalPill | undefined) => void;
  /** `pills.whenGoalsAsked`. */
  readonly whenGoalsAsked: (act: () => void) => () => void;
  /** `details.whenAsked`. */
  readonly whenDetailsAsked: (act: () => void) => () => void;
  /**
   * `details.edit`: open Edit Project Details for this project. The shell's
   * name pill, `project` and the workspace bar follow; the workspace stays
   * mounted. A rename's move waits its turn with every workspace that is up
   * (`MountedWorkspace.relocate`), not only the one that asked.
   */
  readonly editProjectDetails: (request: DetailsRequest) => void;
  /** `details.whenChanged`. */
  readonly whenDetailsChanged: (act: (details: ProjectDetails) => void) => () => void;
  /** `settings.open`. */
  readonly openSettings: (request: SettingsRequest) => void;
  /** `pills.setSaved`. */
  readonly setSaved: (state: SaveState) => void;
  /** `pills.setSpellcheck`. */
  readonly setSpellcheck: (on: boolean) => void;
  /**
   * Where the writer was in each project's manuscript, kept in app data
   * between sessions (`places.txt`) — the Editor's caret. Opened at launch,
   * so a function, as the ledger is.
   */
  readonly places: () => Places | undefined;
  /** Every workspace's places, unscoped. A new workspace uses `memory`. */
  readonly workspacePlaces: () => WorkspacePlaces | undefined;
}

/** The name the toolbox had before it was one (ADR-0045): the same object. */
export type WorkspaceContext = Toolbox;

/** A workspace that has been put on screen. */
export interface MountedWorkspace {
  /**
   * Take it down again, releasing whatever it holds — **and answer whether it
   * came down.**
   *
   * A workspace may have work to finish. The Editor saves the manuscript on
   * the way out (ADR-0028), and a save that fails leaves the writer's last
   * sentence nowhere but on screen. So it answers `false` rather than tearing
   * down over work it could not finish: it stays up, with what happened said
   * beside it, and the writer can try again or take their own copy.
   *
   * The alternative was to come down anyway and report. There is nowhere to
   * report to — the frame the message would go in is the frame being removed —
   * and the words being removed with it is the silent destruction ADR-0008
   * exists to end.
   */
  readonly unmount: () => Promise<boolean>;
  /** Give the keys back to the workspace, when a menu of the shell's closes. */
  readonly focus?: () => void;
  /**
   * The writer chose another workspace's tab. This one stays mounted, out of
   * sight, so its selection, scroll and undo history are there when they come
   * back. It should save what is waiting — leaving a workspace is one of the
   * moments ADR-0028 saves at — and stop answering keys the window hears.
   */
  readonly hide?: () => void;
  /** Back on screen after `hide`: take the keys again. */
  readonly show?: () => void;
  /**
   * Run a move of the project's folder (a rename) at a moment when this
   * workspace is not writing, and go on writing where it went. Any workspace
   * that writes files in the folder should have it; the shell asks every one
   * that is up, so a rename asked for in one never moves the folder under
   * another's save.
   */
  readonly relocate?: (move: () => Promise<Project>) => Promise<Project>;
}

export interface WorkspaceManifest {
  /** Stable, and not shown to the writer. */
  readonly id: string;
  /** What the workspace bar calls it. */
  readonly name: string;
  /**
   * The key for reaching it from the keyboard: Alt and this selects its tab
   * (`workspace-keys.ts`). Declared here because it is part of what a workspace
   * *is*, and adding it later would mean touching every manifest.
   */
  readonly key: string;
  /** The Lucide icon drawn before its name in the workspace bar (ADR-0035). */
  readonly icon: IconNode;
  /**
   * Always on: shown in every project, and not offered as a switch in Edit
   * Project Details. The Editor is; a project with no workspace for its
   * manuscript would be a project that cannot be written in.
   */
  readonly alwaysOn?: true;
  /**
   * Whether the project name pill at the foot of the desk is shown while this
   * workspace is on screen. Shown unless this says `false`: a workspace whose
   * own surface runs down to the foot can ask for the room. The pill is the
   * shell's; only whether it is drawn is the workspace's. File ▸ Edit Project
   * Details is there either way.
   */
  readonly showsProjectName?: false;
  /**
   * Whether the paper's fades — the bands at the window's top and bottom edges
   * that the Editor's writing fades into — are drawn while this workspace is
   * on screen. Drawn unless this says `false`: a workspace with no paper under
   * them, whose own surface would be faded or banded by them, asks them away.
   * The fades are the shell's; only whether they are drawn is the workspace's.
   */
  readonly showsPaperFade?: false;
  /**
   * The files in a project's folder that hold this workspace's work, by name;
   * a name ending in `/` is a folder, and everything in it (ADR-0025:
   * `plan.md` is Plan's, the `notes/` folder Notes'). Declared so what
   * belongs to a workspace is said where the workspace is. Turning a
   * workspace off for a project hides its tab, takes it down (saving it, as
   * closing does) and **never touches these**: turning it on again finds them
   * as they were.
   */
  readonly files: readonly string[];
  /**
   * **The third thing ADR-0005 names is deliberately absent**: *"which formats
   * show it by default"*.
   *
   * It is missing rather than forgotten. A format is data (ADR-0006) and today
   * every format is a screenplay that shows the same workspaces, so a field
   * listing which formats show this workspace could only ever hold every one of
   * them — an abstraction for a need nothing has yet. It arrives with the first
   * format that differs, and it costs one line in each manifest then. Notes and
   * Plan did not need it: both are for any project (ADR-0006, and Plan is
   * medium-agnostic), so every format shows every workspace until the writer
   * turns one off.
   */
  /**
   * Its own settings (`WorkspaceSetting`), if it has any: switches the
   * application draws in Settings ▸ General (`place: "app"`), or in Edit
   * Project Details and Settings ▸ New Project Defaults (`place: "project"`),
   * under the workspace's name, and keeps in the files settings are kept in.
   * Read with `toolbox.settings.read`. None of the workspaces has any yet;
   * the hook is here so the next one need not change the application.
   */
  readonly settings?: readonly WorkspaceSetting[];
  /** Draw it into the element given, and answer how to take it down. Everything it may use is in `toolbox`. */
  readonly mount: (into: HTMLElement, toolbox: Toolbox) => MountedWorkspace;
}
