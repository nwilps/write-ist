/**
 * Deleting and renaming a project, with real files in a temporary folder.
 *
 * Deleting is a move into the `Graveyard`, never an erase: what is checked
 * is that every byte arrives, that nothing already there is replaced, and that
 * a move that fails leaves the project where it was. Every project here is
 * made up.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FORMER_GRAVEYARD_FOLDER, GRAVEYARD_FOLDER, MANUSCRIPT_FILE, MARKER_FILE, type Project } from "../../src/project/bundle.ts";
import { createProject } from "../../src/project/create.ts";
import { CannotDelete, deleteProject, graveyardIn, moveDeletedProjectsToGraveyard } from "../../src/project/delete.ts";
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
    type: "Feature",
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

/** A project whose folder has some other name, as one from before a name was kept would. */
async function renameFolderTo(project: Project, folder: string): Promise<Project> {
  const path = join(projects, folder);
  await nodeFilesystem.moveFolder(project.path, path);
  return { ...project, path };
}

const names = async () => (await listProjects(nodeFilesystem, projects)).projects.map((p) => p.marker.name);

describe("deleteProject", () => {
  it("moves the whole bundle into the Graveyard, unchanged, and out of the list", async () => {
    const boats = await make("Paper Boats");
    await make("Quiet Road");
    // Something of the writer's beside the manuscript, which must travel too.
    mkdirSync(join(boats.path, "drafts"));
    writeFileSync(join(boats.path, "drafts", "1.fountain"), "INT. HOUSE - DAY\n");
    const before = contents(boats.path);

    const to = await deleteProject(nodeFilesystem, projects, boats);

    expect(to).toBe(join(projects, GRAVEYARD_FOLDER, "Paper Boats"));
    expect(graveyardIn(projects)).toBe(join(projects, "Graveyard"));
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

    expect(secondTo).toBe(join(projects, GRAVEYARD_FOLDER, "Paper Boats 2"));
    expect(contents(firstTo)).toEqual(firstBytes);
    expect(readFileSync(join(secondTo, MANUSCRIPT_FILE), "utf8")).toBe("Title: The second one\n");
  });

  it("never lands on anything already there — an empty folder, or a file — and numbers past it", async () => {
    const boats = await make("Paper Boats");
    mkdirSync(join(projects, GRAVEYARD_FOLDER, "Paper Boats"), { recursive: true });
    writeFileSync(join(projects, GRAVEYARD_FOLDER, "Paper Boats 2"), "a file of the writer's");

    const to = await deleteProject(nodeFilesystem, projects, boats);

    expect(to).toBe(join(projects, GRAVEYARD_FOLDER, "Paper Boats 3"));
    expect(readdirSync(join(projects, GRAVEYARD_FOLDER, "Paper Boats"))).toEqual([]);
    expect(readFileSync(join(projects, GRAVEYARD_FOLDER, "Paper Boats 2"), "utf8")).toBe("a file of the writer's");
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

    expect(to).toBe(join(projects, GRAVEYARD_FOLDER, "Paper Boats 2"));
    expect(readFileSync(join(projects, GRAVEYARD_FOLDER, "Paper Boats", "someone else's"), "utf8")).toBe("x");
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
    expect(readdirSync(join(projects, GRAVEYARD_FOLDER))).toEqual([]);
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

  it("refuses when a project already sits where the Graveyard goes", async () => {
    const boats = await make("Paper Boats");
    // Made by hand, as an old project of that name would be.
    mkdirSync(join(projects, GRAVEYARD_FOLDER));
    writeFileSync(join(projects, GRAVEYARD_FOLDER, MARKER_FILE), "# Graveyard\n");

    await expect(deleteProject(nodeFilesystem, projects, boats)).rejects.toBeInstanceOf(CannotDelete);
    expect(await nodeFilesystem.exists(join(boats.path, MANUSCRIPT_FILE))).toBe(true);
  });

  it("keeps the name for itself: a new project called Graveyard is numbered", async () => {
    expect((await make("Graveyard")).marker.name).toBe("Graveyard 2");
  });

  it("lets a project already called Graveyard be renamed out of the way, and then deletes", async () => {
    const boats = await make("Paper Boats");
    const old = await make("Old One");
    const squatter = await renameFolderTo(old, GRAVEYARD_FOLDER);

    await expect(deleteProject(nodeFilesystem, projects, boats)).rejects.toThrow(/Rename that project first/);
    await renameProject(nodeFilesystem, projects, squatter, "Cemetery Story");

    expect(await deleteProject(nodeFilesystem, projects, boats)).toBe(join(projects, GRAVEYARD_FOLDER, "Paper Boats"));
    expect(await names()).toEqual(["Cemetery Story"]);
  });

  it("will not act on the Graveyard as if it were a project", async () => {
    const boats = await make("Paper Boats");
    await deleteProject(nodeFilesystem, projects, boats);
    const graveyard = { ...boats, path: graveyardIn(projects) };

    await expect(deleteProject(nodeFilesystem, projects, graveyard)).rejects.toBeInstanceOf(CannotDelete);
    await expect(renameProject(nodeFilesystem, projects, graveyard, "Elsewhere")).rejects.toBeInstanceOf(CannotRename);
    expect(readdirSync(graveyardIn(projects))).toEqual(["Paper Boats"]);
  });
});

describe("moveDeletedProjectsToGraveyard", () => {
  const former = () => join(projects, FORMER_GRAVEYARD_FOLDER);
  const graveyard = () => graveyardIn(projects);
  const move = () => moveDeletedProjectsToGraveyard(nodeFilesystem, projects);

  /** A deleted project in `folder`: a folder holding a manuscript that says `words`. */
  function buried(folder: string, name: string, words: string): void {
    mkdirSync(join(folder, name), { recursive: true });
    writeFileSync(join(folder, name, MANUSCRIPT_FILE), words);
  }
  const manuscript = (name: string) => readFileSync(join(graveyard(), name, MANUSCRIPT_FILE), "utf8");

  it("does nothing when there is no old folder, or no projects folder at all", async () => {
    await move();
    expect(existsSync(projects)).toBe(false);
    await make("Paper Boats");
    await move();
    expect(readdirSync(projects)).toEqual(["Paper Boats"]);
  });

  it("renames the old folder when there is no Graveyard, keeping everything in it", async () => {
    buried(former(), "Paper Boats", "the boats\n");
    writeFileSync(join(former(), "a note"), "kept");
    const before = contents(former());

    await move();

    expect(existsSync(former())).toBe(false);
    expect(contents(graveyard())).toEqual(before);
  });

  it("merges into a Graveyard that exists, numbering a clash and replacing nothing", async () => {
    buried(former(), "Paper Boats", "the older boats\n");
    buried(former(), "Quiet Road", "the road\n");
    buried(graveyard(), "Paper Boats", "the newer boats\n");

    await move();

    expect(existsSync(former())).toBe(false);
    expect(readdirSync(graveyard()).sort()).toEqual(["Paper Boats", "Paper Boats 2", "Quiet Road"]);
    expect(manuscript("Paper Boats")).toBe("the newer boats\n");
    expect(manuscript("Paper Boats 2")).toBe("the older boats\n");
    expect(manuscript("Quiet Road")).toBe("the road\n");
  });

  it("carries loose files across inside the old folder, since only folders move", async () => {
    buried(former(), "Paper Boats", "the boats\n");
    writeFileSync(join(former(), "a note"), "kept");
    mkdirSync(graveyard());

    await move();

    expect(existsSync(former())).toBe(false);
    expect(manuscript("Paper Boats")).toBe("the boats\n");
    expect(readFileSync(join(graveyard(), FORMER_GRAVEYARD_FOLDER, "a note"), "utf8")).toBe("kept");
  });

  it("finishes on the next run after stopping part way, losing nothing", async () => {
    buried(former(), "Paper Boats", "the boats\n");
    buried(former(), "Quiet Road", "the road\n");
    mkdirSync(graveyard());
    let moves = 0;
    const failing: Filesystem = {
      ...nodeFilesystem,
      moveFolder: (from, to) =>
        ++moves === 2 ? Promise.reject(new Error("the disk said no")) : nodeFilesystem.moveFolder(from, to),
    };

    await expect(moveDeletedProjectsToGraveyard(failing, projects)).rejects.toThrow("the disk said no");
    expect(readdirSync(former())).toHaveLength(1);
    expect(readdirSync(graveyard())).toHaveLength(1);

    await move();
    await move();
    expect(existsSync(former())).toBe(false);
    expect(readdirSync(graveyard()).sort()).toEqual(["Paper Boats", "Quiet Road"]);
  });

  it("leaves a project called Deleted Projects alone: it is a project", async () => {
    const project = await renameFolderTo(await make("Old One"), FORMER_GRAVEYARD_FOLDER);
    const before = contents(project.path);

    await move();

    expect(contents(project.path)).toEqual(before);
    expect(existsSync(graveyard())).toBe(false);
    expect(await names()).toEqual(["Old One"]);
  });

  it("moves nothing into a project called Graveyard", async () => {
    await renameFolderTo(await make("Old One"), GRAVEYARD_FOLDER);
    buried(former(), "Paper Boats", "the boats\n");
    const before = contents(projects);

    await move();

    expect(contents(projects)).toEqual(before);
  });

  it("leaves a file called Deleted Projects alone", async () => {
    mkdirSync(projects);
    writeFileSync(former(), "a file of the writer's");

    await move();

    expect(readFileSync(former(), "utf8")).toBe("a file of the writer's");
    expect(existsSync(graveyard())).toBe(false);
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

  it("refuses an empty name, a hidden one, and the Graveyard's", async () => {
    const boats = await make("Paper Boats");
    for (const name of ["   ", ".secret", "graveyard"]) {
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

describe("removeEmptyFolder, the port's promise", () => {
  it("removes an empty folder and refuses one with anything in it", async () => {
    const boats = await make("Paper Boats");
    const empty = join(projects, "Empty");
    mkdirSync(empty);
    const before = contents(boats.path);

    await expect(nodeFilesystem.removeEmptyFolder(boats.path)).rejects.toThrow();
    await nodeFilesystem.removeEmptyFolder(empty);

    expect(contents(boats.path)).toEqual(before);
    expect(existsSync(empty)).toBe(false);
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
