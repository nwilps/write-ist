/**
 * Saving the manuscript: **one routine** (ADR-0028).
 *
 * > **Autosave and an explicit save are one save.** There is a single routine,
 * > and both call it, so everything the round-trip gate proves about saving is
 * > proved about autosave too.
 *
 * `src/project/autosave.ts` decides *when* this is called. This decides what
 * happens when it is, and it is the only place in Write-ist that writes a
 * manuscript.
 *
 * ## Why a session rather than a function
 *
 * **ADR-0008 rule 3 — never write over a file that could not be read — is a
 * type here rather than a check.** A session is made from an `OpenedProject`,
 * and an `OpenedProject` only exists because `openProject` read the manuscript
 * and parsed it; a read that failed rejects and produces nothing. So there is
 * no way to reach this routine for a manuscript Write-ist could not read.
 *
 * That is deliberate. The v1 failure was *"a failed read initialising empty
 * state, which the next autosave writes over the good file"* — a sequence in
 * which every individual step looked reasonable. A rule that has to be
 * remembered would have been remembered in v1 too.
 *
 * ## What it writes, and what it does not
 *
 * The bytes come from **the existing serialiser** and nothing else (#37):
 * `exportScreenplay` over the model, never ProseMirror's own format and never
 * the DOM.
 *
 * `(CONT'D)` maintenance is deliberately **not** run here, although
 * `reopenAndSave` runs it. ADR-0026 has the application maintaining the
 * extension *live*, as the writer moves from a cue to its dialogue (#45), so
 * running it again at save time would make saving a second, quieter author of
 * the writer's text — and one whose result the writer never saw on screen.
 */
import { exportScreenplay } from "../screenplay/import.ts";
import type { ScreenplayDocument } from "../screenplay/document.ts";
import { MANUSCRIPT_FILE, type Project } from "./bundle.ts";
import { join, type Filesystem } from "./filesystem.ts";
import type { OpenedProject } from "./open.ts";

export interface SaveOutcome {
  /**
   * Whether the manuscript on disk was replaced.
   *
   * False when there was nothing to save, **and** when what the writer has
   * serialises to the bytes already there — typing a letter and deleting it
   * again is not a change to their screenplay, so it is not a change to their
   * file (ADR-0020 point 2).
   */
  readonly written: boolean;
}

/**
 * A project open for editing: what the writer has, against what is on disk.
 *
 * The session is the small piece of state autosave needs and #42 will extend:
 * it is the only thing that knows both halves, so it is the only thing that
 * can tell whether a save has anything to do.
 */
export interface EditingSession {
  readonly project: Project;
  /** The writer changed the manuscript. */
  readonly changed: () => void;
  /** Whether anything has changed since the last save. */
  readonly unsaved: () => boolean;
  /** The one save routine. Autosave and an explicit save both call this. */
  readonly save: () => Promise<SaveOutcome>;
}

/**
 * Open a session over a project that has been read.
 *
 * The manuscript is asked for rather than held, because the model behind the
 * editor is rebuilt from the editing engine's document and that is work worth
 * doing once per save rather than once per keystroke — `docs/STANDARDS.md`,
 * *Measure the measurer*. A save is the only thing that needs it, so a save is
 * when it is asked for.
 */
export function editingSession(
  filesystem: Filesystem,
  opened: OpenedProject,
  manuscript: () => ScreenplayDocument,
): EditingSession {
  const path = join(opened.project.path, MANUSCRIPT_FILE);
  let onDisk = opened.manuscript;
  let dirty = false;
  /**
   * Saves run one at a time.
   *
   * Autosave fires on a pause and on losing focus, and a writer who stops
   * typing and immediately switches away asks for both within a few
   * milliseconds. Two writes racing for one path is the kind of thing that
   * works on every machine it is tried on.
   */
  let running: Promise<SaveOutcome> = Promise.resolve({ written: false });

  const write = async (): Promise<SaveOutcome> => {
    if (!dirty) return { written: false };

    const bytes = exportScreenplay(manuscript());
    // Cleared before the write, so a keystroke that arrives *during* it is
    // still unsaved afterwards rather than being lost to a flag cleared too
    // late.
    dirty = false;

    if (identical(bytes, onDisk)) return { written: false };

    try {
      // Atomic — temp, flush, rename — which the `Filesystem` port promises
      // and both of its implementations provide (ADR-0008 rule 5). A save
      // interrupted before the rename leaves the previous manuscript intact.
      await filesystem.writeFile(path, bytes);
    } catch (error) {
      // **The writer's work is still only in memory, so it is still
      // unsaved.** A full disk that cleared the flag would mean the next
      // autosave had nothing to do and the scene was lost at the next crash
      // — a failed write authorising silence is ADR-0008 rule 3 wearing the
      // other face.
      dirty = true;
      throw error;
    }
    onDisk = bytes;
    return { written: true };
  };

  return {
    project: opened.project,
    changed: () => {
      dirty = true;
    },
    unsaved: () => dirty,
    save: () => {
      running = running.then(write, write);
      return running;
    },
  };
}

function identical(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}
