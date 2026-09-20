/**
 * The `Filesystem` port over `node:fs`, so the disk tests use real files.
 *
 * This is test support rather than production code: the application reaches
 * the disk through Tauri's filesystem plugin, in `app/src/tauri-filesystem.ts`.
 * Both implement the same four methods, and everything worth testing lives
 * above them in `src/project/`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DirectoryEntry, Filesystem } from "../../src/project/filesystem.ts";

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
    // Temp, then rename: the rename is atomic within a filesystem, so a
    // reader never sees a half-written file (ADR-0008 rule 5).
    const temporary = `${path}.writing`;
    await writeFile(temporary, bytes);
    await rename(temporary, path);
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
