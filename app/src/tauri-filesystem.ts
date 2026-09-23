/**
 * The `Filesystem` port over Tauri's filesystem plugin.
 *
 * This is the only file in the application that knows the disk is reached
 * through Tauri. Everything the import and the projects list actually do lives
 * in `src/project/`, above the port, where the tests reach it through
 * `node:fs` and real files in a temporary folder.
 */
import { exists, mkdir, readDir, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { documentDir, join } from "@tauri-apps/api/path";
import type { DirectoryEntry, Filesystem } from "../../src/project/filesystem.ts";

/**
 * The number of the last write begun.
 *
 * Starts from the time rather than from nought, so that a webview reloaded
 * under a shell that is still running numbers its writes above the ones the
 * shell has already seen land.
 */
let written = Date.now();

export const tauriFilesystem: Filesystem = {
  async readDirectory(path: string): Promise<readonly DirectoryEntry[]> {
    // Absent reads as empty: a writer who has never imported anything has no
    // default location yet, and that is a first run rather than an error.
    if (!(await exists(path))) return [];
    const entries = await readDir(path);
    return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory }));
  },

  async readFile(path: string): Promise<Uint8Array> {
    // Rejects when the file cannot be read, and never resolves to empty bytes
    // — ADR-0008 rule 3, the exact failure that cost v1 its highlights.
    return readFile(path);
  },

  async writeFile(path: string, bytes: Uint8Array): Promise<void> {
    // **Temp, flush, rename** (ADR-0008 rule 5), and all three words matter.
    // The rename is atomic within a filesystem, so a reader — another tool, or
    // Write-ist next time — never sees a half-written manuscript. The flush is
    // what makes that true after a power cut rather than only after a crash,
    // and the plugin has no call for it, so the last two steps are one command
    // in `src-tauri/src/lib.rs`. The bytes do not cross that boundary: the
    // plugin writes the temporary file, and the command only finishes it.
    //
    // **Every write is numbered, and has a temporary file of its own.** The
    // save routine gives up on a write the disk has not answered (#64), and
    // the write carries on regardless. Its own file means a later write cannot
    // overwrite it half-way through, and its number means that if it lands
    // late, the command throws it away instead of putting older words over newer.
    const sequence = ++written;
    const temporary = `${path}.writing-${sequence}`;
    await writeFile(temporary, bytes);
    await invoke("commit_write", { temporary, path, sequence });
  },

  async createDirectory(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  },
};

/** The folder inside `Documents` that holds every project (ADR-0016). */
export const PROJECTS_FOLDER = "write-ist";

/**
 * `~/Documents/write-ist/` (ADR-0016) — the place the writer never has to
 * think about.
 *
 * Resolved through Tauri rather than built from `$HOME`, so that the folder is
 * the platform's own Documents directory on each of the three.
 */
export async function defaultProjectsDirectory(): Promise<string> {
  return join(await documentDir(), PROJECTS_FOLDER);
}
