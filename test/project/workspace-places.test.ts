/**
 * Where the writer was in Notes and Plan, kept in app data beside `places.txt`
 * (`src/project/workspace-places.ts`): a readable line per workspace of a
 * project, never in the bundle, never `localStorage`, and never written over
 * when it will not read.
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
});
