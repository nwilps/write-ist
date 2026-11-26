/**
 * A workspace's files, and only those: what `toolbox.files` is (ADR-0045).
 *
 * A workspace declares in its manifest which files and folders in a project
 * hold its work (`files`; a name ending in `/` is a folder, and everything
 * directly in it — ADR-0025: `plan.md` is Plan's, the `notes/` folder Notes').
 * This hands it the disk **for those and nothing else**: every path is
 * relative to the project's folder, and one that is not declared is refused
 * before the disk is asked anything. So a workspace never reaches the
 * manuscript, the marker, another workspace's work, or anything outside the
 * project.
 *
 * Nothing here is new machinery. Each call is a promise the project layer
 * already keeps, narrowed:
 *
 * - **Reading** is `readWorkspaceFile`: absent is no text, unreadable rejects,
 *   so nothing is ever opened for writing over a file it could not read
 *   (ADR-0008 rule 3, ADR-0016).
 * - **Saving** is the workspace-file session (`workspace-file.ts`): the safe
 *   save (temp, flush, rename), autosave at ADR-0028's moments, outside changes
 *   handled quietly (ADR-0031), and the save pill told how the work stands. A
 *   last save that fails answers `false`, so the work stays on screen.
 * - **Making** a file writes it only where nothing is.
 * - **Moving** (a rename) is `Filesystem.moveFile`: never over another file.
 * - **Deleting** is `Filesystem.removeWorkspaceFile`: one real file directly
 *   inside a declared folder, for good. The workspace asks the writer first,
 *   with the toolbox's confirm (`toolbox.dialogs.confirm`), in its own words.
 *
 * The project is asked for each time (`project()`), because a rename moves its
 * folder while the workspace stays up; an open file follows the move itself
 * (`relocate`).
 */
import type { Clock } from "./autosave.ts";
import type { Project } from "./bundle.ts";
import { join, type Filesystem } from "./filesystem.ts";
import {
  readWorkspaceFile,
  workspaceFileSession,
  type FileSaveState,
  type WorkspaceFileRead,
  type WorkspaceFileSession,
} from "./workspace-file.ts";

export interface WorkspaceFilesPorts {
  readonly filesystem: Filesystem;
  /** The project as it is now. */
  readonly project: () => Project;
  /** The manifest's `files`: what this workspace may touch. */
  readonly declared: readonly string[];
  /** Trouble an open file's saving runs into, in words for the writer. */
  readonly report?: (trouble: string) => void;
  /** The save pill, for an open file that is not told otherwise. */
  readonly setSaved?: (state: FileSaveState) => void;
  readonly whenSwitchedAway?: (act: () => void) => () => void;
  readonly whenSwitchedBack?: (act: () => void) => () => void;
  readonly clock?: Clock;
  readonly now?: () => Date;
}

/** What a workspace hands an open file: its work as text, and how to take the text back. */
export interface FileWork {
  /** What the file holds, in the writer's words for failures: "your notes". */
  readonly noun: string;
  /** The work as the file's text, asked for at each save. */
  readonly text: () => string;
  /**
   * Something else changed the file and nothing was typed: this is it now.
   * Answer `false` if it cannot be loaded; the writer's version then stands.
   */
  readonly reload: (text: string) => boolean | void;
  /** Where this file's save state goes, if not straight to the save pill. */
  readonly setSaved?: (state: FileSaveState) => void;
}

/** An open file: the workspace-file session, and a rename that waits its turn with the saves. */
export interface OpenFile extends WorkspaceFileSession {
  /** Move the file to `to` (declared, nothing there) between saves, and go on saving there. */
  readonly moveTo: (to: string) => Promise<string>;
}

/** One entry directly inside a declared folder. */
export interface FolderEntry {
  readonly name: string;
  readonly isFolder: boolean;
}

export interface WorkspaceFiles {
  /** The manifest's `files`, as declared. */
  readonly declared: readonly string[];
  /** Whether a path is one this workspace may touch: a declared file, or directly inside a declared folder. */
  readonly allows: (path: string) => boolean;
  readonly exists: (path: string) => Promise<boolean>;
  /** Read a file: absent is no text; one that will not read rejects. */
  readonly read: (path: string) => Promise<WorkspaceFileRead>;
  /** Open a file that was read for writing: safe saves, autosave, the save pill. */
  readonly open: (path: string, work: FileWork, read: WorkspaceFileRead) => OpenFile;
  /** What is directly inside a declared folder. An absent folder is empty. */
  readonly list: (folder: string) => Promise<readonly FolderEntry[]>;
  /** Make a declared folder, if it is not there. */
  readonly makeFolder: (folder: string) => Promise<void>;
  /** Make a file holding `text` (empty by default). Rejects, writing nothing, if anything is there. */
  readonly create: (path: string, text?: string) => Promise<void>;
  /** Move a file to a path where nothing is. Never over another file. */
  readonly move: (from: string, to: string) => Promise<void>;
  /** Delete a file directly inside a declared folder, for good. Ask the writer first. */
  readonly remove: (path: string) => Promise<void>;
}

/** Thrown for a path the workspace did not declare; nothing was touched. */
export class NotDeclared extends Error {}

/** A relative path, one or two plain segments: no `..`, no `.`, nothing hidden, no backslash. */
const PLAIN_SEGMENT = /^(?!\.)[^/\\]+$/;

/** The declared folders (without their `/`) and files. */
function declarations(declared: readonly string[]): { folders: Set<string>; files: Set<string> } {
  const folders = new Set<string>();
  const files = new Set<string>();
  for (const entry of declared) {
    if (entry.endsWith("/")) folders.add(entry.slice(0, -1));
    else files.add(entry);
  }
  return { folders, files };
}

/** The declared folder `path` is directly inside, or `undefined`. */
function folderOf(path: string, folders: ReadonlySet<string>): string | undefined {
  const segments = path.split("/");
  if (segments.length !== 2 || !segments.every((segment) => PLAIN_SEGMENT.test(segment))) return undefined;
  return folders.has(segments[0]!) ? segments[0] : undefined;
}

export function workspaceFiles(ports: WorkspaceFilesPorts): WorkspaceFiles {
  const { folders, files } = declarations(ports.declared);
  const quiet = (): (() => void) => () => {};

  const allows = (path: string): boolean =>
    (files.has(path) && path.split("/").every((segment) => PLAIN_SEGMENT.test(segment))) || folderOf(path, folders) !== undefined;
  const check = (path: string): string => {
    if (!allows(path)) throw new NotDeclared(`${path} is not one of this workspace's files, so it has been left alone.`);
    return path;
  };
  const checkFolder = (folder: string): string => {
    if (!folders.has(folder) || !PLAIN_SEGMENT.test(folder)) {
      throw new NotDeclared(`${folder} is not one of this workspace's folders, so it has been left alone.`);
    }
    return folder;
  };
  const at = (path: string): string => join(ports.project().path, path);

  const makeFolder = async (folder: string): Promise<void> => {
    await ports.filesystem.createDirectory(at(checkFolder(folder)));
  };

  return {
    declared: ports.declared,
    allows,
    exists: async (path) => ports.filesystem.exists(at(check(path))),
    read: async (path) => readWorkspaceFile(ports.filesystem, ports.project(), check(path)),
    open: (path, work, read) => {
      const session = workspaceFileSession(
        {
          filesystem: ports.filesystem,
          project: ports.project(),
          file: check(path),
          noun: work.noun,
          text: work.text,
          reload: work.reload,
          report: ports.report ?? (() => {}),
          setSaved: work.setSaved ?? ports.setSaved ?? (() => {}),
          whenSwitchedAway: ports.whenSwitchedAway ?? quiet,
          whenSwitchedBack: ports.whenSwitchedBack ?? quiet,
          ...(ports.clock === undefined ? {} : { clock: ports.clock }),
          ...(ports.now === undefined ? {} : { now: ports.now }),
        },
        read,
      );
      return {
        // The session's own project, which follows a rename of the folder.
        get project() {
          return session.project;
        },
        changed: session.changed,
        unsaved: session.unsaved,
        save: session.save,
        leave: session.leave,
        settled: session.settled,
        relocate: session.relocate,
        file: session.file,
        rename: session.rename,
        discard: session.discard,
        moveTo: (to) =>
          session.rename(async (from) => {
            check(to);
            if (from === to) return to;
            // Asked here, in the session's turn: a rename of the project may have moved the folder.
            const folder = session.project.path;
            await ports.filesystem.moveFile(join(folder, from), join(folder, to));
            return to;
          }),
      };
    },
    list: async (folder) => {
      const entries = await ports.filesystem.readDirectory(at(checkFolder(folder)));
      return entries.map((entry) => ({ name: entry.name, isFolder: entry.isDirectory }));
    },
    makeFolder,
    create: async (path, text = "") => {
      check(path);
      const folder = folderOf(path, folders);
      if (folder !== undefined) await makeFolder(folder);
      // Asked again just before: a file made elsewhere a moment ago is never written over.
      if (await ports.filesystem.exists(at(path))) throw new Error(`${path} appeared just now, so it has been left as it is.`);
      await ports.filesystem.writeFile(at(path), new TextEncoder().encode(text));
    },
    move: async (from, to) => {
      check(from);
      check(to);
      if (from === to) return;
      await ports.filesystem.moveFile(at(from), at(to));
    },
    remove: async (path) => {
      const folder = folderOf(check(path), folders);
      if (folder === undefined) throw new NotDeclared(`${path} is not inside one of this workspace's folders, so it has been left alone.`);
      await ports.filesystem.removeWorkspaceFile(at(path), folder);
    },
  };
}
