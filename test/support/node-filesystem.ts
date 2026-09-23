/**
 * The `Filesystem` port over `node:fs`, so the disk tests use real files.
 *
 * This is test support rather than production code: the application reaches
 * the disk through Tauri's filesystem plugin, in `app/src/tauri-filesystem.ts`.
 * Both implement the same four methods, and everything worth testing lives
 * above them in `src/project/`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
};

/**
 * A temporary folder standing in for the default location, and the call that
 * removes it again.
 */
export function temporaryDirectory(): { path: string; remove: () => void } {
  const path = mkdtempSync(join(tmpdir(), "write-ist-test-"));
  return { path, remove: () => rmSync(path, { recursive: true, force: true }) };
}
