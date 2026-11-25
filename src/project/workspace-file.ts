/**
 * A workspace's own file, open for writing: a note in `notes/` for Notes,
 * `plan.md` for Plan (ADR-0025).
 *
 * The manuscript has its save routine (`save.ts`) and its session
 * (`manuscript-session.ts`); this is the same set of promises for a file that
 * is not a manuscript, with nothing in it about what the file holds. A
 * workspace hands it the file's text when asked and takes the text back when
 * something else changed the file, and this decides everything about the disk:
 *
 * - **When.** ADR-0028's three moments — a couple of seconds after the writer
 *   stops, on switching to another application, and on leaving — plus a
 *   fourth that only a workspace has: switching to another workspace. One
 *   autosave (`autosave.ts`) and one save routine, as for the manuscript.
 * - **Never over a file it could not read** (ADR-0008 rule 3). A session only
 *   exists for a file that was read (`readWorkspaceFile` rejects otherwise), and
 *   every save reads the file again first.
 * - **Outside changes, quietly** (ADR-0031). Changed elsewhere and nothing typed:
 *   the version on disk is loaded. Typed as well: the version found is kept
 *   beside it under a dated name, *then* the writer's is written. Neither says
 *   anything; only failures are reported.
 * - **A last save that fails keeps the workspace up** (`leave` answers false),
 *   so the words on screen are never taken down with nowhere else to be.
 *
 * ## In a folder of its own
 *
 * A file may be in a folder inside the project's (`notes/Ideas.md`). The folder
 * is made if it is not there when the file is first written, the dated copy of
 * an outside change is kept beside the file in that folder, and `rename` moves
 * the file to a new name between saves, as `relocate` moves the project.
 *
 * ## Absent is not unreadable
 *
 * A project that has never had a plan has no `plan.md`, and that is a blank
 * page rather than an error (ADR-0016's *absent and unparseable are
 * different*). Nothing is written until the writer writes something, so
 * opening Notes and leaving never creates an empty file.
 *
 * ## What is kept of the file's own habits
 *
 * A byte-order mark and Windows line endings are the file's, not the writer's
 * text, so they are taken off for editing and put back on every write: a
 * note written on Windows stays a Windows file.
 */
import { autosave, windowClock, type Clock } from "./autosave.ts";
import type { Project } from "./bundle.ts";
import { join, type Filesystem } from "./filesystem.ts";
import { copyNameFor, identical, withinLimit } from "./save.ts";
import { message } from "../message.ts";

/** Where a workspace's work stands against the disk (the save pill's three states). */
export type FileSaveState = "saved" | "unsaved" | "saving";

/** A workspace file as read: its text, and how to write that text back as the file had it. */
export interface WorkspaceFileRead {
  /** The text, with Windows line endings as `\n` and no byte-order mark. */
  readonly text: string;
  /** The bytes found, or `undefined` when there was no file. */
  readonly bytes: Uint8Array | undefined;
  readonly habits: FileHabits;
}

/** What a file does that is not its text. */
export interface FileHabits {
  readonly byteOrderMark: boolean;
  readonly windowsLineEndings: boolean;
}

const PLAIN: FileHabits = { byteOrderMark: false, windowsLineEndings: false };
const BOM = [0xef, 0xbb, 0xbf];

/** The text of a file's bytes. Rejects, in the writer's words, when they are not UTF-8 text. */
export function decodeWorkspaceFile(bytes: Uint8Array, file: string): { text: string; habits: FileHabits } {
  let text: string;
  try {
    // `ignoreBOM` keeps a mark in the text, so it is seen and put back.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error(`${file} is not text Write-ist can read, so it has been left as it is.`);
  }
  const byteOrderMark = text.startsWith("﻿");
  if (byteOrderMark) text = text.slice(1);
  const windowsLineEndings = text.includes("\r\n");
  if (windowsLineEndings) text = text.replace(/\r\n/g, "\n");
  return { text, habits: { byteOrderMark, windowsLineEndings } };
}

/** The bytes for `text`, written the way the file was. */
export function encodeWorkspaceFile(text: string, habits: FileHabits): Uint8Array {
  const lines = habits.windowsLineEndings ? text.replace(/\n/g, "\r\n") : text;
  const body = new TextEncoder().encode(lines);
  if (!habits.byteOrderMark) return body;
  const bytes = new Uint8Array(BOM.length + body.length);
  bytes.set(BOM);
  bytes.set(body, BOM.length);
  return bytes;
}

/**
 * Read a workspace's file from a project's folder. An absent file reads as no
 * text; one that is there and cannot be read **rejects**, so nothing is ever
 * opened for writing over it.
 */
export async function readWorkspaceFile(
  filesystem: Filesystem,
  project: Project,
  file: string,
): Promise<WorkspaceFileRead> {
  const path = join(project.path, file);
  if (!(await filesystem.exists(path))) return { text: "", bytes: undefined, habits: PLAIN };
  const bytes = await filesystem.readFile(path);
  return { ...decodeWorkspaceFile(bytes, file), bytes };
}

export interface WorkspaceFilePorts {
  readonly filesystem: Filesystem;
  /** The project as it was opened; `relocate` is how it changes after that. */
  readonly project: Project;
  /** The file's path in the project's folder (`plan.md`, `notes/Ideas.md`). */
  readonly file: string;
  /** What the file holds, in the writer's words for failures: "your notes". */
  readonly noun: string;
  /** The writer's work as the file's text, asked for at each save. */
  readonly text: () => string;
  /**
   * Something else changed the file and the writer had typed nothing: this is
   * it now. Answer `false` if it cannot be loaded (it is not a plan, say): the
   * writer's version then stands, and the other is kept beside it as if they
   * had typed — so neither is lost and nothing unreadable is ever loaded.
   */
  readonly reload: (text: string) => boolean | void;
  readonly report: (trouble: string) => void;
  readonly setSaved: (state: FileSaveState) => void;
  readonly whenSwitchedAway: (act: () => void) => () => void;
  readonly whenSwitchedBack: (act: () => void) => () => void;
  /** For the dated copy's name. The system clock unless a test is it. */
  readonly now?: () => Date;
  readonly clock?: Clock;
}

export interface WorkspaceFileSession {
  /** The project as it is now: `relocate` replaces it. */
  readonly project: Project;
  /** The writer changed their work: it is unsaved, and saves after the pause. */
  readonly changed: () => void;
  readonly unsaved: () => boolean;
  /** Save now. Never rejects: trouble is reported, and the work stays unsaved. */
  readonly save: () => Promise<void>;
  /**
   * The last save, on leaving. Answers whether it landed; if not, the writer
   * has been told, and whatever holds the words must stay up.
   */
  readonly leave: () => Promise<boolean>;
  /**
   * Resolves when the save under way, if any — the pause's own included — has
   * landed or failed. Starts none.
   */
  readonly settled: () => Promise<void>;
  /** Move the project's folder between saves, and go on saving where it went (`save.ts`'s `relocate`). */
  readonly relocate: (move: () => Promise<Project>) => Promise<Project>;
  /** The file's path in the project's folder, as it is now: `rename` changes it. */
  readonly file: () => string;
  /**
   * Move the file to another path between saves — never during one — and go on
   * saving there. `move` does the move and answers the new path; if it fails,
   * the file and the session are as they were.
   */
  readonly rename: (move: (from: string) => Promise<string>) => Promise<string>;
  /**
   * Stop saving, for good: the file is about to be deleted. Nothing waiting is
   * written, and nothing is written after. Only for a file whose work is on
   * disk (`unsaved()` false) or is being thrown away on the writer's word.
   */
  readonly discard: () => void;
}

/** Open a session over a file that has been read. */
export function workspaceFileSession(ports: WorkspaceFilePorts, read: WorkspaceFileRead): WorkspaceFileSession {
  const clock = ports.clock ?? windowClock;
  const now = ports.now ?? (() => new Date());
  let project = ports.project;
  let file = ports.file;
  let habits = read.habits;
  /**
   * Every version the file may hold because of Write-ist — what it last read,
   * what it last wrote, and a write that failed and may yet land. `undefined`
   * is *no file*, which is Write-ist's too until it writes one.
   */
  let ours: (Uint8Array | undefined)[] = [read.bytes];
  let unsettled = false;
  let dirty = false;
  let running: Promise<void> = Promise.resolve();

  const same = (one: Uint8Array | undefined, other: Uint8Array | undefined): boolean =>
    one === undefined || other === undefined ? one === other : identical(one, other);

  const write = async (): Promise<void> => {
    // Asked here rather than once: a rename moves the folder, or the file, between saves.
    const path = join(project.path, file);
    const slash = file.lastIndexOf("/");
    const folder = join(project.path, file.slice(0, Math.max(0, slash)));
    const name = file.slice(slash + 1);
    const there = await withinLimit(ports.filesystem.exists(path), clock);
    const found = there ? await withinLimit(ports.filesystem.readFile(path), clock) : undefined;

    if (!ours.some((bytes) => same(bytes, found))) {
      if (!dirty) {
        // Nothing typed, so nothing is lost by loading it, and nothing is
        // written: loading is not a change. A file deleted elsewhere loads as
        // a blank page, and stays deleted until the writer writes again.
        if (load(found)) {
          ours = [found];
          return;
        }
        // It could not be loaded, so the writer's version stands, and the one
        // found is kept beside it, exactly as if they had typed.
        dirty = true;
      }
      // Typed as well: the other version is kept beside it first, exactly as
      // found. A file deleted elsewhere has nothing to keep.
      if (found !== undefined) {
        const entries = await withinLimit(ports.filesystem.readDirectory(folder), clock);
        const copy = copyNameFor(now(), new Set(entries.map((entry) => entry.name)), name);
        await withinLimit(ports.filesystem.writeFile(join(folder, copy), found), clock);
      }
      ours.push(found);
    }

    if (!dirty) return;
    const text = ports.text();
    // Cleared before the write, so typing during it is still unsaved after.
    dirty = false;
    // Nothing written and nothing to write: an empty page is not a file.
    if (found === undefined && text === "") return;
    const bytes = encodeWorkspaceFile(text, habits);
    if (!unsettled && found !== undefined && identical(bytes, found)) return;
    try {
      if (!there && slash >= 0) await withinLimit(ports.filesystem.createDirectory(folder), clock);
      await withinLimit(ports.filesystem.writeFile(path, bytes), clock);
    } catch (error) {
      dirty = true;
      ours.push(bytes);
      unsettled = true;
      throw error;
    }
    ours = [bytes];
    unsettled = false;
  };

  /** Hand the version found to the workspace; whether it took it. */
  const load = (found: Uint8Array | undefined): boolean => {
    if (found === undefined) return ports.reload("") !== false;
    let decoded: { text: string; habits: FileHabits };
    try {
      decoded = decodeWorkspaceFile(found, file);
    } catch {
      return false;
    }
    if (ports.reload(decoded.text) === false) return false;
    habits = decoded.habits;
    return true;
  };

  let discarded = false;
  const saveOnce = async (): Promise<void> => {
    if (discarded) return;
    ports.setSaved("saving");
    const done = running.then(write, write);
    running = done.catch(() => {});
    try {
      await done;
    } finally {
      ports.setSaved(dirty ? "unsaved" : "saved");
    }
  };

  let leaving = false;
  let unfinished: unknown;
  const failure = (error: unknown): string =>
    `Write-ist could not save ${ports.noun}, so your last changes are only on screen. ${message(error)}`;

  const saving = autosave({
    save: saveOnce,
    trouble: (error) => {
      if (leaving) {
        unfinished = error;
        return;
      }
      ports.report(
        dirty
          ? `${failure(error)} It will try again.`
          : `Write-ist could not check whether ${ports.noun} changed outside it. Nothing has been changed. ${message(error)}`,
      );
    },
    clock,
  });

  const stopAway = ports.whenSwitchedAway(() => void saving.now());
  const stopBack = ports.whenSwitchedBack(() => void saving.now());

  return {
    get project() {
      return project;
    },
    changed: () => {
      dirty = true;
      ports.setSaved("unsaved");
      saving.typed();
    },
    unsaved: () => dirty,
    save: () => saving.now(),
    leave: async () => {
      unfinished = undefined;
      leaving = true;
      await saving.now();
      leaving = false;
      if (unfinished !== undefined) {
        ports.report(`${failure(unfinished)} It stays open until it saves, so nothing you have written is lost.`);
        return false;
      }
      stopAway();
      stopBack();
      return true;
    },
    settled: () => running,
    relocate: (move) => {
      const moving = (): Promise<Project> => withinLimit(move().then((moved) => (project = moved)), clock);
      const moved = running.then(moving, moving);
      running = moved.then(
        () => {},
        () => {},
      );
      return moved;
    },
    file: () => file,
    discard: () => {
      discarded = true;
      dirty = false;
      stopAway();
      stopBack();
    },
    rename: (move) => {
      const moving = (): Promise<string> => withinLimit(move(file).then((moved) => (file = moved)), clock);
      const moved = running.then(moving, moving);
      running = moved.then(
        () => {},
        () => {},
      );
      return moved;
    },
  };
}
