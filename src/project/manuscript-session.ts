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
 * - **Confirmed names.** The writer's own confirmations are held in the name
 *   lists and nowhere else, and written to the names file whole or not at all
 *   (ADR-0022, ADR-0029).
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
import type { DecorationSet } from "prosemirror-view";
import type { Node as EditorNode } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import { DEFAULT_PREFERENCES } from "../preferences.ts";
import { message } from "../message.ts";
import { countsText, wordsIn } from "../screenplay/counts.ts";
import type { ScreenplayDocument } from "../screenplay/document.ts";
import { editorStateFor, manuscriptOf } from "../screenplay/editing.ts";
import { layout, type Layout } from "../screenplay/layout.ts";
import { nameOf, type NameKind, type NameLists } from "../screenplay/names.ts";
import { namesOf, syncNames } from "../screenplay/names-sync.ts";
import { pageAtElement } from "../screenplay/paginate.ts";
import { manuscriptElementAt } from "../screenplay/numbering.ts";
import { elementUnder } from "../screenplay/place.ts";
import { paperDecorations, type SheetBreak } from "../screenplay/sheets.ts";
import { Spellcheck } from "../screenplay/spellcheck.ts";
import type { SpellEngine } from "../screenplay/spelling.ts";
import type { Drawing } from "../screenplay/autocomplete.ts";
import { autosave, type Clock } from "./autosave.ts";
import type { Project } from "./bundle.ts";
import type { Filesystem } from "./filesystem.ts";
import type { Ledger } from "./ledger.ts";
import {
  NO_CONFIRMATIONS,
  readConfirmations,
  writeConfirmations,
  type Confirmations,
} from "./names-file.ts";
import { openProject, type OpenedProject } from "./open.ts";
import { editingSession } from "./save.ts";

/** Where the work stands against the disk, for the save pill. */
export type SavedState = "saved" | "unsaved" | "saving";

/** What a session needs of the world. The Editor's `WorkspaceContext` carries most of it. */
export interface SessionPorts {
  readonly filesystem: Filesystem;
  readonly project: Project;
  /** Trouble the writer must see, in words about their file. */
  readonly report: (trouble: string) => void;
  readonly setSaved: (state: SavedState) => void;
  /** The counts line: the page the caret is on, the pages, the words. */
  readonly setStatus: (text: string) => void;
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
  /**
   * Another application changed the manuscript and nothing was typed here, so
   * `state` is a fresh one. The view must be given it; `spellingWasOn` says
   * whether a pass was running and so needs turning on again.
   */
  readonly reloaded: (spellingWasOn: boolean) => void;
  /** Autosave's clock; a test drives it. */
  readonly autosaveClock?: Clock;
}

/** What opening a project's manuscript found. */
export interface ManuscriptRead {
  readonly opened: OpenedProject;
  /** The writer's confirmed names, or `undefined` when the file could not be read — then confirming is refused. */
  readonly confirmed: Confirmations | undefined;
}

/**
 * Read the manuscript and the confirmed names. A manuscript that cannot be read
 * rejects, and nothing has been written. A names file that cannot be read is
 * said and **not overwritten**: confirming is refused for this session.
 */
export async function readManuscript(
  filesystem: Filesystem,
  project: Project,
  report: (trouble: string) => void,
): Promise<ManuscriptRead> {
  const opened = await openProject(filesystem, project);
  try {
    return { opened, confirmed: await readConfirmations(filesystem, project) };
  } catch (error) {
    report(
      `Write-ist could not read this project's confirmed names, so it will not change them. ` +
        `Your screenplay is not affected. ${message(error)}`,
    );
    return { opened, confirmed: undefined };
  }
}

export interface ManuscriptSession {
  /** The editing state. Replaced on every transaction; the view is told, never the holder. */
  readonly state: EditorState;
  /** Where each sheet ends, and the pairs of dual dialogue (never in the document). */
  readonly seams: DecorationSet;
  readonly layout: Layout;
  /** The character and location lists, with the writer's confirmations. */
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
  /**
   * Finish and let go: the last save, then the ledger. Answers `false` — and
   * says why — when the save failed, in which case nothing has been let go of.
   */
  readonly leave: () => Promise<boolean>;
  /** Resolves when every confirmation so far has been written (or has failed, and been said). */
  readonly settled: () => Promise<void>;
  /** Which list the caret's element belongs in. */
  readonly confirmableKind: () => NameKind;
  /**
   * The writer says the name or location the caret is in is right. Answers
   * whether there was one to say it of.
   */
  readonly confirm: (kind: NameKind) => boolean;
}

export function manuscriptSession(ports: SessionPorts, read: ManuscriptRead): ManuscriptSession {
  const { opened } = read;
  let state: EditorState;
  let laid: Layout;
  let seams: DecorationSet;
  let names: NameLists;

  const spellcheck = new Spellcheck({
    engine: ports.spellEngine,
    names: () => names,
    pause: DEFAULT_PREFERENCES.spellcheckPauseMs,
    spelling: {
      nearDistance: DEFAULT_PREFERENCES.spellcheckNearDistance,
      nearMinLength: DEFAULT_PREFERENCES.spellcheckNearMinLength,
    },
  });
  // The name lists are replaced when a manuscript is reloaded, hence a getter.
  const autocomplete = { names: () => names, draw: ports.drawOffer };

  /** The writer's confirmations, as the lists hold them: the only copy there is. */
  const confirmationsOf = (lists: NameLists): Confirmations => ({
    character: lists.explicit("character"),
    location: lists.explicit("location"),
  });

  /**
   * **The one pipeline from the model to the paper.** Whatever changed the
   * state, what is drawn from it is worked out here: the lists, the layout, the
   * seams. A whole new state is read afresh; an edit is brought up to date from
   * the document it replaced, by the elements it changed — the same answer, at
   * the cost of the edit (#49, step 8).
   */
  const settle = (basis: { readonly replaced: Confirmations } | { readonly editedFrom: EditorNode }): void => {
    const document = manuscriptOf(state.doc);
    if ("replaced" in basis) {
      names = namesOf(state.doc, { explicit: basis.replaced });
      laid = layout(document);
    } else {
      syncNames(names, basis.editedFrom, state.doc);
      laid = layout(document, laid, manuscriptElementAt(state.doc, state.selection.head));
    }
    // Decorations, so they are never part of the document and never reach the file.
    seams = paperDecorations(state.doc, laid, ports.drawSeam);
  };

  const showCounts = (): void => {
    const current = pageAtElement(laid.pagination, manuscriptElementAt(state.doc, state.selection.head));
    ports.setStatus(countsText(current, laid.totalPages, wordsIn(state.doc)));
  };

  state = editorStateFor(opened.document, { autocomplete, spellcheck });
  settle({ replaced: read.confirmed ?? NO_CONFIRMATIONS });

  const session = editingSession(ports.filesystem, opened, () => manuscriptOf(state.doc), {
    // Changed elsewhere, and nothing typed here: the other version is the
    // screenplay now. A fresh state, so undo cannot walk back into the
    // version that was replaced.
    reload: (imported) => {
      const spellingWasOn = spellcheck.isOn(state);
      state = editorStateFor(imported.document, { autocomplete, spellcheck });
      settle({ replaced: confirmationsOf(names) });
      showCounts();
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
  const stopSwitchingAway = ports.whenSwitchedAway(() => void saving.now());
  const stopSwitchingBack = ports.whenSwitchedBack(() => void saving.now());

  const leave = async (): Promise<boolean> => {
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
          { id: ports.project.marker.projectId, name: ports.project.marker.name },
          manuscriptOf(state.doc),
        );
      } catch (error) {
        ports.report(
          `Write-ist could not record today's writing in the ledger. ` +
            `Your screenplay is saved. ${message(error)}`,
        );
      }
    }
    stopSwitchingAway();
    stopSwitchingBack();
    return true;
  };

  // The writer says the name or location the caret is in is right, without
  // waiting for it to be used enough times. Written to the names file, whole
  // or not at all; the manuscript is not touched. A failed write is said, and
  // the confirmation holds until the project closes.
  let writingNames: Promise<void> = Promise.resolve();
  const confirm = (kind: NameKind): boolean => {
    const at = elementUnder(state.doc, state.selection.head);
    const found = at === undefined ? undefined : nameOf(at);
    if (found === undefined || found.kind !== kind || read.confirmed === undefined) return false;
    if (names.confirm(kind, found.name)) {
      const toWrite = confirmationsOf(names);
      writingNames = writingNames.then(async () => {
        try {
          await writeConfirmations(ports.filesystem, ports.project, toWrite);
        } catch (error) {
          ports.report(
            `Write-ist could not save the confirmed name. It holds while this project is open. ` +
              `Your screenplay is unchanged. ${message(error)}`,
          );
        }
      });
    }
    return true;
  };

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
      const before = state.doc;
      state = state.apply(transaction);
      if (transaction.docChanged) {
        session.changed();
        saving.typed();
        ports.setSaved("unsaved");
        settle({ editedFrom: before });
      }
      // Selection moves still refresh the current page; the total only
      // moves when the manuscript does.
      if (transaction.docChanged || transaction.selectionSet) showCounts();
    },
    unsaved: session.unsaved,
    save: () => saving.now(),
    showCounts,
    leave,
    settled: () => writingNames,
    confirmableKind: () => {
      const at = elementUnder(state.doc, state.selection.head);
      return at?.type === "scene-heading" ? "location" : "character";
    },
    confirm,
  };
}
