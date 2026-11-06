/**
 * Deleting and renaming a project, with real files in a temporary folder.
 *
 * Deleting is a move into `Deleted Projects`, never an erase: what is checked
 * is that every byte arrives, that nothing already there is replaced, and that
 * a move that fails leaves the project where it was. Every project here is
 * made up.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETED_FOLDER, MANUSCRIPT_FILE, MARKER_FILE } from "../../src/project/bundle.ts";
import { createProject } from "../../src/project/create.ts";
import { CannotDelete, deleteProject, deletedFolderIn } from "../../src/project/delete.ts";
import { CannotRename, renameProject } from "../../src/project/rename.ts";
import { listProjects } from "../../src/project/projects.ts";
import { parseMarker } from "../../src/project/marker.ts";
import type { Filesystem } from "../../src/project/filesystem.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

let temporary: { path: string; remove: () => void };
let projects: string;

beforeEach(() => {
  temporary = temporaryDirectory();
  projects = join(temporary.path, "write-ist");
});
afterEach(() => temporary.remove());

let minted = 0;
const make = (title: string) =>
  createProject({ filesystem: nodeFilesystem, newProjectId: () => `id-${++minted}` }, projects, {
    title,
    type: "Screenplay",
  });

/** Every file under a folder, with its text, so a move can be checked byte for byte. */
function contents(folder: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const entry of readdirSync(folder, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      found[path.slice(folder.length)] = readFileSync(path, "utf8");
    }
  }
  return found;
}

const names = async () => (await listProjects(nodeFilesystem, projects)).projects.map((p) => p.marker.name);

describe("deleteProject", () => {
  it("moves the whole bundle into Deleted Projects, unchanged, and out of the list", async () => {
    const boats = await make("Paper Boats");
    await make("Quiet Road");
    // Something of the writer's beside the manuscript, which must travel too.
    mkdirSync(join(boats.path, "drafts"));
    writeFileSync(join(boats.path, "drafts", "1.fountain"), "INT. HOUSE - DAY\n");
    const before = contents(boats.path);

    const to = await deleteProject(nodeFilesystem, projects, boats);

    expect(to).toBe(join(projects, DELETED_FOLDER, "Paper Boats"));
    expect(deletedFolderIn(projects)).toBe(join(projects, "Deleted Projects"));
    expect(contents(to)).toEqual(before);
    expect(await nodeFilesystem.exists(boats.path)).toBe(false);
    expect(await names()).toEqual(["Quiet Road"]);
    // Still a project, with the same id: moving it back is all recovery takes.
    expect(parseMarker(readFileSync(join(to, MARKER_FILE), "utf8"))?.projectId).toBe(boats.marker.projectId);
  });

  it("is recovered by moving the folder back", async () => {
    const boats = await make("Paper Boats");
    const to = await deleteProject(nodeFilesystem, projects, boats);

    await nodeFilesystem.moveFolder(to, boats.path);

    expect(await names()).toEqual(["Paper Boats"]);
  });

  it("numbers a second deletion of the same name, and never replaces the first", async () => {
    const first = await make("Paper Boats");
    const firstTo = await deleteProject(nodeFilesystem, projects, first);
    const firstBytes = contents(firstTo);
    const second = await make("Paper Boats");
    writeFileSync(join(second.path, MANUSCRIPT_FILE), "Title: The second one\n");

    const secondTo = await deleteProject(nodeFilesystem, projects, second);

    expect(secondTo).toBe(join(projects, DELETED_FOLDER, "Paper Boats 2"));
    expect(contents(firstTo)).toEqual(firstBytes);
    expect(readFileSync(join(secondTo, MANUSCRIPT_FILE), "utf8")).toBe("Title: The second one\n");
  });

  it("never lands on anything already there — an empty folder, or a file — and numbers past it", async () => {
    const boats = await make("Paper Boats");
    mkdirSync(join(projects, DELETED_FOLDER, "Paper Boats"), { recursive: true });
    writeFileSync(join(projects, DELETED_FOLDER, "Paper Boats 2"), "a file of the writer's");

    const to = await deleteProject(nodeFilesystem, projects, boats);

    expect(to).toBe(join(projects, DELETED_FOLDER, "Paper Boats 3"));
    expect(readdirSync(join(projects, DELETED_FOLDER, "Paper Boats"))).toEqual([]);
    expect(readFileSync(join(projects, DELETED_FOLDER, "Paper Boats 2"), "utf8")).toBe("a file of the writer's");
  });

  it("chooses again when the name is taken between choosing it and moving there", async () => {
    const boats = await make("Paper Boats");
    let raced = false;
    const racing: Filesystem = {
      ...nodeFilesystem,
      moveFolder: async (from, to) => {
        if (!raced) {
          raced = true;
          mkdirSync(to);
          writeFileSync(join(to, "someone else's"), "x");
        }
        return nodeFilesystem.moveFolder(from, to);
      },
    };

    const to = await deleteProject(racing, projects, boats);

    expect(to).toBe(join(projects, DELETED_FOLDER, "Paper Boats 2"));
    expect(readFileSync(join(projects, DELETED_FOLDER, "Paper Boats", "someone else's"), "utf8")).toBe("x");
  });

  it("leaves the project exactly where it was when the move fails", async () => {
    const boats = await make("Paper Boats");
    const before = contents(boats.path);
    const refusing: Filesystem = {
      ...nodeFilesystem,
      moveFolder: () => Promise.reject(new Error("the disk said no")),
    };

    await expect(deleteProject(refusing, projects, boats)).rejects.toThrow("the disk said no");

    expect(contents(boats.path)).toEqual(before);
    expect(await names()).toEqual(["Paper Boats"]);
    expect(readdirSync(join(projects, DELETED_FOLDER))).toEqual([]);
  });

  it("refuses a project that changed on disk since the list was read, moving nothing", async () => {
    const boats = await make("Paper Boats");
    const stale = { ...boats, marker: { ...boats.marker, projectId: "a different project" } };

    await expect(deleteProject(nodeFilesystem, projects, stale)).rejects.toBeInstanceOf(CannotDelete);
    await expect(
      deleteProject(nodeFilesystem, projects, { ...boats, path: join(temporary.path, "elsewhere") }),
    ).rejects.toBeInstanceOf(CannotDelete);
    expect(await nodeFilesystem.exists(join(boats.path, MANUSCRIPT_FILE))).toBe(true);
  });

  it("refuses when a project already sits where the deleted folder goes", async () => {
    const boats = await make("Paper Boats");
    // Made by hand, as an old project of that name would be.
    mkdirSync(join(projects, DELETED_FOLDER));
    writeFileSync(join(projects, DELETED_FOLDER, MARKER_FILE), "# Deleted Projects\n");

    await expect(deleteProject(nodeFilesystem, projects, boats)).rejects.toBeInstanceOf(CannotDelete);
    expect(await nodeFilesystem.exists(join(boats.path, MANUSCRIPT_FILE))).toBe(true);
  });

  it("keeps the name for itself: a new project called Deleted Projects is numbered", async () => {
    expect((await make("Deleted Projects")).marker.name).toBe("Deleted Projects 2");
  });
});

describe("renameProject", () => {
  it("renames the folder and the marker, keeps the id, and leaves the manuscript alone", async () => {
    const boats = await make("Paper Boats");
    const manuscript = readFileSync(join(boats.path, MANUSCRIPT_FILE), "utf8");

    const renamed = await renameProject(nodeFilesystem, projects, boats, "  Paper   Planes ");

    expect(renamed.path).toBe(join(projects, "Paper Planes"));
    expect(renamed.marker).toEqual({ ...boats.marker, name: "Paper Planes" });
    expect(parseMarker(readFileSync(join(renamed.path, MARKER_FILE), "utf8"))).toEqual(renamed.marker);
    expect(readFileSync(join(renamed.path, MANUSCRIPT_FILE), "utf8")).toBe(manuscript);
    expect(await nodeFilesystem.exists(boats.path)).toBe(false);
    expect(await names()).toEqual(["Paper Planes"]);
  });

  it("refuses a name another project has, in any case, and changes nothing", async () => {
    const boats = await make("Paper Boats");
    const road = await make("Quiet Road");
    const before = contents(projects);

    await expect(renameProject(nodeFilesystem, projects, boats, "quiet road")).rejects.toThrow(
      /already something called “Quiet Road”/,
    );

    expect(contents(projects)).toEqual(before);
    expect(await nodeFilesystem.exists(road.path)).toBe(true);
  });

  it("refuses an empty name, a hidden one, and the deleted folder's", async () => {
    const boats = await make("Paper Boats");
    for (const name of ["   ", ".secret", "deleted projects"]) {
      await expect(renameProject(nodeFilesystem, projects, boats, name)).rejects.toBeInstanceOf(CannotRename);
    }
    expect(await names()).toEqual(["Paper Boats"]);
  });

  it("changes only the case of its own name", async () => {
    const boats = await make("paper boats");
    const renamed = await renameProject(nodeFilesystem, projects, boats, "Paper Boats");
    expect(renamed.path).toBe(join(projects, "Paper Boats"));
    expect(await names()).toEqual(["Paper Boats"]);
  });

  it("does nothing for the name it already has", async () => {
    const boats = await make("Paper Boats");
    const moves: string[] = [];
    const watching: Filesystem = {
      ...nodeFilesystem,
      moveFolder: (from, to) => (moves.push(to), nodeFilesystem.moveFolder(from, to)),
    };
    expect(await renameProject(watching, projects, boats, "Paper Boats")).toBe(boats);
    expect(moves).toEqual([]);
  });

  it("makes a name safe for the disk as a new project's title is", async () => {
    const boats = await make("Paper Boats");
    expect((await renameProject(nodeFilesystem, projects, boats, "A/B: what?")).marker.name).toBe("A B what");
  });

  it("puts the folder back when the marker cannot be written, so nothing changed", async () => {
    const boats = await make("Paper Boats");
    const before = contents(boats.path);
    const refusing: Filesystem = {
      ...nodeFilesystem,
      writeFile: () => Promise.reject(new Error("the disk is full")),
    };

    await expect(renameProject(refusing, projects, boats, "Paper Planes")).rejects.toThrow("the disk is full");

    expect(contents(boats.path)).toEqual(before);
    expect(await nodeFilesystem.exists(join(projects, "Paper Planes"))).toBe(false);
  });

  it("refuses a project that changed on disk since the list was read", async () => {
    const boats = await make("Paper Boats");
    const stale = { ...boats, marker: { ...boats.marker, projectId: "someone else" } };
    await expect(renameProject(nodeFilesystem, projects, stale, "Paper Planes")).rejects.toBeInstanceOf(CannotRename);
    expect(await names()).toEqual(["Paper Boats"]);
  });
});

describe("moveFolder, the port's promise", () => {
  it("never replaces anything, not even an empty folder, and leaves both as they were", async () => {
    const boats = await make("Paper Boats");
    const road = await make("Quiet Road");
    const empty = join(projects, "Empty");
    mkdirSync(empty);
    const before = contents(projects);

    await expect(nodeFilesystem.moveFolder(boats.path, road.path)).rejects.toThrow();
    await expect(nodeFilesystem.moveFolder(boats.path, empty)).rejects.toThrow();
    await expect(nodeFilesystem.moveFolder(boats.path, join(boats.path, "inside"))).rejects.toThrow();

    expect(contents(projects)).toEqual(before);
    expect(readdirSync(empty)).toEqual([]);
  });
});
