/**
 * The projects screen — what Write-ist opens to.
 *
 * A listing of the default location and nothing more (ADR-0015, ADR-0016):
 * there is no store behind this, so it cannot go stale and cannot be
 * corrupted. Opening a project from here belongs to #39; until then the list
 * shows the writer what is there.
 *
 * **Real text on the page.** Every name, count and label below is text a
 * screen reader can read and a writer can select. Nothing is drawn.
 */
import type { Project } from "../../../src/project/bundle.ts";
import { element } from "./element.ts";

export interface ProjectsScreen {
  readonly projects: readonly Project[];
  /**
   * Folders holding a marker Write-ist could not read (ADR-0008 rule 4). Named
   * so the writer is told, never adopted, never written into.
   */
  readonly unreadable: readonly string[];
  /** What the writer does here: bring a screenplay in. */
  readonly onImport: () => void;
  /** Set while an import is running, so it cannot be started twice. */
  readonly importing: boolean;
  /** Something went wrong, in words the writer can act on. */
  readonly trouble?: string;
}

export function renderProjects(into: HTMLElement, screen: ProjectsScreen): void {
  into.replaceChildren(
    element("header", { className: "screen__banner" }, [
      element("h1", { className: "screen__name", textContent: "Write-ist" }),
      importButton(screen),
    ]),
    // "No projects yet" is a claim about the folder, so it is only made when
    // the folder was actually read. A failed read must never read as an empty
    // one — that is ADR-0008 rule 3's instinct applied to the screen.
    ...(screen.projects.length > 0
      ? [projectsList(screen.projects)]
      : screen.trouble === undefined
        ? [nothingYet()]
        : []),
    ...(screen.trouble === undefined ? [] : [trouble(screen.trouble)]),
    ...(screen.unreadable.length === 0 ? [] : [declined(screen.unreadable)]),
  );
}

function importButton({ importing, onImport }: ProjectsScreen): HTMLButtonElement {
  const button = element("button", {
    className: "button button--leading",
    // The gesture names itself; `docs/STANDARDS.md` bans the caption that
    // would otherwise explain it.
    textContent: importing ? "Importing…" : "Import a screenplay…",
    type: "button",
    disabled: importing,
  });
  button.addEventListener("click", onImport);
  return button;
}

function projectsList(projects: readonly Project[]): HTMLElement {
  return element(
    "ul",
    { className: "projects" },
    projects.map((project) =>
      element("li", { className: "project" }, [
        element("span", { className: "project__name", textContent: project.marker.name }),
        element("span", { className: "project__format", textContent: project.marker.format }),
      ]),
    ),
  );
}

function nothingYet(): HTMLElement {
  return element("div", { className: "nothing-yet" }, [
    element("p", { textContent: "No projects yet." }),
    element("p", {
      textContent:
        "Import a screenplay to start one. The file you import from is left exactly as it is.",
    }),
  ]);
}

/**
 * Folders that look like projects and could not be read.
 *
 * ADR-0008 rule 4: an unresolvable record fails **loudly** and is retained.
 * Retaining is automatic here — nothing is written — so being loud is the
 * whole of the work, and it is what this says. The writer is told which folder
 * and told that it is untouched, because the repair is theirs to make.
 */
function declined(folders: readonly string[]): HTMLElement {
  return element("div", { className: "trouble" }, [
    element("p", {
      className: "trouble__line",
      textContent:
        folders.length === 1
          ? "One folder looks like a project but could not be read. It has been left exactly as it is:"
          : `${folders.length} folders look like projects but could not be read. They have been left exactly as they are:`,
    }),
    element(
      "ul",
      { className: "trouble__folders" },
      folders.map((name) => element("li", { textContent: name })),
    ),
  ]);
}

function trouble(message: string): HTMLElement {
  // `role="alert"` so a screen reader is told without the writer going looking.
  const panel = element("p", { className: "trouble", textContent: message });
  panel.setAttribute("role", "alert");
  return panel;
}
