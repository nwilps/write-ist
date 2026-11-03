/**
 * The names file: confirmed characters and locations, in the bundle, as plain
 * text (slice 2, step 8, Q1). Real files in a temporary folder.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MANUSCRIPT_FILE, NAMES_FILE, type Project } from "../../src/project/bundle.ts";
import {
  NO_CONFIRMATIONS,
  parseConfirmations,
  readConfirmations,
  serialiseConfirmations,
  writeConfirmations,
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
    expect(serialiseConfirmations({ character: ["SANDRA", "EDWARD"], location: ["KITCHEN"] })).toBe(
      "characters\n  EDWARD\n  SANDRA\nlocations\n  KITCHEN\n",
    );
  });

  it("writes nothing for nothing", () => {
    expect(serialiseConfirmations(NO_CONFIRMATIONS)).toBe("");
  });

  it("reads what it writes", () => {
    const confirmations = { character: ["ANN", "EDWARD"], location: ["BENNETT'S HOSPITAL ROOM"] };
    expect(parseConfirmations(serialiseConfirmations(confirmations))).toEqual(confirmations);
  });

  it("reads loosely: blank lines, CRLF, case, tabs, unknown kinds", () => {
    expect(
      parseConfirmations("Characters\r\n\tedward\r\n\r\n  Sandra  \r\nprops\r\n  KNIFE\r\nlocations\r\n  yard\r\n"),
    ).toEqual({ character: ["EDWARD", "SANDRA"], location: ["YARD"] });
  });

  it("ignores names that come before any kind", () => {
    expect(parseConfirmations("  STRAY\ncharacters\n  ANN\n")).toEqual({ character: ["ANN"], location: [] });
  });
});

describe("in the bundle", () => {
  it("reads as nothing confirmed when there is no file yet", async () => {
    expect(await readConfirmations(nodeFilesystem, project)).toEqual(NO_CONFIRMATIONS);
  });

  it("writes beside the manuscript, and reads back", async () => {
    await writeConfirmations(nodeFilesystem, project, { character: ["EDWARD"], location: ["KITCHEN"] });
    expect(readFileSync(join(project.path, NAMES_FILE), "utf8")).toBe(
      "characters\n  EDWARD\nlocations\n  KITCHEN\n",
    );
    expect(await readConfirmations(nodeFilesystem, project)).toEqual({
      character: ["EDWARD"],
      location: ["KITCHEN"],
    });
    // Whole or not at all: no temp file is left behind, and the manuscript is untouched.
    expect(readdirSync(project.path).sort()).toEqual([MANUSCRIPT_FILE, NAMES_FILE]);
    expect(readFileSync(join(project.path, MANUSCRIPT_FILE), "utf8")).toBe("INT. KITCHEN - DAY\n");
  });

  it("refuses a file that exists and cannot be read, rather than reading it as empty", async () => {
    writeFileSync(join(project.path, NAMES_FILE), new Uint8Array([0xff, 0xfe, 0xfd]));
    await expect(readConfirmations(nodeFilesystem, project)).rejects.toThrow();
    // And it is still there, to be looked at.
    expect(existsSync(join(project.path, NAMES_FILE))).toBe(true);
  });

  it("carries a confirmation from the lists to the file and back to the lists", async () => {
    const lists = NameLists.of([{ type: "character", text: "ANNE" }, { type: "character", text: "ANNE" }]);
    expect(lists.isConfirmed("character", "ANNE")).toBe(false);
    lists.confirm("character", "ANNE");
    await writeConfirmations(nodeFilesystem, project, {
      character: lists.explicit("character"),
      location: lists.explicit("location"),
    });

    // A later session, with the script's ANNEs gone, still knows ANNE.
    const reopened = new NameLists({ explicit: await readConfirmations(nodeFilesystem, project) });
    expect(reopened.isConfirmed("character", "ANNE")).toBe(true);
    expect(reopened.confirmed("character")).toEqual(["ANNE"]);
  });
});
