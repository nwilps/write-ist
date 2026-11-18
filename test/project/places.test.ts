/**
 * Where the writer left the caret in each project: a small file in app data,
 * not in the bundle, keyed by project id.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openPlaces, parsePlaces, PLACES_FILE, serialisePlaces } from "../../src/project/places.ts";
import type { CaretPlace } from "../../src/screenplay/caret-place.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

const kitchen: CaretPlace = { element: 2, offset: 11, elements: 40 };
const harbour: CaretPlace = { element: 0, offset: 0, elements: 4 };

describe("the places file", () => {
  it("round-trips a list of places as one tab-separated line each", () => {
    const text = serialisePlaces(
      new Map([
        ["id-kitchen", kitchen],
        ["id-harbour", harbour],
      ]),
    );
    expect(text).toBe("id-kitchen\t2\t11\t40\nid-harbour\t0\t0\t4\n");
    expect(parsePlaces(text)).toEqual(
      new Map([
        ["id-kitchen", kitchen],
        ["id-harbour", harbour],
      ]),
    );
  });

  it("treats an empty file as no places, and will not read a broken line", () => {
    expect(parsePlaces("")).toEqual(new Map());
    expect(parsePlaces("id-kitchen\t2\t11\n")).toBeUndefined();
    expect(parsePlaces("id-kitchen\tnope\t11\t40\n")).toBeUndefined();
  });
});

describe("remembering and recalling a place", () => {
  let temporary: { path: string; remove: () => void };

  beforeEach(() => {
    temporary = temporaryDirectory();
    mkdirSync(temporary.path, { recursive: true });
  });
  afterEach(() => temporary.remove());

  it("writes a project's place and reads it back, and does not disturb another project's", async () => {
    const places = openPlaces(nodeFilesystem, temporary.path);
    await places.remember("id-kitchen", kitchen);
    await places.remember("id-harbour", harbour);
    expect(await places.recall("id-kitchen")).toEqual(kitchen);
    expect(await places.recall("id-harbour")).toEqual(harbour);
    expect(await places.recall("id-missing")).toBeUndefined();
    expect(readFileSync(join(temporary.path, PLACES_FILE), "utf8")).toContain("id-kitchen\t2\t11\t40\n");
  });

  it("answers nothing when there is no file yet, and leaves a file it cannot read untouched", async () => {
    const places = openPlaces(nodeFilesystem, temporary.path);
    expect(await places.recall("id-kitchen")).toBeUndefined();

    const path = join(temporary.path, PLACES_FILE);
    writeFileSync(path, "this is not a list of places\n");
    const before = readFileSync(path);
    expect(await places.recall("id-kitchen")).toBeUndefined();
    await expect(places.remember("id-kitchen", kitchen)).rejects.toThrow(/places/i);
    expect(readFileSync(path)).toEqual(before);
  });
});
