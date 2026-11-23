/**
 * The Plan workspace: cards on a grid, for brainstorming the story's overall
 * shape (`GLOSSARY.md`, *Plan card*; the prototype, `plan.html`, ported and
 * restyled).
 *
 * The grid runs across the project's **target page count** — the one in Edit
 * Project Details — and follows it when it changes, the cards keeping their
 * places as a share of the whole (`src/plan/plan.ts`). Lanes run down it and
 * mean nothing. Structure sheets can be drawn under it as a guide. Nothing in
 * Plan refers to the manuscript, or reads it (ADR-0013): a plan is the same
 * sandbox for any project, a novel included.
 *
 * **A grid of squares is its own affordance** (`docs/STANDARDS.md`): there is
 * no toolbar and no line explaining it. Double-click an empty square to make a
 * card and name it; drag a card to move it, its right edge to lengthen it;
 * double-click it to rename it; click it to see and write its description;
 * drag the empty grid to pan. Right-click is Write-ist's own menu (ADR-0034),
 * and every gesture has a key.
 *
 * This file draws a **plan session** (`src/plan/plan-session.ts`) and hands it
 * what the writer did; the session decides what fits and what is stored, and
 * saves `plan.md`.
 */
import { createElement, ListChecks, Pencil, Plus, Shapes, Trash2, type IconNode } from "lucide";
import { readDetails } from "../../../../src/project/details.ts";
import { CARD_COLOURS, fits, type CardColour, type PlacedCard, type PlanLayout } from "../../../../src/plan/plan.ts";
import { PLAN_FILE, planSession, readPlan, type PlanSession } from "../../../../src/plan/plan-session.ts";
import { STRUCTURE_SHEETS, layoutBeats } from "../../../../src/plan/structure.ts";
import { openContextMenu, type ContextMenu } from "../../menus/context-menu.ts";
import type { MenuEntry } from "../../menus/drop-menu.ts";
import { element } from "../../screens/element.ts";
import { chordHint, chordMatches, isCapturedKey, type Chord } from "../../screens/shortcuts.ts";
import { message } from "../../screens/trouble.ts";
import type { MountedWorkspace, WorkspaceContext, WorkspaceManifest } from "../../shell/workspace.ts";
import "./plan.css";

/** How long the view rests before its place is kept. Leaving keeps it too. */
const PLACE_REST_MS = 5_000;
/** Two presses this close together on one square or card are a double-click. */
const DOUBLE_MS = 400;

/** What each colour is called, where the writer sees it. */
const COLOUR_NAMES: Readonly<Record<CardColour, string>> = {
  plain: "No Colour",
  yellow: "Yellow",
  orange: "Orange",
  red: "Red",
  purple: "Purple",
  blue: "Blue",
  green: "Green",
};

const KEYS = {
  save: { key: "s", mod: true },
  undo: { key: "z", mod: true },
  redo: { key: "y", mod: true },
  contextMenu: { key: "Enter", mod: true, alt: true },
  rename: { key: "Enter" },
  remove: { key: "Delete", alsoKeys: ["Backspace"] },
} as const satisfies Record<string, Chord>;

/** The webview's own zoom keys, which would zoom the whole window: answered with nothing. */
const WINDOW_ZOOM: readonly Chord[] = [
  { key: "=", alsoKeys: ["+", "Add"], mod: true },
  { key: "-", alsoKeys: ["Subtract"], mod: true },
  { key: "0", mod: true },
];

export const planWorkspace: WorkspaceManifest = {
  id: "plan",
  name: "Plan",
  key: "3",
  icon: ListChecks,
  files: [PLAN_FILE],
  mount,
};

function mount(into: HTMLElement, context: WorkspaceContext): MountedWorkspace {
  const surface = element("div", { className: "plan__surface" });
  const board = element("div", { className: "plan__board", tabIndex: 0 });
  board.setAttribute("aria-label", "Plan");
  board.append(surface);
  const reading = element("p", { className: "plan__reading", textContent: "Reading your plan…" });
  const structureButton = element("button", { className: "plan__control", type: "button" }, [
    icon(Shapes),
    element("span", { textContent: "Structure" }),
  ]);
  const controls = element("div", { className: "plan__controls" }, [structureButton]);
  const inspector = cardPanel();
  const desk = element("div", { className: "plan-desk" }, [reading]);
  into.replaceChildren(desk);

  let session: PlanSession | undefined;
  let gone = false;
  let hidden = false;
  let selected: string | undefined;
  let menu: ContextMenu | undefined;
  let pendingAcross: number | undefined;

  // --- Where the writer was: how far along the grid. ---
  let placeRest: ReturnType<typeof setTimeout> | undefined;
  let placeKept: number | undefined;
  let across = 0;
  const keepPlace = async (): Promise<void> => {
    clearTimeout(placeRest);
    placeRest = undefined;
    const places = context.workspacePlaces();
    const now = Math.round(across);
    if (places === undefined || session === undefined || now === placeKept) return;
    try {
      await places.remember(context.project.marker.projectId, "plan", { across: now });
      placeKept = now;
    } catch {
      // Only where the view was: Plan opens at the start next time.
    }
  };
  board.addEventListener("scroll", () => {
    if (hidden) return;
    across = board.scrollLeft;
    clearTimeout(placeRest);
    placeRest = setTimeout(() => void keepPlace(), PLACE_REST_MS);
  });

  // --- Drawing. ---
  const cellSize = (): number => {
    const grid = surface.querySelector<HTMLElement>(".plan__grid");
    const lanes = session?.layout().lanes ?? 1;
    const height = grid?.getBoundingClientRect().height ?? 0;
    return height > 0 ? height / lanes : tokenPixels("--size-plan-cell", 32);
  };

  const draw = (): void => {
    if (session === undefined) return;
    const layout = session.layout();
    const plan = session.plan();
    if (selected !== undefined && !plan.cards.some((card) => card.id === selected)) selected = undefined;
    surface.style.setProperty("--plan-columns", String(layout.columns));
    surface.style.setProperty("--plan-lanes", String(layout.lanes));
    surface.style.setProperty("--plan-length", String(layout.length));

    const ticks = [0, ...range(5, layout.length, 5).map((page) => page - 1)].map((cell) => {
      const tick = element("span", { className: "plan__tick", textContent: String(cell + 1) });
      tick.style.setProperty("--tick", String(cell));
      return tick;
    });
    const grid = element("div", { className: "plan__grid" }, [
      element("div", { className: "plan__past", ariaHidden: "true" }),
      element("div", { className: "plan__end", ariaHidden: "true" }),
      ...layout.placed.map((placed) => cardElement(placed)),
    ]);
    grid.addEventListener("pointerdown", onGridPress);
    grid.addEventListener("contextmenu", onGridMenu);

    const hint = tokenPixels("--size-hint", 11);
    const cell = tokenPixels("--size-plan-cell", 32);
    const track = layoutBeats(plan.structure, layout.length, (text) => (text.length * hint * 0.6 + hint * 2) / cell);
    const beats = track.beats.map((beat) => {
      const mark = element("div", { className: "plan__beat", ariaHidden: "true" });
      const label = element("div", { className: "plan__beat-label" }, [
        element("span", { textContent: beat.name }),
        element("span", { className: "plan__beat-page", textContent: beat.label }),
      ]);
      for (const each of [mark, label]) {
        each.style.setProperty("--beat-cell", String(beat.cell));
        each.style.setProperty("--beat-row", String(beat.row));
        if (beat.end !== undefined) each.style.setProperty("--beat-cells", String(beat.end - beat.cell));
      }
      if (beat.end !== undefined) label.classList.add("plan__beat-label--span");
      label.dataset["sheet"] = beat.sheet;
      return [mark, label];
    });
    surface.style.setProperty("--plan-beat-rows", String(track.rows));
    surface.replaceChildren(
      element("div", { className: "plan__ruler", ariaHidden: "true" }, ticks),
      grid,
      element("div", { className: "plan__beats" }, beats.flat()),
    );
    drawPanel();
  };

  const cardElement = (placed: PlacedCard): HTMLElement => {
    const card = element("div", { className: "plan__card" }, [
      element("span", { className: "plan__card-title", textContent: placed.card.title }),
      element("span", { className: "plan__card-grip", ariaHidden: "true" }),
    ]);
    card.dataset["id"] = placed.card.id;
    card.dataset["colour"] = placed.card.colour;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", placed.card.title === "" ? "Untitled card" : placed.card.title);
    if (placed.card.id === selected) card.dataset["selected"] = "true";
    if (placed.card.title === "") card.dataset["untitled"] = "true";
    place(card, placed.cell, placed.lane, placed.cells);
    return card;
  };

  // --- The card panel: the selected card's title, colour, length and description. ---
  function drawPanel(): void {
    const card = session?.plan().cards.find((each) => each.id === selected);
    const placed = session?.layout().placed.find((each) => each.card.id === selected);
    inspector.element.hidden = card === undefined;
    if (card === undefined || placed === undefined || session === undefined) return;
    inspector.show(card, placed, session.layout());
  }

  const select = (id: string | undefined): void => {
    selected = id;
    for (const card of surface.querySelectorAll<HTMLElement>(".plan__card")) {
      if (card.dataset["id"] === id) card.dataset["selected"] = "true";
      else delete card.dataset["selected"];
    }
    drawPanel();
  };

  const changed = (): void => {
    draw();
  };

  // --- Gestures on the grid. ---
  let lastPress: { key: string; at: number } | undefined;
  const isDouble = (key: string): boolean => {
    const now = performance.now();
    const double = lastPress !== undefined && lastPress.key === key && now - lastPress.at < DOUBLE_MS;
    lastPress = double ? undefined : { key, at: now };
    return double;
  };

  const squareAt = (event: { clientX: number; clientY: number }): { cell: number; lane: number } => {
    const grid = surface.querySelector<HTMLElement>(".plan__grid")!;
    const box = grid.getBoundingClientRect();
    const size = cellSize();
    const lanes = session?.layout().lanes ?? 1;
    return {
      cell: Math.max(0, Math.floor((event.clientX - box.left) / size)),
      lane: Math.max(0, Math.min(lanes - 1, Math.floor((event.clientY - box.top) / size))),
    };
  };

  const onGridPress = (event: PointerEvent): void => {
    if (event.button !== 0 || session === undefined) return;
    const target = event.target as HTMLElement;
    if (target.closest(".plan__title-edit") !== null) return;
    const card = target.closest<HTMLElement>(".plan__card");
    board.focus({ preventScroll: true });
    if (card !== null) {
      pressCard(event, card);
      return;
    }
    const square = squareAt(event);
    if (isDouble(`square:${square.cell}:${square.lane}`)) {
      event.preventDefault();
      createAt(square.cell, square.lane);
      return;
    }
    pan(event);
  };

  const createAt = (cell: number, lane: number): void => {
    const id = session?.add(cell, lane);
    if (id === undefined) return;
    selected = id;
    changed();
    editTitle(id);
  };

  /** A drag on the empty grid moves the view along it; a press without one clears the selection. */
  const pan = (event: PointerEvent): void => {
    const startX = event.clientX;
    const startLeft = board.scrollLeft;
    let moved = false;
    const grid = event.currentTarget as HTMLElement;
    grid.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    const move = (next: PointerEvent): void => {
      const dx = next.clientX - startX;
      if (Math.abs(dx) > 2) moved = true;
      board.scrollLeft = startLeft - dx;
    };
    const up = (): void => {
      grid.removeEventListener("pointermove", move);
      grid.removeEventListener("pointerup", up);
      grid.removeEventListener("pointercancel", up);
      if (!moved) select(undefined);
    };
    grid.addEventListener("pointermove", move);
    grid.addEventListener("pointerup", up);
    grid.addEventListener("pointercancel", up);
  };

  /**
   * Press on a card: select it; a second press renames it; a drag moves it, or
   * from its right edge lengthens it. **While the drag is measured, nothing
   * else is laid out again** (`docs/STANDARDS.md`): only the card being
   * dragged moves, and the grid is drawn again once it is dropped.
   */
  const pressCard = (event: PointerEvent, card: HTMLElement): void => {
    const id = card.dataset["id"]!;
    const writing = session!;
    const placed = writing.layout().placed.find((each) => each.card.id === id);
    if (placed === undefined) return;
    const resizing = (event.target as HTMLElement).classList.contains("plan__card-grip");
    if (!resizing && isDouble(`card:${id}`)) {
      event.preventDefault();
      editTitle(id);
      return;
    }
    select(id);
    const size = cellSize();
    const startX = event.clientX;
    const startY = event.clientY;
    let cell = placed.cell;
    let lane = placed.lane;
    let cells = placed.cells;
    let ok = true;
    card.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    card.dataset["dragging"] = "true";
    const move = (next: PointerEvent): void => {
      const dx = Math.round((next.clientX - startX) / size);
      const dy = Math.round((next.clientY - startY) / size);
      if (resizing) cells = Math.max(1, placed.cells + dx);
      else {
        cell = Math.max(0, placed.cell + dx);
        lane = Math.max(0, Math.min(writing.layout().lanes - 1, placed.lane + dy));
      }
      ok = fits(writing.layout(), cell, lane, cells, id);
      if (ok) delete card.dataset["invalid"];
      else card.dataset["invalid"] = "true";
      place(card, cell, lane, cells);
    };
    const up = (): void => {
      card.removeEventListener("pointermove", move);
      card.removeEventListener("pointerup", up);
      card.removeEventListener("pointercancel", up);
      delete card.dataset["dragging"];
      delete card.dataset["invalid"];
      const moved = cell !== placed.cell || lane !== placed.lane || cells !== placed.cells;
      if (moved && ok && (resizing ? writing.resize(id, cells) : writing.move(id, cell, lane))) changed();
      else place(card, placed.cell, placed.lane, placed.cells);
    };
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerup", up);
    card.addEventListener("pointercancel", up);
  };

  /** The title, typed straight onto the card. Enter keeps it, Escape leaves it as it was. */
  const editTitle = (id: string): void => {
    const writing = session;
    const placed = writing?.layout().placed.find((each) => each.card.id === id);
    const grid = surface.querySelector<HTMLElement>(".plan__grid");
    if (writing === undefined || placed === undefined || grid === null) return;
    grid.querySelector(".plan__title-edit")?.remove();
    select(id);
    const input = element("input", { className: "plan__title-edit", type: "text", value: placed.card.title, autocomplete: "off" });
    input.setAttribute("aria-label", "Card title");
    input.spellcheck = false;
    place(input, placed.cell, placed.lane, placed.cells);
    grid.append(input);
    input.focus();
    input.select();
    let finished = false;
    const finish = (keep: boolean): void => {
      if (finished) return;
      finished = true;
      if (keep) writing.setTitle(id, input.value.trim());
      input.remove();
      changed();
      board.focus({ preventScroll: true });
    };
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        // The edit's, not the window's: Escape here is not Home.
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }
    });
  };

  // --- Write-ist's own right-click menu (ADR-0034). ---
  const openMenu = (items: MenuEntry[], x: number, y: number, fromKeyboard: boolean): void => {
    menu?.close(false);
    menu = openContextMenu({ label: "Plan", items, x, y, fromKeyboard, restoreFocus: () => board.focus({ preventScroll: true }) });
  };
  const cardMenu = (id: string): MenuEntry[] => {
    const card = session?.plan().cards.find((each) => each.id === id);
    if (card === undefined) return [];
    return [
      { label: "Rename", icon: Pencil, hint: chordHint(KEYS.rename), act: () => editTitle(id) },
      { divider: true },
      ...CARD_COLOURS.map((colour) => ({
        label: COLOUR_NAMES[colour],
        checked: () => session?.plan().cards.find((each) => each.id === id)?.colour === colour,
        act: () => {
          session?.setColour(id, colour);
          changed();
        },
      })),
      { divider: true },
      { label: "Delete Card", icon: Trash2, hint: chordHint({ key: "Delete" }), act: () => removeCard(id) },
    ];
  };
  const onGridMenu = (event: MouseEvent): void => {
    event.preventDefault();
    if (session === undefined) return;
    const card = (event.target as HTMLElement).closest<HTMLElement>(".plan__card");
    if (card !== null) {
      select(card.dataset["id"]);
      openMenu(cardMenu(card.dataset["id"]!), event.clientX, event.clientY, false);
      return;
    }
    const square = squareAt(event);
    const free = fits(session.layout(), square.cell, square.lane, 1);
    openMenu(
      [{ label: "New Card", icon: Plus, ...(free ? {} : { unavailable: true }), act: () => createAt(square.cell, square.lane) }],
      event.clientX,
      event.clientY,
      false,
    );
  };
  // Nowhere in Plan is the webview's own menu wanted.
  const quietMenu = (event: MouseEvent): void => event.preventDefault();
  desk.addEventListener("contextmenu", quietMenu);

  const removeCard = (id: string): void => {
    session?.remove(id);
    if (selected === id) selected = undefined;
    changed();
    board.focus({ preventScroll: true });
  };

  // The structure sheets drawn under the grid: Write-ist's own menu, each a tick.
  structureButton.addEventListener("click", () => {
    const box = structureButton.getBoundingClientRect();
    openMenu(
      STRUCTURE_SHEETS.map((sheet) => ({
        label: sheet.name,
        checked: () => session?.plan().structure.includes(sheet.id) === true,
        act: () => {
          if (session === undefined) return;
          const shown = session.plan().structure;
          session.setStructure(shown.includes(sheet.id) ? shown.filter((id) => id !== sheet.id) : [...shown, sheet.id]);
          changed();
        },
      })),
      box.left,
      box.bottom,
      false,
    );
  });

  // The wheel runs along the grid, which is what it is: wide, not tall.
  board.addEventListener(
    "wheel",
    (event) => {
      if (event.shiftKey) return;
      const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (delta === 0) return;
      event.preventDefault();
      board.scrollLeft += delta;
    },
    { passive: false },
  );

  // --- Keys. Heard on the way down, while Plan is on screen. ---
  const keys = (event: KeyboardEvent): void => {
    if (hidden || session === undefined || isCapturedKey(event)) return;
    if (document.querySelector("dialog[open]") !== null) return;
    if (WINDOW_ZOOM.some((chord) => chordMatches(chord, event))) {
      event.preventDefault();
      return;
    }
    if (chordMatches(KEYS.save, event)) {
      event.preventDefault();
      void session.save();
      return;
    }
    // A title or a description being typed has its own keys, Undo among them.
    const target = event.target as HTMLElement | null;
    if (target !== null && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
    const writing = session;
    const step = (act: () => boolean): void => {
      event.preventDefault();
      if (act()) changed();
    };
    if (chordMatches(KEYS.undo, event)) return step(() => (event.shiftKey ? writing.redo() : writing.undo()));
    if (chordMatches(KEYS.redo, event)) return step(writing.redo);
    if (selected === undefined) return;
    const id = selected;
    const placed = writing.layout().placed.find((each) => each.card.id === id);
    if (placed === undefined) return;
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey) || chordMatches(KEYS.contextMenu, event)) {
      event.preventDefault();
      const box = surface.querySelector<HTMLElement>(`.plan__card[data-id="${id}"]`)?.getBoundingClientRect();
      openMenu(cardMenu(id), box?.left ?? 0, box?.bottom ?? 0, true);
      return;
    }
    if (chordMatches(KEYS.rename, event)) {
      event.preventDefault();
      editTitle(id);
      return;
    }
    if (chordMatches(KEYS.remove, event)) {
      event.preventDefault();
      removeCard(id);
      return;
    }
    if (event.key === "Escape") {
      // Let go of the card first; Escape again goes Home, as everywhere.
      event.preventDefault();
      event.stopPropagation();
      select(undefined);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const arrow = arrows[event.key];
    if (arrow === undefined) return;
    event.preventDefault();
    const [dx, dy] = arrow;
    // Shift and Left or Right: shorter or longer. The arrows alone: move it.
    if (event.shiftKey && dy === 0) {
      if (writing.resize(id, Math.max(1, placed.cells + dx))) changed();
    } else if (writing.move(id, Math.max(0, placed.cell + dx), placed.lane + dy)) changed();
  };
  window.addEventListener("keydown", keys, true);

  // File ▸ Edit Project Details is the name pill's, here as in the Editor.
  const stopListeningForDetails = context.whenDetailsAsked(() => {
    if (session === undefined || into.querySelector("dialog[open]") !== null) return;
    context.editProjectDetails({ into, carryOut: session.relocate, closed: () => board.focus({ preventScroll: true }) });
  });
  // A new target page count: the grid takes it, the cards keep their places.
  const stopListeningForTarget = context.whenDetailsChanged((details) => {
    session?.setTargetPages(details.targetPages);
    draw();
  });

  // --- The card panel's own wiring. ---
  inspector.onTitle((title) => {
    if (selected === undefined || session === undefined) return;
    session.setTitle(selected, title);
    const shown = surface.querySelector<HTMLElement>(`.plan__card[data-id="${selected}"] .plan__card-title`);
    if (shown !== null) shown.textContent = title.trim();
  });
  inspector.onTitleDone(() => draw());
  inspector.onDescription((text) => {
    if (selected !== undefined) session?.setDescription(selected, text);
  });
  inspector.onColour((colour) => {
    if (selected === undefined) return;
    session?.setColour(selected, colour);
    changed();
  });
  inspector.onLength((cells) => {
    if (selected !== undefined && session?.resize(selected, cells) === true) changed();
  });
  inspector.element.addEventListener("plan-panel-left", () => board.focus({ preventScroll: true }));
  inspector.onDelete(() => {
    if (selected !== undefined) removeCard(selected);
  });

  void (async () => {
    try {
      const [read, details, place] = await Promise.all([
        readPlan(context.filesystem, context.project),
        readDetails(context.filesystem, context.project.path),
        recallPlace(context),
      ]);
      if (gone) return;
      session = planSession(
        {
          filesystem: context.filesystem,
          project: context.project,
          targetPages: details.details.targetPages,
          report: context.report,
          setSaved: context.setSaved,
          setStatus: context.setStatus,
          whenSwitchedAway: context.whenSwitchedAway,
          whenSwitchedBack: context.whenSwitchedBack,
          redraw: () => draw(),
        },
        read,
      );
      desk.replaceChildren(board, controls, inspector.element);
      draw();
      const at = place?.["across"];
      if (at !== undefined) {
        placeKept = at;
        across = at;
        if (hidden) pendingAcross = at;
        else board.scrollLeft = at;
      }
      const active = document.activeElement;
      if (!hidden && (active === null || active === document.body)) board.focus({ preventScroll: true });
    } catch (error) {
      if (gone) return;
      reading.textContent = "";
      context.report(`Write-ist could not read this project's plan, so nothing has been changed. ${message(error)}`);
    }
  })();

  const takeDown = (): void => {
    gone = true;
    clearTimeout(placeRest);
    window.removeEventListener("keydown", keys, true);
    desk.removeEventListener("contextmenu", quietMenu);
    stopListeningForDetails();
    stopListeningForTarget();
    menu?.close(false);
  };

  return {
    focus: () => board.focus({ preventScroll: true }),
    hide: () => {
      hidden = true;
      menu?.close(false);
      // A title being typed is kept, as a click away would keep it.
      (surface.querySelector(".plan__title-edit") as HTMLInputElement | null)?.blur();
      void session?.save();
      void keepPlace();
    },
    show: () => {
      hidden = false;
      if (pendingAcross !== undefined) {
        board.scrollLeft = pendingAcross;
        pendingAcross = undefined;
      }
      board.focus({ preventScroll: true });
    },
    relocate: (move) => (session === undefined ? move() : session.relocate(move)),
    unmount: async () => {
      if (session === undefined) {
        takeDown();
        return true;
      }
      (surface.querySelector(".plan__title-edit") as HTMLInputElement | null)?.blur();
      if (!(await session.leave())) return false;
      await keepPlace();
      takeDown();
      session = undefined;
      return true;
    },
  };
}

/** Put a card (or its title being typed) at a cell and lane, so many cells long: the stylesheet draws it there. */
function place(item: HTMLElement, cell: number, lane: number, cells: number): void {
  item.style.setProperty("--card-cell", String(cell));
  item.style.setProperty("--card-lane", String(lane));
  item.style.setProperty("--card-cells", String(cells));
}

/**
 * The panel under the grid for the card selected: its title, colour, length
 * and description. Hidden while no card is.
 */
function cardPanel() {
  const title = element("input", { className: "plan__panel-title", type: "text", autocomplete: "off" });
  title.setAttribute("aria-label", "Card title");
  title.spellcheck = false;
  const swatches = CARD_COLOURS.map((colour) => {
    const swatch = element("button", { className: "plan__swatch", type: "button" });
    swatch.dataset["colour"] = colour;
    swatch.setAttribute("aria-label", COLOUR_NAMES[colour]);
    return swatch;
  });
  const shorter = element("button", { className: "plan__step", type: "button", textContent: "−" });
  shorter.setAttribute("aria-label", "Shorter");
  const longer = element("button", { className: "plan__step", type: "button", textContent: "+" });
  longer.setAttribute("aria-label", "Longer");
  const where = element("span", { className: "plan__where" });
  const remove = element("button", { className: "plan__control plan__delete", type: "button" }, [
    icon(Trash2),
    element("span", { textContent: "Delete" }),
  ]);
  const description = element("textarea", { className: "plan__description", placeholder: "What happens here?" });
  description.setAttribute("aria-label", "Card description");
  description.spellcheck = false;
  const panel = element("section", { className: "plan__panel", hidden: true }, [
    element("div", { className: "plan__panel-head" }, [
      title,
      element("div", { className: "plan__swatches" }, swatches),
    ]),
    element("div", { className: "plan__panel-row" }, [
      element("div", { className: "plan__stepper" }, [shorter, where, longer]),
      remove,
    ]),
    description,
  ]);
  panel.setAttribute("aria-label", "Card");

  let cells = 1;
  let shown: string | undefined;
  let titleListener: (title: string) => void = () => {};
  let titleDone: () => void = () => {};
  let descriptionListener: (text: string) => void = () => {};
  let colourListener: (colour: CardColour) => void = () => {};
  let lengthListener: (cells: number) => void = () => {};
  let deleteListener: () => void = () => {};
  title.addEventListener("input", () => titleListener(title.value));
  title.addEventListener("change", () => titleDone());
  title.addEventListener("keydown", (event) => {
    if (event.key === "Enter") title.blur();
  });
  // Escape in a field leaves the field, back to the grid; it is not Home.
  for (const field of [title, description] as HTMLElement[]) {
    field.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      field.blur();
      panel.dispatchEvent(new Event("plan-panel-left", { bubbles: true }));
    });
  }
  description.addEventListener("input", () => descriptionListener(description.value));
  swatches.forEach((swatch) => swatch.addEventListener("click", () => colourListener(swatch.dataset["colour"] as CardColour)));
  shorter.addEventListener("click", () => lengthListener(Math.max(1, cells - 1)));
  longer.addEventListener("click", () => lengthListener(cells + 1));
  remove.addEventListener("click", () => deleteListener());

  return {
    element: panel,
    show: (card: PlacedCard["card"], placed: PlacedCard, layout: PlanLayout) => {
      // What the writer is typing into is theirs: it is not written over under them.
      const fresh = shown !== card.id;
      shown = card.id;
      if (fresh || document.activeElement !== title) title.value = card.title;
      if (fresh || document.activeElement !== description) description.value = card.description;
      swatches.forEach((swatch) => swatch.setAttribute("aria-pressed", String(swatch.dataset["colour"] === card.colour)));
      cells = placed.cells;
      shorter.disabled = placed.cells <= 1;
      longer.disabled = !fits(layout, placed.cell, placed.lane, placed.cells + 1, card.id);
      // Counted from 1, as a person counts; the grid counts from 0.
      const first = placed.cell + 1;
      const last = placed.cell + placed.cells;
      where.textContent = first === last ? `${first} of ${layout.length}` : `${first}–${last} of ${layout.length}`;
    },
    onTitle: (act: (title: string) => void) => void (titleListener = act),
    onTitleDone: (act: () => void) => void (titleDone = act),
    onDescription: (act: (text: string) => void) => void (descriptionListener = act),
    onColour: (act: (colour: CardColour) => void) => void (colourListener = act),
    onLength: (act: (cells: number) => void) => void (lengthListener = act),
    onDelete: (act: () => void) => void (deleteListener = act),
  };
}

function icon(node: IconNode): SVGElement {
  const drawn = createElement(node, { class: "plan__icon" });
  drawn.setAttribute("aria-hidden", "true");
  return drawn;
}

/** Whole numbers from `from` to `to`, `by` apart. */
function range(from: number, to: number, by: number): number[] {
  const out: number[] = [];
  for (let at = from; at <= to; at += by) out.push(at);
  return out;
}

/** A pixel token's value as a number, or `fallback` where there is no stylesheet. */
function tokenPixels(name: string, fallback: number): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Where Plan was left in this project, or `undefined`. */
async function recallPlace(context: WorkspaceContext): Promise<Readonly<Record<string, number>> | undefined> {
  try {
    return await context.workspacePlaces()?.recall(context.project.marker.projectId, "plan");
  } catch {
    return undefined;
  }
}
