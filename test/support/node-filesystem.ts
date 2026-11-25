/**
 * The `Filesystem` port over `node:fs`, so the disk tests use real files.
 *
 * This is test support rather than production code: the application reaches
 * the disk through Tauri's filesystem plugin, in `app/src/tauri-filesystem.ts`.
 * Both implement the same port, and everything worth testing lives
 * above them in `src/project/`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { access, link, lstat, mkdir, open, readdir, readFile, realpath, rename, rm, rmdir, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { DirectoryEntry, Filesystem } from "../../src/project/filesystem.ts";

let written = 0;
/** The newest write landed on each path, by number. */
const landed = new Map<string, number>();
let committing: Promise<void> = Promise.resolve();

export const nodeFilesystem: Filesystem = {
  async readDirectory(path: string): Promise<readonly DirectoryEntry[]> {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch (error) {
      // Absent reads as empty — a first run, not a failure. Anything else is
      // a real error and is not swallowed.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
  },

  async readFile(path: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(path));
  },

  async writeFile(path: string, bytes: Uint8Array): Promise<void> {
    // **Temp, flush, rename** (ADR-0008 rule 5), the same three steps the
    // application's port takes — there they are a plugin call and a command in
    // `src-tauri/src/lib.rs`, here they are `node:fs`. A test port that skipped
    // the flush would be testing a weaker promise than the one that ships.
    //
    // Numbered, each with its own temporary file, and a write that arrives
    // after a newer one has landed is thrown away — the promise
    // `commit_write` keeps, kept here too.
    const sequence = ++written;
    const temporary = `${path}.writing-${sequence}`;
    const file = await open(temporary, "w");
    try {
      await file.write(bytes);
      await file.sync();
    } finally {
      await file.close();
    }

    const commit = committing.then(async () => {
      if ((landed.get(path) ?? 0) >= sequence) {
        await rm(temporary);
        return;
      }
      await rename(temporary, path);

      // The rename is a directory entry, and the file's bytes being durable
      // does not make the name that refers to them durable.
      const folder = await open(dirname(path), "r");
      try {
        await folder.sync();
      } finally {
        await folder.close();
      }
      landed.set(path, sequence);
    });
    // One commit at a time, as the command's lock makes it; a commit that
    // failed does not stop the next one.
    committing = commit.catch(() => {});
    await commit;
  },

  async createDirectory(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  },

  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },

  async modifiedAt(path: string): Promise<Date | undefined> {
    try {
      return (await stat(path)).mtime;
    } catch {
      return undefined;
    }
  },

  async appendFile(path: string, bytes: Uint8Array): Promise<void> {
    // True append: open with "a", write, sync. Never a read-modify-write —
    // that would put every earlier day at risk of a crash mid-rewrite.
    await mkdir(dirname(path), { recursive: true });
    const file = await open(path, "a");
    try {
      await file.write(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
  },

  async moveFolder(from: string, to: string): Promise<void> {
    // The same steps `move_folder` takes in `src-tauri/src/lib.rs`, so the
    // tests hold the promise the application keeps.
    if (!(await lstat(from)).isDirectory()) throw new Error(`${from} is not a folder.`);
    const inside = relative(resolve(from), resolve(to));
    if (inside !== ".." && !inside.startsWith("../")) throw new Error(`${to} is inside ${from}.`);
    // Claim the name first: `mkdir` fails if anything at all is there, so
    // nothing is ever replaced. The rename then lands on the folder just made,
    // which is empty — the one thing a rename of a folder may replace.
    await mkdir(to);
    try {
      await rename(from, to);
    } catch (error) {
      // Only the empty folder made above; `rmdir` cannot take anything else.
      await rmdir(to).catch(() => {});
      throw error;
    }
  },

  async removeEmptyFolder(path: string): Promise<void> {
    // `rmdir`, as `remove_empty_folder` does: it cannot take a folder with anything in it.
    await rmdir(path);
  },

  async moveFile(from: string, to: string): Promise<void> {
    // The steps `move_file_within` takes in `src-tauri/src/folders.rs`: linked
    // under the new name first, which fails if anything is there, then the old
    // name dropped. Nothing is ever replaced.
    if (!(await lstat(from)).isFile()) throw new Error(`${from} is not a file.`);
    await link(from, to);
    await unlink(from);
  },

  async removeNote(path: string): Promise<void> {
    // The checks `remove_note_within` makes, every one before the delete.
    if (!isAbsolute(path) || path.split(/[\\/]/).some((part) => part === ".." || part === ".")) {
      throw new Error(`${path} is not a plain path.`);
    }
    const name = basename(path);
    const folder = dirname(path);
    if (name.startsWith(".") || !name.toLowerCase().endsWith(".md")) throw new Error(`${path} is not a note.`);
    if (basename(folder) !== "notes" || !(await lstat(folder)).isDirectory()) throw new Error(`${path} is not in a notes folder.`);
    if (!(await lstat(path)).isFile()) throw new Error(`${path} is not a file.`);
    if (!(await lstat(join(dirname(folder), "project.md"))).isFile()) throw new Error(`${path} is not in a project.`);
    await unlink(path);
  },

  async exileFromGraveyard(path: string, projectId: string): Promise<void> {
    // The checks `exile_within` makes in `src-tauri/src/folders.rs`, so the
    // tests hold the promise the application keeps. Every one before the erase.
    if (!isAbsolute(path) || path.split(/[\\/]/).some((part) => part === ".." || part === ".")) {
      throw new Error(`${path} is not a plain path.`);
    }
    if (projectId.trim() === "") throw new Error("No project id was given.");
    const graveyard = dirname(path);
    if (basename(graveyard) !== "Graveyard" || basename(path).startsWith(".")) {
      throw new Error(`${path} is not a project in the Graveyard.`);
    }
    if (!(await lstat(graveyard)).isDirectory() || (await realpath(graveyard)) !== resolve(graveyard)) {
      throw new Error(`${graveyard} is not the Graveyard.`);
    }
    if (!(await lstat(path)).isDirectory() || (await realpath(path)) !== resolve(path)) {
      throw new Error(`${path} is not a plain folder.`);
    }
    const marker = join(path, "project.md");
    if (!(await lstat(marker)).isFile()) throw new Error(`${path} has no project marker.`);
    const held = (await readFile(marker, "utf8"))
      .split(/\r\n?|\n/)
      .find((line) => line.startsWith("Project id:"))
      ?.slice("Project id:".length)
      .trim();
    if (held === undefined || held === "" || held !== projectId.trim()) {
      throw new Error(`${path} is not the project that was chosen.`);
    }
    await rm(path, { recursive: true });
  },
};

/**
 * A temporary folder standing in for the default location, and the call that
 * removes it again.
 */
export function temporaryDirectory(): { path: string; remove: () => void } {
  const path = mkdtempSync(join(tmpdir(), "write-ist-test-"));
  return { path, remove: () => rmSync(path, { recursive: true, force: true }) };
}
