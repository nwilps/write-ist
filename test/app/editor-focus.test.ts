/**
 * When a project opens the writer can type at once: the paper has the keys,
 * unless something else took them while the script was being read.
 */
// @vitest-environment jsdom
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importProject } from "../../src/project/import.ts";
import { openProject } from "../../src/project/open.ts";
import type { MountedWorkspace, WorkspaceContext } from "../../app/src/shell/workspace.ts";
import { readFixtureBytes } from "../support/files.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { fakeEngine } from "../support/spell-engine.ts";

// The Rust dictionary is not here; the fake stands in for it.
vi.mock("../../app/src/spell-tauri.ts", () => ({ tauriSpellEngine: fakeEngine() }));
const { editorWorkspace } = await import("../../app/src/workspaces/editor/editor.ts");

let temporary: { path: string; remove: () => void };
beforeEach(() => {
  temporary = temporaryDirectory();
});
afterEach(() => {
  temporary.remove();
  document.body.replaceChildren();
});

async function opening(into: HTMLElement): Promise<MountedWorkspace> {
  const source = join(temporary.path, "Brick-&-Steel.fountain");
  writeFileSync(source, readFixtureBytes("Brick-&-Steel.fountain"));
  const imported = await importProject(
    { filesystem: nodeFilesystem, newProjectId: () => "3f2a1c44-0000-4000-8000-0123456789ab" },
    { sourcePath: source, projectsDirectory: join(temporary.path, "write-ist") },
  );
  const opened = await openProject(nodeFilesystem, imported.project);
  const quiet = (): (() => void) => () => {};
  const context = {
    project: opened.project,
    filesystem: nodeFilesystem,
    report: () => {},
    setStatus: () => {},
    setGoal: () => {},
    whenGoalsAsked: quiet,
    whenDetailsAsked: quiet,
    setSaved: () => {},
    setSpellcheck: () => {},
    whenSwitchedAway: quiet,
    whenSwitchedBack: quiet,
    leave: { toProjects: () => {}, toHome: () => {} },
    ledger: () => undefined,
    places: () => undefined,
    chooseCopyLocation: async () => undefined,
    choosePdfLocation: async () => undefined,
  } as unknown as WorkspaceContext;
  const mounted = editorWorkspace.mount(into, context);
  await vi.waitFor(() => expect(into.querySelector(".ProseMirror")).not.toBeNull());
  return mounted;
}

describe("the paper when a project opens", () => {
  it("has the keys, with no click", async () => {
    const into = document.createElement("div");
    document.body.append(into);
    const mounted = await opening(into);
    expect(document.activeElement).toBe(into.querySelector(".ProseMirror"));
    await mounted.unmount();
  });

  it("leaves them where they are if something else took them while it was read", async () => {
    const into = document.createElement("div");
    const elsewhere = document.createElement("button");
    document.body.append(into, elsewhere);
    elsewhere.focus();
    const mounted = await opening(into);
    expect(document.activeElement).toBe(elsewhere);
    await mounted.unmount();
  });
});
