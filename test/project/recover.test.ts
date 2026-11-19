/**
 * The Graveyard, read and undone (Settings ▸ Graveyard), with real files in a
 * temporary folder. Recovering is a move back, never a copy: what is checked is
 * that every byte arrives, that nothing in the projects folder is replaced, and
 * that only a project in the Graveyard is ever moved. Every project here is
 * made up.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GRAVEYARD_FOLDER, MARKER_FILE, type Project } from "../../src/project/bundle.ts";
import { createProject } from "../../src/project/create.ts";
import { deleteProject, graveyardIn } from "../../src/project/delete.ts";
import { listProjects } from "../../src/project/projects.ts";
import { CannotRecover, listGraveyard, recoverProject } from "../../src/project/recover.ts";
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
  createProject({ filesystem: nodeFilesystem, newProjectId: () => `id-${++minted}` }, projects, { title, type: "Feature" });
const bury = async (title: string): Promise<Project> => {
  const project = await make(title);
  return { ...project, path: await deleteProject(nodeFilesystem, projects, project) };
};

/** Every file under a folder, with its text. */
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

const listed = async () => (await listProjects(nodeFilesystem, projects)).projects.map((p) => p.marker.name);
const buried = async () => (await listGraveyard(nodeFilesystem, projects)).map((p) => p.marker.name);

describe("listGraveyard", () => {
  it("is empty before anything has been deleted, and makes no Graveyard to say so", async () => {
    expect(await listGraveyard(nodeFilesystem, projects)).toEqual([]);
    expect(await nodeFilesystem.exists(graveyardIn(projects))).toBe(false);
  });

  it("lists the projects in the Graveyard by name, and nothing that is not one", async () => {
    await bury("Quiet Road");
    await bury("Paper Boats");
    await make("Still Here");
    // Not projects: loose files, a folder with no marker, a hidden folder.
    writeFileSync(join(graveyardIn(projects), "notes.txt"), "a loose file\n");
    mkdirSync(join(graveyardIn(projects), "Deleted Projects"));
    mkdirSync(join(graveyardIn(projects), ".cache"));
    // A project whose marker will not read is left where it is, unlisted.
    mkdirSync(join(graveyardIn(projects), "Torn"));
    writeFileSync(join(graveyardIn(projects), "Torn", MARKER_FILE), "not a marker\n");

    const graveyard = await listGraveyard(nodeFilesystem, projects);
    expect(graveyard.map((p) => p.marker.name)).toEqual(["Paper Boats", "Quiet Road"]);
    expect(graveyard[0]!.path).toBe(join(projects, GRAVEYARD_FOLDER, "Paper Boats"));
    expect(graveyard[0]!.marker.format).toBe("Feature");
  });
});

describe("recoverProject", () => {
  it("moves the whole bundle back, unchanged, into the list and out of the Graveyard", async () => {
    const boats = await bury("Paper Boats");
    mkdirSync(join(boats.path, "drafts"));
    writeFileSync(join(boats.path, "drafts", "1.fountain"), "INT. HARBOUR - DAY\n");
    const before = contents(boats.path);

    const back = await recoverProject(nodeFilesystem, projects, boats);

    expect(back.path).toBe(join(projects, "Paper Boats"));
    expect(back.marker).toEqual(boats.marker);
    expect(contents(back.path)).toEqual(before);
    expect(await listed()).toEqual(["Paper Boats"]);
    expect(await buried()).toEqual([]);
  });

  it("numbers it rather than replace a project of that name made since", async () => {
    const boats = await bury("Paper Boats");
    const newer = await make("Paper Boats");
    const newerBytes = contents(newer.path);

    const back = await recoverProject(nodeFilesystem, projects, boats);

    expect(back.path).toBe(join(projects, "Paper Boats 2"));
    expect(contents(newer.path)).toEqual(newerBytes);
    expect((await listProjects(nodeFilesystem, projects)).projects.map((p) => p.marker.projectId).sort()).toEqual(
      [boats.marker.projectId, newer.marker.projectId].sort(),
    );
  });

  it("never takes the Graveyard's own name, even for a folder of that name", async () => {
    const odd = await bury("Paper Boats");
    // A bundle buried under a folder name a project may no longer have.
    const renamed = { ...odd, path: join(graveyardIn(projects), "graveyard") };
    await nodeFilesystem.moveFolder(odd.path, renamed.path);
    const back = await recoverProject(nodeFilesystem, projects, renamed);
    expect(back.path).toBe(join(projects, "graveyard 2"));
  });

  it("refuses a project that is not in the Graveyard, and moves nothing", async () => {
    const live = await make("Still Here");
    await expect(recoverProject(nodeFilesystem, projects, live)).rejects.toThrow(CannotRecover);
    // Nor one deeper inside it, nor one reached by a path that climbs out.
    const boats = await bury("Paper Boats");
    const deeper = { ...boats, path: join(graveyardIn(projects), "Paper Boats", "drafts") };
    await expect(recoverProject(nodeFilesystem, projects, deeper)).rejects.toThrow(CannotRecover);
    const climbing = { ...boats, path: join(graveyardIn(projects), "..", "Still Here") };
    await expect(recoverProject(nodeFilesystem, projects, climbing)).rejects.toThrow(CannotRecover);
    expect(await listed()).toEqual(["Still Here"]);
    expect(await buried()).toEqual(["Paper Boats"]);
  });

  it("refuses a folder that has changed since the Graveyard was read", async () => {
    const boats = await bury("Paper Boats");
    const someoneElse = { ...boats, marker: { ...boats.marker, projectId: "id-not-this-one" } };
    await expect(recoverProject(nodeFilesystem, projects, someoneElse)).rejects.toThrow(/changed on disk/);
    expect(await buried()).toEqual(["Paper Boats"]);
  });
});
