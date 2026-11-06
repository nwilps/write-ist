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
 * The look is the Open Project design (ADR-0043): the header drawn in
 * characters, a rule above and below the list, the projects in two columns
 * with one row lit, and **Home [Esc]**, **Import [I]** and **New Project [N]**
 * along the foot. New Project opens the home screen's dialog over this one. A
 * search has no control here: **Alt+Enter** opens it, for whoever goes looking.
 *
 * **Real text on the page.** Every name, count and label below is text a
 * screen reader can read and a writer can select. The header's art is the one
 * thing drawn, and it is hidden behind the heading that names the screen.
 */
import type { ProjectsListing } from "../../../src/project/projects.ts";
import type { Project } from "../../../src/project/bundle.ts";
import { element } from "./element.ts";
import { menuRow, navigable } from "./menu.ts";
import { OPEN_PROJECT_HEADER } from "./open-project-header.ts";
import { chordMatches, LEAVE, type Gesture, type KeyPress } from "./shortcuts.ts";
import { trouble as troublePanel } from "./trouble.ts";

export interface OpenProjectScreen {
  /**
   * The default location, once it has been read — **undefined until then**.
   * "No projects yet" is a claim about a folder, and a folder not yet read
   * must never read as an empty one.
   */
  readonly listing: ProjectsListing | undefined;
  /** Bring a screenplay in: Import [I], in the middle of the foot. */
  readonly onImport: () => void;
  /** Open one of them, which is what the list is for. */
  readonly onOpen: (project: Project) => void;
  /** Ask for a new, empty project: the New Project dialog, over this screen. */
  readonly onNewProject: () => void;
  /** Search the projects: Alt+Enter, and nothing drawn. */
  readonly onSearch: () => void;
  /** Back to the home screen. */
  readonly onBack: () => void;
  /** Set while an import is running, so it cannot be started twice. */
  readonly importing: boolean;
  /** Something went wrong, in words the writer can act on. */
  readonly trouble?: string;
}

/** The screen as drawn: its letters, and what the arrow keys and Enter do. */
export interface DrawnOpenProject {
  readonly gestures: readonly Gesture[];
  /** Answer a key press; true when it moved the highlight, opened, or searched. */
  readonly navigate: (press: KeyPress) => boolean;
}

/**
 * The line above and below the list: 70 box-drawing dashes at most — 630px at
 * the rule's 15px (Noah, after testing; wider than the design's 51).
 */
export const RULE_LENGTH = 70;

/** The chord that opens the search: the Editor's own (`commands.ts`). */
const SEARCH = { key: "Enter", alt: true } as const;

/** Draw the screen, and return what the window answers to. */
export function renderOpenProject(into: HTMLElement, screen: OpenProjectScreen): DrawnOpenProject {
  // The foot: Home on the left, Import in the middle, New Project on the right.
  const gestures: readonly Gesture[] = [
    { label: "Home", key: LEAVE, act: screen.onBack },
    { label: "Import", key: "i", act: screen.onImport, unavailable: screen.importing },
    { label: "New Project", key: "n", act: screen.onNewProject },
  ];

  const { listing, trouble } = screen;
  const projects = listing?.projects ?? [];
  const list = projects.length > 0 ? projectsList(projects, screen.onOpen) : undefined;

  into.replaceChildren(
    element("main", { className: "screen" }, [
      element("div", { className: "composition composition--open-project" }, [
        // The art is for the eye: the heading carries the name, the art is hidden.
        element("h1", { className: "open-project__header", ariaLabel: "Open Project" }, [
          element("pre", {
            className: "open-project__art",
            ariaHidden: "true",
            textContent: OPEN_PROJECT_HEADER,
          }),
        ]),
        rule(),
        // A failed read must never read as an empty folder, and never as one
        // still being read either — both are the screen telling the writer
        // something about their disk that nobody checked. That is ADR-0008
        // rule 3's instinct applied to the screen. Once a read has succeeded,
        // "No projects yet" is a claim someone made good on, and a later read
        // that fails says so beneath the list rather than emptying it.
        ...(listing === undefined
          ? trouble === undefined
            ? [reading("Reading your projects…")]
            : []
          : list !== undefined
            ? [list]
            : [nothingYet()]),
        ...(screen.importing ? [reading("Importing…")] : []),
        ...(trouble === undefined ? [] : [troublePanel(trouble)]),
        ...(listing === undefined || listing.unreadable.length === 0
          ? []
          : [declined(listing.unreadable)]),
        rule(),
        menuRow(gestures, { foot: true }),
      ]),
    ]),
  );

  // The projects as gestures, so the home menu's highlight can move through them.
  const rows: readonly Gesture[] = projects.map((project) => ({
    label: project.marker.name,
    key: "",
    act: () => screen.onOpen(project),
  }));
  const highlight = list === undefined ? undefined : navigable(list, rows, "button.project");

  return {
    gestures,
    navigate: (press) => {
      if (chordMatches(SEARCH, press)) {
        screen.onSearch();
        return true;
      }
      // A focused button outside the list — Home, Import, New Project — keeps its own
      // Enter: the lit project is not what the writer is pointing at then.
      const focused = document.activeElement;
      if (focused instanceof HTMLButtonElement && list?.contains(focused) !== true) return false;
      return highlight?.(press) ?? false;
    },
  };
}

/**
 * A rule of box-drawing dashes, 70 of them; on a window too narrow for
 * that it loses whole dashes, never half of one (`.open-project-rule`).
 */
function rule(): HTMLElement {
  return element("div", {
    className: "open-project-rule",
    ariaHidden: "true",
    textContent: "\u2500".repeat(RULE_LENGTH),
  });
}

/**
 * The projects, each a real button: its name, and its format beside it.
 *
 * **A row is the gesture, and the row says so by being a button.** There is no
 * letter beside it and no caption explaining how to choose one: a list of names
 * is its own affordance, and `docs/STANDARDS.md` bans captioning a gesture that
 * already exists. A click opens one; so does Enter on the lit row, which the
 * arrows, the pointer and Tab all move, as on the home screen.
 *
 * Letters are deliberately not handed out. A writer may have thirty projects
 * and the alphabet does not stretch; the screen's own gestures keep theirs.
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

function reading(words: string): HTMLElement {
  return element("p", { className: "reading", textContent: words });
}

function nothingYet(): HTMLElement {
  return element("div", { className: "nothing-yet" }, [
    element("p", { textContent: "No projects yet." }),
    element("p", {
      textContent:
        "Choose New Project to start one, or Import to bring in a screenplay. The file you import from is left exactly as it is.",
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
