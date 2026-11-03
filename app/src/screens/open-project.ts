/**
 * The Open Project screen — the projects, and the way a project gets in.
 *
 * Its own screen, reached from the home screen and returning to it (#37,
 * stories 11 and 12), so choosing what to work on is a deliberate step rather
 * than a side effect of launching. **Import lives here** because importing is
 * how a project arrives; nothing about what importing *does* lives in this
 * file.
 *
 * The list is a listing of the default location and nothing more (ADR-0015,
 * ADR-0016): there is no store behind it, so it cannot go stale and cannot be
 * corrupted. Choosing one opens it in the Editor (#39), which is the whole of
 * what this screen decides: the shell and the workspace do the rest.
 *
 * Shape and flow are v1's `OpenProjectScreen`: a titled composition, the
 * projects as rows of name and format, and the screen's own gestures along
 * the foot with Escape among them.
 *
 * **Real text on the page.** Every name, count and label below is text a
 * screen reader can read and a writer can select. Nothing is drawn.
 */
import type { ProjectsListing } from "../../../src/project/projects.ts";
import type { Project } from "../../../src/project/bundle.ts";
import { element } from "./element.ts";
import { menuRow } from "./menu.ts";
import { LEAVE, type Gesture } from "./shortcuts.ts";
import { trouble as troublePanel } from "./trouble.ts";

export interface OpenProjectScreen {
  /**
   * The default location, once it has been read — **undefined until then**.
   * "No projects yet" is a claim about a folder, and a folder not yet read
   * must never read as an empty one.
   */
  readonly listing: ProjectsListing | undefined;
  /** What the writer does here: bring a screenplay in. */
  readonly onImport: () => void;
  /** Make an empty screenplay and open it. */
  readonly onCreate: () => void;
  /** Open one of them, which is what the list is for. */
  readonly onOpen: (project: Project) => void;
  /** Back to the home screen. */
  readonly onBack: () => void;
  /** Set while an import is running, so it cannot be started twice. */
  readonly importing: boolean;
  /** Set while a new project is being made, so it cannot be made twice. */
  readonly creating?: boolean;
  /** Something went wrong, in words the writer can act on. */
  readonly trouble?: string;
}

/** Draw the screen, and return the gestures the window answers to. */
export function renderOpenProject(
  into: HTMLElement,
  screen: OpenProjectScreen,
): readonly Gesture[] {
  const gestures: readonly Gesture[] = [
    {
      // The gesture names itself; `docs/STANDARDS.md` bans the caption that
      // would otherwise explain it.
      label: screen.importing ? "Importing…" : "Import a screenplay…",
      key: "i",
      act: screen.onImport,
      unavailable: screen.importing,
    },
    { label: "Back", key: LEAVE, act: screen.onBack },
  ];

  const { listing, trouble } = screen;
  into.replaceChildren(
    element("main", { className: "screen" }, [
      element("div", { className: "composition composition--wide" }, [
        element("h1", { className: "screen__name", textContent: "Open Project" }),
        // A failed read must never read as an empty folder, and never as one
        // still being read either — both are the screen telling the writer
        // something about their disk that nobody checked. That is ADR-0008
        // rule 3's instinct applied to the screen. Once a read has succeeded,
        // "No projects yet" is a claim someone made good on, and a later read
        // that fails says so beneath the list rather than emptying it.
        ...(listing === undefined ? [] : [newProjectRow(screen.onCreate, screen.creating === true)]),
        ...(listing === undefined
          ? trouble === undefined
            ? [reading()]
            : []
          : listing.projects.length > 0
            ? [projectsList(listing.projects, screen.onOpen)]
            : [nothingYet()]),
        ...(trouble === undefined ? [] : [troublePanel(trouble)]),
        ...(listing === undefined || listing.unreadable.length === 0
          ? []
          : [declined(listing.unreadable)]),
        menuRow(gestures),
      ]),
    ]),
  );

  return gestures;
}

/**
 * The projects, each a real button.
 *
 * **A row is the gesture, and the row says so by being a button.** There is no
 * letter beside it and no caption explaining how to choose one: a list of names
 * is its own affordance, and `docs/STANDARDS.md` bans captioning a gesture that
 * already exists. Tab reaches them and Enter opens one, which is what a button
 * does without a line of code here — the same reason the menus are buttons.
 *
 * Letters are deliberately not handed out. A writer may have thirty projects
 * and the alphabet does not stretch; the screen's own two gestures keep theirs.
 */
function projectsList(
  projects: readonly Project[],
  onOpen: (project: Project) => void,
): HTMLElement {
  return element(
    "ul",
    { className: "projects" },
    projects.map((project) => {
      const row = element("button", { className: "project", type: "button" }, [
        element("span", { className: "project__name", textContent: project.marker.name }),
        element("span", { className: "project__format", textContent: project.marker.format }),
      ]);
      row.addEventListener("click", () => onOpen(project));
      return element("li", {}, [row]);
    }),
  );
}

/**
 * The first row of the list: the same shape as a project, so it reads as the
 * way to add one. A real button, like the rows beneath it.
 */
function newProjectRow(onCreate: () => void, creating: boolean): HTMLElement {
  const row = element(
    "button",
    { className: "project project--new", type: "button", disabled: creating },
    [
      element("span", {
        className: "project__name",
        textContent: creating ? "Creating…" : "New Project",
      }),
      element("span", { className: "project__format", textContent: "Screenplay" }),
    ],
  );
  row.addEventListener("click", onCreate);
  return element("div", { className: "projects projects--new" }, [row]);
}

function reading(): HTMLElement {
  return element("p", { className: "reading", textContent: "Reading your projects…" });
}

function nothingYet(): HTMLElement {
  return element("div", { className: "nothing-yet" }, [
    element("p", { textContent: "No projects yet." }),
    element("p", {
      textContent:
        "Choose New Project to start one, or import a screenplay. The file you import from is left exactly as it is.",
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
  const panel = element("div", { className: "trouble" }, [
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
  // Loud means announced: a screen reader is told about this the same way it
  // is told about a failed read.
  panel.setAttribute("role", "alert");
  return panel;
}
