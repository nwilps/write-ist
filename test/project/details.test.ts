/**
 * `details.md` and the save Edit Project Details makes (`src/project/details.ts`):
 * its shape, how it is read from a project before it and from a hand-edited
 * file, and that a refusal changes nothing. Invented projects, in a temporary
 * folder.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DETAILS_FILE, MARKER_FILE, type Project } from "../../src/project/bundle.ts";
import { createProject } from "../../src/project/create.ts";
import {
  CannotEditDetails,
  DEFAULT_DETAILS,
  parseDetails,
  readDetails,
  saveProjectDetails,
  serialiseDetails,
} from "../../src/project/details.ts";
import { listProjects } from "../../src/project/projects.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

let temporary: { path: string; remove: () => void };
let projects: string;
let boats: Project;

beforeEach(async () => {
  temporary = temporaryDirectory();
  projects = join(temporary.path, "write-ist");
  const make = (title: string, id: string) =>
    createProject({ filesystem: nodeFilesystem, newProjectId: () => id }, projects, { title, type: "Feature" });
  boats = await make("Paper Boats", "id-boats");
  await make("Quiet Road", "id-quiet");
});
afterEach(() => temporary.remove());

describe("details.md", () => {
  it("is a heading and labelled lines, and reads back as written", () => {
    const text = serialiseDetails({ targetPages: 110, workspaces: ["editor", "plan"] });
    expect(text).toBe("# Project details\n\nTarget pages: 110\nWorkspaces: editor, plan\n");
    expect(parseDetails(text)).toEqual({ targetPages: 110, workspaces: ["editor", "plan"] });
    expect(serialiseDetails(DEFAULT_DETAILS)).toBe("# Project details\n\nTarget pages: none\n");
    expect(parseDetails(serialiseDetails(DEFAULT_DETAILS))).toEqual(DEFAULT_DETAILS);
  });

  it("puts hand-edited values right quietly, and keeps a workspace it does not know", () => {
    expect(parseDetails("# Project details\n\nTarget pages: lots\nWorkspaces: Editor, LOG, bad id!, log\n")).toEqual({
      targetPages: 0,
      workspaces: ["editor", "log"],
    });
    expect(parseDetails("# x\nTarget pages: 4000\n")?.targetPages).toBe(1000);
  });

  it("is not one without a heading, and an unreadable one reads as the defaults, marked unreadable", async () => {
    expect(parseDetails("Target pages: 3\n")).toBeNull();
    expect(await readDetails(nodeFilesystem, boats.path)).toEqual({ details: DEFAULT_DETAILS, readable: true });
    writeFileSync(join(boats.path, DETAILS_FILE), new Uint8Array([0xff, 0xfe]));
    expect(await readDetails(nodeFilesystem, boats.path)).toEqual({ details: DEFAULT_DETAILS, readable: false });
  });

  it("does not stop a folder being a project, whatever it holds", async () => {
    writeFileSync(join(boats.path, DETAILS_FILE), new Uint8Array([0xff, 0xfe]));
    const names = (await listProjects(nodeFilesystem, projects)).projects.map((project) => project.marker.name);
    expect(names.sort()).toEqual(["Paper Boats", "Quiet Road"]);
  });
});

describe("saving Edit Project Details", () => {
  const wanted = (change: Partial<Parameters<typeof saveProjectDetails>[3]> = {}) => ({
    name: "Paper Boats",
    format: "Feature" as const,
    details: DEFAULT_DETAILS,
    ...change,
  });

  it("renames, retypes and writes the details, and answers the project as it now is", async () => {
    const saved = await saveProjectDetails(nodeFilesystem, projects, boats, wanted({
      name: "Paper Kites",
      format: "Episode",
      details: { targetPages: 60, workspaces: ["editor"] },
    }));
    expect(saved.project.path).toBe(join(projects, "Paper Kites"));
    expect(saved.project.marker).toEqual({ ...boats.marker, name: "Paper Kites", format: "Episode" });
    const marker = readFileSync(join(saved.project.path, MARKER_FILE), "utf8");
    expect(marker).toContain("# Paper Kites");
    expect(marker).toContain("Format: Episode");
    expect(readFileSync(join(saved.project.path, DETAILS_FILE), "utf8")).toContain("Target pages: 60");
  });

  it("refuses a name that is taken before writing anything at all", async () => {
    await expect(
      saveProjectDetails(nodeFilesystem, projects, boats, wanted({ name: "quiet road", format: "Short Film", details: { targetPages: 9, workspaces: undefined } })),
    ).rejects.toThrow(CannotEditDetails);
    expect(existsSync(join(boats.path, DETAILS_FILE))).toBe(false);
    expect(readFileSync(join(boats.path, MARKER_FILE), "utf8")).toContain("Format: Feature");
  });

  it("refuses another surface's type", async () => {
    await expect(
      saveProjectDetails(nodeFilesystem, projects, boats, wanted({ format: "Novel" as never })),
    ).rejects.toThrow("A screenplay cannot become a Novel.");
  });
});
