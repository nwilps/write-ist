/**
 * The shell: the frame a project is worked in.
 *
 * `CONTEXT.md`: *the application frame that hosts the workspaces and the
 * workspace bar without knowing what any workspace is.* So this file draws the
 * furniture, hands one element to a workspace, and knows nothing else — not which
 * surface the project runs on, not what an element is, not that a screenplay
 * exists. The registry in `app/src/workspaces/` is where that is known.
 *
 * **The furniture is the prototype's** (`nwilps/write-ist-ng`, `spike/plan.html`):
 * a full-height column, the workspace filling it and scrolling, and a status bar
 * along the foot carrying the project's name. Its floating workspace bar sits
 * over the top of that column, which is why the workspace is given room above
 * it — slice 1 does not build the bar, and the furniture it will join is here
 * already rather than waiting to be retrofitted.
 *
 * **Placement and proportion, not contents.** The prototype's side panels hold
 * Plan's and the Log's controls, and the spike's panel is a developer's harness
 * showing round-trip status; neither belongs to a writer. What goes in the
 * Editor's furniture is the writer's business — the page count, when it arrives
 * (#48) — so the status bar carries the project's name and nothing invented.
 */
import type { Project } from "../../../src/project/bundle.ts";
import type { Filesystem } from "../../../src/project/filesystem.ts";
import { element } from "../screens/element.ts";
import { menuRow } from "../screens/menu.ts";
import { LEAVE, type Gesture } from "../screens/shortcuts.ts";
import { trouble as troublePanel } from "../screens/trouble.ts";
import type { MountedWorkspace, WorkspaceManifest } from "./workspace.ts";

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
}

/** A shell that has been drawn, and what the window answers to while it is up. */
export interface MountedShell {
  readonly gestures: readonly Gesture[];
  /** Take the shell and its workspace down. */
  readonly unmount: () => void;
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

  into.replaceChildren(
    element("div", { className: "shell" }, [
      view,
      element("footer", { className: "statusbar" }, [
        // The project's name is the one thing the writer needs told back to
        // them: it is which work they are in. Real text, like everything else.
        element("span", {
          className: "statusbar__project",
          textContent: screen.project.marker.name,
        }),
        menuRow(gestures),
      ]),
    ]),
  );

  const mounted: MountedWorkspace = first(screen.workspaces).mount(host, {
    project: screen.project,
    filesystem: screen.filesystem,
    // **Said beside the workspace that could not load, without taking the
    // shell down and putting it back up.** Remounting would mount the
    // workspace again, which would fail again, which would report again — a
    // loop rather than a message.
    report: (wrong) => view.append(troublePanel(wrong)),
  });

  return { gestures, unmount: mounted.unmount };
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
