/**
 * The shell: the frame a project is worked in.
 *
 * `GLOSSARY.md`: *the application frame that hosts the workspaces and the
 * workspace bar without knowing what any workspace is.* So this file draws the
 * furniture, hands one element to a workspace, and knows nothing else — not which
 * surface the project runs on, not what an element is, not that a screenplay
 * exists. The registry in `app/src/workspaces/` is where that is known.
 *
 * **The furniture is the prototype's** (`nwilps/write-ist-ng`, `spike/plan.html`):
 * a full-height column with the workspace filling it and scrolling. **The desk
 * design has no full-width status bar** (§1, §2.3): the workspace bar floats
 * over the top, and along the foot three small pills float over the desk — the
 * project's name at the left, the workspace's counts and the save state at the
 * right — with, while spellcheck is on, a spellcheck pill just left of the counts.
 *
 * **Placement and proportion, not contents.** What goes in the counts pill is
 * the workspace's business — the Editor's pages and words (#48) — so the shell
 * carries the project's name and a slot the workspace fills, and a save state it
 * is told rather than works out.
 *
 * **Each workspace is handed its toolbox** (ADR-0045, `toolbox.ts`): the one
 * versioned object it reaches the application through, built here for it and
 * scoped to it, and put away when it comes down.
 */
import { createElement, Save, SaveCheck, SpellCheck, type IconNode } from "lucide";
import type { Project } from "../../../src/project/bundle.ts";
import type { Filesystem } from "../../../src/project/filesystem.ts";
import type { Ledger } from "../../../src/project/ledger.ts";
import type { Places } from "../../../src/project/places.ts";
import type { ProjectDetails } from "../../../src/project/details.ts";
import type { WorkspacePlaces } from "../../../src/project/workspace-places.ts";
import type { PlainSpellEngine } from "../../../src/spelling/plain.ts";
import type { WorkspaceSettingValues } from "../../../src/settings/workspace-settings.ts";
import { element } from "../screens/element.ts";
import { LEAVE, type Gesture } from "../screens/shortcuts.ts";
import { trouble as troublePanel } from "../screens/trouble.ts";
import type { ProjectDetailsRoute } from "../screens/project-dialogs.ts";
import { offerWorkspaces } from "./hotkeys.ts";
import { buildToolbox } from "./toolbox.ts";
import type {
  DetailsRequest,
  EarlierCalls,
  MountedWorkspace,
  SaveState,
  SettingsRequest,
  Toolbox,
  WorkspaceManifest,
} from "./workspace.ts";
import { workspaceAsked } from "./workspace-keys.ts";

export interface ShellScreen {
  /** Which project is open — a path and what its marker says (ADR-0015). */
  readonly project: Project;
  readonly filesystem: Filesystem;
  /**
   * The workspaces the application offers, in the order the bar lists them.
   * The first is the one on screen when the project opens; the others are
   * mounted the first time their tab is chosen.
   */
  readonly workspaces: readonly WorkspaceManifest[];
  /**
   * The ids of the workspaces this project shows (its details), or `undefined`
   * for every one. One that is `alwaysOn` is shown either way.
   */
  readonly shown?: readonly string[] | undefined;
  /** Close the project and go back to where it was chosen. */
  readonly onClose: () => void;
  /** Close the project and go to the home screen. */
  readonly onHome: () => void;
  /**
   * The writer switched to another application. Handed straight to the
   * workspace, which is the only thing that has anything to do about it — the
   * shell does not know what a workspace saves, or whether it saves at all.
   */
  readonly whenSwitchedAway: (act: () => void) => () => void;
  /** The writer came back to Write-ist. Handed straight on, like the other. */
  readonly whenSwitchedBack: (act: () => void) => () => void;
  /**
   * The writer's days. Handed straight to the workspace, the way the filesystem
   * is. The shell does not record a day and does not know what is being counted.
   */
  readonly ledger: () => Ledger | undefined;
  /** Where the writer was in each project. Handed straight on, like the ledger. */
  readonly places: () => Places | undefined;
  /** Where the writer was in each workspace of each project. Handed straight on, like the ledger. */
  readonly workspacePlaces?: () => WorkspacePlaces | undefined;
  /** Where a copy should go, asked of the writer. Handed straight to the workspace. */
  readonly chooseCopyLocation: (suggestedName: string) => Promise<string | undefined>;
  /** Where the PDF should go, asked the same way. */
  readonly choosePdfLocation: (suggestedName: string) => Promise<string | undefined>;
  /** Open Edit Project Details for the open project. */
  readonly askToEditDetails: (route: ProjectDetailsRoute) => void;
  /** Open the application's Settings. Handed straight to the workspace. */
  readonly openSettings: (request: SettingsRequest) => void;
  /** The application's dictionary, for every workspace's `toolbox.spelling`. None: spellcheck is not offered. */
  readonly spellEngine?: PlainSpellEngine | undefined;
  /** The values of the workspaces' application-wide settings, as Settings keeps them now. */
  readonly workspaceSettings?: () => WorkspaceSettingValues | undefined;
  /** The writer changed Settings. Answers how to stop listening. */
  readonly whenSettingsChanged?: (act: () => void) => () => void;
}

/** What the shell makes for a workspace before its toolbox is built round it. */
type ToolboxEarlier = EarlierCalls & Pick<Toolbox, "project" | "report" | "leave" | "ledger" | "chooseCopyLocation" | "choosePdfLocation">;

/** A shell that has been drawn, and what the window answers to while it is up. */
export interface MountedShell {
  readonly gestures: readonly Gesture[];
  /**
   * Take the shell and its workspace down, and answer whether it came down.
   *
   * The shell does not know what a workspace has left to finish, only that it
   * is not instant and that it may not be possible — the Editor's last save
   * (#41, ADR-0028). `false` means the project is still open and the writer
   * has been told why.
   */
  readonly unmount: () => Promise<boolean>;
  /** Say something beside the workspace, the way a workspace does. */
  readonly report: (wrong: string) => void;
  /**
   * Show these workspaces' tabs (ids; `undefined` for every one), as the
   * project's details now say. If the tab selected is one no longer shown,
   * the first workspace's is selected: the writer is back in it. A workspace
   * no longer shown is taken down, which saves it; its files stay where they
   * are, and turning it on again finds them as they were.
   */
  readonly showWorkspaces: (shown: readonly string[] | undefined) => void;
}

/** What a workspace has said to the pills, kept while another one is on screen. */
interface Pills {
  status: string;
  goal: { readonly text: string; readonly kind: string; readonly state: string } | undefined;
  saved: SaveState;
  spellcheck: boolean;
}

/** A workspace that has been put up, on screen or out of sight behind another. */
interface Hosted {
  readonly manifest: WorkspaceManifest;
  /** The element it was drawn into, its own; hidden while another workspace is on screen. */
  readonly host: HTMLElement;
  mounted: MountedWorkspace | undefined;
  /** Puts its toolbox away (its hotkeys) when it comes down. */
  dispose: () => void;
  readonly pills: Pills;
  readonly goalsAsked: Set<() => void>;
  readonly detailsAsked: Set<() => void>;
  readonly detailsChanged: Set<(details: ProjectDetails) => void>;
  /** Where the window was scrolled to when it was last left. */
  scroll: number;
}

/**
 * Draw the shell and mount its first workspace.
 *
 * Each workspace is mounted **once**, into an element of its own the shell
 * then leaves alone — the first when the project opens, each other the first
 * time its tab is chosen — and is hidden, not taken down, while another is on
 * screen. Redrawing the furniture around a live editing engine would throw away
 * its selection, its scroll position and eventually its undo stack, so the
 * shell does not own a `draw()` the way the menu screens do — it is put up
 * when a project opens and taken down when it closes.
 */
export function mountShell(into: HTMLElement, screen: ShellScreen): MountedShell {
  const gestures: readonly Gesture[] = [
    { label: "Home", key: LEAVE, act: screen.onHome },
  ];

  const view = element("main", { className: "shell__view" });
  // The counts slot stays empty until the workspace has something to say
  // (#48) — real text, never a guess — and its pill is hidden until then.
  // Pressing the counts or the Goal pill asks the workspace for its goals.
  const counts = element("button", { className: "pill pill--counts", type: "button", hidden: true });
  const goal = element("button", { className: "pill pill--goal", type: "button", hidden: true });
  const saved = savePill();
  // Spellcheck is off when a project opens, so its pill starts hidden. It says
  // only that the pass is on: a status, like the save pill, not a switch.
  const spelling = element("span", { className: "pill pill--spellcheck", hidden: true });
  spelling.setAttribute("role", "status");
  spelling.setAttribute("aria-label", "Spellcheck is on");
  const spellingIcon = createElement(SpellCheck as IconNode, { class: "pill__icon" });
  spellingIcon.setAttribute("aria-hidden", "true");
  spelling.append(spellingIcon);

  // The project as it is now: a rename replaces it with the workspace still up.
  let project = screen.project;
  // The project's name is which work they are in, and a click on it opens
  // Edit Project Details (Noah): a button, so Enter and Space open it too.
  // Right-click opens nothing; there is only the one thing to do here.
  const projectName = element("button", {
    className: "pill pill--project",
    type: "button",
    textContent: project.marker.name,
  });

  /**
   * **Every workspace that has been put up, by id.** One is on screen; the
   * others are hidden, still mounted, so the Editor's selection, scroll and
   * undo history are where the writer left them when they come back. Each is
   * mounted the first time its tab is chosen and taken down when the project
   * closes or the workspace is turned off.
   */
  const hosted = new Map<string, Hosted>();
  let active: Hosted | undefined;

  // The pills belong to whichever workspace is on screen, and say what it last said.
  const drawPills = (record: Hosted): void => {
    projectName.hidden = record.manifest.showsProjectName === false;
    counts.textContent = record.pills.status;
    counts.hidden = record.pills.status === "";
    const pill = record.pills.goal;
    goal.hidden = pill === undefined;
    if (pill !== undefined) {
      goal.textContent = pill.text;
      goal.dataset["kind"] = pill.kind;
      goal.dataset["state"] = pill.state;
    }
    saved.set(record.pills.saved);
    spelling.hidden = !record.pills.spellcheck;
  };
  const onScreen = (record: Hosted): boolean => active === record;
  // A press on a pill is the on-screen workspace's to answer.
  counts.addEventListener("click", () => active?.goalsAsked.forEach((act) => act()));
  goal.addEventListener("click", () => active?.goalsAsked.forEach((act) => act()));
  projectName.addEventListener("click", () => active?.detailsAsked.forEach((act) => act()));

  /**
   * A rename moves the folder under every workspace that is up, so the move
   * waits its turn with each of them (`relocate`): none of them writes while
   * the folder is on the move, and each goes on writing where it went.
   */
  const carryOutAround = (asking: Hosted, carryOut: DetailsRequest["carryOut"]): DetailsRequest["carryOut"] =>
    [...hosted.values()]
      .filter((record) => record !== asking)
      .reduce<DetailsRequest["carryOut"]>((inner, record) => {
        const relocate = record.mounted?.relocate;
        return relocate === undefined ? inner : (move) => relocate(() => inner(move));
      }, carryOut);

  /** What every workspace was given before the toolbox, and the toolbox is built round (`EarlierCalls`). */
  const earlierFor = (record: Hosted): ToolboxEarlier => ({
    get project() {
      return project;
    },
    filesystem: screen.filesystem,
    report: (wrong) => void record.host.append(troublePanel(wrong)),
    setStatus: (text) => {
      record.pills.status = text;
      if (onScreen(record)) drawPills(record);
    },
    setGoal: (pill) => {
      record.pills.goal = pill;
      if (onScreen(record)) drawPills(record);
    },
    whenGoalsAsked: (act) => {
      record.goalsAsked.add(act);
      return () => void record.goalsAsked.delete(act);
    },
    whenDetailsAsked: (act) => {
      record.detailsAsked.add(act);
      return () => void record.detailsAsked.delete(act);
    },
    whenDetailsChanged: (act) => {
      record.detailsChanged.add(act);
      return () => void record.detailsChanged.delete(act);
    },
    editProjectDetails: (request: DetailsRequest) =>
      screen.askToEditDetails({
        ...request,
        carryOut: carryOutAround(record, request.carryOut),
        renamed: (now) => {
          project = now;
          projectName.textContent = now.marker.name;
        },
        detailsChanged: (details) => {
          bar.show(details.workspaces);
          for (const each of hosted.values()) each.detailsChanged.forEach((act) => act(details));
        },
      }),
    openSettings: screen.openSettings,
    setSaved: (state) => {
      record.pills.saved = state;
      if (onScreen(record)) saved.set(state);
    },
    setSpellcheck: (on) => {
      record.pills.spellcheck = on;
      if (onScreen(record)) spelling.hidden = !on;
    },
    whenSwitchedAway: screen.whenSwitchedAway,
    whenSwitchedBack: screen.whenSwitchedBack,
    leave: { toProjects: screen.onClose, toHome: screen.onHome },
    ledger: screen.ledger,
    places: screen.places,
    workspacePlaces: screen.workspacePlaces ?? (() => undefined),
    chooseCopyLocation: screen.chooseCopyLocation,
    choosePdfLocation: screen.choosePdfLocation,
  });

  /** The workspace's toolbox (ADR-0045): everything it is given, in one versioned object. */
  const toolboxFor = (record: Hosted): Toolbox => {
    const built = buildToolbox({
      manifest: record.manifest,
      host: record.host,
      earlier: earlierFor(record),
      onScreen: () => onScreen(record),
      spellEngine: screen.spellEngine,
      appSettings: screen.workspaceSettings ?? (() => undefined),
      whenAppSettingsChanged: screen.whenSettingsChanged ?? (() => () => {}),
    });
    record.dispose = built.dispose;
    return built.toolbox;
  };

  const put = (manifest: WorkspaceManifest): Hosted => {
    const record: Hosted = {
      manifest,
      host: element("div", { className: "workspace" }),
      mounted: undefined,
      dispose: () => {},
      pills: { status: "", goal: undefined, saved: "saved", spellcheck: false },
      goalsAsked: new Set(),
      detailsAsked: new Set(),
      detailsChanged: new Set(),
      scroll: 0,
    };
    record.host.dataset["workspace"] = manifest.id;
    hosted.set(manifest.id, record);
    view.append(record.host);
    record.mounted = manifest.mount(record.host, toolboxFor(record));
    return record;
  };

  /**
   * Put this workspace on screen. The one leaving is hidden, not taken down,
   * and told (`hide`), so it can save what is waiting — leaving a workspace is
   * one of the moments ADR-0028 saves at — and stop answering the window's
   * keys. Each keeps its own place in the window's scroll.
   */
  const bringUp = (manifest: WorkspaceManifest): void => {
    if (active?.manifest.id === manifest.id) return;
    const leaving = active;
    if (leaving !== undefined) {
      leaving.scroll = view.scrollTop;
      leaving.host.hidden = true;
      leaving.mounted?.hide?.();
    }
    const arriving = hosted.get(manifest.id);
    if (arriving === undefined) {
      active = put(manifest);
      // Hosts are put up in the order their tabs were first chosen.
      drawPills(active);
      active.host.hidden = false;
      view.scrollTop = 0;
      return;
    }
    active = arriving;
    arriving.host.hidden = false;
    drawPills(arriving);
    view.scrollTop = arriving.scroll;
    arriving.mounted?.show?.();
  };

  /**
   * Take down a workspace the project no longer shows. Its files are not
   * touched: this is the same leaving as closing the project, so it saves
   * first, and one whose save failed stays up, out of sight, to be tried
   * again when the project closes.
   */
  const release = async (record: Hosted): Promise<boolean> => {
    const down = (await record.mounted?.unmount()) ?? true;
    if (!down) return false;
    record.dispose();
    record.host.remove();
    hosted.delete(record.manifest.id);
    return true;
  };

  // The Hotkeys lists name these workspaces' tabs, and no others.
  offerWorkspaces(screen.workspaces);

  let ready = false;
  const bar = workspaceBar(screen.workspaces, screen.shown, (manifest) => {
    if (ready) bringUp(manifest);
  }, (shownNow) => {
    if (!ready) return;
    for (const record of [...hosted.values()]) {
      if (!shownNow.includes(record.manifest) && record !== active) void release(record);
    }
  });
  // Alt and a tab's key, or Alt+Left and Alt+Right, choose a tab as a click
  // does. Heard first, so the webview never takes Alt+Left for Back; and not
  // while a dialog has the writer's attention.
  const askedForTab = (event: KeyboardEvent): void => {
    if (document.querySelector("dialog[open]") !== null) return;
    const to = workspaceAsked(bar.shown(), bar.selected(), event);
    if (to === undefined) return;
    event.preventDefault();
    if (!event.repeat) bar.select(to);
  };
  window.addEventListener("keydown", askedForTab, true);

  into.replaceChildren(
    element("div", { className: "shell" }, [
      bar.element,
      view,
      // The paper fades off under the window's top and bottom edges. Purely a
      // picture over the paper: it takes no clicks and is never in the document.
      element("div", { className: "paper-fade paper-fade--top", ariaHidden: "true" }),
      element("div", { className: "paper-fade paper-fade--bottom", ariaHidden: "true" }),
      element("div", { className: "pills pills--left" }, [
        projectName,
        goal,
      ]),
      element("div", { className: "pills pills--right" }, [spelling, counts, saved.pill]),
    ]),
  );

  // **Said beside the workspace that could not load, without taking the shell
  // down and putting it back up.** Remounting would mount the workspace again,
  // which would fail again, which would report again — a loop rather than a
  // message.
  const report = (wrong: string): void => void (active?.host ?? view).append(troublePanel(wrong));

  ready = true;
  bringUp(first(bar.shown()));

  /**
   * Every workspace that is up comes down, the one on screen last. One that
   * cannot (its last save failed) keeps the project open, and is put on screen
   * so the writer sees why.
   */
  const unmount = async (): Promise<boolean> => {
    const order = [...hosted.values()].sort((one, other) => Number(one === active) - Number(other === active));
    for (const record of order) {
      if (await release(record)) continue;
      const index = bar.shown().indexOf(record.manifest);
      if (index !== -1) bar.select(index);
      else bringUp(record.manifest);
      return false;
    }
    window.removeEventListener("keydown", askedForTab, true);
    return true;
  };
  return { gestures, unmount, report, showWorkspaces: bar.show };
}

/** What the save pill says, in words, for a screen reader. */
const SAVE_LABELS: Readonly<Record<SaveState, string>> = {
  saved: "Saved",
  unsaved: "Not yet saved",
  saving: "Saving",
};

/**
 * The save pill (the desk design, §2.3, §4): a 32px square holding one icon —
 * `save-check` in the affirm colour when the work is on disk, `save` dimmed
 * when it is not, and `save` pulsing while a save is under way. The state is
 * told to it; it never decides.
 *
 * A save on a local disk lands in a few milliseconds, too quick to see. So once
 * `saving` is shown it stays for the whole saving look (`--duration-saving`,
 * three seconds: three pulses, one a second), and a save that succeeded turns
 * green only when that is up. Work changed meanwhile is drawn at once, dimmed:
 * the green check never stands over unsaved work. Only the pill waits: the save
 * itself, and the state it reports, do not.
 */
function savePill(): { readonly pill: HTMLElement; readonly set: (state: SaveState) => void } {
  const drawings = {
    saved: createElement(SaveCheck as IconNode, { class: "pill__icon" }),
    unsaved: createElement(Save as IconNode, { class: "pill__icon" }),
    saving: createElement(Save as IconNode, { class: "pill__icon" }),
  };
  const pill = element("span", { className: "pill pill--save", role: "status" });
  // While the saving look runs: its timer, and whether the save has landed.
  let showing: ReturnType<typeof setTimeout> | undefined;
  let landed = false;
  const stop = (): void => {
    clearTimeout(showing);
    showing = undefined;
  };
  const set = (state: SaveState): void => {
    if (state === "unsaved") {
      stop();
      draw("unsaved");
      return;
    }
    if (state === "saving") {
      landed = false;
      if (showing === undefined && pill.dataset["state"] !== "saving") {
        draw("saving");
        showing = setTimeout(() => {
          showing = undefined;
          if (landed) draw("saved");
        }, savingLook());
      }
      return;
    }
    // `saved`: shown now if the saving look is over (or never ran), else when it is.
    landed = true;
    if (showing === undefined) draw("saved");
  };
  const draw = (state: SaveState): void => {
    pill.dataset["state"] = state;
    pill.setAttribute("aria-label", SAVE_LABELS[state]);
    const icon = drawings[state].cloneNode(true) as SVGElement;
    icon.setAttribute("aria-hidden", "true");
    pill.replaceChildren(icon);
  };
  set("saved");
  return { pill, set };
}

/**
 * How long the pill shows `saving`, in milliseconds, read from the token the
 * animation is built on so the two cannot drift apart. Without the stylesheet
 * there is no saving look to wait for.
 */
function savingLook(): number {
  const token = getComputedStyle(document.documentElement).getPropertyValue("--duration-saving").trim();
  const value = Number.parseFloat(token);
  if (Number.isNaN(value)) return 0;
  return token.endsWith("ms") ? value : value * 1000;
}

/**
 * The workspace on screen.
 *
 * A shell with no workspaces is a window with nothing in it, and a registry
 * that ended up empty is the kind of silent failure `docs/STANDARDS.md` says to
 * make loud rather than to render as a blank page.
 */
function first(workspaces: readonly WorkspaceManifest[]): WorkspaceManifest {
  const found = workspaces[0];
  if (found === undefined) throw new Error("the shell was given no workspace to host.");
  return found;
}

/**
 * The workspace bar: a pill floating over the top of the paper (the desk
 * design, §2.3), one tab for each workspace the project shows, named by its
 * manifest — never by the shell.
 *
 * The first is active to begin with. Clicking a tab selects it, and so do its
 * keys (`workspace-keys.ts`); `chosen` is told which workspace that is.
 *
 * **Which tabs** is the project's: every workspace offered that is `alwaysOn`
 * or in `shown` (`undefined` is every one). `show` draws them again when the
 * project's details change; the tab selected stays selected if it is still
 * shown, and otherwise the first is, and `drawn` is told which are shown now.
 */
function workspaceBar(
  offered: readonly WorkspaceManifest[],
  initially: readonly string[] | undefined,
  chosen: (workspace: WorkspaceManifest) => void,
  drawn: (shown: readonly WorkspaceManifest[]) => void,
): {
  readonly element: HTMLElement;
  readonly selected: () => number;
  readonly select: (index: number) => void;
  /** The workspaces whose tabs are drawn, in order. */
  readonly shown: () => readonly WorkspaceManifest[];
  readonly show: (shown: readonly string[] | undefined) => void;
} {
  const pill = element("div", { className: "workspace-bar__pill", role: "tablist" });
  let visible: readonly WorkspaceManifest[] = [];
  let tabs: HTMLButtonElement[] = [];
  let selected = 0;
  const select = (index: number): void => {
    selected = index;
    tabs.forEach((tab, at) => tab.setAttribute("aria-selected", String(at === index)));
    const workspace = visible[index];
    if (workspace !== undefined) chosen(workspace);
  };
  const show = (shown: readonly string[] | undefined): void => {
    const was = visible[selected]?.id;
    visible = offered.filter((workspace) => workspace.alwaysOn === true || shown === undefined || shown.includes(workspace.id));
    tabs = visible.map((workspace, index) => {
      const icon = createElement(workspace.icon as IconNode, { class: "workspace-bar__icon" });
      icon.setAttribute("aria-hidden", "true");
      const tab = element(
        "button",
        { type: "button", className: "workspace-bar__tab", role: "tab", ariaSelected: "false" },
        [icon, element("span", { textContent: workspace.name })],
      );
      // The click leaves the focus where it was, so the writer keeps their caret.
      tab.addEventListener("mousedown", (event) => event.preventDefault());
      tab.addEventListener("click", () => select(index));
      return tab;
    });
    pill.replaceChildren(...tabs);
    select(Math.max(0, visible.findIndex((workspace) => workspace.id === was)));
    drawn(visible);
  };
  show(initially);
  return {
    element: element("div", { className: "workspace-bar" }, [pill]),
    selected: () => selected,
    select,
    shown: () => visible,
    show,
  };
}
