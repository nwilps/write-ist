/**
 * The names file: the characters and locations the writer added to or removed
 * from the lists by hand, in the bundle, as plain text (slice 2, step 8, Q1).
 * Real files in a temporary folder.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MANUSCRIPT_FILE, NAMES_FILE, type Project } from "../../src/project/bundle.ts";
import {
  NOTHING_BY_HAND,
  parseNamesFile,
  readNamesFile,
  serialiseNamesFile,
  writeNamesFile,
} from "../../src/project/names-file.ts";
import { FORMAT_VERSION } from "../../src/project/marker.ts";
import { NameLists } from "../../src/screenplay/names.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

let temporary: { path: string; remove: () => void };
let project: Project;

beforeEach(() => {
  temporary = temporaryDirectory();
  const path = join(temporary.path, "The Pilot");
  mkdirSync(path);
  writeFileSync(join(path, MANUSCRIPT_FILE), "INT. KITCHEN - DAY\n");
  project = {
    path,
    marker: {
      name: "The Pilot",
      formatVersion: FORMAT_VERSION,
      projectId: "3f2a1c44-0000-4000-8000-0123456789ab",
      format: "Feature",
    },
  };
});
afterEach(() => temporary.remove());

describe("the file's text", () => {
  it("is a kind on a line, then one indented name per line", () => {
    expect(serialiseNamesFile({ character: ["SANDRA", "EDWARD"], location: ["KITCHEN"] })).toBe(
      "characters\n  EDWARD\n  SANDRA\nlocations\n  KITCHEN\n",
    );
  });

  it("writes nothing for nothing", () => {
    expect(serialiseNamesFile(NOTHING_BY_HAND)).toBe("");
  });

  it("reads what it writes", () => {
    const byHand = { character: ["ANN", "EDWARD"], location: ["BENNETT'S HOSPITAL ROOM"] };
    expect(parseNamesFile(serialiseNamesFile(byHand))).toEqual(byHand);
  });

  it("reads loosely: blank lines, CRLF, case, tabs, unknown kinds", () => {
    expect(
      parseNamesFile("Characters\r\n\tedward\r\n\r\n  Sandra  \r\nprops\r\n  KNIFE\r\nlocations\r\n  yard\r\n"),
    ).toEqual({ character: ["EDWARD", "SANDRA"], location: ["YARD"] });
  });

  it("ignores names that come before any kind", () => {
    expect(parseNamesFile("  STRAY\ncharacters\n  ANN\n")).toEqual({ character: ["ANN"], location: [] });
  });

  it("writes the removed names after the added ones, with no counts", () => {
    const text = serialiseNamesFile({
      character: ["EDNA"],
      location: [],
      removed: { character: ["EDWRAD", "BOY"], location: ["THE ATTIC"] },
    });
    expect(text).toBe("characters\n  EDNA\nremoved characters\n  BOY\n  EDWRAD\nremoved locations\n  THE ATTIC\n");
    expect(parseNamesFile(text)).toEqual({
      character: ["EDNA"],
      location: [],
      removed: { character: ["BOY", "EDWRAD"], location: ["THE ATTIC"] },
    });
  });

  it("reads an older file's hidden names as removed, without their counts, and never writes them back as hidden", () => {
    const older = "characters\n  EDNA\nhidden characters\n  EDWRAD\t2\n  BOY\nhidden locations\n  THE ATTIC\t0\n";
    const read = parseNamesFile(older);
    expect(read).toEqual({
      character: ["EDNA"],
      location: [],
      removed: { character: ["EDWRAD", "BOY"], location: ["THE ATTIC"] },
    });
    const written = serialiseNamesFile(read);
    expect(written).not.toMatch(/hidden|\t/);
    expect(written).toBe("characters\n  EDNA\nremoved characters\n  BOY\n  EDWRAD\nremoved locations\n  THE ATTIC\n");
  });

  it("reads a removed name with a count left after a tab as the name alone, and writes it back without one", () => {
    const read = parseNamesFile("removed characters\n  EDWARD\t3\n");
    expect(read).toEqual({ character: [], location: [], removed: { character: ["EDWARD"], location: [] } });
    expect(serialiseNamesFile(read)).toBe("removed characters\n  EDWARD\n");
  });
});

describe("in the bundle", () => {
  it("reads as nothing done by hand when there is no file yet", async () => {
    expect(await readNamesFile(nodeFilesystem, project)).toEqual(NOTHING_BY_HAND);
  });

  it("writes beside the manuscript, and reads back", async () => {
    await writeNamesFile(nodeFilesystem, project, { character: ["EDWARD"], location: ["KITCHEN"] });
    expect(readFileSync(join(project.path, NAMES_FILE), "utf8")).toBe(
      "characters\n  EDWARD\nlocations\n  KITCHEN\n",
    );
    expect(await readNamesFile(nodeFilesystem, project)).toEqual({
      character: ["EDWARD"],
      location: ["KITCHEN"],
    });
    // Whole or not at all: no temp file is left behind, and the manuscript is untouched.
    expect(readdirSync(project.path).sort()).toEqual([MANUSCRIPT_FILE, NAMES_FILE]);
    expect(readFileSync(join(project.path, MANUSCRIPT_FILE), "utf8")).toBe("INT. KITCHEN - DAY\n");
  });

  it("refuses a file that exists and cannot be read, rather than reading it as empty", async () => {
    writeFileSync(join(project.path, NAMES_FILE), new Uint8Array([0xff, 0xfe, 0xfd]));
    await expect(readNamesFile(nodeFilesystem, project)).rejects.toThrow();
    // And it is still there, to be looked at.
    expect(existsSync(join(project.path, NAMES_FILE))).toBe(true);
  });

  it("carries what was added and removed from the lists to the file and back to the lists", async () => {
    const lists = NameLists.of([{ type: "character", text: "ANNE" }, { type: "character", text: "EDWRAD" }]);
    lists.add("character", "ZELDA");
    lists.remove("character", "EDWRAD");
    await writeNamesFile(nodeFilesystem, project, {
      character: lists.added("character"),
      location: lists.added("location"),
      removed: { character: lists.removed("character"), location: lists.removed("location") },
    });

    // A later session, the script as it was: ZELDA is on the list unused, and
    // EDWRAD stays off though the script still has it.
    const byHand = await readNamesFile(nodeFilesystem, project);
    const reopened = NameLists.of([{ type: "character", text: "ANNE" }, { type: "character", text: "EDWRAD" }], {
      added: byHand,
      ...(byHand.removed === undefined ? {} : { removed: byHand.removed }),
    });
    expect(reopened.list("character")).toEqual(["ANNE", "ZELDA"]);
  });
});
