/**
 * Edit ▸ Character List and Location List (Noah, 2026-11-21; simplified
 * 2026-11-22): the names a project's autocomplete offers, which the writer can
 * add to and remove from.
 *
 * - A name is on its list after **one** use. There is no count to reach.
 * - **Add**: on the list, and offered by autocomplete, at once.
 * - **Remove**: deleted from the list. The uses already in the script never
 *   put it back — not when the list is worked out again, not when the dialog
 *   closes, not when the project is opened again. Only a new cue or heading
 *   typed afterwards does.
 * - Kept per project, in the names file. Nothing is ever said.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TextSelection } from "prosemirror-state";
import { NAMES_FILE, type Project } from "../../src/project/bundle.ts";
import { importProject } from "../../src/project/import.ts";
import { manuscriptSession, readManuscript, type ManuscriptSession } from "../../src/project/manuscript-session.ts";
import { readNamesFile } from "../../src/project/names-file.ts";
import { openProject } from "../../src/project/open.ts";
import { completions } from "../../src/screenplay/autocomplete.ts";
import { NameLists, type NameLine } from "../../src/screenplay/names.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { fakeEngine } from "../support/spell-engine.ts";

const cue = (name: string): NameLine => ({ type: "character", text: name });
const heading = (text: string): NameLine => ({ type: "scene-heading", text });

/** EDWARD three times, EDNA once; KITCHEN three times. */
const LINES = [cue("EDWARD"), cue("EDWARD"), cue("EDWARD"), cue("EDNA"), ...Array.from({ length: 3 }, () => heading("INT. KITCHEN - DAY"))];

describe("the lists, added to and removed from", () => {
  it("offer a name used once, and a name added by hand at once, used or not", () => {
    const lists = NameLists.of(LINES);
    expect(lists.startingWith("character", "ED")).toEqual(["EDNA", "EDWARD"]);
    expect(completions("character", "edn", lists)?.choices).toEqual(["EDNA"]);
    expect(lists.add("character", "Zelda")).toBe(true);
    expect(lists.add("location", "the attic")).toBe(true);
    expect(lists.list("location")).toEqual(["KITCHEN", "THE ATTIC"]);
    expect(completions("character", "ze", lists)?.choices).toEqual(["ZELDA"]);
  });

  it("stop offering a removed name, however often the script uses it", () => {
    const lists = NameLists.of(LINES);
    expect(lists.remove("character", "EDWARD")).toBe(true);
    expect(lists.list("character")).toEqual(["EDNA"]);
    expect(completions("character", "EDW", lists)).toBeUndefined();
    // The manuscript's count is untouched.
    expect(lists.uses("character", "EDWARD")).toBe(3);
  });

  it("let a name added after it was removed back in at once", () => {
    const lists = NameLists.of(LINES);
    lists.remove("location", "KITCHEN");
    expect(lists.list("location")).toEqual([]);
    lists.add("location", "KITCHEN");
    expect(lists.list("location")).toEqual(["KITCHEN"]);
    expect(lists.isRemoved("location", "KITCHEN")).toBe(false);
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
    expect(session.nameList("character")).toEqual(["EDNA", "EDWARD"]);
    expect(session.addName("character", "zelda")).toBe(true);
    expect(session.nameList("character")).toEqual(["EDNA", "EDWARD", "ZELDA"]);
    expect(session.names.startingWith("character", "Z")).toEqual(["ZELDA"]);
    await session.settled();
    expect(readFileSync(join(path, NAMES_FILE), "utf8")).toBe("characters\n  ZELDA\n");
    expect(reports).toEqual([]);
  });

  it("removes a name: no longer offered, kept as removed, the screenplay untouched", async () => {
    const { session, reports, path } = await open();
    const before = session.manuscript();
    expect(session.removeName("character", "EDWARD")).toBe(true);
    expect(session.nameList("character")).toEqual(["EDNA"]);
    expect(session.names.startingWith("character", "EDW")).toEqual([]);
    expect(session.manuscript()).toEqual(before);
    await session.settled();
    expect(readFileSync(join(path, NAMES_FILE), "utf8")).toBe("removed characters\n  EDWARD\n");
    expect(reports).toEqual([]);
  });

  it("does not bounce a removed name back while its cues are still in the script", async () => {
    const { session } = await open();
    session.removeName("character", "EDWARD");
    // Editing elsewhere, and moving the caret through EDWARD's cues: the list is worked out again each time.
    typeCue(session, "EDNA");
    const edward = session.manuscript().elements.findIndex((element) => element.text === "EDWARD");
    let at = 0;
    session.state.doc.forEach((node, offset, index) => void (index === edward && (at = offset + 2)));
    session.apply(session.state.tr.setSelection(TextSelection.create(session.state.doc, at)));
    session.apply(session.state.tr.setSelection(TextSelection.create(session.state.doc, 1)));
    expect(session.nameList("character")).toEqual(["EDNA"]);
    // Fixing a letter of an EDWARD cue already there is not a new use.
    session.apply(session.state.tr.delete(at, at + 1));
    session.apply(session.state.tr.insertText("D", at));
    session.apply(session.state.tr.setSelection(TextSelection.create(session.state.doc, 1)));
    expect(session.nameList("character")).toEqual(["EDNA"]);
    expect(completions("character", "EDW", session.names)).toBeUndefined();
  });

  it("brings it back when a new cue is typed, once the caret leaves it, and the file forgets it was removed", async () => {
    const { session, reports, project } = await open();
    session.removeName("character", "EDWARD");
    typeCue(session, "EDWARD");
    // The caret is still in the cue: it may yet become another name.
    expect(session.nameList("character")).toEqual(["EDNA"]);
    session.apply(session.state.tr.setSelection(TextSelection.create(session.state.doc, 1)));
    expect(session.nameList("character")).toEqual(["EDNA", "EDWARD"]);
    await session.settled();
    expect((await readNamesFile(nodeFilesystem, project)).removed).toBeUndefined();
    expect(reports).toEqual([]);
  });

  it("keeps each project's own lists: what was removed stays removed when it is opened again", async () => {
    const first = await open();
    first.session.removeName("character", "EDWARD");
    first.session.addName("location", "THE ATTIC");
    await first.session.settled();
    // Opened again: read from the names file, and made into the lists.
    const read = await readManuscript(nodeFilesystem, first.project, () => {});
    expect(read.namesByHand?.removed?.character).toEqual(["EDWARD"]);
    expect(read.namesByHand?.location).toEqual(["THE ATTIC"]);
    const again = manuscriptSession({ ...portsFor(first.project), report: () => {} }, read);
    expect(again.nameList("character")).toEqual(["EDNA"]);
    expect(again.nameList("location")).toEqual(["KITCHEN", "THE ATTIC"]);
    // Moving about the reopened script brings nothing back.
    again.apply(again.state.tr.setSelection(TextSelection.create(again.state.doc, again.state.doc.content.size - 1)));
    expect(again.nameList("character")).toEqual(["EDNA"]);
  });

  it("opens an older names file's hidden names as removed", async () => {
    const first = await open();
    writeFileSync(join(first.path, NAMES_FILE), "characters\n  ZELDA\nhidden characters\n  EDWARD\t3\n");
    const read = await readManuscript(nodeFilesystem, first.project, () => {});
    const again = manuscriptSession({ ...portsFor(first.project), report: () => {} }, read);
    expect(again.nameList("character")).toEqual(["EDNA", "ZELDA"]);
    // The next change writes the file in today's form.
    again.addName("location", "THE ATTIC");
    await again.settled();
    expect(readFileSync(join(first.path, NAMES_FILE), "utf8")).toBe(
      "characters\n  ZELDA\nlocations\n  THE ATTIC\nremoved characters\n  EDWARD\n",
    );
  });
});
