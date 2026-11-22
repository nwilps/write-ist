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
 */
import { createElement, Pencil, Save, SaveCheck, SpellCheck, type IconNode } from "lucide";
import type { Project } from "../../../src/project/bundle.ts";
import type { Filesystem } from "../../../src/project/filesystem.ts";
import type { Ledger } from "../../../src/project/ledger.ts";
import type { Places } from "../../../src/project/places.ts";
import { openContextMenu, type ContextMenu } from "../menus/context-menu.ts";
import { element } from "../screens/element.ts";
import { LEAVE, type Gesture } from "../screens/shortcuts.ts";
import { trouble as troublePanel } from "../screens/trouble.ts";
import type { ProjectDetailsRoute } from "../screens/project-dialogs.ts";
import type { DetailsRequest, MountedWorkspace, SaveState, SettingsRequest, WorkspaceManifest } from "./workspace.ts";
import { workspaceAsked } from "./workspace-keys.ts";

export interface ShellScreen {
  /** Which project is open — a path and what its marker says (ADR-0015). */
  readonly project: Project;
  readonly filesystem: Filesystem;
  /**
   * The workspaces the application offers, in the order the bar lists them.
   * The first is the one on screen. The Editor is the only real workspace;
   * Notes and Plan are placeholder tabs, so choosing one selects its tab and
   * leaves the first mounted and on screen.
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
  /** Where a copy should go, asked of the writer. Handed straight to the workspace. */
  readonly chooseCopyLocation: (suggestedName: string) => Promise<string | undefined>;
  /** Where the PDF should go, asked the same way. */
  readonly choosePdfLocation: (suggestedName: string) => Promise<string | undefined>;
  /** Open Edit Project Details for the open project. */
  readonly askToEditDetails: (route: ProjectDetailsRoute) => void;
  /** Open the application's Settings. Handed straight to the workspace. */
  readonly openSettings: (request: SettingsRequest) => void;
}

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
   * the first workspace's is selected: the writer is back in it.
   */
  readonly showWorkspaces: (shown: readonly string[] | undefined) => void;
}

/**
 * Draw the shell and mount its workspace.
 *
 * The workspace is mounted **once**, into an element the shell then leaves
 * alone. Redrawing the furniture around a live editing engine would throw away its
 * selection, its scroll position and eventually its undo stack, so the shell
 * does not own a `draw()` the way the menu screens do — it is put up when a
 * project opens and taken down when it closes.
 */
export function mountShell(into: HTMLElement, screen: ShellScreen): MountedShell {
  const gestures: readonly Gesture[] = [
    { label: "Home", key: LEAVE, act: screen.onHome },
  ];

  const host = element("div", { className: "workspace" });
  const view = element("main", { className: "shell__view" }, [host]);
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
  const askers = new Set<() => void>();
  const asked = (): void => askers.forEach((act) => act());
  counts.addEventListener("click", asked);
  goal.addEventListener("click", asked);

  // The project as it is now: a rename replaces it with the workspace still up.
  let project = screen.project;
  // The project's name is which work they are in. Focusable so that the Menu
  // key can open its menu, as it does on a row of Open Project.
  const projectName = element("span", {
    className: "pill pill--project",
    textContent: project.marker.name,
    tabIndex: 0,
  });
  const detailsAskers = new Set<() => void>();
  let nameMenu: ContextMenu | undefined;
  const openNameMenu = (x: number, y: number, fromKeyboard: boolean): void => {
    nameMenu = openContextMenu({
      label: project.marker.name,
      items: [{ label: "Edit Project Details", icon: Pencil, act: () => detailsAskers.forEach((act) => act()) }],
      x,
      y,
      fromKeyboard,
      restoreFocus: () => (fromKeyboard ? projectName.focus() : mounted.focus?.()),
    });
  };
  projectName.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openNameMenu(event.clientX, event.clientY, false);
  });
  // The Menu key and Shift+F10, as a native menu opens (ADR-0034): at the pill.
  projectName.addEventListener("keydown", (event) => {
    if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
    event.preventDefault();
    event.stopPropagation();
    const box = projectName.getBoundingClientRect();
    openNameMenu(box.left, box.top, true);
  });

  const bar = workspaceBar(screen.workspaces, screen.shown);
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
  const report = (wrong: string): void => void view.append(troublePanel(wrong));
  const setStatus = (text: string): void => {
    counts.textContent = text;
    counts.hidden = text === "";
  };
  const setGoal = (pill: { readonly text: string; readonly kind: string; readonly state: string } | undefined): void => {
    goal.hidden = pill === undefined;
    if (pill === undefined) return;
    goal.textContent = pill.text;
    goal.dataset["kind"] = pill.kind;
    goal.dataset["state"] = pill.state;
  };

  const mounted: MountedWorkspace = first(bar.shown()).mount(host, {
    get project() {
      return project;
    },
    filesystem: screen.filesystem,
    report,
    setStatus,
    setGoal,
    whenGoalsAsked: (act) => {
      askers.add(act);
      return () => void askers.delete(act);
    },
    whenDetailsAsked: (act) => {
      detailsAskers.add(act);
      return () => void detailsAskers.delete(act);
    },
    editProjectDetails: (request: DetailsRequest) =>
      screen.askToEditDetails({
        ...request,
        renamed: (now) => {
          project = now;
          projectName.textContent = now.marker.name;
        },
        detailsChanged: (details) => bar.show(details.workspaces),
      }),
    openSettings: screen.openSettings,
    setSaved: saved.set,
    setSpellcheck: (on) => void (spelling.hidden = !on),
    whenSwitchedAway: screen.whenSwitchedAway,
    whenSwitchedBack: screen.whenSwitchedBack,
    leave: { toProjects: screen.onClose, toHome: screen.onHome },
    ledger: screen.ledger,
    places: screen.places,
    chooseCopyLocation: screen.chooseCopyLocation,
    choosePdfLocation: screen.choosePdfLocation,
  });

  const unmount = async (): Promise<boolean> => {
    const down = await mounted.unmount();
    // The menu is on the body, so it would outlive the frame it belongs to.
    if (down) nameMenu?.close(false);
    if (down) window.removeEventListener("keydown", askedForTab, true);
    return down;
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
 * keys (`workspace-keys.ts`). Only the first workspace is mounted, and it stays
 * mounted and on screen whichever tab is selected: the others are placeholders
 * until they are real workspaces, and taking the first down would end its work.
 *
 * **Which tabs** is the project's: every workspace offered that is `alwaysOn`
 * or in `shown` (`undefined` is every one). `show` draws them again when the
 * project's details change; the tab selected stays selected if it is still
 * shown, and otherwise the first is, which is the workspace on screen.
 */
function workspaceBar(
  offered: readonly WorkspaceManifest[],
  initially: readonly string[] | undefined,
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
