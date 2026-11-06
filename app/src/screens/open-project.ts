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
 * **The list shows eight rows at most, and scrolls** (Noah, after testing,
 * ADR-0043); the header, the rules and the foot stay where they are. A window
 * too short for eight shows as many whole rows as fit (`rowsThatFit`).
 *
 * **Right-click on a project** — or the Menu key, or Shift+F10, on the lit one
 * — opens the menu File, Edit and View are drawn from (ADR-0034), with two
 * items: Rename Project and Delete Project. It acts on the row that was
 * pointed at, which the right-click lights first, so the lit row and the
 * menu's project are always the same one. Right-click anywhere else on the
 * screen opens nothing, and not the webview's own menu either.
 *
 * **Real text on the page.** Every name, count and label below is text a
 * screen reader can read and a writer can select. The header's art is the one
 * thing drawn, and it is hidden behind the heading that names the screen.
 */
import type { ProjectsListing } from "../../../src/project/projects.ts";
import type { Project } from "../../../src/project/bundle.ts";
import { Pencil, Trash } from "lucide";
import { openContextMenu, type ContextMenu } from "../menus/context-menu.ts";
import { element } from "./element.ts";
import { menuRow, navigable } from "./menu.ts";
import { OPEN_PROJECT_HEADER } from "./open-project-header.ts";
import { chordMatches, LEAVE, shortcutOf, type Gesture, type KeyPress } from "./shortcuts.ts";
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
  /** Rename a project: the right-click menu's first item, for the row pointed at. */
  readonly onRename: (project: Project) => void;
  /** Move a project to the deleted folder: the menu's second item. */
  readonly onDelete: (project: Project) => void;
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

/**
 * The most project rows on the screen at once (Noah, after testing): more
 * than this and the list scrolls. Kept equal to `--count-project-rows`.
 */
export const MOST_ROWS = 8;

/**
 * How many whole rows fit in `room` pixels of height, rows `row` tall and
 * `gap` apart: never more than `MOST_ROWS`, never fewer than one — a window
 * too short even for that scrolls as a whole, as it always has.
 */
export function rowsThatFit(room: number, row: number, gap: number): number {
  // A hair's tolerance, so a fractional layout does not lose a row it has room for.
  const whole = Math.floor((room + gap + 0.5) / (row + gap));
  return Math.max(1, Math.min(MOST_ROWS, whole));
}

/** The chord that opens the search: the Editor's own (`commands.ts`). */
const SEARCH = { key: "Enter", alt: true } as const;

/** The right-click menu, while one is open. A redraw takes it down with the rows. */
let projectMenu: ContextMenu | undefined;

/** Fits the list to the window when it is resized; the next drawing replaces it. */
let fitOnResize: (() => void) | undefined;

/** Draw the screen, and return what the window answers to. */
export function renderOpenProject(into: HTMLElement, screen: OpenProjectScreen): DrawnOpenProject {
  projectMenu?.close(false);
  projectMenu = undefined;
  if (fitOnResize !== undefined) window.removeEventListener("resize", fitOnResize);
  fitOnResize = undefined;
  // The foot: Home on the left, Import in the middle, New Project on the right.
  const gestures: readonly Gesture[] = [
    { label: "Home", key: LEAVE, act: screen.onBack },
    { label: "Import", key: "i", act: screen.onImport, unavailable: screen.importing },
    { label: "New Project", key: "n", act: screen.onNewProject },
  ];

  const { listing, trouble } = screen;
  const projects = listing?.projects ?? [];
  const list = projects.length > 0 ? projectsList(projects, screen.onOpen) : undefined;

  const composition = element("div", { className: "composition composition--open-project" }, [
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
  ]);
  const main = element("main", { className: "screen" }, [composition]);
  into.replaceChildren(main);
  if (list !== undefined) {
    const fit = (): void => {
      if (list.isConnected) fitRows(main, composition, list);
      else window.removeEventListener("resize", fit);
    };
    fit();
    fitOnResize = fit;
    window.addEventListener("resize", fit);
    // The bundled face can arrive after the first drawing, and move the foot.
    void document.fonts?.ready.then(fit);
  }
  // Write-ist draws its own menus (ADR-0034): the webview's is never wanted
  // here, and only a project row has one of Write-ist's.
  main.addEventListener("contextmenu", (event) => event.preventDefault());

  // The projects as gestures, so the home menu's highlight can move through them.
  const rows: readonly Gesture[] = projects.map((project) => ({
    label: project.marker.name,
    key: "",
    act: () => screen.onOpen(project),
  }));
  const highlight = list === undefined ? undefined : navigable(list, rows, "button.project");
  const menuFor = list === undefined ? undefined : menuOnRows(list, projects, screen);

  return {
    gestures,
    navigate: (press) => {
      if (projectMenu?.isOpen() === true) {
        // The menu has the keys: its own arrows, Escape and Tab stop there, and
        // Enter and Space are its focused item's. A letter must not reach the
        // screen behind it — N would open New Project over the menu. Escape
        // from anywhere closes the menu, and does not leave the screen.
        if (press.key === "Escape") projectMenu.close(true);
        return shortcutOf(press) !== undefined;
      }
      // The Menu key, with focus nowhere in particular: the lit row's menu.
      if (press.key === "ContextMenu" && list !== undefined && menuFor !== undefined) {
        const lit = list.querySelector<HTMLButtonElement>("button.project.gesture--selected");
        if (lit !== null) menuFor(lit);
        return true;
      }
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

/**
 * Give every project row its right-click menu: Rename Project and Delete
 * Project, **for that row's project** — each item's action is bound to the row
 * it was opened on, never read from whichever row is lit when it is chosen.
 *
 * A right-click lights the row it lands on and takes focus there, as hover and
 * Tab do, so there is one highlight and it is on the project the menu is for.
 * While the menu is open the pointer passing over other rows does not move it:
 * the highlight stays on the menu's project until the menu goes.
 *
 * Answers how to open a row's menu from the keyboard, under the row.
 */
function menuOnRows(
  list: HTMLElement,
  projects: readonly Project[],
  screen: OpenProjectScreen,
): (row: HTMLButtonElement) => void {
  const rows = [...list.querySelectorAll<HTMLButtonElement>("button.project")];
  // Capture, on the list: a `mouseenter` does not bubble, but it does pass here
  // first on its way to the row, and stopping it here is stopping the highlight.
  list.addEventListener(
    "mouseenter",
    (event) => {
      if (projectMenu?.isOpen() === true) event.stopPropagation();
    },
    true,
  );

  const open = (row: HTMLButtonElement, project: Project, x: number, y: number, fromKeyboard: boolean): void => {
    row.focus({ preventScroll: true });
    projectMenu = openContextMenu({
      label: project.marker.name,
      items: [
        { label: "Rename Project", icon: Pencil, act: () => screen.onRename(project) },
        { label: "Delete Project", icon: Trash, act: () => screen.onDelete(project) },
      ],
      x,
      y,
      fromKeyboard,
      restoreFocus: () => {
        if (row.isConnected) row.focus({ preventScroll: true });
      },
    });
  };
  // The Menu key and Shift+F10, as a native menu opens (ADR-0034): under the row.
  const fromKeyboard = (row: HTMLButtonElement): void => {
    const index = rows.indexOf(row);
    if (index < 0) return;
    const box = row.getBoundingClientRect();
    open(row, projects[index]!, box.left, box.bottom, true);
  };

  rows.forEach((row, index) => {
    const project = projects[index]!;
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      // The screen's own handler would only say the same again.
      event.stopPropagation();
      open(row, project, event.clientX, event.clientY, false);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
      event.preventDefault();
      event.stopPropagation();
      fromKeyboard(row);
    });
  });
  return fromKeyboard;
}

/**
 * Size the list's window to whole rows: as many as the window has room for
 * once the header, rules, foot and the screen's margins have theirs, and
 * never more than eight. A measured count, handed to the stylesheet, which
 * owns the row and gap sizes (`.projects`).
 *
 * Without a layout — no window yet — it leaves the stylesheet's eight alone.
 */
function fitRows(main: HTMLElement, composition: HTMLElement, list: HTMLElement): void {
  const [first, second] = [...list.children];
  const row = first?.getBoundingClientRect();
  if (row === undefined || row.height <= 0) return;
  const gap = second === undefined ? 0 : second.getBoundingClientRect().top - row.bottom;
  const style = getComputedStyle(main);
  const margins = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const rest = composition.getBoundingClientRect().height - list.getBoundingClientRect().height;
  const room = window.innerHeight - margins - rest;
  list.style.setProperty("--project-rows", String(rowsThatFit(room, row.height, gap)));
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
