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

export interface ProjectsScreen {
  readonly projects: readonly Project[];
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
    screen.projects.length === 0 ? nothingYet() : projectsList(screen.projects),
    ...(screen.trouble === undefined ? [] : [trouble(screen.trouble)]),
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

function trouble(message: string): HTMLElement {
  // `role="alert"` so a screen reader is told without the writer going looking.
  const panel = element("p", { className: "trouble", textContent: message });
  panel.setAttribute("role", "alert");
  return panel;
}

/** Build an element, set its plain properties, and give it its children. */
export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  properties: Partial<HTMLElementTagNameMap[K]> = {},
  children: readonly Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), properties);
  node.append(...children);
  return node;
}
