/**
 * One note open for writing, with no window: the editing state, its undo
 * history, the word count, the spelling pass, and its file (`notes/Ideas.md`;
 * the folder is `notes-folder.ts`'s). Each open tab in Notes is one of these,
 * so each note keeps its own undo history and saves on its own.
 *
 * The Notes workspace (`app/src/workspaces/notes/`) mounts a view over this and
 * hands it each transaction, the way the Editor does over its manuscript
 * session; everything that decides anything is here, where a test can reach
 * it without a window.
 *
 * Saving is the shared workspace-file session's (`workspace-file.ts`): after a
 * pause, on switching away, on leaving Notes for another workspace and on
 * closing — never over a file that could not be read, and quietly when the
 * file changed elsewhere (ADR-0028, ADR-0031).
 */
import { history, redo as redoCommand, undo as undoCommand } from "prosemirror-history";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Clock } from "../project/autosave.ts";
import type { Filesystem } from "../project/filesystem.ts";
import type { Project } from "../project/bundle.ts";
import {
  workspaceFileSession,
  type FileSaveState,
  type WorkspaceFileRead,
} from "../project/workspace-file.ts";
import { message } from "../message.ts";
import { plainSpelling, type PlainSpellEngine } from "./spelling.ts";
import { docOf, offsetOf, positionOf, textOf, wordsOf } from "./text.ts";

export interface NotesSessionPorts {
  readonly filesystem: Filesystem;
  readonly project: Project;
  /** The note's path in the project's folder (`notePath`). Plain text, exactly as typed. */
  readonly file: string;
  readonly report: (trouble: string) => void;
  readonly setSaved: (state: FileSaveState) => void;
  /** The counts pill: Notes' words. */
  readonly setStatus: (text: string) => void;
  /** The spellcheck pill, shown while the pass is on. */
  readonly setSpellcheck: (on: boolean) => void;
  readonly whenSwitchedAway: (act: () => void) => () => void;
  readonly whenSwitchedBack: (act: () => void) => () => void;
  /** The dictionary. Without one, spellcheck cannot be turned on. */
  readonly spellEngine?: PlainSpellEngine | undefined;
  /**
   * The state was replaced from outside the view — the file changed elsewhere
   * and was loaded — or the spelling pass has new lines to draw.
   */
  readonly redraw: () => void;
  readonly clock?: Clock;
  readonly now?: () => Date;
}

/** A misspelt word in the document, by position. */
export interface NotesMisspelling {
  readonly word: string;
  readonly from: number;
  readonly to: number;
}

export interface NotesSession {
  readonly state: EditorState;
  /** Hand the session a transaction; the view is then told the new state. */
  readonly apply: (transaction: Transaction) => void;
  /** The text as the file will hold it. */
  readonly text: () => string;
  readonly undo: () => boolean;
  readonly redo: () => boolean;
  /** The selection as character offsets in the text, for keeping the writer's place. */
  readonly caret: () => { readonly anchor: number; readonly head: number };
  /** Put the selection at character offsets in the text, clamped to it. */
  readonly select: (anchor: number, head: number) => void;
  /** The wavy lines under misspelt words, while the pass is on. */
  readonly decorations: () => DecorationSet;
  readonly spelling: {
    readonly available: () => boolean;
    readonly isOn: () => boolean;
    readonly toggle: () => Promise<void>;
    /** The misspelt word at a document position, if the pass is on and has marked one there. */
    readonly at: (position: number) => NotesMisspelling | undefined;
    readonly suggestions: (word: string) => Promise<readonly string[]>;
    readonly replace: (misspelling: NotesMisspelling, text: string) => void;
    readonly addToDictionary: (word: string) => Promise<void>;
  };
  readonly unsaved: () => boolean;
  readonly save: () => Promise<void>;
  readonly leave: () => Promise<boolean>;
  /** Resolves when the save under way, if any, has landed or failed (`WorkspaceFileSession.settled`). */
  readonly settled: () => Promise<void>;
  readonly relocate: (move: () => Promise<Project>) => Promise<Project>;
  /** Move the note's file between saves, and go on saving there (`WorkspaceFileSession.rename`). */
  readonly rename: (move: (from: string) => Promise<string>) => Promise<string>;
  readonly file: () => string;
  /** Stop saving this note, for good: it is being deleted (`WorkspaceFileSession.discard`). */
  readonly discard: () => void;
  readonly project: () => Project;
}

const stateFor = (text: string): EditorState => EditorState.create({ doc: docOf(text), plugins: [history()] });

/** Open a session over notes that have been read (`readWorkspaceFile`). */
export function notesSession(ports: NotesSessionPorts, read: WorkspaceFileRead): NotesSession {
  let state = stateFor(read.text);
  let text = read.text;

  const showWords = (): void => ports.setStatus(`w. ${new Intl.NumberFormat("en-US").format(wordsOf(text))}`);

  // Drawn again only when the document or a verdict changes, not on every caret move.
  let drawn: { doc: EditorState["doc"]; verdicts: number; set: DecorationSet } | undefined;
  let verdicts = 0;
  const spelling = ports.spellEngine === undefined
    ? undefined
    : plainSpelling(ports.spellEngine, () => {
        verdicts += 1;
        ports.setSpellcheck(spelling?.isOn() === true);
        ports.redraw();
      });

  const misspellings = (): NotesMisspelling[] => {
    if (spelling === undefined || !spelling.isOn()) return [];
    const found: NotesMisspelling[] = [];
    let start = 1;
    state.doc.forEach((line) => {
      for (const word of spelling.misspelt(line.textContent)) {
        found.push({ word: word.word, from: start + word.start, to: start + word.end });
      }
      start += line.content.size + 2;
    });
    return found;
  };

  const file = workspaceFileSession(
    {
      filesystem: ports.filesystem,
      project: ports.project,
      file: ports.file,
      noun: "your notes",
      text: () => text,
      reload: (found) => {
        // The caret stays where it was in the text, as near as the new text allows.
        const { anchor, head } = caret();
        state = stateFor(found);
        text = found;
        select(anchor, head);
        showWords();
        void spelling?.edited(text);
        ports.redraw();
      },
      report: ports.report,
      setSaved: ports.setSaved,
      whenSwitchedAway: ports.whenSwitchedAway,
      whenSwitchedBack: ports.whenSwitchedBack,
      ...(ports.clock === undefined ? {} : { clock: ports.clock }),
      ...(ports.now === undefined ? {} : { now: ports.now }),
    },
    read,
  );

  const apply = (transaction: Transaction): void => {
    state = state.apply(transaction);
    if (!transaction.docChanged) return;
    text = textOf(state.doc);
    file.changed();
    showWords();
    void spelling?.edited(text);
  };
  const run = (command: typeof undoCommand): boolean => command(state, apply);
  const caret = (): { anchor: number; head: number } => ({
    anchor: offsetOf(state.doc, state.selection.anchor),
    head: offsetOf(state.doc, state.selection.head),
  });
  const select = (anchor: number, head: number): void => {
    const doc = state.doc;
    state = state.apply(state.tr.setSelection(TextSelection.create(doc, positionOf(doc, anchor), positionOf(doc, head))));
  };

  showWords();

  return {
    get state() {
      return state;
    },
    apply,
    text: () => text,
    undo: () => run(undoCommand),
    redo: () => run(redoCommand),
    caret,
    select,
    decorations: () => {
      if (drawn !== undefined && drawn.doc === state.doc && drawn.verdicts === verdicts) return drawn.set;
      const set = DecorationSet.create(
        state.doc,
        misspellings().map((found) => Decoration.inline(found.from, found.to, { class: "spell-error" })),
      );
      drawn = { doc: state.doc, verdicts, set };
      return set;
    },
    spelling: {
      available: () => spelling !== undefined,
      isOn: () => spelling?.isOn() === true,
      toggle: async () => {
        if (spelling === undefined) return;
        const wanted = !spelling.isOn();
        ports.setSpellcheck(wanted);
        try {
          await spelling.setOn(wanted, text);
        } catch (error) {
          ports.report(`Write-ist could not check your spelling just now. Your notes are unchanged. ${message(error)}`);
        }
      },
      at: (position) => misspellings().find((found) => found.from <= position && position <= found.to),
      suggestions: (word) => spelling?.suggestions(word) ?? Promise.resolve([]),
      replace: (misspelling, replacement) => {
        // Only if the word is still there: the menu may have opened before an edit.
        if (state.doc.textBetween(misspelling.from, misspelling.to) !== misspelling.word) return;
        apply(state.tr.insertText(replacement, misspelling.from, misspelling.to));
      },
      addToDictionary: async (word) => {
        await spelling?.addToDictionary(word);
      },
    },
    unsaved: file.unsaved,
    save: file.save,
    leave: file.leave,
    settled: file.settled,
    relocate: file.relocate,
    rename: file.rename,
    file: file.file,
    discard: file.discard,
    project: () => file.project,
  };
}
