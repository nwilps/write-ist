/**
 * Write-ist, starting up.
 *
 * The whole of the application's behaviour is above the `Filesystem` port, in
 * `src/project/`, where slice 1's third testing seam reaches it with real
 * files in a temporary folder. What is left here is the window: resolve the
 * default location, list it, and wire the one gesture the writer has.
 */
import "./style/tokens.css";
import "./style/app.css";
import { open } from "@tauri-apps/plugin-dialog";
import type { Project } from "../../src/project/bundle.ts";
import { importProject, newProjectId } from "../../src/project/import.ts";
import { describeImportReport } from "../../src/project/report.ts";
import { listProjects } from "../../src/project/projects.ts";
import { renderProjects } from "./screens/projects.ts";
import { showImportReport } from "./screens/import-report.ts";
import { defaultProjectsDirectory, tauriFilesystem } from "./tauri-filesystem.ts";

const into = document.querySelector<HTMLElement>("#app");
if (into === null) throw new Error("Write-ist has no window to draw into.");

let projects: readonly Project[] = [];
let importing = false;
let trouble: string | undefined;

async function draw(): Promise<void> {
  renderProjects(into!, { projects, importing, trouble, onImport: () => void importOne() });
}

async function refresh(): Promise<void> {
  const directory = await defaultProjectsDirectory();
  projects = await listProjects(tauriFilesystem, directory);
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
  await draw();

  try {
    const directory = await defaultProjectsDirectory();
    const imported = await importProject(
      { filesystem: tauriFilesystem, newProjectId },
      { sourcePath: chosen, projectsDirectory: directory },
    );

    await refresh();
    importing = false;
    await draw();

    // Shown at the moment the import completes, and dismissed by the writer
    // (ADR-0028).
    showImportReport(into!, {
      projectName: imported.project.marker.name,
      lines: describeImportReport(imported.report),
      onDismiss: () => void draw(),
    });
  } catch (error) {
    importing = false;
    // Never a stack trace: the writer is told what did not happen, in words
    // about their file. Nothing was written, because the failure was a read.
    trouble = `That screenplay could not be imported, so nothing was changed. ${message(error)}`;
    await draw();
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function start(): Promise<void> {
  try {
    await refresh();
  } catch (error) {
    trouble = `Write-ist could not read its projects folder. ${message(error)}`;
  }
  await draw();
}

void start();
