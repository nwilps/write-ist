/**
 * A plan open for working on, with no window: the cards, the grid they are
 * laid out on, the undo history, and the file (`plan.md`).
 *
 * The Plan workspace (`app/src/workspaces/plan/`) draws what this says and
 * hands it what the writer did; every rule — what fits where, what a move
 * stores, what the grid's length is — is here, where a test reaches it without
 * a window. Saving is the shared workspace-file session's (`workspace-file.ts`).
 *
 * **The grid's length is the project's target page count** (`details.md`),
 * told to the session when the project opens and whenever Edit Project
 * Details changes it. Nothing about the plan is written when it changes: cards
 * keep their place as a share of the whole (`plan.ts`).
 */
import type { Project } from "../project/bundle.ts";
import type { WorkspaceFileRead } from "../project/workspace-file.ts";
import type { WorkspaceFiles } from "../project/workspace-files.ts";
import {
  EMPTY_PLAN,
  NEW_CARD_CELLS,
  fits,
  fractionOf,
  freeCardId,
  gridLength,
  layoutPlan,
  withCard,
  type CardColour,
  type Plan,
  type PlanLayout,
} from "./plan.ts";
import { parsePlan, serialisePlan, PLAN_HEADING, type PlanDocument } from "./plan-file.ts";

/** Plan's file in the project's folder (ADR-0025). */
export const PLAN_FILE = "plan.md";

/** How far back Undo goes. */
const HISTORY = 200;

/** Typing in one card's title or description within this long is one step to undo. */
const TYPING_STEP_MS = 1_500;

export interface PlanRead {
  readonly file: WorkspaceFileRead;
  readonly document: PlanDocument;
}

/**
 * Read a project's plan. An absent `plan.md` is an empty plan; one that is
 * there and is not a plan **rejects**, so it is never opened for writing over.
 */
export async function readPlan(files: Pick<WorkspaceFiles, "read">): Promise<PlanRead> {
  const file = await files.read(PLAN_FILE);
  if (file.bytes === undefined) return { file, document: { plan: EMPTY_PLAN, heading: PLAN_HEADING, extra: [] } };
  const document = parsePlan(file.text);
  if (document === null) throw new Error(`${PLAN_FILE} is not a plan Write-ist can read, so it has been left as it is.`);
  return { file, document };
}

export interface PlanSessionPorts {
  /**
   * Plan's files (`toolbox.files`, ADR-0045): `plan.md` is opened through
   * them, so its saving — safe, automatic, quiet about outside changes, and
   * told to the save pill — is the toolbox's.
   */
  readonly files: Pick<WorkspaceFiles, "open">;
  /** The project's target page count; 0 for none. */
  readonly targetPages: number;
  /** The counts pill: how many cards. */
  readonly setStatus: (text: string) => void;
  /** The plan was replaced from outside: the file changed elsewhere and was loaded. */
  readonly redraw: () => void;
  /** For joining typing into one step to undo. The system clock unless a test is it. */
  readonly now?: () => Date;
}

export interface PlanSession {
  readonly plan: () => Plan;
  readonly layout: () => PlanLayout;
  /** Follow the project's target page count: the grid's length changes, and the cards keep their places. */
  readonly setTargetPages: (pages: number) => void;
  /** A new card at a cell and lane, if one fits there. Answers its id. */
  readonly add: (cell: number, lane: number) => string | undefined;
  /** Move a card to start at a cell in a lane. Answers whether it fitted. */
  readonly move: (id: string, cell: number, lane: number) => boolean;
  /** Make a card this many cells long. Answers whether it fitted. */
  readonly resize: (id: string, cells: number) => boolean;
  readonly setTitle: (id: string, title: string) => void;
  readonly setDescription: (id: string, description: string) => void;
  readonly setColour: (id: string, colour: CardColour) => void;
  readonly remove: (id: string) => void;
  /** Show these structure sheets, by id, in order. */
  readonly setStructure: (ids: readonly string[]) => void;
  readonly undo: () => boolean;
  readonly redo: () => boolean;
  readonly unsaved: () => boolean;
  readonly save: () => Promise<void>;
  readonly leave: () => Promise<boolean>;
  readonly relocate: (move: () => Promise<Project>) => Promise<Project>;
}

export function planSession(ports: PlanSessionPorts, read: PlanRead): PlanSession {
  let plan = read.document.plan;
  let kept: Pick<PlanDocument, "heading" | "extra"> = read.document;
  let length = gridLength(ports.targetPages);
  let laid: PlanLayout | undefined;
  const layout = (): PlanLayout => (laid ??= layoutPlan(plan, length));

  const done: Plan[] = [];
  const undone: Plan[] = [];
  let lastStep: { key: string; at: number } | undefined;
  const clockNow = (): number => (ports.now ?? (() => new Date()))().getTime();

  const showCount = (): void => {
    const count = plan.cards.length;
    ports.setStatus(`${count} ${count === 1 ? "card" : "cards"}`);
  };

  const file = ports.files.open(
    PLAN_FILE,
    {
      noun: "your plan",
      text: () => serialisePlan(plan, kept),
      reload: (text) => {
        const found = text === "" ? { plan: EMPTY_PLAN, heading: PLAN_HEADING, extra: [] } : parsePlan(text);
        if (found === null) return false;
        plan = found.plan;
        kept = found;
        laid = undefined;
        done.length = 0;
        undone.length = 0;
        lastStep = undefined;
        showCount();
        ports.redraw();
        return true;
      },
    },
    read.file,
  );

  /**
   * The plan is now `next`. One step for Undo, unless `typing` names the same
   * field typed into a moment ago: a title typed letter by letter is one step.
   */
  const change = (next: Plan, typing?: string): void => {
    if (next === plan) return;
    const at = clockNow();
    const joined = typing !== undefined && lastStep?.key === typing && at - lastStep.at < TYPING_STEP_MS;
    if (!joined) {
      done.push(plan);
      if (done.length > HISTORY) done.shift();
    }
    undone.length = 0;
    lastStep = typing === undefined ? undefined : { key: typing, at };
    plan = next;
    laid = undefined;
    file.changed();
    showCount();
  };

  const placedOf = (id: string) => layout().placed.find((each) => each.card.id === id);

  showCount();

  return {
    plan: () => plan,
    layout,
    setTargetPages: (pages) => {
      const next = gridLength(pages);
      if (next === length) return;
      length = next;
      laid = undefined;
    },
    add: (cell, lane) => {
      const grid = layout();
      const cells = fits(grid, cell, lane, NEW_CARD_CELLS) ? NEW_CARD_CELLS : fits(grid, cell, lane, 1) ? 1 : 0;
      if (cells === 0) return undefined;
      const id = freeCardId(plan);
      change({
        ...plan,
        cards: [
          ...plan.cards,
          {
            id,
            title: "",
            description: "",
            colour: "plain",
            lane,
            start: fractionOf(cell, length),
            length: fractionOf(cells, length),
          },
        ],
      });
      return id;
    },
    move: (id, cell, lane) => {
      const placed = placedOf(id);
      if (placed === undefined || !fits(layout(), cell, lane, placed.cells, id)) return false;
      if (placed.cell === cell && placed.lane === lane) return true;
      // Stored as where it now is in the whole, at the length the writer moved it on.
      change(withCard(plan, id, (card) => ({ ...card, lane, start: fractionOf(cell, length), length: fractionOf(placed.cells, length) })));
      return true;
    },
    resize: (id, cells) => {
      const placed = placedOf(id);
      if (placed === undefined || !fits(layout(), placed.cell, placed.lane, cells, id)) return false;
      if (placed.cells === cells) return true;
      change(withCard(plan, id, (card) => ({ ...card, start: fractionOf(placed.cell, length), length: fractionOf(cells, length) })));
      return true;
    },
    setTitle: (id, title) => {
      const card = plan.cards.find((each) => each.id === id);
      if (card === undefined || card.title === title) return;
      change(withCard(plan, id, (each) => ({ ...each, title })), `title:${id}`);
    },
    setDescription: (id, description) => {
      const card = plan.cards.find((each) => each.id === id);
      if (card === undefined || card.description === description) return;
      change(withCard(plan, id, (each) => ({ ...each, description })), `description:${id}`);
    },
    setColour: (id, colour) => {
      const card = plan.cards.find((each) => each.id === id);
      if (card === undefined || card.colour === colour) return;
      change(withCard(plan, id, (each) => ({ ...each, colour })));
    },
    remove: (id) => {
      if (!plan.cards.some((card) => card.id === id)) return;
      change({ ...plan, cards: plan.cards.filter((card) => card.id !== id) });
    },
    setStructure: (ids) => {
      if (ids.join() === plan.structure.join()) return;
      change({ ...plan, structure: [...ids] });
    },
    undo: () => {
      const back = done.pop();
      if (back === undefined) return false;
      undone.push(plan);
      plan = back;
      laid = undefined;
      lastStep = undefined;
      file.changed();
      showCount();
      return true;
    },
    redo: () => {
      const forward = undone.pop();
      if (forward === undefined) return false;
      done.push(plan);
      plan = forward;
      laid = undefined;
      lastStep = undefined;
      file.changed();
      showCount();
      return true;
    },
    unsaved: file.unsaved,
    save: file.save,
    leave: file.leave,
    relocate: file.relocate,
  };
}
