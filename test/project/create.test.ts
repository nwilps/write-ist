/**
 * Creating a new project, with real files in a temporary folder — and then
 * living in it: the real loader opens it, the real editor state is typed into,
 * and the real save routine writes it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MANUSCRIPT_FILE, MARKER_FILE } from "../../src/project/bundle.ts";
import { CannotCreate, createProject } from "../../src/project/create.ts";
import { openProject } from "../../src/project/open.ts";
import { listProjects } from "../../src/project/projects.ts";
import { parseMarker } from "../../src/project/marker.ts";
import { editingSession } from "../../src/project/save.ts";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import type { Filesystem } from "../../src/project/filesystem.ts";
import { startOfElement } from "../support/editor-positions.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { unwatched } from "../support/unwatched.ts";

let temporary: { path: string; remove: () => void };
let projects: string;

beforeEach(() => {
  temporary = temporaryDirectory();
  projects = join(temporary.path, "write-ist");
});
afterEach(() => temporary.remove());

let minted = 0;
const make = (title = "Big Fish", filesystem: Filesystem = nodeFilesystem) =>
  createProject({ filesystem, newProjectId: () => `id-${++minted}` }, projects, {
    title,
    type: "Screenplay",
  });

describe("createProject", () => {
  it("makes the same bundle an import makes: a titled manuscript and a marker", async () => {
    const project = await make("Big Fish");

    expect(project.marker.name).toBe("Big Fish");
    expect(project.marker.format).toBe("Feature");
    expect(project.path).toBe(join(projects, "Big Fish"));
    const entries = await nodeFilesystem.readDirectory(project.path);
    expect(entries.map((e) => e.name).sort()).toEqual([MANUSCRIPT_FILE, MARKER_FILE]);
    expect(readFileSync(join(project.path, MANUSCRIPT_FILE), "utf8")).toBe("Title: Big Fish\n");
    expect(parseMarker(readFileSync(join(project.path, MARKER_FILE), "utf8"))).toEqual(
      project.marker,
    );
  });

  it("numbers a duplicate title, in the list as well as on disk, and keeps the title typed", async () => {
    const first = await make("Big Fish");
    const second = await make("big fish");
    const third = await make("Big Fish");

    expect([first, second, third].map((p) => p.marker.name)).toEqual([
      "Big Fish",
      "big fish 2",
      "Big Fish 3",
    ]);
    expect(new Set([first, second, third].map((p) => p.marker.projectId)).size).toBe(3);
    expect(readFileSync(join(second.path, MANUSCRIPT_FILE), "utf8")).toBe("Title: big fish\n");
  });

  it("makes a safe folder from a title the disk would refuse", async () => {
    const project = await make("  A/B: what?  ");
    expect(project.path).toBe(join(projects, "A B what"));
    expect(readFileSync(join(project.path, MANUSCRIPT_FILE), "utf8")).toBe("Title: A/B: what?\n");
  });

  it("refuses an empty title and a type it cannot make, writing nothing", async () => {
    await expect(make("   ")).rejects.toBeInstanceOf(CannotCreate);
    await expect(
      createProject({ filesystem: nodeFilesystem, newProjectId: () => "x" }, projects, {
        title: "Dune",
        type: "Novel" as never,
      }),
    ).rejects.toBeInstanceOf(CannotCreate);
    expect(await nodeFilesystem.readDirectory(projects)).toEqual([]);
  });

  it("leaves no project behind when the marker cannot be written", async () => {
    const failing: Filesystem = {
      ...nodeFilesystem,
      writeFile: async (path, bytes) => {
        if (path.endsWith(MARKER_FILE)) throw new Error("disk full");
        return nodeFilesystem.writeFile(path, bytes);
      },
    };
    await expect(make("Big Fish", failing)).rejects.toThrow("disk full");
    expect((await listProjects(nodeFilesystem, projects)).projects).toEqual([]);
  });

  it("appears in the projects list, then opens, is typed into, saves, and reopens", async () => {
    const created = await make("Big Fish");

    const listing = await listProjects(nodeFilesystem, projects);
    expect(listing.projects).toEqual([created]);
    expect(listing.unreadable).toEqual([]);

    const opened = await openProject(nodeFilesystem, created);
    expect(opened.document.titlePage.map((f) => f.key)).toEqual(["Title"]);

    // The real editor state, as the window builds it: there must be a line to
    // type on even though the file holds no elements.
    let state = editorStateFor(opened.document);
    const at = startOfElement(state, 0);
    state = state.apply(state.tr.insertText("INT. KITCHEN - DAY", at));

    const session = editingSession(nodeFilesystem, opened, () => manuscriptOf(state.doc), unwatched);
    session.changed();
    expect((await session.save()).written).toBe(true);

    const bytes = readFileSync(join(created.path, MANUSCRIPT_FILE), "utf8");
    expect(bytes).toContain("Title: Big Fish");
    expect(bytes).toContain("INT. KITCHEN - DAY");

    const reopened = await openProject(nodeFilesystem, created);
    expect(reopened.document.elements.map((e) => [e.type, e.text])).toEqual([
      ["scene-heading", "INT. KITCHEN - DAY"],
    ]);
  });

  it("saving a project nothing was typed into leaves its file byte for byte alone", async () => {
    const created = await make("Big Fish");
    const opened = await openProject(nodeFilesystem, created);
    const state = editorStateFor(opened.document);
    const session = editingSession(nodeFilesystem, opened, () => manuscriptOf(state.doc), unwatched);
    session.changed();
    expect((await session.save()).written).toBe(false);
    expect(readFileSync(join(created.path, MANUSCRIPT_FILE), "utf8")).toBe("Title: Big Fish\n");
  });
});
