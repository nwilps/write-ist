/**
 * The project's notes: plain-text `.md` files in its `notes/` folder, one file
 * a note (ADR-0025, amended 2026-11-23). What the writer types is what the
 * file holds — no formatting, nothing drawn as Markdown.
 *
 * Everything here is about the folder and the names in it — which notes there
 * are, what a new one or a renamed one is called, and the disk work of making,
 * renaming and deleting one. What is *in* a note is the notes session's
 * (`notes-session.ts`), which reads and saves it as any workspace file is.
 *
 * ## Names
 *
 * A note's name is its file's name without `.md`, and the writer sees only the
 * name. Whatever they type for one is made safe for every disk **quietly**:
 * characters no system allows in a file name are dropped, so are leading dots
 * (a hidden file would vanish from the folder) and trailing dots and spaces
 * (Windows drops them itself), and a name Windows keeps for a device (`CON`,
 * `NUL`, `COM1`…) gets ` note` after it. Nothing is left: it is `Untitled`. A
 * name already taken, in any case, gets the next free number — `Untitled 2`,
 * `Untitled 3` — as two imports of one title do. Nothing is ever said about
 * any of it; the tab simply shows the name the note got.
 *
 * ## The old `notes.md`
 *
 * Before 2026-11-23 a project had one note, `notes.md`, at the top of its
 * folder. It is brought into `notes/` the first time Notes opens, **moved, not
 * copied**, so there is never a second copy to drift: to `notes/Notes.md`, or
 * `Notes 2.md` and on if that is taken. A move never replaces anything
 * (`Filesystem.moveFile`), so a project that has both keeps both. If the move
 * fails, `notes.md` stays where it is and the move is tried again next time.
 */
import type { Project } from "../project/bundle.ts";
import { join, type Filesystem } from "../project/filesystem.ts";

/** The folder in a project that holds its notes. */
export const NOTES_FOLDER = "notes";

/** A note's file ends with this, and its name is the rest. */
export const NOTE_EXTENSION = ".md";

/** Where a project's one note was kept before the folder (ADR-0025's first version). */
export const LEGACY_NOTES_FILE = "notes.md";

/** What a note is called when it has no name of its own, and what the old `notes.md` becomes. */
export const UNTITLED_NOTE = "Untitled";
export const LEGACY_NOTE_NAME = "Notes";

/** The longest a name is kept to, in characters, well inside every system's limit for a file name. */
const LONGEST_NAME = 120;

/** Names Windows keeps for devices, whatever follows the dot. */
const DEVICE_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** A note's path inside the project's folder, from its name. */
export const notePath = (name: string): string => `${NOTES_FOLDER}/${name}${NOTE_EXTENSION}`;

/** Whether a file in the notes folder is a note: Markdown, and not hidden. */
export const isNoteFile = (file: string): boolean =>
  file.toLowerCase().endsWith(NOTE_EXTENSION) && !file.startsWith(".") && file.length > NOTE_EXTENSION.length;

/** A note's name, from its file's. */
export const nameOfNote = (file: string): string => file.slice(0, file.length - NOTE_EXTENSION.length);

/**
 * The name a note gets for what the writer typed: safe for every disk, never
 * empty. `.md` typed at the end is taken as the extension, not the name.
 */
export function safeNoteName(typed: string): string {
  let name = typed
    .normalize("NFC")
    // A tab or a line break is a space between words…
    .replace(/\s+/g, " ")
    // …and characters no system allows in a file name, and every other control character, are dropped.
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
  if (name.toLowerCase().endsWith(NOTE_EXTENSION)) name = name.slice(0, -NOTE_EXTENSION.length).trim();
  // Not hidden, and nothing Windows would drop from the end.
  name = name.replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
  if (name.length > LONGEST_NAME) name = name.slice(0, LONGEST_NAME).replace(/[.\s]+$/, "");
  if (DEVICE_NAMES.test(name.split(".")[0] ?? "")) name = `${name} note`;
  return name === "" ? UNTITLED_NOTE : name;
}

/**
 * `wanted`, or the first of `wanted 2`, `wanted 3`… that no note in `taken`
 * has, compared without case — two names one disk would see as the same are
 * the same.
 */
export function freeNoteName(wanted: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((name) => name.toLowerCase()));
  if (!used.has(wanted.toLowerCase())) return wanted;
  for (let number = 2; ; number++) {
    const candidate = `${wanted} ${number}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** Sorted as a person reads a list: without case, numbers by their value. */
const byName = new Intl.Collator("en", { sensitivity: "base", numeric: true }).compare;

/** The project's notes, by name, in order. An absent folder is no notes yet. */
export async function listNotes(filesystem: Filesystem, project: Project): Promise<string[]> {
  const entries = await filesystem.readDirectory(join(project.path, NOTES_FOLDER));
  return entries
    .filter((entry) => !entry.isDirectory && isNoteFile(entry.name))
    .map((entry) => nameOfNote(entry.name))
    .sort(byName);
}

/**
 * Make a new, empty note, named `Untitled` or the next free number, and answer
 * its name. It is written at once, so it is in the folder menu from the start.
 */
export async function createNote(filesystem: Filesystem, project: Project): Promise<string> {
  await filesystem.createDirectory(join(project.path, NOTES_FOLDER));
  const name = freeNoteName(UNTITLED_NOTE, await listNotes(filesystem, project));
  const path = join(project.path, notePath(name));
  // Asked again just before: a note made elsewhere a moment ago is never written over.
  if (await filesystem.exists(path)) throw new Error(`${name}${NOTE_EXTENSION} appeared in the notes folder just now.`);
  await filesystem.writeFile(path, new Uint8Array());
  return name;
}

/**
 * The name a note renamed to `typed` gets: made safe, and numbered if another
 * note has it. Answers the note's own name when that is what it comes to.
 */
export async function nameForRename(filesystem: Filesystem, project: Project, from: string, typed: string): Promise<string> {
  const wanted = safeNoteName(typed);
  if (wanted === from) return from;
  const others = (await listNotes(filesystem, project)).filter((name) => name !== from);
  // Only the case changed: the note's own name is not "taken".
  return freeNoteName(wanted, others);
}

/** Move a note's file to its new name. Never over another file (`Filesystem.moveFile`). */
export async function renameNoteFile(filesystem: Filesystem, project: Project, from: string, to: string): Promise<void> {
  if (from === to) return;
  await filesystem.moveFile(join(project.path, notePath(from)), join(project.path, notePath(to)));
}

/** Delete a note's file, for good (`Filesystem.removeNote`). */
export async function deleteNote(filesystem: Filesystem, project: Project, name: string): Promise<void> {
  await filesystem.removeNote(join(project.path, notePath(name)));
}

/**
 * Bring an old `notes.md` into the notes folder, once. Answers the name it was
 * given there, or `undefined` when there was none to bring. Rejects if it is
 * there and could not be moved; it is then where it was.
 */
export async function bringInLegacyNotes(filesystem: Filesystem, project: Project): Promise<string | undefined> {
  const legacy = join(project.path, LEGACY_NOTES_FILE);
  if (!(await filesystem.exists(legacy))) return undefined;
  await filesystem.createDirectory(join(project.path, NOTES_FOLDER));
  const name = freeNoteName(LEGACY_NOTE_NAME, await listNotes(filesystem, project));
  await filesystem.moveFile(legacy, join(project.path, notePath(name)));
  return name;
}
