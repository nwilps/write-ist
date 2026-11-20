/**
 * Exile: erasing one project in the Graveyard, for good (ADR-0044), with real
 * files in a temporary folder. What is checked is that exactly the chosen
 * bundle goes, that everything else is refused and left as it was, and that
 * the writer's ledger, which lives outside every bundle (ADR-0017), is not
 * touched. Every project and folder here is invented and temporary.
 */
import { mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GRAVEYARD_FOLDER, MARKER_FILE, type Project } from "../../src/project/bundle.ts";
import { createProject } from "../../src/project/create.ts";
import { deleteProject, graveyardIn } from "../../src/project/delete.ts";
import { CannotExile, exileProject } from "../../src/project/exile.ts";
import { LEDGER_FILE, openLedger } from "../../src/project/ledger.ts";
import { listProjects } from "../../src/project/projects.ts";
import { listGraveyard } from "../../src/project/recover.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

let temporary: { path: string; remove: () => void };
let projects: string;
let appData: string;

beforeEach(() => {
  temporary = temporaryDirectory();
  projects = join(temporary.path, "write-ist");
  appData = join(temporary.path, "app-data");
});
afterEach(() => temporary.remove());

let minted = 0;
const make = (title: string) =>
  createProject({ filesystem: nodeFilesystem, newProjectId: () => `id-${++minted}` }, projects, { title, type: "Feature" });
const bury = async (title: string): Promise<Project> => {
  const project = await make(title);
  return { ...project, path: await deleteProject(nodeFilesystem, projects, project) };
};
const buried = async () => (await listGraveyard(nodeFilesystem, projects)).map((p) => p.marker.name);

describe("exileProject", () => {
  it("erases the chosen project in the Graveyard, whole, and nothing else", async () => {
    const boats = await bury("Paper Boats");
    mkdirSync(join(boats.path, "drafts"));
    writeFileSync(join(boats.path, "drafts", "1.fountain"), "INT. HARBOUR - DAY\n");
    await bury("Quiet Road");
    await make("Still Here");

    await exileProject(nodeFilesystem, projects, boats);

    expect(await nodeFilesystem.exists(boats.path)).toBe(false);
    expect(await buried()).toEqual(["Quiet Road"]);
    expect((await listProjects(nodeFilesystem, projects)).projects.map((p) => p.marker.name)).toEqual(["Still Here"]);
    // The Graveyard and the projects folder stay.
    expect(readdirSync(graveyardIn(projects))).toEqual(["Quiet Road"]);
  });

  it("leaves the writer's ledger exactly as it was: history is the writer's, not the bundle's", async () => {
    const boats = await bury("Paper Boats");
    const ledger = openLedger(nodeFilesystem, appData, { now: () => new Date("2026-11-18T21:00:00Z") });
    await ledger.recordOpened();
    await ledger.recordDay(
      { id: boats.marker.projectId, name: "Paper Boats" },
      { titlePage: [], elements: [{ type: "action", text: "The tide comes in.", forced: false }], comments: [], endsWithNewline: true },
    );
    await ledger.recordClosed();
    const before = readFileSync(join(appData, LEDGER_FILE), "utf8");
    expect(before).toContain(`\t${boats.marker.projectId}\t`);

    await exileProject(nodeFilesystem, projects, boats);

    expect(await nodeFilesystem.exists(boats.path)).toBe(false);
    // Outside every bundle, so the project's days are all still there.
    expect(readFileSync(join(appData, LEDGER_FILE), "utf8")).toBe(before);
  });

  it("refuses a live project, the projects folder, the Graveyard and a folder outside it", async () => {
    const live = await make("Still Here");
    await bury("Paper Boats");
    const outside = join(temporary.path, "Elsewhere");
    mkdirSync(outside);
    writeFileSync(join(outside, MARKER_FILE), "# Elsewhere\n\nFormat version: 1\nProject id: id-else\nFormat: Feature\n");
    const as = (path: string, projectId = live.marker.projectId): Project => ({ path, marker: { ...live.marker, projectId } });

    for (const project of [live, as(projects), as(graveyardIn(projects)), as(outside, "id-else")]) {
      await expect(exileProject(nodeFilesystem, projects, project), project.path).rejects.toBeInstanceOf(CannotExile);
    }
    expect(await nodeFilesystem.exists(join(live.path, MARKER_FILE))).toBe(true);
    expect(await nodeFilesystem.exists(join(outside, MARKER_FILE))).toBe(true);
    expect(await buried()).toEqual(["Paper Boats"]);
  });

  it("refuses a project whose id on disk is not the one chosen, and one with no marker", async () => {
    const boats = await bury("Paper Boats");
    await expect(
      exileProject(nodeFilesystem, projects, { ...boats, marker: { ...boats.marker, projectId: "id-someone-else" } }),
    ).rejects.toThrow(/changed on disk/);

    // Replaced since the Graveyard was read: same folder, another project.
    writeFileSync(join(boats.path, MARKER_FILE), "# Paper Boats\n\nFormat version: 1\nProject id: id-other\nFormat: Feature\n");
    await expect(exileProject(nodeFilesystem, projects, boats)).rejects.toBeInstanceOf(CannotExile);
    expect(await nodeFilesystem.exists(boats.path)).toBe(true);

    const bare = join(graveyardIn(projects), "No Marker");
    mkdirSync(bare);
    writeFileSync(join(bare, "manuscript.fountain"), "Title: No Marker\n");
    await expect(exileProject(nodeFilesystem, projects, { ...boats, path: bare })).rejects.toBeInstanceOf(CannotExile);
    expect(await nodeFilesystem.exists(join(bare, "manuscript.fountain"))).toBe(true);
  });

  it("refuses relative paths and paths that climb", async () => {
    const boats = await bury("Paper Boats");
    for (const path of [
      `write-ist/${GRAVEYARD_FOLDER}/Paper Boats`,
      `${graveyardIn(projects)}/../${GRAVEYARD_FOLDER}/Paper Boats`,
    ]) {
      await expect(exileProject(nodeFilesystem, projects, { ...boats, path }), path).rejects.toBeInstanceOf(CannotExile);
    }
    expect(await nodeFilesystem.exists(join(boats.path, MARKER_FILE))).toBe(true);
  });

  it("refuses a link in the Graveyard, and never follows one out of a project", async () => {
    const live = await make("Still Here");
    const boats = await bury("Paper Boats");
    // A live project, linked into the Graveyard under a name of its own.
    const link = join(graveyardIn(projects), "Linked");
    symlinkSync(live.path, link);
    await expect(exileProject(nodeFilesystem, projects, { ...live, path: link })).rejects.toThrow();
    expect(await nodeFilesystem.exists(join(live.path, MARKER_FILE))).toBe(true);

    // The port refuses the link itself too, even with the right id.
    await expect(nodeFilesystem.exileFromGraveyard(link, live.marker.projectId)).rejects.toThrow();
    expect(await nodeFilesystem.exists(join(live.path, MARKER_FILE))).toBe(true);

    // A link inside the project goes with it, and what it points at stays.
    const kept = join(temporary.path, "Kept");
    mkdirSync(kept);
    writeFileSync(join(kept, "notes.txt"), "kept\n");
    symlinkSync(kept, join(boats.path, "out"));
    await exileProject(nodeFilesystem, projects, boats);
    expect(await nodeFilesystem.exists(boats.path)).toBe(false);
    expect(readFileSync(join(kept, "notes.txt"), "utf8")).toBe("kept\n");
  });
});

describe("the port's own checks, a moment before the erase", () => {
  it("refuses everything but a plain project folder directly in the Graveyard holding the id", async () => {
    const live = await make("Still Here");
    const boats = await bury("Paper Boats");
    const id = boats.marker.projectId;
    const bare = join(graveyardIn(projects), "No Marker");
    mkdirSync(bare);
    const refusals: readonly [string, string][] = [
      [projects, id],
      [graveyardIn(projects), id],
      [live.path, live.marker.projectId],
      [join(boats.path, MARKER_FILE), id],
      [bare, id],
      [boats.path, "id-someone-else"],
      [boats.path, ""],
      [`${graveyardIn(projects)}/../${GRAVEYARD_FOLDER}/Paper Boats`, id],
      [`${graveyardIn(projects)}/./Paper Boats`, id],
      [`write-ist/${GRAVEYARD_FOLDER}/Paper Boats`, id],
    ];
    for (const [path, projectId] of refusals) {
      await expect(nodeFilesystem.exileFromGraveyard(path, projectId), `${path} ${projectId}`).rejects.toThrow();
    }
    expect(await nodeFilesystem.exists(join(live.path, MARKER_FILE))).toBe(true);
    expect(await nodeFilesystem.exists(join(boats.path, MARKER_FILE))).toBe(true);
    expect(await nodeFilesystem.exists(bare)).toBe(true);
  });
});
