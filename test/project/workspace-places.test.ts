/**
 * Where the writer was in Notes and Plan, kept in app data beside `places.txt`
 * (`src/project/workspace-places.ts`): a readable line per workspace of a
 * project, and per note in Notes, holding whole numbers and short texts (the
 * names of the open tabs); never in the bundle, never `localStorage`, and
 * never written over when it will not read. Lines written before texts and
 * notes existed read as they did.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  WORKSPACE_PLACES_FILE,
  openWorkspacePlaces,
  parseWorkspacePlaces,
  serialiseWorkspacePlaces,
} from "../../src/project/workspace-places.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

let temporary: { path: string; remove: () => void };
beforeEach(() => void (temporary = temporaryDirectory()));
afterEach(() => temporary.remove());

describe("workspace places", () => {
  it("remembers a place per project and workspace, and recalls it after a restart", async () => {
    const directory = join(temporary.path, "app-data");
    const places = openWorkspacePlaces(nodeFilesystem, directory);
    await places.remember("id-a", "notes", { anchor: 12, head: 15, scroll: 340 });
    await places.remember("id-a", "plan", { across: 900 });
    await places.remember("id-b", "notes", { anchor: 0, head: 0, scroll: 0 });
    const again = openWorkspacePlaces(nodeFilesystem, directory);
    expect(await again.recall("id-a", "notes")).toEqual({ anchor: 12, head: 15, scroll: 340 });
    expect(await again.recall("id-a", "plan")).toEqual({ across: 900 });
    expect(await again.recall("id-c", "notes")).toBeUndefined();
    expect(readFileSync(join(directory, WORKSPACE_PLACES_FILE), "utf8")).toBe(
      "id-a\tnotes\tanchor=12\thead=15\tscroll=340\nid-a\tplan\tacross=900\nid-b\tnotes\tanchor=0\thead=0\tscroll=0\n",
    );
  });

  it("never writes over a file it cannot read, and recalls nothing from it", async () => {
    const places = openWorkspacePlaces(nodeFilesystem, temporary.path);
    const path = join(temporary.path, WORKSPACE_PLACES_FILE);
    writeFileSync(path, "this is not a list of places\n");
    expect(await places.recall("id-a", "notes")).toBeUndefined();
    await expect(places.remember("id-a", "notes", { anchor: 1 })).rejects.toThrow();
    expect(readFileSync(path, "utf8")).toBe("this is not a list of places\n");
  });

  it("reads what it writes", () => {
    const text = "id-a\tnotes\tanchor=3\thead=3\tscroll=20\n";
    expect(serialiseWorkspacePlaces(parseWorkspacePlaces(text)!)).toBe(text);
    expect(parseWorkspacePlaces("id-a\tnotes\tanchor=-1\n")).toBeUndefined();
  });

  it("keeps texts and a place per item — Notes' tabs, and each note's caret — in readable lines", async () => {
    const directory = join(temporary.path, "app-data");
    const places = openWorkspacePlaces(nodeFilesystem, directory);
    await places.remember("id-a", "notes", { open: 2, "tab-1": "Ideas", "tab-2": "Ferry, at night = 100%", active: "Ideas" });
    await places.remember("id-a", "notes", { anchor: 14, head: 14, scroll: 340 }, "Ideas");
    await places.remember("id-a", "notes", { anchor: 0, head: 3, scroll: 0 }, 'Tab\there "quoted"');
    await places.remember("id-a", "plan", { across: 120 });
    expect(readFileSync(join(directory, WORKSPACE_PLACES_FILE), "utf8")).toBe(
      [
        'id-a\tnotes\topen=2\ttab-1="Ideas"\ttab-2="Ferry, at night = 100%25"\tactive="Ideas"',
        'id-a\tnotes\t"Ideas"\tanchor=14\thead=14\tscroll=340',
        'id-a\tnotes\t"Tab%09here %22quoted%22"\tanchor=0\thead=3\tscroll=0',
        "id-a\tplan\tacross=120",
        "",
      ].join("\n"),
    );
    const again = openWorkspacePlaces(nodeFilesystem, directory);
    expect(await again.recall("id-a", "notes")).toEqual({
      open: 2,
      "tab-1": "Ideas",
      "tab-2": "Ferry, at night = 100%",
      active: "Ideas",
    });
    expect(await again.recall("id-a", "notes", "Ideas")).toEqual({ anchor: 14, head: 14, scroll: 340 });
    expect(await again.recall("id-a", "notes", 'Tab\there "quoted"')).toEqual({ anchor: 0, head: 3, scroll: 0 });
    expect(await again.recall("id-a", "notes", "Absent")).toBeUndefined();
  });

  it("moves an item's place to its new name, and forgets one", async () => {
    const places = openWorkspacePlaces(nodeFilesystem, temporary.path);
    await places.remember("id-a", "notes", { anchor: 5, head: 5, scroll: 10 }, "Untitled");
    await places.remember("id-a", "notes", { anchor: 1, head: 1, scroll: 0 }, "Gone");
    await places.forget("id-a", "notes", "Untitled", "Ferry");
    await places.forget("id-a", "notes", "Gone");
    expect(await places.recall("id-a", "notes", "Untitled")).toBeUndefined();
    expect(await places.recall("id-a", "notes", "Ferry")).toEqual({ anchor: 5, head: 5, scroll: 10 });
    expect(await places.recall("id-a", "notes", "Gone")).toBeUndefined();
  });

  it("reads a file written before texts and items, and keeps its lines as they were", () => {
    const old = "id-a\tnotes\tanchor=14\thead=14\tscroll=340\nid-a\tplan\tacross=900\n";
    const read = parseWorkspacePlaces(old)!;
    expect(read.get("id-a\tnotes")).toEqual({ anchor: 14, head: 14, scroll: 340 });
    expect(serialiseWorkspacePlaces(read)).toBe(old);
  });

  it("refuses a line that is not one, so a damaged file is never written over", () => {
    for (const bad of [
      'id-a\tnotes\tactive="unclosed\n',
      'id-a\tnotes\tactive="a"b"\n',
      'id-a\tnotes\tactive="bad %zz"\n',
      'id-a\tnotes\t"item\n',
      "id-a\tnotes\tactive=bare words\n",
      "id-a\tnotes\tno-equals\n",
    ]) {
      expect(parseWorkspacePlaces(bad), bad).toBeUndefined();
    }
  });
});
