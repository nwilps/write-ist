/**
 * Creating a new, empty project, with real files in a temporary folder.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MANUSCRIPT_FILE, MARKER_FILE } from "../../src/project/bundle.ts";
import {
  createProject,
  DEFAULT_PROJECT_NAME,
} from "../../src/project/create.ts";
import { openProject } from "../../src/project/open.ts";
import { listProjects } from "../../src/project/projects.ts";
import { parseMarker } from "../../src/project/marker.ts";
import {
  nodeFilesystem,
  temporaryDirectory,
} from "../support/node-filesystem.ts";

let temporary: { path: string; remove: () => void };
let projects: string;

beforeEach(() => {
  temporary = temporaryDirectory();
  projects = join(temporary.path, "write-ist");
});
afterEach(() => temporary.remove());

let minted = 0;
const make = () =>
  createProject(
    { filesystem: nodeFilesystem, newProjectId: () => `id-${++minted}` },
    projects,
  );

describe("createProject", () => {
  it("makes a bundle with a manuscript and a marker, named Untitled Screenplay", async () => {
    const project = await make();

    expect(project.marker.name).toBe(DEFAULT_PROJECT_NAME);
    expect(project.marker.format).toBe("Feature");
    expect(project.path).toBe(join(projects, DEFAULT_PROJECT_NAME));
    const entries = await nodeFilesystem.readDirectory(project.path);
    expect(entries.map((e) => e.name).sort()).toEqual([
      MANUSCRIPT_FILE,
      MARKER_FILE,
    ]);
    expect(readFileSync(join(project.path, MANUSCRIPT_FILE)).length).toBe(0);
    expect(
      parseMarker(readFileSync(join(project.path, MARKER_FILE), "utf8")),
    ).toEqual(project.marker);
  });

  it("uses a minted id, and a second project gets a different name and folder", async () => {
    const first = await make();
    const second = await make();
    const third = await make();

    expect(second.marker.name).toBe("Untitled Screenplay 2");
    expect(third.marker.name).toBe("Untitled Screenplay 3");
    expect(
      new Set([first, second, third].map((p) => p.marker.projectId)).size,
    ).toBe(3);
    expect(second.path).toBe(join(projects, "Untitled Screenplay 2"));
  });

  it("appears in the projects list, and opens as an empty screenplay", async () => {
    const created = await make();

    const listing = await listProjects(nodeFilesystem, projects);
    expect(listing.projects).toEqual([created]);
    expect(listing.unreadable).toEqual([]);

    const opened = await openProject(nodeFilesystem, created);
    expect(opened.project).toEqual(created);
  });
});
