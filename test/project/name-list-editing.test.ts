/**
 * Edit ▸ Character List and Location List (Noah, 2026-11-21): the names a
 * project's autocomplete offers, which the writer can add to and remove from.
 *
 * - **Add**: confirmed by hand, offered by autocomplete at once.
 * - **Remove**: hidden — autocomplete stops offering it — until the paper uses
 *   it three more times, when it quietly returns.
 * - Kept per project, in the names file. Nothing is ever said.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TextSelection } from "prosemirror-state";
import { NAMES_FILE, type Project } from "../../src/project/bundle.ts";
import { importProject } from "../../src/project/import.ts";
import { manuscriptSession, readManuscript, type ManuscriptSession } from "../../src/project/manuscript-session.ts";
import { parseConfirmations, readConfirmations, serialiseConfirmations } from "../../src/project/names-file.ts";
import { openProject } from "../../src/project/open.ts";
import { completions } from "../../src/screenplay/autocomplete.ts";
import { NameLists, RETURN_AFTER_USES, type NameLine } from "../../src/screenplay/names.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { fakeEngine } from "../support/spell-engine.ts";

const cue = (name: string): NameLine => ({ type: "character", text: name });
const heading = (text: string): NameLine => ({ type: "scene-heading", text });

/** EDWARD three times (confirmed by use), EDNA once; KITCHEN three times. */
const LINES = [cue("EDWARD"), cue("EDWARD"), cue("EDWARD"), cue("EDNA"), ...Array.from({ length: 3 }, () => heading("INT. KITCHEN - DAY"))];

describe("the lists, added to and removed from", () => {
  it("offer a name added by hand at once, used or not", () => {
    const lists = NameLists.of(LINES);
    expect(lists.confirmedStartingWith("character", "ED")).toEqual(["EDWARD"]);
    expect(lists.add("character", "Edna")).toBe(true);
    expect(lists.confirmedStartingWith("character", "ED")).toEqual(["EDNA", "EDWARD"]);
    expect(lists.add("location", "the attic")).toBe(true);
    expect(lists.confirmed("location")).toEqual(["KITCHEN", "THE ATTIC"]);
    // Through autocomplete itself: typed, it is offered.
    expect(completions("character", "edn", lists)?.choices).toEqual(["EDNA"]);
  });

  it("stop offering a removed name, however often the paper uses it", () => {
    const lists = NameLists.of(LINES);
    expect(lists.remove("character", "EDWARD")).toBe(true);
    expect(lists.confirmed("character")).toEqual([]);
    expect(lists.isHidden("character", "edward")).toBe(true);
    expect(completions("character", "ED", lists)).toBeUndefined();
    // The manuscript's count is untouched.
    expect(lists.uses("character", "EDWARD")).toBe(3);
  });

  it("bring a removed name back, quietly, once the paper uses it three more times", () => {
    const lists = NameLists.of(LINES);
    lists.remove("character", "EDWARD");
    const before = lists.hiddenVersion;
    for (let more = 1; more < RETURN_AFTER_USES; more++) {
      lists.apply([], [cue("EDWARD")]);
      expect(lists.isHidden("character", "EDWARD"), `${more} more`).toBe(true);
    }
    lists.apply([], [cue("EDWARD")]);
    expect(lists.isHidden("character", "EDWARD")).toBe(false);
    expect(lists.confirmed("character")).toEqual(["EDWARD"]);
    // The names file has something new to keep.
    expect(lists.hiddenVersion).toBeGreaterThan(before);
    expect(lists.hidden("character")).toEqual([]);
  });

  it("count the three from fewer uses, when uses are taken away after the removal", () => {
    const lists = NameLists.of(LINES);
    lists.remove("character", "EDWARD");
    lists.apply([cue("EDWARD"), cue("EDWARD")], []);
    expect(lists.hidden("character")).toEqual([{ name: "EDWARD", since: 1 }]);
    lists.apply([], [cue("EDWARD"), cue("EDWARD")]);
    expect(lists.isHidden("character", "EDWARD")).toBe(true);
    lists.apply([], [cue("EDWARD")]);
    expect(lists.isHidden("character", "EDWARD")).toBe(false);
  });

  it("let a name added after it was removed back in at once", () => {
    const lists = NameLists.of(LINES);
    lists.remove("location", "KITCHEN");
    expect(lists.confirmed("location")).toEqual([]);
    lists.add("location", "KITCHEN");
    expect(lists.confirmed("location")).toEqual(["KITCHEN"]);
    expect(lists.isHidden("location", "KITCHEN")).toBe(false);
  });

  it("forget a name added by hand and never used, rather than hide it", () => {
    const lists = NameLists.of(LINES);
    lists.add("character", "ZELDA");
    expect(lists.remove("character", "ZELDA")).toBe(true);
    expect(lists.isHidden("character", "ZELDA")).toBe(false);
    expect(lists.entries("character").map((entry) => entry.name)).not.toContain("ZELDA");
    expect(lists.remove("character", "NOBODY")).toBe(false);
  });

  it("are made again with what the names file kept", () => {
    const lists = NameLists.of(LINES, { hidden: { character: [{ name: "edward", since: 3 }], location: [] } });
    expect(lists.confirmed("character")).toEqual([]);
    expect(lists.entries("character").find((entry) => entry.name === "EDWARD")).toMatchObject({ hidden: true, confirmed: false });
  });
});

describe("the names file", () => {
  it("keeps the removed names with their marks, after the confirmed ones", () => {
    const text = serialiseConfirmations({
      character: ["EDNA"],
      location: [],
      hidden: { character: [{ name: "EDWRAD", since: 2 }], location: [{ name: "THE ROOM 12", since: 0 }] },
    });
    expect(text).toBe("characters\n  EDNA\nhidden characters\n  EDWRAD\t2\nhidden locations\n  THE ROOM 12\t0\n");
    expect(parseConfirmations(text)).toEqual({
      character: ["EDNA"],
      location: [],
      hidden: { character: [{ name: "EDWRAD", since: 2 }], location: [{ name: "THE ROOM 12", since: 0 }] },
    });
  });

  it("reads a file with no removed names as it always did", () => {
    expect(parseConfirmations("characters\n  EDNA\n")).toEqual({ character: ["EDNA"], location: [] });
    expect(serialiseConfirmations({ character: ["EDNA"], location: [] })).toBe("characters\n  EDNA\n");
  });
});

describe("in a project", () => {
  let temporary: { path: string; remove: () => void };
  beforeEach(() => {
    temporary = temporaryDirectory();
  });
  afterEach(() => temporary.remove());

  const SCRIPT = ["INT. KITCHEN - DAY", "", "EDWARD", "One.", "", "EDWARD", "Two.", "", "EDWARD", "Three.", "", "EDNA", "Four.", ""].join("\n");

  async function open(): Promise<{ session: ManuscriptSession; reports: string[]; path: string; project: Project }> {
    const source = join(temporary.path, "script.fountain");
    writeFileSync(source, SCRIPT);
    const imported = await importProject(
      { filesystem: nodeFilesystem, newProjectId: () => "3f2a1c44-0000-4000-8000-0123456789ab" },
      { sourcePath: source, projectsDirectory: join(temporary.path, "write-ist") },
    );
    const opened = await openProject(nodeFilesystem, imported.project);
    const reports: string[] = [];
    const ports = { ...portsFor(opened.project), report: (text: string) => void reports.push(text) };
    const read = await readManuscript(nodeFilesystem, opened.project, ports.report);
    return { session: manuscriptSession(ports, read), reports, path: opened.project.path, project: opened.project };
  }

  function portsFor(project: Project) {
    return {
      filesystem: nodeFilesystem,
      project,
      report: (_text: string) => {},
      setSaved: () => {},
      setStatus: () => {},
      setGoal: () => {},
      ledger: () => undefined,
      whenSwitchedAway: () => () => {},
      whenSwitchedBack: () => () => {},
      spellEngine: fakeEngine(),
      drawSeam: () => ({}) as HTMLElement,
      drawOffer: () => ({}) as HTMLElement,
      reloaded: () => {},
      autosaveClock: { wait: (run: () => void) => run, cancel: () => {} },
    };
  }

  /** A new cue typed at the end of the script: a line of its own, then the name. */
  function typeCue(session: ManuscriptSession, name: string): void {
    const end = session.state.doc.content.size;
    const node = session.state.schema.nodes["element"]!.create({ type: "character" }, session.state.schema.text(name));
    const tr = session.state.tr.insert(end, node);
    session.apply(tr.setSelection(TextSelection.create(tr.doc, tr.doc.content.size - 1)));
  }

  it("adds a name: offered at once, and kept in the names file", async () => {
    const { session, reports, path } = await open();
    expect(session.nameList("character")).toEqual(["EDWARD"]);
    expect(session.addName("character", "zelda")).toBe(true);
    expect(session.nameList("character")).toEqual(["EDWARD", "ZELDA"]);
    expect(session.names.confirmedStartingWith("character", "Z")).toEqual(["ZELDA"]);
    await session.settled();
    expect(readFileSync(join(path, NAMES_FILE), "utf8")).toBe("characters\n  ZELDA\n");
    expect(reports).toEqual([]);
  });

  it("removes a name: no longer offered, kept as hidden, the screenplay untouched", async () => {
    const { session, reports, path } = await open();
    const before = session.manuscript();
    expect(session.removeName("character", "EDWARD")).toBe(true);
    expect(session.nameList("character")).toEqual([]);
    expect(session.names.confirmedStartingWith("character", "ED")).toEqual([]);
    expect(session.manuscript()).toEqual(before);
    await session.settled();
    expect(readFileSync(join(path, NAMES_FILE), "utf8")).toBe("hidden characters\n  EDWARD\t3\n");
    expect(reports).toEqual([]);
  });

  it("brings it back after three more uses on the paper, and the file forgets it was hidden", async () => {
    const { session, reports, project } = await open();
    session.removeName("character", "EDWARD");
    typeCue(session, "EDWARD");
    typeCue(session, "EDWARD");
    expect(session.nameList("character")).toEqual([]);
    typeCue(session, "EDWARD");
    expect(session.nameList("character")).toEqual(["EDWARD"]);
    await session.settled();
    expect((await readConfirmations(nodeFilesystem, project)).hidden).toBeUndefined();
    expect(reports).toEqual([]);
  });

  it("keeps each project's own lists: what was removed stays removed when it is opened again", async () => {
    const first = await open();
    first.session.removeName("character", "EDWARD");
    first.session.addName("location", "THE ATTIC");
    await first.session.settled();
    // Opened again: read from the names file, and made into the lists.
    const read = await readManuscript(nodeFilesystem, first.project, () => {});
    expect(read.confirmed?.hidden?.character).toEqual([{ name: "EDWARD", since: 3 }]);
    expect(read.confirmed?.location).toEqual(["THE ATTIC"]);
    const again = manuscriptSession({ ...portsFor(first.project), report: () => {} }, read);
    expect(again.nameList("character")).toEqual([]);
    // KITCHEN is used once here, too few to be offered; THE ATTIC was added by hand.
    expect(again.nameList("location")).toEqual(["THE ATTIC"]);
  });
});
