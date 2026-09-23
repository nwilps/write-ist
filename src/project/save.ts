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
import { windowClock, type Clock } from "./autosave.ts";
import { exportScreenplay } from "../screenplay/import.ts";
import type { ScreenplayDocument } from "../screenplay/document.ts";
import { MANUSCRIPT_FILE, type Project } from "./bundle.ts";
import { join, type Filesystem } from "./filesystem.ts";
import type { OpenedProject } from "./open.ts";

/**
 * How long a save waits for the disk before it stops waiting (#64).
 *
 * A write crosses from the webview into the operating system, and an answer
 * that never comes back is a promise that never settles. Everything waiting
 * behind it would wait for ever: every later save, and closing the project,
 * which saves first (ADR-0028). So a save that has not landed by now is a save
 * that failed, and is said as one.
 *
 * Long enough that no disk this runs on takes it for a manuscript — a save is
 * a couple of hundred kilobytes and takes milliseconds — and short enough that
 * a writer closing Write-ist is not left waiting on a disk that is not there.
 */
export const DISK_LIMIT = 10_000;

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
  { clock = windowClock }: { readonly clock?: Clock } = {},
): EditingSession {
  const path = join(opened.project.path, MANUSCRIPT_FILE);
  /**
   * What the manuscript on disk holds — or undefined once a write has failed,
   * because a write that failed may still have landed, or may yet land.
   */
  let onDisk: Uint8Array | undefined = opened.manuscript;
  let dirty = false;
  /**
   * Saves run one at a time.
   *
   * Autosave fires on a pause and on losing focus, and a writer who stops
   * typing and immediately switches away asks for both within a few
   * milliseconds. Two writes racing for one path is the kind of thing that
   * works on every machine it is tried on.
   *
   * **Each save waits at most `DISK_LIMIT`**, so one that never lands cannot
   * hold up the next. The port promises that a write given up on never lands
   * over a later one.
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
      await withinLimit(filesystem.writeFile(path, bytes), clock);
    } catch (error) {
      // **The writer's work is still only in memory, so it is still
      // unsaved.** A full disk that cleared the flag would mean the next
      // autosave had nothing to do and the scene was lost at the next crash
      // — a failed write authorising silence is ADR-0008 rule 3 wearing the
      // other face.
      dirty = true;
      // And the disk is no longer known, so the next save writes whatever
      // it has rather than trusting a comparison with bytes that may not be
      // there.
      onDisk = undefined;
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

/** The write, or a failure in the writer's words once `DISK_LIMIT` has passed. */
function withinLimit(write: Promise<void>, clock: Clock): Promise<void> {
  return new Promise((resolve, reject) => {
    const limit = clock.wait(
      () =>
        reject(new Error(`Your disk did not answer within ${DISK_LIMIT / 1000} seconds.`)),
      DISK_LIMIT,
    );
    write.then(
      () => {
        clock.cancel(limit);
        resolve();
      },
      (error: unknown) => {
        clock.cancel(limit);
        reject(error);
      },
    );
  });
}

function identical(left: Uint8Array, right: Uint8Array | undefined): boolean {
  if (right === undefined || left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}
