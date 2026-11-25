/**
 * The project's notes folder (`src/notes/notes-folder.ts`): which notes there
 * are, what a new or renamed note is called — made safe and numbered quietly —
 * making, renaming and deleting one, and bringing an old `notes.md` in. Real
 * files in a temporary folder, through the same port the application uses.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Project } from "../../src/project/bundle.ts";
import {
  bringInLegacyNotes,
  createNote,
  deleteNote,
  freeNoteName,
  listNotes,
  nameForRename,
  notePath,
  NOTES_FILES,
  renameNoteFile,
  safeNoteName,
} from "../../src/notes/notes-folder.ts";
import type { Filesystem } from "../../src/project/filesystem.ts";
import { workspaceFiles } from "../../src/project/workspace-files.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

let temporary: { path: string; remove: () => void };
let project: Project;
const notes = () => join(project.path, "notes");
beforeEach(() => {
  temporary = temporaryDirectory();
  const path = join(temporary.path, "Brick & Steel");
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "project.md"), "# Brick & Steel\n\nProject id: id-brick\n");
  project = { path, marker: { name: "Brick & Steel", projectId: "id-brick" } } as Project;
});
afterEach(() => temporary.remove());

/** Notes' files, as the toolbox hands them to Notes: only what its manifest declares. */
const files = (filesystem: Filesystem = nodeFilesystem) => workspaceFiles({ filesystem, project: () => project, declared: NOTES_FILES });

describe("a note's name", () => {
  it("is what was typed, made safe for every disk, quietly", () => {
    expect(safeNoteName("Ideas")).toBe("Ideas");
    expect(safeNoteName("  Ferry,   at night  ")).toBe("Ferry, at night");
    expect(safeNoteName('Act 1: the "plan"? <draft> a/b\\c|d*')).toBe("Act 1 the plan draft abcd");
    expect(safeNoteName("Ideas.md")).toBe("Ideas");
    expect(safeNoteName("Ideas.MD")).toBe("Ideas");
    expect(safeNoteName("...hidden")).toBe("hidden");
    expect(safeNoteName("trailing. . ")).toBe("trailing");
    expect(safeNoteName("tab\there\nnewline")).toBe("tab here newline");
    expect(safeNoteName("CON")).toBe("CON note");
    expect(safeNoteName("nul.txt")).toBe("nul.txt note");
    expect(safeNoteName("CONSOLE")).toBe("CONSOLE");
    expect(safeNoteName("")).toBe("Untitled");
    expect(safeNoteName("///")).toBe("Untitled");
    expect(safeNoteName("x".repeat(300))).toHaveLength(120);
  });

  it("is numbered when another note has it, without regard to case", () => {
    expect(freeNoteName("Untitled", [])).toBe("Untitled");
    expect(freeNoteName("Untitled", ["Untitled"])).toBe("Untitled 2");
    expect(freeNoteName("Untitled", ["untitled", "Untitled 2", "UNTITLED 3"])).toBe("Untitled 4");
    expect(freeNoteName("Ideas", ["Ideas 2"])).toBe("Ideas");
  });
});

describe("the notes folder", () => {
  it("is no notes at all when it is not there yet", async () => {
    expect(await listNotes(files())).toEqual([]);
    expect(existsSync(notes())).toBe(false);
  });

  it("lists its Markdown files by name, as a person orders them, and nothing else", async () => {
    mkdirSync(join(notes(), "A folder.md"), { recursive: true });
    for (const file of ["b.md", "Untitled 10.md", "Untitled 2.md", "a.MD", ".hidden.md", "draft.txt", ".md", "Ideas.md.writing-4"]) {
      writeFileSync(join(notes(), file), "");
    }
    expect(await listNotes(files())).toEqual(["a", "b", "Untitled 2", "Untitled 10"]);
  });

  it("makes new notes as Untitled, Untitled 2, …, empty, and in the folder at once", async () => {
    expect(await createNote(files())).toBe("Untitled");
    expect(await createNote(files())).toBe("Untitled 2");
    expect(await createNote(files())).toBe("Untitled 3");
    expect(readdirSync(notes()).sort()).toEqual(["Untitled 2.md", "Untitled 3.md", "Untitled.md"]);
    expect(readFileSync(join(notes(), "Untitled.md"), "utf8")).toBe("");
  });

  it("renames a note and its file, made safe and numbered, and never over another note", async () => {
    mkdirSync(notes());
    writeFileSync(join(notes(), "Untitled.md"), "The ferry crosses at night.");
    writeFileSync(join(notes(), "Ferry.md"), "Another note.");
    // Taken: numbered quietly.
    const to = await nameForRename(files(), "Untitled", "ferry");
    expect(to).toBe("ferry 2");
    await renameNoteFile(files(), "Untitled", to);
    expect(readdirSync(notes()).sort()).toEqual(["Ferry.md", "ferry 2.md"]);
    expect(readFileSync(join(notes(), "ferry 2.md"), "utf8")).toBe("The ferry crosses at night.");
    expect(readFileSync(join(notes(), "Ferry.md"), "utf8")).toBe("Another note.");
    // Only its own name: nothing to do. Only the case: its own name is not taken.
    expect(await nameForRename(files(), "Ferry", "Ferry.md")).toBe("Ferry");
    expect(await nameForRename(files(), "Ferry", "FERRY")).toBe("FERRY");
    // And the port itself never replaces a file, whatever it is asked.
    await expect(
      nodeFilesystem.moveFile(join(project.path, notePath("ferry 2")), join(project.path, notePath("Ferry"))),
    ).rejects.toThrow();
    expect(readFileSync(join(notes(), "Ferry.md"), "utf8")).toBe("Another note.");
  });

  it("deletes a note's file and nothing else", async () => {
    mkdirSync(notes());
    writeFileSync(join(notes(), "Ideas.md"), "Gone soon.");
    writeFileSync(join(notes(), "Keep.md"), "Stays.");
    await deleteNote(files(), "Ideas");
    expect(readdirSync(notes())).toEqual(["Keep.md"]);
    // Notes' files delete only what is in the notes folder…
    await expect(files().remove("project.md")).rejects.toThrow();
    await expect(files().remove("notes.md")).rejects.toThrow();
    await expect(files().remove("notes/../project.md")).rejects.toThrow();
    // …and the port only a file directly in a project's folder of the name it is given.
    await expect(nodeFilesystem.removeWorkspaceFile(join(project.path, "project.md"), "notes")).rejects.toThrow();
    await expect(nodeFilesystem.removeWorkspaceFile(join(notes(), "Absent.md"), "notes")).rejects.toThrow();
    await expect(nodeFilesystem.removeWorkspaceFile(join(notes(), "Keep.md"), "plan")).rejects.toThrow();
    expect(existsSync(join(project.path, "project.md"))).toBe(true);
  });
});

describe("an old notes.md", () => {
  it("is moved into the folder as Notes, once, exactly as it was", async () => {
    const bytes = "﻿# Ideas\r\n**The ferry** crosses at night.\r\n";
    writeFileSync(join(project.path, "notes.md"), bytes);
    expect(await bringInLegacyNotes(files())).toBe("Notes");
    expect(existsSync(join(project.path, "notes.md"))).toBe(false);
    expect(readFileSync(join(notes(), "Notes.md"), "utf8")).toBe(bytes);
    // Nothing left to bring in.
    expect(await bringInLegacyNotes(files())).toBeUndefined();
    expect(readdirSync(notes())).toEqual(["Notes.md"]);
  });

  it("never replaces a note already called Notes: it takes the next free name, and both are kept", async () => {
    mkdirSync(notes());
    writeFileSync(join(notes(), "Notes.md"), "Already in the folder.");
    writeFileSync(join(project.path, "notes.md"), "From before the folder.");
    expect(await bringInLegacyNotes(files())).toBe("Notes 2");
    expect(readFileSync(join(notes(), "Notes.md"), "utf8")).toBe("Already in the folder.");
    expect(readFileSync(join(notes(), "Notes 2.md"), "utf8")).toBe("From before the folder.");
  });

  it("stays where it is when the move fails, and is tried again next time", async () => {
    writeFileSync(join(project.path, "notes.md"), "Still here.");
    const refusing = { ...nodeFilesystem, moveFile: () => Promise.reject(new Error("The disk said no.")) };
    await expect(bringInLegacyNotes(files(refusing))).rejects.toThrow("The disk said no.");
    expect(readFileSync(join(project.path, "notes.md"), "utf8")).toBe("Still here.");
    expect(await bringInLegacyNotes(files())).toBe("Notes");
  });
});
