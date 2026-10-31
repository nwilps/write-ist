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
 * right.
 *
 * **Placement and proportion, not contents.** What goes in the counts pill is
 * the workspace's business — the Editor's pages and words (#48) — so the shell
 * carries the project's name and a slot the workspace fills, and a save state it
 * is told rather than works out.
 */
import { createElement, Save, SaveCheck, type IconNode } from "lucide";
import type { Project } from "../../../src/project/bundle.ts";
import type { Filesystem } from "../../../src/project/filesystem.ts";
import type { Ledger } from "../../../src/project/ledger.ts";
import { element } from "../screens/element.ts";
import { LEAVE, type Gesture } from "../screens/shortcuts.ts";
import { trouble as troublePanel } from "../screens/trouble.ts";
import type { MountedWorkspace, SaveState, WorkspaceManifest } from "./workspace.ts";

export interface ShellScreen {
  /** Which project is open — a path and what its marker says (ADR-0015). */
  readonly project: Project;
  readonly filesystem: Filesystem;
  /**
   * The workspaces this project shows, in the order the bar will list them.
   * The first is the one on screen: slice 1 has one, and the bar that would
   * choose between them is out of scope.
   */
  readonly workspaces: readonly WorkspaceManifest[];
  /** Close the project and go back to where it was chosen. */
  readonly onClose: () => void;
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
    { label: "Close project", key: LEAVE, act: screen.onClose },
  ];

  const host = element("div", { className: "workspace" });
  const view = element("main", { className: "shell__view" }, [host]);
  // The counts slot stays empty until the workspace has something to say
  // (#48) — real text, never a guess — and its pill is hidden until then.
  const counts = element("span", { className: "pill pill--counts", hidden: true });
  const saved = savePill();

  into.replaceChildren(
    element("div", { className: "shell" }, [
      workspaceBar(screen.workspaces),
      view,
      // The paper fades off under the window's top and bottom edges. Purely a
      // picture over the paper: it takes no clicks and is never in the document.
      element("div", { className: "paper-fade paper-fade--top", ariaHidden: "true" }),
      element("div", { className: "paper-fade paper-fade--bottom", ariaHidden: "true" }),
      element("div", { className: "pills pills--left" }, [
        // The project's name is which work they are in.
        element("span", { className: "pill pill--project", textContent: screen.project.marker.name }),
      ]),
      element("div", { className: "pills pills--right" }, [counts, saved.pill]),
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

  const mounted: MountedWorkspace = first(screen.workspaces).mount(host, {
    project: screen.project,
    filesystem: screen.filesystem,
    report,
    setStatus,
    setSaved: saved.set,
    whenSwitchedAway: screen.whenSwitchedAway,
    whenSwitchedBack: screen.whenSwitchedBack,
    ledger: screen.ledger,
  });

  return { gestures, unmount: mounted.unmount, report };
}

/** What the save pill says, in words, for a screen reader. */
const SAVE_LABELS: Readonly<Record<SaveState, string>> = {
  saved: "Saved",
  unsaved: "Not yet saved",
  saving: "Saving",
};

/**
 * The save pill (the desk design, §2.3, §4): a 32px square holding one icon —
 * `save-check` in the affirm colour when the work is on disk, `save` in the
 * text colour when it is not, and pulsing while a save is under way. The state
 * is told to it; it never decides.
 */
function savePill(): { readonly pill: HTMLElement; readonly set: (state: SaveState) => void } {
  const drawings = {
    saved: createElement(SaveCheck as IconNode, { class: "pill__icon" }),
    unsaved: createElement(Save as IconNode, { class: "pill__icon" }),
    saving: createElement(Save as IconNode, { class: "pill__icon" }),
  };
  const pill = element("span", { className: "pill pill--save", role: "status" });
  const set = (state: SaveState): void => {
    pill.dataset["state"] = state;
    pill.setAttribute("aria-label", SAVE_LABELS[state]);
    pill.title = SAVE_LABELS[state];
    const icon = drawings[state].cloneNode(true) as SVGElement;
    icon.setAttribute("aria-hidden", "true");
    pill.replaceChildren(icon);
  };
  set("saved");
  return { pill, set };
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
 * Only the first is on screen, so it is the active tab and the others are not
 * yet reachable: switching is a no-op until a second workspace exists.
 */
function workspaceBar(workspaces: readonly WorkspaceManifest[]): HTMLElement {
  const tabs = workspaces.map((workspace, index) => {
    const icon = createElement(workspace.icon as IconNode, { class: "workspace-bar__icon" });
    icon.setAttribute("aria-hidden", "true");
    return element(
      "button",
      { type: "button", className: "workspace-bar__tab", role: "tab", ariaSelected: String(index === 0) },
      [icon, element("span", { textContent: workspace.name })],
    );
  });
  return element("div", { className: "workspace-bar" }, [
    element("div", { className: "workspace-bar__pill", role: "tablist" }, tabs),
  ]);
}
