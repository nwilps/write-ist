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
import "./style/autocomplete.css";
import "./style/spellcheck.css";
import "./style/search.css";
import "./style/goals.css";
import "./style/export.css";
import "./style/shortcuts.css";
import "./style/panels.css";
import "./style/menus.css";
import "./style/title-page.css";
import "./style/home.css";
import "./style/open-project.css";
import "./style/settings.css";
// Named for what it is here. `open` on its own is what a writer does to a
// project, and this is the file where both words are in play.
import { open as chooseFile, save as chooseSavePath } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CannotCreate, createProject } from "../../src/project/create.ts";
import { newProjectId } from "../../src/project/import.ts";
import { listProjects, type ProjectsListing } from "../../src/project/projects.ts";
import { CannotDelete, deleteProject, moveDeletedProjectsToGraveyard } from "../../src/project/delete.ts";
import { CannotRecover, listGraveyard, recoverProject } from "../../src/project/recover.ts";
import { CannotExile, exileProject } from "../../src/project/exile.ts";
import { setDayEndsAt } from "../../src/goals/day.ts";
import {
  DEFAULT_SETTINGS,
  openSettingsStore,
  type Settings,
  type SettingsStore,
} from "../../src/settings/settings.ts";
import { renderHome } from "./screens/home.ts";
import { renderOpenProject } from "./screens/open-project.ts";
import { showNewProject } from "./screens/new-project.ts";
import { askToRenameProject, showDeleteProject, type RenameRoute } from "./screens/project-dialogs.ts";
import { openProjectSearch } from "./screens/project-search.ts";
import { applyAppearance, openSettingsDialog } from "./screens/settings.ts";
import { mountGround } from "./background/ground.ts";
import { tauriDictionary } from "./spell-tauri.ts";
import { RESERVED_KEYS, shortcutCommands, useKeyBindings } from "./workspaces/editor/commands.ts";
import { askToImportProject, IMPORT_PICKER } from "./screens/import-project.ts";
import { answerKey, type Gesture, type KeyPress } from "./screens/shortcuts.ts";
import { message } from "./screens/trouble.ts";
import { mountShell, type MountedShell } from "./shell/shell.ts";
import { WORKSPACES } from "./workspaces/registry.ts";
import type { Project } from "../../src/project/bundle.ts";
import { openLedger } from "../../src/project/ledger.ts";
import { openPlaces, type Places } from "../../src/project/places.ts";
import {
  defaultLedgerDirectory,
  defaultProjectsDirectory,
  tauriFilesystem,
} from "./tauri-filesystem.ts";

const found = document.querySelector<HTMLElement>("#app");
if (found === null) throw new Error("Write-ist has no window to draw into.");
/** Where every screen is drawn. Narrowed once, here, rather than at each use. */
const into: HTMLElement = found;
/** The animated ground under every screen; started once the settings say whether it is wanted. */
const ground = mountGround({ body: document.body, root: document.documentElement });

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
/** Bringing an old `Deleted Projects` folder into the Graveyard: once a launch. */
let graveyardMove: Promise<string | undefined> | undefined;
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

/**
 * The writer's settings (`src/settings/settings.ts`), in app data beside the
 * ledger. The defaults until the file has been read, and if it never can be,
 * the defaults for the session, with the file left as it was.
 */
let settings: Settings = DEFAULT_SETTINGS;
let settingsStore: SettingsStore | undefined;
const settingsRead: Promise<void> = (async () => {
  try {
    settingsStore = openSettingsStore(tauriFilesystem, await defaultLedgerDirectory());
    useSettings(await settingsStore.load());
  } catch {
    // No app data folder: the defaults stand, and a change says it is not kept.
    ground.look(settings.appearance.backgroundPreset);
    ground.react(settings.appearance.backgroundMotion === "reactive");
    ground.set(settings.appearance.backgroundAnimation);
  }
})();

/** Use these settings from now on: where the day ends, how the window looks, and the writer's keys. */
function useSettings(next: Settings): void {
  settings = next;
  setDayEndsAt(next.dayEndsAt);
  applyAppearance(document.documentElement, next.appearance);
  ground.look(next.appearance.backgroundPreset);
  ground.react(next.appearance.backgroundMotion === "reactive");
  ground.set(next.appearance.backgroundAnimation);
  useKeyBindings(next.keyBindings);
}

/**
 * Where the writer left the caret in each project, in app data beside the
 * ledger. Undefined until the folder is known, and if it never is, every
 * project simply opens at the top of its script.
 */
let places: Places | undefined;
void defaultLedgerDirectory().then(
  (directory) => void (places = openPlaces(tauriFilesystem, directory)),
  () => {},
);

/** What the screen now showing answers to. Replaced every time one is drawn. */
let gestures: readonly Gesture[] = [];
/** The arrow keys and Enter of Home and Open Project; undefined on any other screen. */
let navigate: ((press: KeyPress) => boolean) | undefined;
/** Stops the home screen's typing tagline; undefined on any other screen. */
let stopHome: (() => void) | undefined;

function draw(): void {
  // Leaving Home, or redrawing it, puts its tagline's timers away.
  stopHome?.();
  stopHome = undefined;
  navigate = undefined;
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
      places: () => places,
      // The dialog's answer is the only place a copy may be written outside the
      // home folder: the plugin widens the file scope to that one path.
      chooseCopyLocation: async (suggestedName) =>
        (await chooseSavePath({
          title: "Save a copy as Fountain",
          defaultPath: suggestedName,
          filters: [{ name: "Fountain screenplay", extensions: ["fountain"] }],
        })) ?? undefined,
      choosePdfLocation: async (suggestedName) =>
        (await chooseSavePath({
          title: "Export as PDF",
          defaultPath: suggestedName,
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        })) ?? undefined,
      openSettings: ({ into: over, closed }) => openSettings(over, closed),
      askToRename: (route) =>
        askToRename(projectOnScreen(), {
          ...route,
          renamed: (now) => {
            // Still this project: the writer may have closed it meanwhile.
            if (opened?.marker.projectId === now.marker.projectId) opened = now;
            route.renamed(now);
          },
        }),
    });
    gestures = shell.gestures;
    return;
  }

  if (screen === "home") {
    const home = renderHome(into, {
      onNewProject: askForNewProject,
      onOpenProject: () => go("open-project"),
      onSettings: () => openSettings(),
      onQuit: quit,
      trouble,
    });
    gestures = home.gestures;
    navigate = home.navigate;
    stopHome = home.stop;
    return;
  }

  const openProject = renderOpenProject(into, {
    listing,
    importing,
    trouble,
    onImport: askToImport,
    onOpen: goToProject,
    onNewProject: askForNewProject,
    onRename: (project) =>
      askToRename(project, {
        into: document.body,
        carryOut: (move) => move(),
        renamed: () => {},
        closed: () => {},
      }),
    onDelete: askToDelete,
    onSearch: searchProjects,
    onBack: () => go("home"),
  });
  gestures = openProject.gestures;
  navigate = openProject.navigate;
}

/**
 * The projects' search, over the Open Project screen (Alt+Enter). On the body
 * rather than the screen, so the listing arriving underneath does not take it
 * down; it reads the listing as it is when the writer types.
 */
function searchProjects(): void {
  if (document.querySelector(".search") !== null) return;
  openProjectSearch(document.body, {
    projects: () => listing?.projects ?? [],
    open: goToProject,
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
      // writer's last words may be only on screen, so the paper stays up.
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
 * While a modal `<dialog>` is open it is the writer's whole attention, so the
 * screen behind it hears nothing.
 */
window.addEventListener("keydown", (event) => {
  const used = answerKey(event, {
    dialogOpen: document.querySelector("dialog[open]") !== null,
    gestures,
    navigate,
  });
  if (used) event.preventDefault();
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
    graveyardMove ??= moveDeletedProjectsToGraveyard(tauriFilesystem, directory).then(
      () => undefined,
      (error: unknown) =>
        `“Deleted Projects” could not be moved into the Graveyard, so it is still in your projects folder. Nothing was lost. ${message(error)}`,
    );
    const wrong = await graveyardMove;
    listing = await listProjects(tauriFilesystem, directory);
    return wrong;
  } catch (error) {
    return listing === undefined
      ? `Write-ist could not read its projects folder. ${message(error)}`
      : `Write-ist could not read its projects folder again, so this list may be out of date. ${message(error)}`;
  }
}

/**
 * Ask what to make, in a dialog over the screen it was asked from — Home or
 * Open Project — then make it and open it. Cancelled, it leaves the writer on
 * that screen.
 *
 * The dialog stays up with the reason when the project could not be made, so
 * the writer can change the title and try again; nothing is written then.
 *
 * **On the body, not the screen.** Open Project redraws when its listing
 * arrives, and a redraw replaces everything drawn into the screen — a dialog
 * there would vanish under the writer's hands without ever closing.
 */
function askForNewProject(): void {
  if (document.querySelector("dialog[open]") !== null) return;
  showNewProject(document.body, {
    onCreate: async (request) => {
      try {
        const project = await createProject(
          { filesystem: tauriFilesystem, newProjectId },
          await defaultProjectsDirectory(),
          request,
        );
        // The dialog closes as this resolves; the project opens behind it.
        goToProject(project);
        return undefined;
      } catch (error) {
        return error instanceof CannotCreate
          ? error.message
          : `A new project could not be made, so nothing was changed. ${message(error)}`;
      }
    },
    onClose: () => {},
  });
}

/**
 * Read the projects again and redraw them, if the writer is still looking.
 * After a rename or a delete — and after one that was refused, because the
 * refusal may be that the folder changed since the list was read.
 */
async function rereadProjects(): Promise<void> {
  const wrong = await readProjects();
  if (screen !== "open-project") return;
  trouble = wrong;
  draw();
}

/**
 * Rename a project: the one right-clicked on Open Project, or the one open in
 * the Editor. The list is read again either way, so that it is true when the
 * writer next sees it.
 */
function askToRename(project: Project, route: RenameRoute): void {
  askToRenameProject(
    { filesystem: tauriFilesystem, projectsDirectory: defaultProjectsDirectory, reread: rereadProjects },
    project,
    route,
  );
}

/**
 * Move the project that was right-clicked to the Graveyard
 * (`src/project/delete.ts`), once the writer has been told where it goes and
 * that it is not deleted for good. Nothing is ever erased.
 */
function askToDelete(project: Project): void {
  if (document.querySelector("dialog[open]") !== null) return;
  void (async () => {
    let directory: string;
    try {
      directory = await defaultProjectsDirectory();
    } catch (error) {
      trouble = `Write-ist could not find its projects folder, so nothing was moved. ${message(error)}`;
      draw();
      return;
    }
    if (document.querySelector("dialog[open]") !== null) return;
    showDeleteProject(document.body, {
      project,
      onDelete: async () => {
        let wrong: string | undefined;
        try {
          await deleteProject(tauriFilesystem, directory, project);
        } catch (error) {
          wrong =
            error instanceof CannotDelete
              ? error.message
              : `“${project.marker.name}” could not be moved, so it is where it was. ${message(error)}`;
        }
        await rereadProjects();
        return wrong;
      },
      onClose: () => {},
    });
  })();
}

/**
 * The Settings dialog: from Home's `[s]`, over the body, and from File ▸
 * Settings… in an open project, over the workspace. A change is used at once and
 * kept in the settings file; the Graveyard and the dictionary are on disk.
 */
function openSettings(over: HTMLElement = document.body, closed: () => void = () => {}): void {
  if (document.querySelector("dialog[open]") !== null) return;
  openSettingsDialog(over, {
    settings: () => settings,
    change: async (next) => {
      // After the file is read, so the file's settings never land over a change.
      await settingsRead;
      useSettings(next);
      if (settingsStore === undefined) {
        return "Write-ist could not find its app data folder, so this change will last only until you quit.";
      }
      try {
        return (await settingsStore.save(settings))
          ? undefined
          : "Your settings file could not be read when Write-ist started, so it has been left as it was and this change will last only until you quit.";
      } catch (error) {
        return `Your settings could not be kept, so this change will last only until you quit. ${message(error)}`;
      }
    },
    shortcuts: { commands: shortcutCommands(), reserved: RESERVED_KEYS },
    dictionary: tauriDictionary,
    graveyard: {
      list: async () => listGraveyard(tauriFilesystem, await defaultProjectsDirectory()),
      recover: async (project) => {
        try {
          await recoverProject(tauriFilesystem, await defaultProjectsDirectory(), project);
          return undefined;
        } catch (error) {
          return error instanceof CannotRecover
            ? error.message
            : `“${project.marker.name}” could not be recovered, so it is still in the Graveyard. ${message(error)}`;
        } finally {
          void rereadProjects();
        }
      },
      // The one erase, after its confirm (ADR-0044). The ledger is in app
      // data, outside every bundle, so the project's history stays (ADR-0017).
      exile: async (project) => {
        try {
          await exileProject(tauriFilesystem, await defaultProjectsDirectory(), project);
          return undefined;
        } catch (error) {
          return error instanceof CannotExile
            ? error.message
            : `“${project.marker.name}” could not be exiled, so it is still in the Graveyard. ${message(error)}`;
        }
      },
    },
    closed,
  });
}

/**
 * Bring a screenplay in, from the Import dialog over Open Project. The screen
 * says an import is running and refuses a second; the new project is in its list
 * by the time the dialog closes.
 */
function askToImport(): void {
  askToImportProject({
    filesystem: tauriFilesystem,
    newProjectId,
    projectsDirectory: defaultProjectsDirectory,
    chooseSource: async () => {
      const chosen = await chooseFile(IMPORT_PICKER);
      return typeof chosen === "string" ? chosen : undefined;
    },
    isImporting: () => importing,
    setImporting: (now) => {
      importing = now;
      if (now) trouble = undefined;
      if (screen === "open-project") draw();
    },
    reread: rereadProjects,
  });
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
