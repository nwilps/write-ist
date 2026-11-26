/**
 * The manuscript session: a project's manuscript, open for writing, with no
 * window.
 *
 * Everything that sits between a keystroke and the paper, and between the
 * paper and the disk, lives here so that one test can reach all of it:
 *
 * - **The model-to-paper pipeline.** A transaction, or a version loaded from
 *   outside, goes in; the editing state, the layout, the seams between sheets,
 *   the name lists and the counts line come out — by one path, whether the
 *   change was one keystroke or the whole manuscript (ADR-0024, ADR-0033).
 * - **Saving.** Autosave and the explicit save are one routine
 *   (`editingSession`), and the three moments ADR-0028 names reach it from here.
 * - **Leaving.** The project closes only once the last words are on disk, and
 *   the writer's day goes in the ledger on the way out (ADR-0017, ADR-0028).
 * - **The name lists by hand.** What the writer added to and removed from the
 *   lists is held in the lists and nowhere else, and written to the names file
 *   whole or not at all (ADR-0022, ADR-0025).
 *
 * What is *not* here is the window. The Editor workspace gives this the ports
 * it needs — somewhere to say things, how to draw a seam, the spelling engine —
 * and draws what comes back. `test/editor/keystroke-budget.test.ts` drives the
 * same interface, so the budget is measured on the code that runs.
 *
 * ## Why the state is held here and the view is told about it
 *
 * The usual ProseMirror shape makes the view the holder of the document. It is
 * held here instead so that **the thing the save routine reads is not the
 * view**: ADR-0024 requires the manuscript to be produced by the serialiser from
 * the model, never from ProseMirror's own format and never from the DOM.
 */
import type { DecorationSet, EditorView } from "prosemirror-view";
import type { Node as EditorNode } from "prosemirror-model";
import type { Command, EditorState, Transaction } from "prosemirror-state";
import { readGoals, writeGoals } from "../goals/file.ts";
import { NO_GOALS, type Goals } from "../goals/history.ts";
import { GoalsTracker, type GoalPill, type GoalsView } from "../goals/tracker.ts";
import type { Weekday } from "../goals/day.ts";
import type { Instant } from "../instant.ts";
import { DEFAULT_PREFERENCES } from "../preferences.ts";
import { message } from "../message.ts";
import { countsText, wordsIn } from "../screenplay/counts.ts";
import type { ScreenplayDocument } from "../screenplay/document.ts";
import { editorStateFor, manuscriptOf } from "../screenplay/editing.ts";
import { layout, type Layout } from "../screenplay/layout.ts";
import { nameOf, type NameKind, type NameLists } from "../screenplay/names.ts";
import { namesOf, syncNames } from "../screenplay/names-sync.ts";
import { OffPaperHistory } from "../screenplay/off-paper-undo.ts";
import { pageAtElement } from "../screenplay/paginate.ts";
import { manuscriptElementAt } from "../screenplay/numbering.ts";
import { elementUnder } from "../screenplay/place.ts";
import { paperDecorations, type SheetBreak } from "../screenplay/sheets.ts";
import { Spellcheck, type SpellIssue } from "../screenplay/spellcheck.ts";
import type { SpellEngine } from "../screenplay/spelling.ts";
import type { AutocompleteOptions, Drawing } from "../screenplay/autocomplete.ts";
import type { Formatting } from "../screenplay/formatting.ts";
import { autosave, type Clock } from "./autosave.ts";
import type { Project } from "./bundle.ts";
import type { Filesystem } from "./filesystem.ts";
import type { Ledger } from "./ledger.ts";
import {
  NOTHING_BY_HAND,
  readNamesFile,
  writeNamesFile,
  type ListsByHand,
} from "./names-file.ts";
import { openProject, type OpenedProject } from "./open.ts";
import { editingSession } from "./save.ts";

/** Where the work stands against the disk, for the save pill. */
export type SavedState = "saved" | "unsaved" | "saving";

/** What a session needs of the world. The Editor's `WorkspaceContext` carries most of it. */
export interface SessionPorts {
  readonly filesystem: Filesystem;
  /** The project as it was opened; `moveProject` is how it changes after that. */
  readonly project: Project;
  /** Trouble the writer must see, in words about their file. */
  readonly report: (trouble: string) => void;
  readonly setSaved: (state: SavedState) => void;
  /** The counts line: the page the caret is on, the pages, the words. */
  readonly setStatus: (text: string) => void;
  /** The Goal pill: what it says, or `undefined` to hide it. */
  readonly setGoal: (pill: GoalPill | undefined) => void;
  /** The clock the day's words are dated by; a test drives it. */
  readonly instant?: Instant;
  /** The ledger, if launch managed to open it. Asked at close, not before. */
  readonly ledger: () => Ledger | undefined;
  /** ADR-0028's first moment. Answers how to stop listening. */
  readonly whenSwitchedAway: (act: () => void) => () => void;
  /** And its second: coming back, when something else may have changed the file. */
  readonly whenSwitchedBack: (act: () => void) => () => void;
  /** Our own dictionary (ADR-0032). */
  readonly spellEngine: SpellEngine;
  /** The DOM of one seam between sheets; the session has none. */
  readonly drawSeam: (seam: SheetBreak) => HTMLElement;
  /** The DOM of an autocomplete offer. */
  readonly drawOffer: (drawing: Drawing) => HTMLElement;
  /** Lines a drawn offer up on the paper (`AutocompleteOptions.place`); a test may leave it out. */
  readonly placeOffer?: AutocompleteOptions["place"];
  /** The project's own formatting (`details.md`), which the sheets are laid out with. Default: as until now. */
  readonly formatting?: Formatting;
  /**
   * Another application changed the manuscript and nothing was typed here, so
   * `state` is a fresh one. The view must be given it; `spellingWasOn` says
   * whether a pass was running and so needs turning on again.
   */
  readonly reloaded: (spellingWasOn: boolean) => void;
  /** Autosave's clock; a test drives it. */
  readonly autosaveClock?: Clock;
  /**
   * A locked draft, open to be read (ADR-0002): nothing the writer does
   * changes it, nothing is saved, and leaving writes nothing — not the
   * manuscript, the goals, the names or the ledger. Selections, spellcheck
   * and comments being lit still work.
   */
  readonly readOnly?: boolean;
}

/** A line the caret is in: where it begins, and the name it gave when the caret arrived. */
interface Visit {
  readonly at: number;
  readonly was: ReturnType<typeof nameOf>;
}

/** What opening a project's manuscript found. */
export interface ManuscriptRead {
  readonly opened: OpenedProject;
  /**
   * What the writer added to and removed from the name lists by hand, or
   * `undefined` when the names file could not be read — then the lists are
   * not changed by hand this session, and the file is not written.
   */
  readonly namesByHand: ListsByHand | undefined;
  /** The project's goals, or `undefined` when the file could not be read — then it is not written. */
  readonly goals: Goals | undefined;
}

/**
 * Read the manuscript and the names file. A manuscript that cannot be read
 * rejects, and nothing has been written. A names file that cannot be read is
 * said and **not overwritten**: adding and removing names is refused for this
 * session.
 */
export async function readManuscript(
  filesystem: Filesystem,
  project: Project,
  report: (trouble: string) => void,
  file?: string,
): Promise<ManuscriptRead> {
  const opened = await openProject(filesystem, project, file);
  let namesByHand: ListsByHand | undefined;
  try {
    namesByHand = await readNamesFile(filesystem, project);
  } catch (error) {
    report(
      `Write-ist could not read this project's character and location lists, so it will not change them. ` +
        `Your screenplay is not affected. ${message(error)}`,
    );
  }
  // The same rule for the goals file (ADR-0008 rule 3): said, and not overwritten.
  let goals: Goals | undefined;
  try {
    goals = await readGoals(filesystem, project);
  } catch (error) {
    report(
      `Write-ist could not read this project's goals, so it will not change them. ` +
        `Your screenplay is not affected. ${message(error)}`,
    );
  }
  return { opened, namesByHand, goals };
}

export interface ManuscriptSession {
  /** The editing state. Replaced on every transaction; the view is told, never the holder. */
  readonly state: EditorState;
  /** Where each sheet ends, and the pairs of dual dialogue (never in the document). */
  readonly seams: DecorationSet;
  readonly layout: Layout;
  /** The character and location lists, with what the writer added and removed by hand. */
  readonly names: NameLists;
  /** Underlining misspelt words. The session builds it; the view is turned on by the Editor. */
  readonly spellcheck: Spellcheck;
  /** The manuscript as the writer has it now, from the model. */
  readonly manuscript: () => ScreenplayDocument;
  /** Apply what the writer did. Everything that follows from it happens before this returns. */
  readonly apply: (transaction: Transaction) => void;
  readonly unsaved: () => boolean;
  /** Save now (a Ctrl+S). Never rejects: trouble is reported. */
  readonly save: () => Promise<void>;
  /** Say the counts line again. */
  readonly showCounts: () => void;
  /** Say the Goal pill again (the day may have turned over). */
  readonly showGoal: () => void;
  /** The goals as the dialog draws them. */
  readonly goalsView: () => GoalsView;
  /** Turn the daily goal on (a number of words) or off, and choose the counted weekdays. */
  readonly setDailyGoal: (goal: number | undefined, weekdays: readonly Weekday[]) => boolean;
  /** Start a sprint; `false` for a target that is not allowed. */
  readonly startSprint: (target: number) => boolean;
  readonly endSprint: () => void;
  /**
   * Finish and let go: the last save, then the ledger. Answers `false` — and
   * says why — when the save failed, in which case nothing has been let go of.
   */
  readonly leave: () => Promise<boolean>;
  /**
   * Rename the project under the open manuscript: run `move`, which moves its
   * folder, once nothing is being written into that folder, and write there
   * from then on. Answers the project as it now is. The manuscript, the caret
   * and the undo history are not touched, and unsaved typing stays unsaved
   * until the next save puts it in the new place.
   */
  readonly moveProject: (move: () => Promise<Project>) => Promise<Project>;
  /**
   * Resolves when every change to the name lists so far has been written, and every
   * change to the dictionary made (or has failed, and been said).
   */
  readonly settled: () => Promise<void>;
  /**
   * The names on a list now (Edit ▸ Character List, Location List), by name:
   * every one the script uses or the writer added, without any they removed.
   * What autocomplete offers.
   */
  readonly nameList: (kind: NameKind) => readonly string[];
  /**
   * The writer adds a name to a list: on it, and offered by autocomplete, at
   * once, and written to the names file. Answers whether it was added — never
   * when the names file could not be read.
   */
  readonly addName: (kind: NameKind, name: string) => boolean;
  /**
   * The writer removes a name from a list: deleted from it, so autocomplete
   * stops offering it, and written to the names file. It comes back as soon as
   * it is typed as a new cue or heading and the caret leaves the line
   * (`NameLists.typed`) — never from the uses already in the script. The
   * manuscript is not touched, and nothing is said.
   */
  readonly removeName: (kind: NameKind, name: string) => boolean;
  /**
   * Add to Dictionary on a flagged word: the writer's dictionary and nothing
   * else. The character and location lists are not touched — a cue's name
   * added here is a dictionary word, not a name on a list (Noah, 2026-11-22).
   * Spellcheck is redrawn after.
   *
   * One undo step, in order with the typing around it, that changes no text:
   * Undo takes the word back out if it was new to the dictionary, and Redo
   * puts it back. Resolves once the dictionary has answered.
   */
  readonly addToDictionary: (view: EditorView, issue: SpellIssue) => Promise<void>;
  /** Undo: the last text step or Add to Dictionary, whichever came last. What Ctrl+Z runs. */
  readonly undo: Command;
  /** Redo: the reverse of `undo`. What Ctrl+Shift+Z and Ctrl+Y run. */
  readonly redo: Command;
}

export function manuscriptSession(ports: SessionPorts, read: ManuscriptRead): ManuscriptSession {
  const { opened } = read;
  let state: EditorState;
  let laid: Layout;
  let seams: DecorationSet;
  let names: NameLists;

  const spellcheck = new Spellcheck({ engine: ports.spellEngine, pause: DEFAULT_PREFERENCES.spellcheckPauseMs });
  // The name lists are replaced when a manuscript is reloaded, hence a getter.
  const autocomplete = { names: () => names, draw: ports.drawOffer, place: ports.placeOffer };
  // Add to Dictionary's undo steps, which sit among the text's (`off-paper-undo.ts`).
  const offPaper = new OffPaperHistory();
  const undo = { undo: offPaper.undo, redo: offPaper.redo };

  /** What the writer did by hand, as the lists hold it: the only copy there is. */
  const byHandOf = (lists: NameLists): ListsByHand => ({
    character: lists.added("character"),
    location: lists.added("location"),
    removed: { character: lists.removed("character"), location: lists.removed("location") },
  });

  /** Where the line holding `position` begins, and the name it gives now, if any. */
  const lineAt = (position: number): Visit | undefined => {
    const under = elementUnder(state.doc, position);
    return under === undefined ? undefined : { at: position - under.offset - 1, was: nameOf(under) };
  };

  // The line the caret is in, and the name it gave when the caret arrived.
  let visit: Visit | undefined;

  /**
   * The caret is leaving the line it was in, which now begins at `at`. If the
   * writer typed it to give a removed name — a new cue or heading, or one
   * changed to that name — the name is back on its list, and the names file
   * says so, quietly. A line that gave the same name when the caret arrived
   * was already in the script, so editing it brings nothing back; nor does
   * `ED` on the way to `EDWARD`, because only the line as it is left counts.
   */
  const leftLine = (from: Visit, at: number): void => {
    if (at + 1 > state.doc.content.size) return;
    const now = lineAt(at + 1)?.was;
    if (now === undefined || (from.was?.kind === now.kind && from.was.name === now.name)) return;
    if (names.typed(now.kind, now.name) && read.namesByHand !== undefined) writeNames();
  };

  /** The caret may have moved to another line: leave the one it was in, and arrive. */
  const caretMoved = (mapping: Transaction["mapping"] | undefined): void => {
    const here = lineAt(state.selection.head);
    if (visit !== undefined) {
      const mapped = mapping === undefined ? { pos: visit.at, deleted: false } : mapping.mapResult(visit.at, 1);
      if (!mapped.deleted && mapped.pos === here?.at) {
        visit = { at: here.at, was: visit.was };
        return;
      }
      if (!mapped.deleted) leftLine(visit, mapped.pos);
    }
    visit = here;
  };

  /** Leave the line the caret is in without moving it (a reload, or closing), so what was typed there counts. */
  const leaveInPlace = (): void => {
    if (visit === undefined) return;
    leftLine(visit, visit.at);
    visit = lineAt(state.selection.head);
  };

  /**
   * **The one pipeline from the model to the paper.** Whatever changed the
   * state, what is drawn from it is worked out here: the lists, the layout, the
   * seams. A whole new state is read afresh; an edit is brought up to date from
   * the document it replaced, by the elements it changed — the same answer, at
   * the cost of the edit (#49, step 8).
   */
  const settle = (basis: { readonly replaced: ListsByHand } | { readonly editedFrom: EditorNode }): void => {
    const document = manuscriptOf(state.doc);
    if ("replaced" in basis) {
      names = namesOf(state.doc, {
        added: basis.replaced,
        ...(basis.replaced.removed === undefined ? {} : { removed: basis.replaced.removed }),
      });
      laid = layout(document, undefined, undefined, ports.formatting);
    } else {
      syncNames(names, basis.editedFrom, state.doc);
      laid = layout(document, laid, manuscriptElementAt(state.doc, state.selection.head), ports.formatting);
    }
    // Decorations, so they are never part of the document and never reach the file.
    seams = paperDecorations(state.doc, laid, ports.drawSeam);
  };

  // The words in the manuscript now, held so a keystroke counts them once. The
  // change in this number across an edit is what the goals are told (ADR-0040);
  // a manuscript that is loaded sets it and tells them nothing.
  let words = 0;

  const showCounts = (): void => {
    const current = pageAtElement(laid.pagination, manuscriptElementAt(state.doc, state.selection.head));
    ports.setStatus(countsText(current, laid.totalPages, words));
  };

  state = editorStateFor(opened.document, { autocomplete, spellcheck, undo });
  words = wordsIn(state.doc);
  settle({ replaced: read.namesByHand ?? NOTHING_BY_HAND });
  visit = lineAt(state.selection.head);

  const tracker = new GoalsTracker(read.goals ?? NO_GOALS, ports.instant === undefined ? {} : { instant: ports.instant });
  const showGoal = (): void => ports.setGoal(tracker.view(words).pill);

  const session = editingSession(ports.filesystem, opened, () => manuscriptOf(state.doc), {
    // Changed elsewhere, and nothing typed here: the other version is the
    // screenplay now. A fresh state, so undo cannot walk back into the
    // version that was replaced.
    reload: (imported) => {
      const spellingWasOn = spellcheck.isOn(state);
      // A removed name typed in the line the caret is in is back first; the
      // rest stay removed, whatever the other version uses.
      leaveInPlace();
      state = editorStateFor(imported.document, { autocomplete, spellcheck, undo });
      offPaper.clear();
      // Someone else's words are not the writer's: counting starts from them.
      words = wordsIn(state.doc);
      settle({ replaced: byHandOf(names) });
      visit = lineAt(state.selection.head);
      showCounts();
      showGoal();
      ports.reloaded(spellingWasOn);
    },
    // The dated copy is already beside the manuscript. Nothing is said:
    // ADR-0031. A copy that could not be written is not here — that stops
    // the save, and arrives through `trouble` below.
    keptBoth: () => {},
  });

  /** A save that failed, in the writer's words. */
  const failure = (error: unknown): string =>
    `Write-ist could not save your screenplay, so your last few words are ` +
    `only on screen. ${message(error)}`;

  // Whether the work is on disk, for the save pill. A save that lands with
  // more typed since (the flag is cleared before the write, so a keystroke
  // during it stays unsaved) leaves the pill unsaved rather than green.
  const saveAndShow = async (): ReturnType<typeof session.save> => {
    ports.setSaved("saving");
    try {
      return await session.save();
    } finally {
      ports.setSaved(session.unsaved() ? "unsaved" : "saved");
    }
  };

  // The goals and names files sit beside the manuscript, so they take turns
  // with a rename too: neither is written while the folder is on the move.
  let besideManuscript: Promise<unknown> = Promise.resolve();
  const inFolderTurn = <T>(act: () => Promise<T>): Promise<T> => {
    const done = besideManuscript.then(act);
    besideManuscript = done.catch(() => {});
    return done;
  };

  // The goals file (ADR-0040): written a pause after a change, like the
  // manuscript, and once more on the way out. Never over a file that could not
  // be read (`read.goals` is then undefined).
  let goalsTrouble = false;
  const writeGoalsNow = (): Promise<void> =>
    inFolderTurn(async () => {
      if (read.goals === undefined || !tracker.dirty) return;
      // Cleared before the write, so a change during it is still to be written.
      tracker.clean();
      try {
        await writeGoals(ports.filesystem, session.project, tracker.data());
        goalsTrouble = false;
      } catch (error) {
        tracker.unclean();
        throw error;
      }
    });
  const savingGoals = autosave({
    save: writeGoalsNow,
    trouble: (error) => {
      // Said once, not on every retry: it costs a chart, never a word.
      if (goalsTrouble) return;
      goalsTrouble = true;
      ports.report(
        `Write-ist could not save your writing goals. Your screenplay is not affected. ${message(error)}`,
      );
    },
    ...(ports.autosaveClock === undefined ? {} : { clock: ports.autosaveClock }),
  });

  // Set while the project is closing, to hold a failure for `leave` to say.
  let leaving = false;
  let unfinished: unknown;

  const saving = autosave({
    save: saveAndShow,
    // Autosave is the thing the writer is not watching, so a failure it
    // swallowed would be a failure nobody ever learned about (ADR-0008 rule 4).
    // Their words are still on screen and still unsaved, and the next save
    // will try again — which is what this says.
    //
    // **Except on the way out**, where there is no next save and the words are
    // handed back to `leave` to say something truer about instead. Two panels
    // for one failure would be the application talking over itself.
    trouble: (error) => {
      if (leaving) {
        unfinished = error;
        return;
      }
      // A save with nothing typed still reads the disk to compare it (#42),
      // and a read that failed then put nothing at risk — so it says so,
      // rather than that words are only on screen.
      ports.report(
        session.unsaved()
          ? `${failure(error)} It will try again.`
          : `Write-ist could not check whether your screenplay was changed outside it. ` +
              `Nothing has been changed. ${message(error)}`,
      );
    },
    ...(ports.autosaveClock === undefined ? {} : { clock: ports.autosaveClock }),
  });

  // Switching to another application (ADR-0028), and back — which is when
  // something else is most likely to have changed the manuscript. The save
  // compares before it writes anything (#42).
  // A locked draft is never saved, so switching away has nothing to do.
  const readOnly = ports.readOnly === true;
  const stopSwitchingAway = readOnly ? () => {} : ports.whenSwitchedAway(() => void saving.now());
  const stopSwitchingBack = readOnly ? () => {} : ports.whenSwitchedBack(() => void saving.now());

  const leave = async (): Promise<boolean> => {
    // Read, never written: there is nothing to save and no day to record.
    if (readOnly) return true;
    // Closing the project (ADR-0028), through the same routine as every
    // other save.
    unfinished = undefined;
    leaving = true;
    await saving.now();
    leaving = false;
    // **The one save with nothing after it.** There is no later autosave to
    // try again, because the paper is about to go — so it does not go.
    if (unfinished !== undefined) {
      ports.report(
        `${failure(unfinished)} This project stays open until it saves, ` +
          `so nothing you have written is lost.`,
      );
      return false;
    }
    // The ledger (ADR-0017): Tuesday's words and pages cannot be worked out
    // later, so they are written now, before the paper goes. A failure here
    // costs a chart, never the manuscript — so the project still leaves.
    const ledger = ports.ledger();
    if (ledger === undefined) {
      ports.report(
        `Write-ist could not record today's writing in the ledger. ` +
          `Your screenplay is saved. The record of your writing days did not start.`,
      );
    } else {
      try {
        await ledger.recordDay(
          { id: session.project.marker.projectId, name: session.project.marker.name },
          manuscriptOf(state.doc),
        );
      } catch (error) {
        ports.report(
          `Write-ist could not record today's writing in the ledger. ` +
            `Your screenplay is saved. ${message(error)}`,
        );
      }
    }
    // The day's words, with the goal beside them. A failure is said and the
    // project still leaves, as with the ledger.
    await savingGoals.now();
    // A removed name typed with the caret still in its line is back too.
    leaveInPlace();
    await writingNames;
    stopSwitchingAway();
    stopSwitchingBack();
    return true;
  };

  // Adding and removing names by hand, written to the names file, whole or not
  // at all; the manuscript is not touched. A failed write is said, and the
  // change holds until the project closes.
  let writingNames: Promise<void> = Promise.resolve();
  /** The lists as they are, to the names file: whole, after any write before it. */
  const writeNames = (): void => {
    const toWrite = byHandOf(names);
    writingNames = writingNames.then(() =>
      inFolderTurn(async () => {
        try {
          await writeNamesFile(ports.filesystem, session.project, toWrite);
        } catch (error) {
          ports.report(
            `Write-ist could not save the change to the list. It holds while this project is open. ` +
              `Your screenplay is unchanged. ${message(error)}`,
          );
        }
      }),
    );
  };
  const addName = (kind: NameKind, name: string): boolean => {
    if (read.namesByHand === undefined || !names.add(kind, name)) return false;
    writeNames();
    return true;
  };
  const removeName = (kind: NameKind, name: string): boolean => {
    if (read.namesByHand === undefined || !names.remove(kind, name)) return false;
    writeNames();
    return true;
  };

  // The dictionary's answers, in the order they were asked for: an undo pressed
  // before the add it undoes has been answered waits for it.
  let spelling: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(act: () => Promise<T>): Promise<T> => {
    const done = spelling.then(act);
    spelling = done.catch(() => {});
    return done;
  };
  const dictionaryTrouble = (error: unknown): void =>
    ports.report(`Write-ist could not change your dictionary. Your screenplay is unchanged. ${message(error)}`);

  return {
    get state() {
      return state;
    },
    get seams() {
      return seams;
    },
    get layout() {
      return laid;
    },
    get names() {
      return names;
    },
    spellcheck,
    manuscript: () => manuscriptOf(state.doc),
    apply: (transaction) => {
      // A locked draft is read, never changed: whatever asked to change it —
      // a key, a paste, a command, a card — changes nothing.
      if (readOnly && transaction.docChanged) return;
      const was = state;
      const before = state.doc;
      state = state.apply(transaction);
      offPaper.applied(transaction, was, state);
      if (transaction.docChanged) {
        session.changed();
        saving.typed();
        ports.setSaved("unsaved");
        settle({ editedFrom: before });
        const wordsBefore = words;
        words = wordsIn(state.doc);
        if (words !== wordsBefore) {
          tracker.wordsChanged(words - wordsBefore);
          savingGoals.typed();
          showGoal();
        }
      }
      // Selection moves still refresh the current page; the total only
      // moves when the manuscript does. Either may take the caret out of a
      // line typed to give a removed name.
      if (transaction.docChanged || transaction.selectionSet) {
        showCounts();
        caretMoved(transaction.docChanged ? transaction.mapping : undefined);
      }
    },
    unsaved: session.unsaved,
    save: () => (readOnly ? Promise.resolve() : saving.now()),
    showCounts,
    showGoal,
    goalsView: () => tracker.view(words),
    setDailyGoal: (goal, weekdays) => {
      const set = tracker.setDaily(goal, weekdays);
      if (set) {
        savingGoals.typed();
        showGoal();
      }
      return set;
    },
    startSprint: (target) => {
      const started = tracker.startSprint(target);
      showGoal();
      return started;
    },
    endSprint: () => {
      tracker.endSprint();
      showGoal();
    },
    leave,
    moveProject: (move) => inFolderTurn(() => session.relocate(move)),
    settled: () => Promise.all([writingNames, spelling]).then(() => {}),
    nameList: (kind) => names.list(kind),
    addName: (kind, name) => !readOnly && addName(kind, name),
    removeName: (kind, name) => !readOnly && removeName(kind, name),
    addToDictionary: async (view, issue) => {
      // Typing before and after stays two undo steps, with this one between.
      const step = offPaper.begin(view.state);
      view.dispatch(step.close);
      let added = false;
      try {
        added = await inTurn(() => spellcheck.addToDictionary(view, issue.word));
      } finally {
        // A word already in the dictionary is not this step's to take out.
        if (added) {
          step.record({
            undo: () => void inTurn(() => spellcheck.removeFromDictionary(view, issue.word)).catch(dictionaryTrouble),
            redo: () => void inTurn(() => spellcheck.addToDictionary(view, issue.word)).catch(dictionaryTrouble),
          });
        }
      }
    },
    undo: offPaper.undo,
    redo: offPaper.redo,
  };
}
