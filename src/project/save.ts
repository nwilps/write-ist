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
 * ## When something else changed the file (#42)
 *
 * **Every save reads the manuscript on disk first**, and compares it with what
 * Write-ist last read or wrote. Switching back to Write-ist is a save too, so
 * the comparison runs then as well — the two moments ADR-0028 names. What
 * happens next depends on one thing: whether the writer typed since the last
 * save.
 *
 * - **Not changed.** The save goes on as it always did.
 * - **Changed, and nothing typed.** The new version is loaded, treated as an
 *   import — ADR-0020's normalisations applied to the model and reported — and
 *   *nothing is written*. Loading a file is not a change to it; the
 *   normalisations reach the disk with the writer's next typed save, which is
 *   ADR-0028's *"the next save may apply"* and ADR-0020 point 2 both.
 * - **Changed, and typed.** Both are kept. The version found is written beside
 *   the manuscript byte for byte, under a dated name, **before** the manuscript
 *   is replaced — a copy that could not be written stops the save, because
 *   until it exists the manuscript is the only place those words are. Then the
 *   writer's version is saved as the manuscript and the writer is told where
 *   the other went.
 *
 * A manuscript that cannot be read at that moment is not written over: the
 * save refuses and the typing stays unsaved, which is ADR-0008 rule 3 at save
 * time as `OpenedProject` is at open time.
 *
 * ## What it does not do
 *
 * `(CONT'D)` maintenance is deliberately **not** run here, although
 * `reopenAndSave` runs it. ADR-0026 has the application maintaining the
 * extension *live*, as the writer moves from a cue to its dialogue (#45), so
 * running it again at save time would make saving a second, quieter author of
 * the writer's text — and one whose result the writer never saw on screen.
 */
import { windowClock, type Clock } from "./autosave.ts";
import {
  exportScreenplay,
  importScreenplay,
  type ImportedScreenplay,
} from "../screenplay/import.ts";
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
 * What the editor does when the manuscript was changed by something else
 * (ADR-0028). **Required**, because a session that found a change and had
 * nowhere to load it would go on saving the old words — and the next typed
 * save would put them over the new ones with nobody told.
 */
export interface ChangedElsewhere {
  /**
   * Nothing was typed since the last save, so the version on disk replaces the
   * one on screen. It arrives as an import: the model with ADR-0020's
   * normalisations applied, and the report naming them.
   *
   * Called synchronously, and the session's `manuscript` must answer with the
   * new document once it returns.
   */
  readonly reload: (imported: ImportedScreenplay) => void;
  /**
   * The writer had typed too, so both were kept: theirs as the manuscript, the
   * other at this path, beside it. Tell them where.
   */
  readonly keptBoth: (path: string) => void;
  /** When it is, for dating the copy. The system clock unless a test is it. */
  readonly now?: () => Date;
  readonly clock?: Clock;
}

/**
 * A project open for editing: what the writer has, against what is on disk.
 *
 * The session is the only thing that knows both halves, so it is the only
 * thing that can tell whether a save has anything to do — and whether the
 * disk still holds what Write-ist left there (#42).
 */
export interface EditingSession {
  readonly project: Project;
  /** The writer changed the manuscript. */
  readonly changed: () => void;
  /** Whether anything has changed since the last save. */
  readonly unsaved: () => boolean;
  /**
   * The one save routine. Autosave and an explicit save both call this, and so
   * does switching back to Write-ist: it is what compares the disk with what
   * Write-ist last read or wrote, and a switch back is a save with nothing
   * typed more often than not.
   */
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
  { reload, keptBoth, now = () => new Date(), clock = windowClock }: ChangedElsewhere,
): EditingSession {
  const path = join(opened.project.path, MANUSCRIPT_FILE);
  /**
   * Every version the manuscript on disk may hold **because of Write-ist** —
   * what it last read, what it last wrote. Anything else on disk was put there
   * by something else.
   *
   * One entry, except after a write that failed: that write may still have
   * landed, or may yet land, so its bytes are Write-ist's too and finding them
   * is not a change made elsewhere.
   */
  let ours: Uint8Array[] = [opened.manuscript];
  /**
   * Whether a write was given up on, so the disk may yet change under a save
   * that found it holding the right bytes. Such a save writes anyway.
   */
  let unsettled = false;
  /** The writer typed since the last save. */
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
    // Read first, every time: the comparison ADR-0028 asks for before each
    // save. A read that fails rejects here, before anything is written.
    const found = await withinLimit(filesystem.readFile(path), clock);

    if (!ours.some((bytes) => identical(bytes, found))) {
      if (!dirty) {
        // Nothing typed, so nothing of the writer's is lost by loading it —
        // and nothing is written, because loading is not a change.
        reload(importScreenplay(found));
        ours = [found];
        return { written: false };
      }
      // Typed as well. The other version goes beside the manuscript first,
      // exactly as found; if that fails, this rejects with the manuscript
      // still holding it.
      const copy = join(opened.project.path, await freeCopyName());
      await withinLimit(filesystem.writeFile(copy, found), clock);
      // It is kept, so it is safe to replace — and a retry after the
      // manuscript's own write fails must not keep it a second time.
      ours.push(found);
      keptBoth(copy);
    }

    if (!dirty) return { written: false };

    const bytes = exportScreenplay(manuscript());
    // Cleared before the write, so a keystroke that arrives *during* it is
    // still unsaved afterwards rather than being lost to a flag cleared too
    // late.
    dirty = false;

    if (!unsettled && identical(bytes, found)) return { written: false };

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
      // And the disk is no longer known: these bytes may land yet, so they
      // are Write-ist's rather than a change made elsewhere, and the next
      // save writes whatever it has rather than trusting a comparison.
      ours.push(bytes);
      unsettled = true;
      throw error;
    }
    ours = [bytes];
    unsettled = false;
    return { written: true };
  };

  /** A name beside the manuscript that nothing already has. */
  const freeCopyName = async (): Promise<string> => {
    const taken = new Set(
      (await filesystem.readDirectory(opened.project.path)).map((entry) => entry.name),
    );
    return copyNameFor(now(), taken);
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

/**
 * The name the version found on disk is kept under, when the writer had typed
 * too (ADR-0028: *"saved beside it as a dated copy"*).
 *
 * Said in words, so a writer looking in the folder knows what it is without
 * being told, and dated year first in their own time, so a folder of them
 * sorts by when they happened. No colons: the bundle may be copied to Windows,
 * which refuses them. Names are compared without case, as `folderNameFor`
 * compares them, and for the same reason.
 */
export function copyNameFor(moment: Date, taken: ReadonlySet<string>): string {
  const two = (value: number): string => String(value).padStart(2, "0");
  const date = `${moment.getFullYear()}-${two(moment.getMonth() + 1)}-${two(moment.getDate())}`;
  const time = `${two(moment.getHours())}.${two(moment.getMinutes())}.${two(moment.getSeconds())}`;
  const stem = MANUSCRIPT_FILE.slice(0, MANUSCRIPT_FILE.lastIndexOf("."));
  const extension = MANUSCRIPT_FILE.slice(MANUSCRIPT_FILE.lastIndexOf("."));
  const base = `${stem} changed elsewhere ${date} ${time}`;

  const lowercased = new Set([...taken].map((name) => name.toLowerCase()));
  for (let suffix = 1; ; suffix++) {
    const candidate = `${base}${suffix === 1 ? "" : ` ${suffix}`}${extension}`;
    if (!lowercased.has(candidate.toLowerCase())) return candidate;
  }
}

/** The disk's answer, or a failure in the writer's words once `DISK_LIMIT` has passed. */
function withinLimit<T>(write: Promise<T>, clock: Clock): Promise<T> {
  return new Promise((resolve, reject) => {
    const limit = clock.wait(
      () =>
        reject(new Error(`Your disk did not answer within ${DISK_LIMIT / 1000} seconds.`)),
      DISK_LIMIT,
    );
    write.then(
      (value) => {
        clock.cancel(limit);
        resolve(value);
      },
      (error: unknown) => {
        clock.cancel(limit);
        reject(error);
      },
    );
  });
}

/**
 * Whether two files hold the same bytes.
 *
 * A plain loop, because every save now makes this comparison at least once
 * (#42): `every` took 3.9 ms over the acceptance corpus, and this takes 0.3.
 */
function identical(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
