/**
 * The spellcheck pill, from the Editor's side: the Editor tells the shell when
 * spellcheck goes on or off, by Ctrl/Cmd+; and by View ▸ Spellcheck alike, and
 * it is off when a project opens. (Where the pill sits and how it looks is in
 * `bottom-pills.test.ts`.)
 */
// @vitest-environment jsdom
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importProject } from "../../src/project/import.ts";
import { openProject } from "../../src/project/open.ts";
import type { WorkspaceContext } from "../../app/src/shell/workspace.ts";
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

async function editing(): Promise<{ told: boolean[]; paper: HTMLElement; into: HTMLElement; unmount: () => Promise<boolean> }> {
  const source = join(temporary.path, "Brick-&-Steel.fountain");
  writeFileSync(source, readFixtureBytes("Brick-&-Steel.fountain"));
  const imported = await importProject(
    { filesystem: nodeFilesystem, newProjectId: () => "3f2a1c44-0000-4000-8000-0123456789ab" },
    { sourcePath: source, projectsDirectory: join(temporary.path, "write-ist") },
  );
  const opened = await openProject(nodeFilesystem, imported.project);
  const told: boolean[] = [];
  const into = document.createElement("div");
  document.body.append(into);
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
    setSpellcheck: (on: boolean) => void told.push(on),
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
  return { told, paper: into.querySelector<HTMLElement>(".ProseMirror")!, into, unmount: mounted.unmount };
}

const isOn = (told: boolean[]): boolean => told.at(-1) === true;

describe("the Editor and the spellcheck pill", () => {
  it("says spellcheck is off when the project opens, and follows Ctrl+; and View ▸ Spellcheck", async () => {
    const { told, paper, into, unmount } = await editing();
    expect(told.length).toBeGreaterThan(0);
    expect(told.every((on) => !on)).toBe(true);

    const chord = (): void =>
      void paper.dispatchEvent(new KeyboardEvent("keydown", { key: ";", ctrlKey: true, metaKey: true, bubbles: true, cancelable: true }));
    chord();
    expect(isOn(told)).toBe(true);
    chord();
    expect(isOn(told)).toBe(false);

    const item = [...into.querySelectorAll<HTMLButtonElement>(".drop-menu__item")].find(
      (button) => button.textContent?.includes("Spellcheck"),
    )!;
    expect(item).toBeDefined();
    item.click();
    expect(isOn(told)).toBe(true);
    item.click();
    expect(isOn(told)).toBe(false);
    await unmount();
  });
});
