/**
 * Write-ist, starting up.
 *
 * The whole of the application's behaviour is above the `Filesystem` port, in
 * `src/project/`, where slice 1's third testing seam reaches it with real
 * files in a temporary folder. What is left here is the window: which screen
 * is showing, the one key listener the screens answer through, and the wiring
 * from a gesture to the work it asks for.
 *
 * Two screens, because the home screen is a menu and **Open Project is its own
 * screen** — a decision that predates the slice (`SETUP-CHECKLIST.md`, Phase 1,
 * deliberately not an ADR).
 */
import "./style/tokens.css";
import "./style/app.css";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { importProject, newProjectId } from "../../src/project/import.ts";
import { describeImportReport } from "../../src/project/report.ts";
import { listProjects, type ProjectsListing } from "../../src/project/projects.ts";
import { renderHome } from "./screens/home.ts";
import { renderOpenProject } from "./screens/open-project.ts";
import { showImportReport } from "./screens/import-report.ts";
import { chosenBy, type Gesture } from "./screens/shortcuts.ts";
import { defaultProjectsDirectory, tauriFilesystem } from "./tauri-filesystem.ts";

const found = document.querySelector<HTMLElement>("#app");
if (found === null) throw new Error("Write-ist has no window to draw into.");
/** Where every screen is drawn. Narrowed once, here, rather than at each use. */
const into: HTMLElement = found;

type Screen = "home" | "open-project";

let screen: Screen = "home";
/** Undefined until the default location has been read. */
let listing: ProjectsListing | undefined;
let importing = false;
let trouble: string | undefined;

/** What the screen now showing answers to. Replaced every time one is drawn. */
let gestures: readonly Gesture[] = [];

function draw(): void {
  gestures =
    screen === "home"
      ? renderHome(into, { onOpenProject: () => go("open-project"), onQuit: quit, trouble })
      : renderOpenProject(into, {
          listing,
          importing,
          trouble,
          onImport: () => void importOne(),
          onBack: () => go("home"),
        });
}

function go(next: Screen): void {
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

  const chosen = await open({
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

function quit(): void {
  // A gesture that quietly does nothing is `docs/STANDARDS.md`'s silent
  // failure: closing needs `core:window:allow-close` in the capability, and
  // without it the promise rejects where nobody is looking.
  getCurrentWindow()
    .close()
    .catch((error: unknown) => {
      trouble = `Write-ist could not close its window. ${message(error)}`;
      draw();
    });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

draw();
