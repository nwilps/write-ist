/**
 * What a workspace declares to the shell (ADR-0005).
 *
 * > Workspaces use the same shape. The shell hosts them through a uniform
 * > registry; each declares itself — its name, its place in the workspace bar,
 * > which formats show it by default — and the shell hosts it without knowing
 * > what it is. […] Get this right and a new workspace is a manifest; get it
 * > wrong and every workspace is surgery in the shell.
 *
 * The Editor is the one real workspace. The workspace bar is drawn, and beside
 * the Editor it lists Notes and Plan, which are placeholders for now
 * (`app/src/workspaces/placeholders.ts`). That is the whole point of the
 * manifest: those tabs, and the real Notes, Plan and Log workspaces after them,
 * arrive as entries in a registry rather than as changes in here. ADR-0005 records that stating this rule is what failed
 * last time — v1's architecture document already said modes must never be
 * hard-coded into the shell, and v1 still produced a 3,535-line `Draft.tsx`.
 *
 * So the rule has a form a test can fail on, and
 * `test/app/shell-knows-nothing.test.ts` is it.
 */
import type { IconNode } from "lucide";
import type { Project } from "../../../src/project/bundle.ts";
import type { Filesystem } from "../../../src/project/filesystem.ts";
import type { Ledger } from "../../../src/project/ledger.ts";
import type { Places } from "../../../src/project/places.ts";
import type { RenameRoute } from "../screens/project-dialogs.ts";

/**
 * How a workspace has the open project renamed: where the dialog goes, how the
 * move fits around the workspace's own writing, and what to do when it closes.
 */
export type RenameRequest = Omit<RenameRoute, "renamed">;

/** Where the Settings dialog goes, and what to do when it closes. */
export interface SettingsRequest {
  readonly into: HTMLElement;
  readonly closed: () => void;
}

/** Where a workspace's work stands against the disk. */
export type SaveState = "saved" | "unsaved" | "saving";

/** Everything a workspace is given. Nothing in it names a surface. */
export interface WorkspaceContext {
  /**
   * Which project is open — a path and what its marker says (ADR-0015). **As it
   * is now**: a rename moves the folder while the workspace stays up, so read
   * this when it is needed rather than keeping it.
   */
  readonly project: Project;
  readonly filesystem: Filesystem;
  /**
   * Something went wrong that the writer must see, in words about their file.
   *
   * A workspace reports rather than drawing its own alarm, because trouble
   * belongs to the frame the writer is looking at and the shell is what knows
   * which that is.
   */
  readonly report: (trouble: string) => void;
  /**
   * The writer switched to another application. Answers how to stop listening.
   *
   * ADR-0028 makes that one of the three moments autosave fires, and it is
   * given to a workspace rather than found by one because *how the window
   * knows* is the window's business: the application asks Tauri, and a test
   * asks whatever it likes. A workspace that reached for the DOM's own `blur`
   * would be guessing at the system webview's behaviour, which is a guess that
   * fails quietly (`docs/STANDARDS.md`).
   */
  readonly whenSwitchedAway: (act: () => void) => () => void;
  /**
   * The writer came back to Write-ist from another application. Answers how to
   * stop listening.
   *
   * ADR-0028 has the manuscript on disk compared then with what Write-ist last
   * read or wrote — the moment something else is most likely to have changed
   * it. Given rather than found, for the same reason as `whenSwitchedAway`.
   */
  readonly whenSwitchedBack: (act: () => void) => () => void;
  /**
   * Put a short line in the counts pill, bottom right (the desk design, §2.3).
   *
   * The shell draws the furniture; the workspace decides what the line says.
   * The Editor puts its pages and words here (#48). The shell still does not
   * know what a page is — only that a workspace may have something to say.
   */
  readonly setStatus: (text: string) => void;
  /**
   * Put a goal in the Goal pill at the foot of the left, or hide the pill with
   * `undefined` (ADR-0040). The shell draws the pill and its placement; what it
   * says and which of its states it is in belong to the workspace. `kind` and
   * `state` are only hooks the stylesheet colours by.
   */
  readonly setGoal: (pill: { readonly text: string; readonly kind: string; readonly state: string } | undefined) => void;
  /**
   * Hear the writer click the counts pill or the Goal pill — the ways in to the
   * Goals dialog besides the menu. Given rather than found, like the window
   * events: the shell owns the pills, and says only that one was pressed.
   * Answers how to stop listening.
   */
  readonly whenGoalsAsked: (act: () => void) => () => void;
  /**
   * Hear the writer choose Rename Project on the project name pill. The shell
   * owns the pill; the workspace decides whether it can be renamed just now.
   * Answers how to stop listening.
   */
  readonly whenRenameAsked: (act: () => void) => () => void;
  /**
   * Ask the writer for a new name for this project, and rename it. The shell's
   * name pill and `project` follow; the workspace stays mounted.
   */
  readonly renameProject: (request: RenameRequest) => void;
  /**
   * Open the application's Settings dialog into `into`, over the workspace.
   * The shell passes this through and does not know what is in it.
   */
  readonly openSettings: (request: SettingsRequest) => void;
  /**
   * Say whether the workspace's work is on disk, in the save pill beside the
   * counts. `saving` is a save that has started and not yet landed; `unsaved`
   * is work waiting on the next one. A workspace with nothing to save never
   * calls this, and the pill stays on `saved`.
   */
  readonly setSaved: (state: SaveState) => void;
  /**
   * Show the spellcheck pill, just left of the counts, while the workspace's
   * spellcheck is on; hide it while it is off. Off to begin with. The pill only
   * says so — it is not a switch.
   */
  readonly setSpellcheck: (on: boolean) => void;
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
   * Where the writer was in each project, kept in app data between sessions.
   * Opened at launch like the ledger, so a function for the same reason; the
   * shell passes it through and does not read it.
   */
  readonly places: () => Places | undefined;
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
   * **The third thing ADR-0005 names is deliberately absent**: *"which formats
   * show it by default"*.
   *
   * It is missing rather than forgotten. A format is data (ADR-0006) and today
   * every format is a screenplay that shows the same workspaces, so a field
   * listing which formats show this workspace could only ever hold every one of
   * them — an abstraction for a need nothing has yet. It arrives with the first
   * format that differs or the second workspace, whichever comes first, and it
   * costs one line in each manifest then.
   */
  /** Draw it into the element given, and answer how to take it down. */
  readonly mount: (into: HTMLElement, context: WorkspaceContext) => MountedWorkspace;
}
