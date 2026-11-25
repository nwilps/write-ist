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
 * Under the grid, the Structure button, and right beside it **up to three
 * cards, open**, larger, to write on (Noah, 2026-11-25; `src/plan/open-cards.ts`).
 * A card clicked on the grid opens in the first place, beside the button, and
 * the open ones move a place along; the third, if there was one, slides off to
 * the right, fading, and closes. A card already open stays where it is. An
 * open card is dragged by its top edge to another place, and is put in there,
 * the others moving over — not swapped. Each grows down as its description
 * does, until its foot reaches the bottom pills' margin; past that the
 * description scrolls inside it. One structure sheet is drawn under the grid
 * at a time.
 *
 * The project name pill is not drawn while Plan is on screen
 * (`showsProjectName`): the card has the foot of the desk. Nor are the
 * paper's fades at the window's top and bottom (`showsPaperFade`): there is
 * no paper here, and they faded the cards' text.
 *
 * This file draws a **plan session** (`src/plan/plan-session.ts`) and hands it
 * what the writer did; the session decides what fits and what is stored, and
 * saves `plan.md`.
 *
 * **Everything it asks of the application is a toolbox call** (ADR-0045): its
 * file (`toolbox.files`, which keep it to `plan.md`), the writer's place
 * (`toolbox.memory`), the project's details, the pills and its menus. It
 * imports nothing else of the application's.
 */
import { createElement, GripHorizontal, ListChecks, Palette, Pencil, Plus, Shapes, Trash2, type IconNode } from "lucide";
import { closeCard, moveCard, openCard, placeUnder } from "../../../../src/plan/open-cards.ts";
import { CARD_COLOURS, fits, type CardColour, type PlacedCard, type PlanLayout } from "../../../../src/plan/plan.ts";
import { PLAN_FILE, planSession, readPlan, type PlanSession } from "../../../../src/plan/plan-session.ts";
import { STRUCTURE_SHEETS, layoutBeats } from "../../../../src/plan/structure.ts";
import {
  chordHint,
  chordMatches,
  element,
  isCapturedKey,
  message,
  type Chord,
  type ContextMenu,
  type MenuEntry,
  type MountedWorkspace,
  type Toolbox,
  type WorkspaceManifest,
} from "../../toolbox/index.ts";
import "./plan.css";

/** How long the view rests before its place is kept. Leaving keeps it too. */
const PLACE_REST_MS = 5_000;
/** Two presses this close together on one square or card are a double-click. */
const DOUBLE_MS = 400;

/** What each colour is called, where the writer sees it. */
const COLOUR_NAMES: Readonly<Record<CardColour, string>> = {
  plain: "No Colour",
  sand: "Sand",
  yellow: "Yellow",
  orange: "Orange",
  red: "Red",
  purple: "Purple",
  blue: "Blue",
  aqua: "Aqua",
  green: "Green",
};

/** The colour picker's swatches across a row; the arrows move by one, or by a row. */
const PALETTE_COLUMNS = 3;

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
  // The selected card has the foot of the desk, where the name pill would be.
  showsProjectName: false,
  // The paper's fades are the Editor's: over Plan they faded the open cards' text at the foot of the desk.
  showsPaperFade: false,
  mount,
};

function mount(into: HTMLElement, toolbox: Toolbox): MountedWorkspace {
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
  // Under the grid: the Structure button, and the open cards beside it.
  const slot = element("div", { className: "plan__card-slot" });
  const under = element("div", { className: "plan__under" }, [controls, slot]);
  const desk = element("div", { className: "plan-desk" }, [reading]);
  into.replaceChildren(desk);

  let session: PlanSession | undefined;
  let gone = false;
  let hidden = false;
  let selected: string | undefined;
  /** The open cards, the first place (beside the Structure button) first. */
  let open: string[] = [];
  const panels = new Map<string, CardPanel>();
  let menu: ContextMenu | undefined;
  let pendingAcross: number | undefined;

  // --- Where the writer was: how far along the grid. ---
  let placeRest: ReturnType<typeof setTimeout> | undefined;
  let placeKept: number | undefined;
  let across = 0;
  const keepPlace = async (): Promise<void> => {
    clearTimeout(placeRest);
    placeRest = undefined;
    const now = Math.round(across);
    if (session === undefined || now === placeKept) return;
    try {
      if (await toolbox.memory.remember({ across: now })) placeKept = now;
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
    open = open.filter((id) => layout.placed.some((placed) => placed.card.id === id));
    surface.style.setProperty("--plan-columns", String(layout.columns));
    surface.style.setProperty("--plan-lanes", String(layout.lanes));
    surface.style.setProperty("--plan-length", String(layout.length));

    const ticks = [0, ...range(5, layout.length, 5).map((page) => page - 1)].map((cell) => {
      const tick = element("span", { className: "plan__tick", textContent: String(cell + 1) });
      tick.style.setProperty("--tick", String(cell));
      return tick;
    });
    // A column of dots on every square's edge, the last edge included.
    const dotColumns = range(0, layout.columns, 1).map((cell) => {
      const column = element("div", { className: "plan__dot-column" });
      column.style.setProperty("--dot-cell", String(cell));
      return column;
    });
    const grid = element("div", { className: "plan__grid" }, [
      element("div", { className: "plan__dots", ariaHidden: "true" }, dotColumns),
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
    drawPanels();
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

  // --- The open cards: each one's title, colour, length and description. ---
  /** Draw every open card in its place, making the newly opened and taking away the closed. */
  function drawPanels(): void {
    for (const [id, panel] of panels) {
      if (open.includes(id)) continue;
      panel.closePalette();
      panel.element.remove();
      panels.delete(id);
    }
    if (session === undefined) return;
    const layout = session.layout();
    open.forEach((id, at) => {
      const card = session!.plan().cards.find((each) => each.id === id);
      const placed = layout.placed.find((each) => each.card.id === id);
      if (card === undefined || placed === undefined) return;
      let panel = panels.get(id);
      if (panel === undefined) {
        panel = cardPanel(toolbox, id, panelActions);
        panels.set(id, panel);
        slot.append(panel.element);
      }
      panel.element.style.setProperty("--plan-position", String(at));
      panel.show(card, placed, layout);
    });
  }

  /** Light a card on the grid, without opening it or moving it among the open ones. */
  const mark = (id: string | undefined): void => {
    selected = id;
    for (const card of surface.querySelectorAll<HTMLElement>(".plan__card")) {
      if (card.dataset["id"] === id) card.dataset["selected"] = "true";
      else delete card.dataset["selected"];
    }
  };

  /**
   * Select a card: lit on the grid and open under it — in the first place if
   * it was not open, pushing the third out; where it is if it was. A new card
   * made on the grid comes in the same way. Nothing closes the open cards but
   * a fourth pushing one out, or deleting one: a press on the empty grid, or
   * Escape, only lets go of the card lit on the grid (Noah, 2026-11-25).
   */
  const select = (id: string): void => {
    mark(id);
    const opened = openCard(open, id);
    open = opened.open;
    if (opened.out !== undefined) pushOut(opened.out);
    drawPanels();
  };

  /** The card in the third place, pushed out by a new one: it slides off to the right, fading, and is gone. */
  const pushOut = (id: string): void => {
    const panel = panels.get(id);
    if (panel === undefined) return;
    panels.delete(id);
    panel.closePalette();
    const leaving = panel.element;
    if (leaving.contains(document.activeElement)) board.focus({ preventScroll: true });
    leaving.dataset["leaving"] = "true";
    leaving.inert = true;
    const gone = (): void => leaving.remove();
    leaving.addEventListener("transitionend", (event) => {
      if (event.target === leaving && event.propertyName === "opacity") gone();
    });
    setTimeout(gone, tokenMilliseconds("--duration-plan-panel", 240));
  };

  /**
   * An open card dragged by its top edge: it follows the pointer, and the
   * others move over to show where it would go in. Dropped, it is put in at
   * the place it is over — the others moved over, never swapped.
   *
   * **Nothing here may throw a card back to where it was** (Plan round 2).
   * The press itself is the drag's first position, so the card is never drawn
   * without its offset; and the place it is over changes only once it is
   * clearly past halfway (`placeUnder`), so the others never turn back and
   * forth while the pointer rests near the line.
   */
  const dragPanel = (id: string, event: PointerEvent): void => {
    const panel = panels.get(id);
    const from = open.indexOf(id);
    if (event.button !== 0 || panel === undefined || from < 0) return;
    event.preventDefault();
    mark(id);
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture?.(event.pointerId);
    const step = panel.element.getBoundingClientRect().width + tokenPixels("--space-plan-panels", 16);
    const startX = event.clientX;
    const before = open;
    let under = from;
    let order = open;
    const move = (next: PointerEvent): void => {
      const dx = next.clientX - startX;
      panel.element.style.setProperty("--plan-drag-x", `${dx}px`);
      const now = placeUnder(from, dx, step, before.length, under);
      if (now === under && order !== before) return;
      under = now;
      order = moveCard(before, id, under);
      order.forEach((each, at) => {
        if (each !== id) panels.get(each)?.element.style.setProperty("--plan-position", String(at));
      });
    };
    // Its offset first, then lifted: lifted with no offset, it was drawn at the first place until the pointer moved.
    move(event);
    panel.element.dataset["dragging"] = "true";
    const up = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      handle.removeEventListener("lostpointercapture", up);
      if (panel.element.dataset["dragging"] === undefined) return;
      delete panel.element.dataset["dragging"];
      panel.element.style.setProperty("--plan-drag-x", "");
      // Only the cards still open: one may have been closed under the drag.
      open = order.filter((each) => open.includes(each));
      drawPanels();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
    // Let go outside the window, the drag still ends: the card is never left following nothing.
    handle.addEventListener("lostpointercapture", up);
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

  /**
   * A drag on the empty grid moves the view along it; a press without one lets
   * go of the card lit on the grid, and leaves the open cards open.
   */
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
      if (!moved) mark(undefined);
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
    menu = toolbox.menus.open({ label: "Plan", items, x, y, fromKeyboard, restoreFocus: () => board.focus({ preventScroll: true }) });
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
      select(card.dataset["id"]!);
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
    open = closeCard(open, id);
    if (selected === id) selected = undefined;
    changed();
    board.focus({ preventScroll: true });
  };

  // The structure sheet drawn under the grid: Write-ist's own menu, a tick on
  // the one shown. One at a time: choosing another puts it in place of the
  // last, and choosing the one shown takes it away, leaving none.
  structureButton.addEventListener("click", () => {
    const box = structureButton.getBoundingClientRect();
    openMenu(
      STRUCTURE_SHEETS.map((sheet) => ({
        label: sheet.name,
        checked: () => session?.plan().structure.includes(sheet.id) === true,
        act: () => {
          if (session === undefined) return;
          const shown = session.plan().structure;
          session.setStructure(shown.length === 1 && shown[0] === sheet.id ? [] : [sheet.id]);
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
    // A title or a description being typed has its own keys, Undo among them; so has the colour picker.
    const target = event.target as HTMLElement | null;
    if (target !== null && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
    if (target?.closest?.(".plan__palette") != null) return;
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
      // Let go of the card lit on the grid, as a press on the empty grid does,
      // and leave the open cards open; Escape again goes Home, as everywhere.
      event.preventDefault();
      event.stopPropagation();
      mark(undefined);
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
  const stopListeningForDetails = toolbox.details.whenAsked(() => {
    if (session === undefined || into.querySelector("dialog[open]") !== null) return;
    toolbox.details.edit({ into, carryOut: session.relocate, closed: () => board.focus({ preventScroll: true }) });
  });
  // A new target page count: the grid takes it, the cards keep their places.
  const stopListeningForTarget = toolbox.details.whenChanged((details) => {
    session?.setTargetPages(details.targetPages);
    draw();
  });

  // --- What the open cards do. ---
  const panelActions: PanelActions = {
    title: (id, title) => {
      session?.setTitle(id, title);
      const shown = surface.querySelector<HTMLElement>(`.plan__card[data-id="${id}"] .plan__card-title`);
      if (shown !== null) shown.textContent = title.trim();
    },
    titleDone: () => draw(),
    description: (id, text) => session?.setDescription(id, text),
    colour: (id, colour) => {
      session?.setColour(id, colour);
      changed();
    },
    length: (id, cells) => {
      if (session?.resize(id, cells) === true) changed();
    },
    remove: (id) => removeCard(id),
    left: () => board.focus({ preventScroll: true }),
    // Writing on an open card selects it on the grid, so its keys are its own; it stays in its place.
    touched: (id) => {
      if (selected !== id) mark(id);
    },
    drag: dragPanel,
  };

  void (async () => {
    try {
      const [read, details, place] = await Promise.all([readPlan(toolbox.files), toolbox.details.read(), toolbox.memory.recall()]);
      if (gone) return;
      session = planSession(
        {
          files: toolbox.files,
          targetPages: details.targetPages,
          setStatus: toolbox.pills.setStatus,
          redraw: () => draw(),
        },
        read,
      );
      desk.replaceChildren(board, under);
      draw();
      const at = place?.["across"];
      if (typeof at === "number") {
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
      toolbox.report(`Write-ist could not read this project's plan, so nothing has been changed. ${message(error)}`);
    }
  })();

  const takeDown = (): void => {
    gone = true;
    clearTimeout(placeRest);
    window.removeEventListener("keydown", keys, true);
    desk.removeEventListener("contextmenu", quietMenu);
    for (const panel of panels.values()) panel.closePalette();
    stopListeningForDetails();
    stopListeningForTarget();
    menu?.close(false);
  };

  return {
    focus: () => board.focus({ preventScroll: true }),
    hide: () => {
      hidden = true;
      menu?.close(false);
      for (const panel of panels.values()) panel.closePalette();
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

/** What an open card asks of the workspace, each for the card it is. */
interface PanelActions {
  title(id: string, title: string): void;
  titleDone(): void;
  description(id: string, text: string): void;
  colour(id: string, colour: CardColour): void;
  length(id: string, cells: number): void;
  remove(id: string): void;
  /** Escape in a field: back to the grid. */
  left(): void;
  /** Pressed or written on. */
  touched(id: string): void;
  /** Pressed on its top edge, to drag it to another place. */
  drag(id: string, event: PointerEvent): void;
}

type CardPanel = ReturnType<typeof cardPanel>;

/**
 * An open card, larger, to write on, beside the Structure button under the
 * grid: along its top edge the grip it is dragged to another place by, its
 * title and description typed straight onto it, in its own colour, and along
 * its foot the colour picker, its pages, and Delete — each an icon or a
 * figure, no words. The description grows as it is written and, once the card
 * is as tall as it may be, scrolls inside it. Its place among the open cards
 * is `--plan-position`, which the stylesheet turns into room.
 *
 * **The colour picker is Write-ist's own** (ADR-0034): the palette icon opens
 * a small grid of the nine colours, three by three, over the card. The arrows
 * move in it, Enter or a click chooses, Escape or a press outside closes it.
 */
function cardPanel(toolbox: Toolbox, id: string, actions: PanelActions) {
  const grip = element("div", { className: "plan__panel-grip" }, [icon(GripHorizontal)]);
  grip.setAttribute("aria-hidden", "true");
  grip.addEventListener("pointerdown", (event) => actions.drag(id, event));
  const title = element("input", { className: "plan__panel-title", type: "text", autocomplete: "off", placeholder: "Untitled" });
  title.setAttribute("aria-label", "Card title");
  title.spellcheck = false;
  const swatches = CARD_COLOURS.map((colour) => {
    const swatch = element("button", { className: "plan__swatch", type: "button", role: "menuitemradio" });
    swatch.dataset["colour"] = colour;
    swatch.tabIndex = -1;
    swatch.setAttribute("aria-label", COLOUR_NAMES[colour]);
    return swatch;
  });
  const paletteButton = element("button", { className: "plan__icon-button plan__palette-button", type: "button", ariaLabel: "Colour" }, [
    icon(Palette),
  ]);
  paletteButton.setAttribute("aria-haspopup", "menu");
  paletteButton.setAttribute("aria-expanded", "false");
  const paletteMenu = element("div", { className: "plan__palette-menu", role: "menu", ariaLabel: "Colour", hidden: true }, swatches);
  const shorter = element("button", { className: "plan__step", type: "button", textContent: "−" });
  shorter.setAttribute("aria-label", "Shorter");
  const longer = element("button", { className: "plan__step", type: "button", textContent: "+" });
  longer.setAttribute("aria-label", "Longer");
  const where = element("span", { className: "plan__where" });
  const remove = element("button", { className: "plan__icon-button plan__delete", type: "button", ariaLabel: "Delete Card" }, [icon(Trash2)]);
  const description = element("textarea", { className: "plan__description", placeholder: "What happens here?", rows: 3 });
  description.setAttribute("aria-label", "Card description");
  description.spellcheck = false;
  // The description is as tall as what is written in it: an unseen copy of
  // its text beside it sizes the box round them both. Once the card can grow
  // no further the box stops growing, and **the field itself scrolls**, the
  // one scroller for the wheel and the caret alike (Plan round 2).
  const descriptionBox = element("div", { className: "plan__description-box" }, [description]);
  const mirror = (): void => void (descriptionBox.dataset["value"] = description.value);
  const panel = element("section", { className: "plan__panel" }, [
    grip,
    element("div", { className: "plan__panel-head" }, [title]),
    descriptionBox,
    element("div", { className: "plan__panel-foot" }, [
      element("div", { className: "plan__palette" }, [paletteButton, paletteMenu]),
      element("div", { className: "plan__stepper" }, [shorter, where, longer]),
      remove,
    ]),
  ]);
  panel.setAttribute("aria-label", "Card");
  panel.dataset["id"] = id;
  panel.addEventListener("pointerdown", () => actions.touched(id));
  panel.addEventListener("focusin", () => actions.touched(id));

  let cells = 1;
  let fresh = true;
  title.addEventListener("input", () => actions.title(id, title.value));
  title.addEventListener("change", () => actions.titleDone());
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
      actions.left();
    });
  }
  description.addEventListener("input", () => {
    mirror();
    actions.description(id, description.value);
  });

  // --- The colour picker. ---
  const outsidePress = (event: Event): void => {
    if (event.target instanceof Node && (paletteMenu.contains(event.target) || paletteButton.contains(event.target))) return;
    palette.close(false);
  };
  const palette = {
    close: (returnFocus = true): void => {
      if (paletteMenu.hidden) return;
      paletteMenu.hidden = true;
      paletteButton.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", outsidePress, true);
      toolbox.menus.release(palette);
      if (returnFocus) paletteButton.focus();
    },
  };
  const openPalette = (fromKeyboard: boolean): void => {
    toolbox.menus.claim(palette);
    paletteMenu.hidden = false;
    paletteButton.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", outsidePress, true);
    const chosen = swatches.find((swatch) => swatch.getAttribute("aria-checked") === "true") ?? swatches[0];
    if (fromKeyboard) chosen?.focus();
  };
  let paletteKeyed = false;
  paletteButton.addEventListener("keydown", (event) => {
    paletteKeyed = event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp";
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      openPalette(true);
    }
  });
  paletteButton.addEventListener("click", () => {
    if (paletteMenu.hidden) openPalette(paletteKeyed);
    else palette.close();
    paletteKeyed = false;
  });
  paletteMenu.addEventListener("keydown", (event) => {
    const at = swatches.indexOf(document.activeElement as HTMLButtonElement);
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -PALETTE_COLUMNS, ArrowDown: PALETTE_COLUMNS };
    const step = steps[event.key];
    if (step !== undefined) swatches[at < 0 ? 0 : (at + step + swatches.length) % swatches.length]?.focus();
    else if (event.key === "Home") swatches[0]?.focus();
    else if (event.key === "End") swatches[swatches.length - 1]?.focus();
    else if (event.key === "Escape") palette.close();
    else if (event.key === "Tab") {
      palette.close(false);
      return;
    } else return;
    // The picker's keys, not the window's: Escape here is not Home.
    event.preventDefault();
    event.stopPropagation();
  });
  swatches.forEach((swatch) =>
    swatch.addEventListener("click", () => {
      palette.close();
      actions.colour(id, swatch.dataset["colour"] as CardColour);
    }),
  );

  shorter.addEventListener("click", () => actions.length(id, Math.max(1, cells - 1)));
  longer.addEventListener("click", () => actions.length(id, cells + 1));
  remove.addEventListener("click", () => actions.remove(id));

  return {
    element: panel,
    show: (card: PlacedCard["card"], placed: PlacedCard, layout: PlanLayout) => {
      // What the writer is typing into is theirs: it is not written over under them.
      if (fresh || document.activeElement !== title) title.value = card.title;
      if (fresh || document.activeElement !== description) description.value = card.description;
      mirror();
      fresh = false;
      panel.dataset["colour"] = card.colour;
      swatches.forEach((swatch) => swatch.setAttribute("aria-checked", String(swatch.dataset["colour"] === card.colour)));
      cells = placed.cells;
      shorter.disabled = placed.cells <= 1;
      longer.disabled = !fits(layout, placed.cell, placed.lane, placed.cells + 1, card.id);
      // Counted from 1, as a person counts; the grid counts from 0.
      const first = placed.cell + 1;
      const last = placed.cell + placed.cells;
      where.textContent = first === last ? `${first}` : `${first}–${last}`;
    },
    closePalette: () => palette.close(false),
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

/** A duration token's value in milliseconds, or `fallback` where there is no stylesheet. */
function tokenMilliseconds(name: string, fallback: number): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount < 0 || value === "") return fallback;
  return value.endsWith("ms") ? amount : value.endsWith("s") ? amount * 1000 : fallback;
}

/** A pixel token's value as a number, or `fallback` where there is no stylesheet. */
function tokenPixels(name: string, fallback: number): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
