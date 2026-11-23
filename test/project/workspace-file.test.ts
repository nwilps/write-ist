/**
 * A workspace's own file (`plan.md`, or `notes/Ideas.md` in a folder), saved
 * by the same rules as the manuscript: after a pause, never over a file it could not read, quietly
 * when it changed elsewhere, and never taken down over a save that failed.
 * Real files in a temporary folder.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Clock } from "../../src/project/autosave.ts";
import { PAUSE } from "../../src/project/autosave.ts";
import type { Project } from "../../src/project/bundle.ts";
import type { Filesystem } from "../../src/project/filesystem.ts";
import {
  decodeWorkspaceFile,
  encodeWorkspaceFile,
  readWorkspaceFile,
  workspaceFileSession,
  type FileSaveState,
} from "../../src/project/workspace-file.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

/** A clock the test turns by hand. */
function handClock(): Clock & { readonly turn: (by: number) => void } {
  let now = 0;
  const waiting = new Map<number, { at: number; run: () => void }>();
  let next = 0;
  return {
    wait: (run, after) => {
      next += 1;
      waiting.set(next, { at: now + after, run });
      return next;
    },
    cancel: (pending) => void waiting.delete(pending as number),
    turn: (by) => {
      now += by;
      for (const [id, { at, run }] of [...waiting]) {
        if (at > now) continue;
        waiting.delete(id);
        run();
      }
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

let temporary: { path: string; remove: () => void };
let project: Project;
beforeEach(() => {
  temporary = temporaryDirectory();
  const path = join(temporary.path, "Big Fish");
  mkdirSync(path, { recursive: true });
  project = { path, marker: { name: "Big Fish", projectId: "id-big-fish" } } as Project;
});
afterEach(() => temporary.remove());

function open(
  read: Awaited<ReturnType<typeof readWorkspaceFile>>,
  text: () => string,
  filesystem: Filesystem = nodeFilesystem,
  file = "plan.md",
) {
  const clock = handClock();
  const reloaded: string[] = [];
  const reports: string[] = [];
  const states: FileSaveState[] = [];
  let refuse = false;
  const session = workspaceFileSession(
    {
      filesystem,
      project,
      file,
      noun: "your plan",
      text,
      reload: (found) => {
        if (refuse) return false;
        reloaded.push(found);
        return true;
      },
      report: (trouble) => void reports.push(trouble),
      setSaved: (state) => void states.push(state),
      whenSwitchedAway: () => () => {},
      whenSwitchedBack: () => () => {},
      clock,
      now: () => new Date(2026, 10, 22, 14, 5, 9),
    },
    read,
  );
  return { session, clock, reloaded, reports, states, refuse: () => void (refuse = true) };
}

const filePath = () => join(project.path, "plan.md");

describe("reading a workspace file", () => {
  it("reads an absent file as no text, and one that is not text as a refusal", async () => {
    expect(await readWorkspaceFile(nodeFilesystem, project, "plan.md")).toMatchObject({ text: "", bytes: undefined });
    writeFileSync(filePath(), new Uint8Array([0xff, 0xfe, 0x00, 0x41]));
    await expect(readWorkspaceFile(nodeFilesystem, project, "plan.md")).rejects.toThrow(/not text Write-ist can read/);
  });

  it("keeps a byte-order mark and Windows line endings, and gives the text without them", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("one\r\ntwo\r\n")]);
    const read = decodeWorkspaceFile(bytes, "plan.md");
    expect(read.text).toBe("one\ntwo\n");
    expect(read.habits).toEqual({ byteOrderMark: true, windowsLineEndings: true });
    expect(encodeWorkspaceFile(read.text, read.habits)).toEqual(bytes);
  });
});

describe("saving a workspace file", () => {
  it("writes nothing for a workspace opened and left, and creates no empty file", async () => {
    const { session } = open(await readWorkspaceFile(nodeFilesystem, project, "plan.md"), () => "");
    expect(await session.leave()).toBe(true);
    expect(existsSync(filePath())).toBe(false);
  });

  it("saves a couple of seconds after the writer stops, and says so in the pill", async () => {
    let text = "";
    const { session, clock, states } = open(await readWorkspaceFile(nodeFilesystem, project, "plan.md"), () => text);
    text = "The river is the whole story.";
    session.changed();
    expect(session.unsaved()).toBe(true);
    clock.turn(PAUSE - 1);
    await settle();
    expect(existsSync(filePath())).toBe(false);
    clock.turn(1);
    await settle();
    expect(readFileSync(filePath(), "utf8")).toBe("The river is the whole story.");
    expect(session.unsaved()).toBe(false);
    expect(states).toEqual(["unsaved", "saving", "saved"]);
  });

  it("writes back the file's own line endings", async () => {
    writeFileSync(filePath(), "a\r\nb\r\n");
    const read = await readWorkspaceFile(nodeFilesystem, project, "plan.md");
    let text = read.text;
    const { session } = open(read, () => text);
    text = "a\nb\nc\n";
    session.changed();
    await session.save();
    expect(readFileSync(filePath(), "utf8")).toBe("a\r\nb\r\nc\r\n");
  });

  it("loads a version changed elsewhere when nothing was typed, and writes nothing", async () => {
    writeFileSync(filePath(), "first");
    const read = await readWorkspaceFile(nodeFilesystem, project, "plan.md");
    const { session, reloaded } = open(read, () => "first");
    writeFileSync(filePath(), "changed in another editor");
    await session.save();
    expect(reloaded).toEqual(["changed in another editor"]);
    expect(readFileSync(filePath(), "utf8")).toBe("changed in another editor");
    expect(readdirSync(project.path)).toEqual(["plan.md"]);
  });

  it("keeps both when the writer typed too: the other beside it, dated, then theirs", async () => {
    writeFileSync(filePath(), "first");
    const read = await readWorkspaceFile(nodeFilesystem, project, "plan.md");
    let text = "first";
    const { session, reloaded, reports } = open(read, () => text);
    writeFileSync(filePath(), "changed in another editor");
    text = "first, and more";
    session.changed();
    await session.save();
    expect(reloaded).toEqual([]);
    expect(reports).toEqual([]);
    expect(readFileSync(filePath(), "utf8")).toBe("first, and more");
    const copy = "plan changed elsewhere 2026-11-22 14.05.09.md";
    expect(readdirSync(project.path).sort()).toEqual([copy, "plan.md"]);
    expect(readFileSync(join(project.path, copy), "utf8")).toBe("changed in another editor");
  });

  it("keeps both when the version found cannot be loaded, though nothing was typed", async () => {
    writeFileSync(filePath(), "first");
    const read = await readWorkspaceFile(nodeFilesystem, project, "plan.md");
    const { session, refuse } = open(read, () => "first");
    refuse();
    writeFileSync(filePath(), "not something this workspace can read");
    await session.save();
    expect(readFileSync(filePath(), "utf8")).toBe("first");
    expect(readdirSync(project.path)).toHaveLength(2);
  });

  it("does not come down over a last save that failed, and says why", async () => {
    let fail = true;
    const failing: Filesystem = {
      ...nodeFilesystem,
      writeFile: (path, bytes) => (fail ? Promise.reject(new Error("The disk is full.")) : nodeFilesystem.writeFile(path, bytes)),
    };
    let text = "";
    const { session, reports } = open(await readWorkspaceFile(nodeFilesystem, project, "plan.md"), () => text, failing);
    text = "words only on screen";
    session.changed();
    expect(await session.leave()).toBe(false);
    expect(reports.at(-1)).toMatch(/could not save your plan.*The disk is full.*stays open until it saves/);
    expect(session.unsaved()).toBe(true);
    fail = false;
    expect(await session.leave()).toBe(true);
    expect(readFileSync(filePath(), "utf8")).toBe("words only on screen");
  });

  it("goes on saving where a rename moved the folder", async () => {
    let text = "";
    const { session } = open(await readWorkspaceFile(nodeFilesystem, project, "plan.md"), () => text);
    const moved = join(temporary.path, "Big Fish Two");
    await session.relocate(async () => {
      await nodeFilesystem.moveFolder(project.path, moved);
      return { ...project, path: moved };
    });
    text = "after the move";
    session.changed();
    await session.save();
    expect(readFileSync(join(moved, "plan.md"), "utf8")).toBe("after the move");
  });
});

describe("a workspace file in a folder of its own", () => {
  const note = "notes/Ideas.md";
  const notePath = () => join(project.path, "notes", "Ideas.md");

  it("makes the folder when it first writes, and keeps an outside change's copy beside the file in it", async () => {
    let text = "";
    const { session } = open(await readWorkspaceFile(nodeFilesystem, project, note), () => text, nodeFilesystem, note);
    text = "The ferry crosses at night.";
    session.changed();
    await session.save();
    expect(readFileSync(notePath(), "utf8")).toBe("The ferry crosses at night.");

    // Changed elsewhere and typed as well: the other version is kept beside it, in the folder.
    writeFileSync(notePath(), "Changed in another editor.");
    text = "Typed in Write-ist.";
    session.changed();
    await session.save();
    expect(readdirSync(join(project.path, "notes")).sort()).toEqual(["Ideas changed elsewhere 2026-11-22 14.05.09.md", "Ideas.md"]);
    expect(readFileSync(join(project.path, "notes", "Ideas changed elsewhere 2026-11-22 14.05.09.md"), "utf8")).toBe(
      "Changed in another editor.",
    );
    expect(readFileSync(notePath(), "utf8")).toBe("Typed in Write-ist.");
    expect(readdirSync(project.path)).toEqual(["notes"]);
  });

  it("is renamed between saves, never during one, and goes on saving under the new name", async () => {
    mkdirSync(join(project.path, "notes"));
    writeFileSync(notePath(), "first");
    let text = "first";
    const { session } = open(await readWorkspaceFile(nodeFilesystem, project, note), () => text, nodeFilesystem, note);
    text = "typed before the rename";
    session.changed();
    const saving = session.save();
    const renamed = session.rename(async (from) => {
      // The save in flight has landed before the move begins.
      expect(readFileSync(join(project.path, from), "utf8")).toBe("typed before the rename");
      await nodeFilesystem.moveFile(join(project.path, from), join(project.path, "notes", "Ferry.md"));
      return "notes/Ferry.md";
    });
    await saving;
    expect(await renamed).toBe("notes/Ferry.md");
    expect(session.file()).toBe("notes/Ferry.md");
    text = "typed after the rename";
    session.changed();
    await session.save();
    expect(readdirSync(join(project.path, "notes"))).toEqual(["Ferry.md"]);
    expect(readFileSync(join(project.path, "notes", "Ferry.md"), "utf8")).toBe("typed after the rename");
  });

  it("keeps its name, and its words, when the rename is refused", async () => {
    mkdirSync(join(project.path, "notes"));
    writeFileSync(notePath(), "kept");
    writeFileSync(join(project.path, "notes", "Taken.md"), "another note");
    const { session } = open(await readWorkspaceFile(nodeFilesystem, project, note), () => "kept", nodeFilesystem, note);
    await expect(
      session.rename(async (from) => {
        await nodeFilesystem.moveFile(join(project.path, from), join(project.path, "notes", "Taken.md"));
        return "notes/Taken.md";
      }),
    ).rejects.toThrow();
    expect(session.file()).toBe(note);
    expect(readFileSync(notePath(), "utf8")).toBe("kept");
    expect(readFileSync(join(project.path, "notes", "Taken.md"), "utf8")).toBe("another note");
  });

  it("once discarded, writes nothing again, not even what was waiting", async () => {
    mkdirSync(join(project.path, "notes"));
    writeFileSync(notePath(), "on disk");
    let text = "on disk";
    const { session, clock } = open(await readWorkspaceFile(nodeFilesystem, project, note), () => text, nodeFilesystem, note);
    text = "waiting on the pause";
    session.changed();
    session.discard();
    clock.turn(PAUSE);
    await settle();
    await session.save();
    expect(await session.leave()).toBe(true);
    expect(readFileSync(notePath(), "utf8")).toBe("on disk");
    expect(session.unsaved()).toBe(false);
  });
});
