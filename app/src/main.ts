/**
 * Write-ist, starting up.
 *
 * The whole of the application's behaviour is above the `Filesystem` port, in
 * `src/project/`, where slice 1's third testing seam reaches it with real
 * files in a temporary folder. What is left here is the window: which screen
 * is showing, the one key listener the screens answer through, and the wiring
 * from a gesture to the work it asks for.
 *
 * Two screens before a project is open, because the home screen is a menu and
 * **Open Project is its own screen** — a decision that predates the slice
 * (`SETUP-CHECKLIST.md`, Phase 1, deliberately not an ADR). Opening one hands
 * the window to the **shell**, which hosts the workspaces without knowing what
 * any of them is (ADR-0005); everything about the manuscript is behind that.
 */
import "./style/tokens.css";
import "./style/geometry.css";
import "./style/app.css";
import "./style/editor.css";
import "./style/sheets.css";
import "./style/search.css";
import "./style/panels.css";
import "./style/menus.css";
// Named for what it is here. `open` on its own is what a writer does to a
// project, and this is the file where both words are in play.
import { open as chooseFile, save as chooseSavePath } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { importProject, newProjectId } from "../../src/project/import.ts";
import { describeImportReport } from "../../src/project/report.ts";
import { listProjects, type ProjectsListing } from "../../src/project/projects.ts";
import { renderHome } from "./screens/home.ts";
import { renderOpenProject } from "./screens/open-project.ts";
import { showImportReport } from "./screens/import-report.ts";
import { chosenBy, type Gesture } from "./screens/shortcuts.ts";
import { message } from "./screens/trouble.ts";
import { mountShell, type MountedShell } from "./shell/shell.ts";
import { WORKSPACES } from "./workspaces/registry.ts";
import type { Project } from "../../src/project/bundle.ts";
import { openLedger } from "../../src/project/ledger.ts";
import {
  defaultLedgerDirectory,
  defaultProjectsDirectory,
  tauriFilesystem,
} from "./tauri-filesystem.ts";

const found = document.querySelector<HTMLElement>("#app");
if (found === null) throw new Error("Write-ist has no window to draw into.");
/** Where every screen is drawn. Narrowed once, here, rather than at each use. */
const into: HTMLElement = found;

type Screen = "home" | "open-project" | "project";

let screen: Screen = "home";
/** The project on screen, while one is. */
let opened: Project | undefined;
/**
 * The shell, while a project is open.
 *
 * The shell is **mounted, not redrawn**: a live editing engine holds the
 * selection, the scroll position and eventually the undo stack, and rebuilding
 * the furniture around it would throw all three away. So `draw()` puts it up once
 * and `go()` takes it down.
 */
let shell: MountedShell | undefined;
/** Undefined until the default location has been read. */
let listing: ProjectsListing | undefined;
let importing = false;
/** A project on its way closed: its last save is still running. */
let closing = false;
let trouble: string | undefined;

/** The writer's days (ADR-0017). Created once; opened at launch, closed on quit. */
let ledger: ReturnType<typeof openLedger> | undefined;
void (async () => {
  try {
    ledger = openLedger(tauriFilesystem, await defaultLedgerDirectory());
    await ledger.recordOpened();
  } catch (error) {
    // Loud: a silent miss would mean every day from now on is gone, and the
    // writer would never know why the chart starts late. Redraw so the words
    // land on the home screen that has already painted.
    trouble =
      `Write-ist could not start the ledger that records your writing days. ` +
      `${message(error)}`;
    if (screen === "home") draw();
  }
})();

/** What the screen now showing answers to. Replaced every time one is drawn. */
let gestures: readonly Gesture[] = [];

function draw(): void {
  if (screen === "project") {
    // Mounted once and then left alone: the shell says why, and trouble inside
    // it is said beside the workspace rather than by rebuilding the frame.
    if (shell !== undefined) return;
    shell = mountShell(into, {
      project: projectOnScreen(),
      filesystem: tauriFilesystem,
      workspaces: WORKSPACES,
      onClose: () => go("open-project"),
      onHome: () => go("home"),
      whenSwitchedAway,
      whenSwitchedBack,
      ledger: () => ledger,
      // The dialog's answer is the only place a copy may be written outside the
      // home folder: the plugin widens the file scope to that one path.
      chooseCopyLocation: async (suggestedName) =>
        (await chooseSavePath({
          title: "Save a copy as Fountain",
          defaultPath: suggestedName,
          filters: [{ name: "Fountain screenplay", extensions: ["fountain"] }],
        })) ?? undefined,
    });
    gestures = shell.gestures;
    return;
  }

  gestures =
    screen === "home"
      ? renderHome(into, { onOpenProject: () => go("open-project"), onQuit: quit, trouble })
      : renderOpenProject(into, {
          listing,
          importing,
          trouble,
          onImport: () => void importOne(),
          onOpen: goToProject,
          onBack: () => go("home"),
        });
}

/**
 * The project the shell is being drawn for.
 *
 * Unreachable — `goToProject` sets it before going to the screen — and loud
 * rather than a blank window if it ever is reached (`docs/STANDARDS.md`: know
 * which of your tools fail silently).
 */
function projectOnScreen(): Project {
  if (opened === undefined) throw new Error("the project screen has no project to show.");
  return opened;
}

/** Open a project: the shell, hosting the workspaces it shows. */
function goToProject(project: Project): void {
  opened = project;
  go("project");
}

/**
 * Close the project that is open, if one is, and then do the thing that was
 * actually asked for.
 *
 * **The shell is asked, not told.** Taking a workspace down may mean finishing
 * work — the Editor's last save (ADR-0028) — and it answers `false` when it
 * could not, in which case nothing happens: the project stays open, with what
 * went wrong said beside the page, and the writer can ask again.
 *
 * It is awaited rather than left running, so that closing a project and
 * immediately reopening it cannot read the file while the save that closing
 * asked for is still in flight.
 */
function closeProject(andThen: () => void): void {
  if (shell === undefined) {
    andThen();
    return;
  }
  // Escape is a keystroke and a disk takes as long as it takes. A second ask
  // while the first is still finishing would take the page down underneath a
  // save that is still running.
  if (closing) return;
  closing = true;
  const closingShell = shell;

  void (async () => {
    let down = false;
    try {
      down = await closingShell.unmount();
    } catch (error) {
      // Nothing the Editor does on the way out is meant to throw, so this is
      // a fault in Write-ist rather than in the writer's disk — and the
      // writer's last words may be only on screen, so the page stays up.
      closingShell.report(`Write-ist could not close this project. ${message(error)}`);
    } finally {
      // **Released however the unmount ended** (#64). Released only when it
      // succeeded, one close that went wrong would swallow every close after it,
      // from every route, and say nothing.
      closing = false;
    }
    if (!down) return;
    shell = undefined;
    andThen();
  })();
}

function go(next: Screen): void {
  closeProject(() => show(next));
}

function show(next: Screen): void {
  if (next !== "project") opened = undefined;

  screen = next;
  // Trouble belongs to the screen it happened on; carrying it to the next one
  // would be telling the writer about a folder they are no longer looking at.
  trouble = undefined;
  draw();
  if (next !== "open-project") return;

  // The listing is read on arrival rather than at launch, so the screen that
  // shows projects is the screen that goes and looks.
  void readProjects().then((wrong) => {
    // Escape is a keystroke away and a folder takes as long as it takes. A
    // writer who left before the read came back must not be shown an error
    // about a folder they are no longer looking at.
    if (screen !== next) return;
    trouble = wrong;
    draw();
  });
}

/**
 * The letters beside the gestures, answered in one place.
 *
 * While the import report is open it is the writer's whole attention — a modal
 * `<dialog>`, dismissed by Escape or Done (ADR-0028) — so the screen behind it
 * hears nothing.
 */
window.addEventListener("keydown", (event) => {
  if (into.querySelector("dialog[open]") !== null) return;
  const gesture = chosenBy(gestures, event);
  if (gesture === undefined) return;
  event.preventDefault();
  gesture.act();
});

/**
 * Read the default location, and say what went wrong if anything did.
 *
 * It reports rather than setting `trouble` itself, because by the time a read
 * comes back the writer may be looking at another screen — and an answer
 * belongs to the screen that asked the question.
 */
async function readProjects(): Promise<string | undefined> {
  try {
    const directory = await defaultProjectsDirectory();
    listing = await listProjects(tauriFilesystem, directory);
    return undefined;
  } catch (error) {
    return listing === undefined
      ? `Write-ist could not read its projects folder. ${message(error)}`
      : `Write-ist could not read its projects folder again, so this list may be out of date. ${message(error)}`;
  }
}

async function importOne(): Promise<void> {
  if (importing) return;

  const chosen = await chooseFile({
    multiple: false,
    directory: false,
    title: "Import a screenplay",
    filters: [{ name: "Fountain screenplay", extensions: ["fountain", "spmd", "txt"] }],
  });
  if (typeof chosen !== "string") return;

  importing = true;
  trouble = undefined;
  draw();

  try {
    const directory = await defaultProjectsDirectory();
    const imported = await importProject(
      { filesystem: tauriFilesystem, newProjectId },
      { sourcePath: chosen, projectsDirectory: directory },
    );

    // The new project is in the list before the report is dismissed, so the
    // screen behind it is already true.
    trouble = await readProjects();
    importing = false;
    draw();

    // Shown at the moment the import completes, and dismissed by the writer
    // (ADR-0028).
    showImportReport(into, {
      projectName: imported.project.marker.name,
      lines: describeImportReport(imported.report),
      onDismiss: draw,
    });
  } catch (error) {
    importing = false;
    // Never a stack trace: the writer is told what did not happen, in words
    // about their file. Nothing was written, because the failure was a read.
    trouble = `That screenplay could not be imported, so nothing was changed. ${message(error)}`;
    draw();
  }
}

/**
 * The writer switched to another application (ADR-0028).
 *
 * Asked of Tauri rather than of the DOM. `window`'s own `blur` is what a web
 * page has, and whether the system webview fires it when the *window* loses
 * focus is the webview's business rather than a promise — a leg of autosave
 * that quietly never fires is exactly the failure `docs/STANDARDS.md` is
 * written against. Tauri answers for the window it opened.
 */
function whenSwitchedAway(act: () => void): () => void {
  return whenFocus(false, act);
}

/**
 * The writer came back to Write-ist (ADR-0028), when the manuscript on disk is
 * compared with what Write-ist last read or wrote (#42). Asked of Tauri, for
 * the reason above.
 */
function whenSwitchedBack(act: () => void): () => void {
  return whenFocus(true, act);
}

function whenFocus(wanted: boolean, act: () => void): () => void {
  const listening = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (focused === wanted) act();
  });
  // Loud rather than an unhandled rejection nobody reads, as the close button
  // is: without this, a save on switching away — or the check for a change
  // made elsewhere on switching back (#42) — quietly never happens.
  listening.catch((error: unknown) => {
    shell?.report(
      `Write-ist could not tell when you switch ${wanted ? "back to it" : "to another app"}, ` +
        `so it will not ${wanted ? "check then whether this screenplay was changed outside it" : "save then"}. ` +
        `It still saves a couple of seconds after you stop typing. ${message(error)}`,
    );
  });
  // The subscription is asked for now and arrives in a moment; stopping is
  // whatever it turns into. A workspace taken down before it arrives still
  // stops it, because this waits for it first.
  return () => void listening.then((stop) => stop()).catch(() => {});
}

/**
 * Close the window — **after the project has closed itself** (ADR-0028).
 *
 * Quit is reachable from the home screen, where no project is open and the
 * first half is nothing. With one open it is the writer's last sentence, and
 * the only moment in the application where nothing survives waiting a beat
 * longer. If that save cannot be made, the window does not close: the Editor
 * has already said so beside the page.
 */
function quit(): void {
  closeProject(closeWindow);
}

function closeWindow(): void {
  // **`destroy`, not `close`.** `close` asks, and the asking arrives back at
  // the listener below, which would stop it again. `destroy` is the answer.
  //
  // A gesture that quietly does nothing is `docs/STANDARDS.md`'s silent
  // failure: this needs `core:window:allow-destroy` in the capability, and
  // without it the promise rejects where nobody is looking. That is #64 — every
  // way of closing Write-ist did nothing, because the destroy was Tauri's own
  // and its refusal was nobody's to report.
  void (async () => {
    try {
      await ledger?.recordClosed();
    } catch (error) {
      // Said on the home screen if destroy fails below; otherwise the window
      // is going away and the day's open line still stands without a close.
      trouble =
        `Write-ist could not finish the ledger entry for this session. ${message(error)}`;
    }
    getCurrentWindow()
      .destroy()
      .catch((error: unknown) => {
      // The project, if one was open, has already closed, so the screen to
      // say it on is the home screen rather than a project that is gone.
      screen = "home";
      opened = undefined;
      trouble = `Write-ist could not close its window. ${message(error)}`;
      draw();
    });
  })();
}

/**
 * The window's own close button is the same gesture as **Quit**.
 *
 * ADR-0028 says autosave fires when the project is closed, and a writer who
 * closes Write-ist from the titlebar has closed the project — the route they
 * took is not a reason to lose the last thing they wrote. The close is
 * stopped, the project closes itself, and `quit` closes the window for real.
 *
 * **Stopped always, even with no project open**, so that every close is
 * finished by `closeWindow`, which says so when it cannot. Left to go ahead,
 * Tauri finishes it by destroying the window itself — and when that was
 * refused, nothing anywhere said so (#64).
 */
getCurrentWindow()
  .onCloseRequested((event) => {
    event.preventDefault();
    quit();
  })
  .catch((error: unknown) => {
    // Loud rather than an unhandled rejection nobody reads. Without this
    // listener, closing from the titlebar costs at most the last pause of
    // typing — which is worth saying, and not worth refusing to start over.
    trouble =
      `Write-ist could not listen for its window closing, so closing it from the ` +
      `title bar may lose the last few seconds of typing. Use Quit instead. ${message(error)}`;
    draw();
  });


draw();
