/**
 * Renaming a project while its manuscript is open: the folder moves between
 * writes, nothing is written to where it was, and what the writer typed is
 * still theirs and lands in the new place.
 *
 * Real files in a temporary folder, and one invented project.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TextSelection } from "prosemirror-state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Clock } from "../../src/project/autosave.ts";
import { GOALS_FILE, MANUSCRIPT_FILE, type Project } from "../../src/project/bundle.ts";
import type { Filesystem } from "../../src/project/filesystem.ts";
import { importProject } from "../../src/project/import.ts";
import { manuscriptSession, readManuscript, type ManuscriptSession } from "../../src/project/manuscript-session.ts";
import { CannotRename, renameProject } from "../../src/project/rename.ts";
import { startOfElement } from "../support/editor-positions.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { fakeEngine } from "../support/spell-engine.ts";

const SCRIPT = "INT. BOATHOUSE - DAY\n\nThe river is high.\n\nMARA\nWe should go.\n";

let temporary: { path: string; remove: () => void };
let projects: string;
beforeEach(() => {
  temporary = temporaryDirectory();
  projects = join(temporary.path, "write-ist");
});
afterEach(() => temporary.remove());

async function aProject(title: string): Promise<Project> {
  const source = join(temporary.path, `${title}.fountain`);
  writeFileSync(source, SCRIPT);
  const imported = await importProject(
    { filesystem: nodeFilesystem, newProjectId: () => `id-${title}` },
    { sourcePath: source, projectsDirectory: projects },
  );
  return imported.project;
}

async function open(project: Project, filesystem: Filesystem = nodeFilesystem) {
  const reports: string[] = [];
  const recorded: { id: string; name: string }[] = [];
  // The pause is never run unless a test runs it.
  const quiet: Clock = { wait: (run) => run, cancel: () => {} };
  const ports = {
    filesystem,
    project,
    report: (text: string) => reports.push(text),
    setSaved: () => {},
    setStatus: () => {},
    setGoal: () => {},
    ledger: () =>
      ({ recordDay: async (which: { id: string; name: string }) => void recorded.push(which) }) as never,
    whenSwitchedAway: () => () => {},
    whenSwitchedBack: () => () => {},
    spellEngine: fakeEngine(),
    drawSeam: () => ({}) as HTMLElement,
    drawOffer: () => ({}) as HTMLElement,
    reloaded: () => {},
    autosaveClock: quiet,
  };
  const read = await readManuscript(filesystem, project, ports.report);
  return { session: manuscriptSession(ports, read), reports, recorded };
}

function type(session: ManuscriptSession, text: string): void {
  const at = startOfElement(session.state, 1);
  session.apply(session.state.tr.setSelection(TextSelection.create(session.state.doc, at)).insertText(text));
}

const manuscriptIn = (project: Project): string => readFileSync(join(project.path, MANUSCRIPT_FILE), "utf8");

describe("renaming the project that is open", () => {
  it("keeps unsaved typing unsaved, and the next save writes it in the new folder", async () => {
    const project = await aProject("Paper Boats");
    const { session, reports } = await open(project);
    type(session, "Rain. ");
    const before = session.state;

    const renamed = await session.moveProject(() => renameProject(nodeFilesystem, projects, project, "Paper Planes"));

    expect(renamed.path).toBe(join(projects, "Paper Planes"));
    expect(renamed.marker.projectId).toBe("id-Paper Boats");
    expect(session.state).toBe(before);
    expect(session.unsaved()).toBe(true);
    expect(manuscriptIn(renamed)).not.toContain("Rain.");

    await session.save();
    expect(manuscriptIn(renamed)).toContain("Rain. The river is high.");
    expect(session.unsaved()).toBe(false);
    expect(existsSync(project.path)).toBe(false);
    expect(reports).toEqual([]);
  });

  it("waits for a save under way, and holds the next one until the folder has moved", async () => {
    const project = await aProject("Paper Boats");
    let release = (): void => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const written: string[] = [];
    const filesystem: Filesystem = {
      ...nodeFilesystem,
      writeFile: async (path, bytes) => {
        // Only the first write is held: the save the rename arrives during.
        if (written.push(path) === 1) await held;
        await nodeFilesystem.writeFile(path, bytes);
      },
    };
    const { session, reports } = await open(project, filesystem);
    type(session, "First. ");
    const first = session.save();
    await vi.waitFor(() => expect(written).toHaveLength(1));

    const move = vi.fn(() => renameProject(filesystem, projects, project, "Paper Planes"));
    const moving = session.moveProject(move);
    await new Promise((resolve) => setTimeout(resolve, 20));
    type(session, "Second. ");
    const second = session.save();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(move).not.toHaveBeenCalled();
    expect(existsSync(project.path)).toBe(true);

    release();
    await first;
    const renamed = await moving;
    await second;

    expect(written[0]).toBe(join(project.path, MANUSCRIPT_FILE));
    expect(written.slice(1)).not.toContain(join(project.path, MANUSCRIPT_FILE));
    expect(manuscriptIn(renamed)).toContain("Second. First. The river is high.");
    expect(existsSync(project.path)).toBe(false);
    expect(reports).toEqual([]);
  });

  it("writes the goals in the new folder, and leaves under the new name", async () => {
    const project = await aProject("Paper Boats");
    const { session, recorded, reports } = await open(project);
    const renamed = await session.moveProject(() => renameProject(nodeFilesystem, projects, project, "Paper Planes"));

    expect(session.setDailyGoal(500, ["Mon"])).toBe(true);
    type(session, "Rain. ");
    expect(await session.leave()).toBe(true);

    expect(existsSync(join(renamed.path, GOALS_FILE))).toBe(true);
    expect(manuscriptIn(renamed)).toContain("Rain.");
    expect(existsSync(project.path)).toBe(false);
    expect(recorded).toEqual([{ id: "id-Paper Boats", name: "Paper Planes" }]);
    expect(reports).toEqual([]);
  });

  it("goes on saving where it was when the name is refused", async () => {
    const project = await aProject("Paper Boats");
    await aProject("Quiet Road");
    const { session } = await open(project);
    type(session, "Rain. ");

    await expect(
      session.moveProject(() => renameProject(nodeFilesystem, projects, project, "quiet road")),
    ).rejects.toBeInstanceOf(CannotRename);

    await session.save();
    expect(manuscriptIn(project)).toContain("Rain.");
  });
});
