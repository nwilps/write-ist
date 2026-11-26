/**
 * Drafts on disk (`src/project/drafts.ts`; ADR-0002, ADR-0014, ADR-0018 and
 * ADR-0025, amended 2026-11-26): the names a lock mints, `drafts.md`, several
 * open drafts, branching, and a lock that lands whole or not at all.
 *
 * Real files in a temporary folder, over invented screenplays and Brick &
 * Steel — never the writer's own.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MANUSCRIPT_FILE, type Project } from "../../src/project/bundle.ts";
import { createProject } from "../../src/project/create.ts";
import {
  branchFrom,
  CannotChangeDrafts,
  chooseOpenDraft,
  cleanNote,
  continues,
  DRAFTS_FOLDER,
  DRAFTS_INDEX,
  draftNameText,
  draftTree,
  lineOfOpenDraft,
  localDay,
  lockDraft,
  lockNames,
  nextBranch,
  NOTE_MAX,
  openDraftFile,
  parseDraftIndex,
  parseDraftName,
  readDrafts,
  serialiseDraftIndex,
  TRUNK,
  type OpenDraft,
  type TreeRow,
} from "../../src/project/drafts.ts";
import type { Filesystem } from "../../src/project/filesystem.ts";
import { importProject } from "../../src/project/import.ts";
import { exportScreenplay, importScreenplay } from "../../src/screenplay/import.ts";
import { readFixtureBytes } from "../support/files.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

let temporary: { path: string; remove: () => void };
let project: Project;

beforeEach(async () => {
  temporary = temporaryDirectory();
  project = await createProject({ filesystem: nodeFilesystem, newProjectId: () => "id-drafts" }, join(temporary.path, "write-ist"), {
    title: "Night Ferry",
    type: "Feature",
  });
});
afterEach(() => temporary.remove());

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const at = (file: string): string => join(project.path, file);
const read = (file: string): string => readFileSync(at(file), "utf8");
const DAY = "2026-11-26";

/** Lock an open draft with whatever it says on disk now. */
async function lock(name: string, open: OpenDraft = TRUNK, note = ""): Promise<void> {
  await lockDraft(nodeFilesystem, project, { open, name, bytes: readFileSync(at(open.file)), note, today: DAY });
}

/** What the next lock of an open draft would be called, as the dialog offers it. */
async function offered(open: OpenDraft = TRUNK): Promise<string[]> {
  const names = lockNames(await readDrafts(nodeFilesystem, project), open);
  return names.kind === "first" ? [names.name] : [names.revision, names.newDraft];
}

describe("a draft's name", () => {
  it("is read from the right, and written back the same", () => {
    const cases: [string, ReturnType<typeof parseDraftName>][] = [
      ["1", { line: "", number: 1, revision: 0 }],
      ["12", { line: "", number: 12, revision: 0 }],
      ["1.1", { line: "", number: 1, revision: 1 }],
      ["3.10", { line: "", number: 3, revision: 10 }],
      ["2a", { line: "2a", number: 1, revision: 0 }],
      ["2b", { line: "2b", number: 1, revision: 0 }],
      ["2a.1", { line: "2a", number: 1, revision: 1 }],
      ["2a-2", { line: "2a", number: 2, revision: 0 }],
      ["2a-2.3", { line: "2a", number: 2, revision: 3 }],
      ["2aa", { line: "2aa", number: 1, revision: 0 }],
      ["1.1a", { line: "1.1a", number: 1, revision: 0 }],
      ["2a-2b", { line: "2a-2b", number: 1, revision: 0 }],
    ];
    for (const [text, name] of cases) {
      expect(parseDraftName(text), text).toEqual(name);
      expect(draftNameText(name!), text).toBe(text);
    }
  });

  it("is not anything else", () => {
    for (const text of ["", "0", "01", "1.0", "1.", ".1", "a", "2A", "2-2", "2a-1", "2a-", "2 a", "2ab-", "manuscript", "1.1.1", "2a.0"]) {
      expect(parseDraftName(text), text).toBeUndefined();
    }
  });

  it("keeps a branch's second new draft apart from a second departure", () => {
    // After 2a: 2a-2 is 2a's next new draft; 2b is the next departure from 2.
    expect(parseDraftName("2a-2")!.line).toBe("2a");
    expect(parseDraftName("2b")!.line).toBe("2b");
    expect(draftNameText({ line: "2a", number: 2, revision: 0 })).not.toBe("2b");
  });
});

describe("an open draft's file", () => {
  it("is manuscript.fountain on the trunk, and named for its branch on a branch", () => {
    expect(openDraftFile("")).toBe(MANUSCRIPT_FILE);
    expect(openDraftFile("2a")).toBe("manuscript 2a.fountain");
    expect(lineOfOpenDraft("manuscript.fountain")).toBe("");
    expect(lineOfOpenDraft("manuscript 2a.fountain")).toBe("2a");
    expect(lineOfOpenDraft("manuscript 1.1a.fountain")).toBe("1.1a");
  });

  it("is never a copy kept beside the manuscript, or a draft's later name", () => {
    for (const name of ["manuscript changed elsewhere 2026-11-26 10.00.00.fountain", "manuscript 2.fountain", "manuscript 2a-2.fountain", "manuscript 2a.1.fountain", "notes.md", "manuscript 2a.md"]) {
      expect(lineOfOpenDraft(name), name).toBeUndefined();
    }
  });
});

describe("drafts.md", () => {
  it("is a heading, the open draft written in, and a section for each lock with its date and note", () => {
    const text = serialiseDraftIndex({
      writingIn: "manuscript 2a.fountain",
      records: new Map([
        ["2", { locked: "2026-11-24" }],
        ["1.1", { locked: "2026-11-22", note: "Tightened act two." }],
        ["1", { locked: "2026-11-20", note: "First pass, for Sam." }],
        ["10", { locked: "2026-12-01" }],
      ]),
      others: [],
    });
    expect(text).toBe(
      [
        "# Drafts",
        "",
        "Writing in: manuscript 2a.fountain",
        "",
        "## 1",
        "",
        "Locked: 2026-11-20",
        "",
        "First pass, for Sam.",
        "",
        "## 1.1",
        "",
        "Locked: 2026-11-22",
        "",
        "Tightened act two.",
        "",
        "## 2",
        "",
        "Locked: 2026-11-24",
        "",
        "## 10",
        "",
        "Locked: 2026-12-01",
        "",
      ].join("\n"),
    );
    const back = parseDraftIndex(text);
    expect(back.writingIn).toBe("manuscript 2a.fountain");
    expect(back.records.get("1")).toEqual({ locked: "2026-11-20", note: "First pass, for Sam." });
    expect(back.records.get("2")).toEqual({ locked: "2026-11-24" });
    expect(serialiseDraftIndex(back)).toBe(text);
  });

  it("keeps a section it does not know, as it was", () => {
    const text = "# Drafts\n\n## 1\n\nLocked: 2026-11-20\n\n## Someone's own heading\n\nTheir words.\n";
    const back = parseDraftIndex(text);
    expect(back.others).toEqual(["## Someone's own heading\n\nTheir words."]);
    expect(serialiseDraftIndex(back)).toContain("## Someone's own heading\n\nTheir words.\n");
  });

  it("will not read without its heading", () => {
    expect(() => parseDraftIndex("## 1\n\nLocked: 2026-11-20\n")).toThrow(/# Drafts/);
  });
});

describe("a note", () => {
  it("is one line, at most NOTE_MAX characters, put right quietly", () => {
    expect(cleanNote("  first   pass\nfor Sam ")).toBe("first pass for Sam");
    expect(cleanNote("## a heading")).toBe("a heading");
    expect([...cleanNote("é".repeat(NOTE_MAX + 40))]).toHaveLength(NOTE_MAX);
    expect(cleanNote("   ")).toBe("");
  });
});

describe("a project made before drafts", () => {
  it("is one open draft on the trunk, written in, that locks as Draft 1", async () => {
    // Only the marker and manuscript.fountain: no drafts/, no drafts.md.
    expect(readdirSync(project.path).sort()).toEqual(["details.md", "manuscript.fountain", "project.md"].filter((name) => existsSync(at(name))));
    expect(existsSync(at(DRAFTS_FOLDER))).toBe(false);
    const drafts = await readDrafts(nodeFilesystem, project);
    expect(drafts.locked).toEqual([]);
    expect(drafts.open).toEqual([TRUNK]);
    expect(drafts.active).toEqual(TRUNK);
    expect(drafts.trouble).toBeUndefined();
    expect(lockNames(drafts, TRUNK)).toEqual({ kind: "first", name: "1" });
  });

  it("an imported one too: Brick & Steel opens on its manuscript, unchanged by being read", async () => {
    const source = join(temporary.path, "Brick-&-Steel.fountain");
    writeFileSync(source, readFixtureBytes("Brick-&-Steel.fountain"));
    const imported = await importProject(
      { filesystem: nodeFilesystem, newProjectId: () => "id-brick" },
      { sourcePath: source, projectsDirectory: join(temporary.path, "write-ist") },
    );
    const before = readdirSync(imported.project.path).sort();
    const drafts = await readDrafts(nodeFilesystem, imported.project);
    expect(drafts.active).toEqual(TRUNK);
    expect(drafts.locked).toHaveLength(0);
    expect(readdirSync(imported.project.path).sort()).toEqual(before);
  });
});

describe("locking", () => {
  it("first locks as 1: a copy backward, byte for byte, dated, with its note, and the open draft untouched", async () => {
    writeFileSync(at(MANUSCRIPT_FILE), "INT. FERRY - NIGHT\n\nThe deck rolls.\n");
    const before = readFileSync(at(MANUSCRIPT_FILE));
    await lock("1", TRUNK, "First pass, for Sam.");

    expect(readFileSync(at("drafts/1.fountain"))).toEqual(before);
    expect(readFileSync(at(MANUSCRIPT_FILE))).toEqual(before);
    expect(read(DRAFTS_INDEX)).toBe(
      "# Drafts\n\nWriting in: manuscript.fountain\n\n## 1\n\nLocked: 2026-11-26\n\nFirst pass, for Sam.\n",
    );
    const drafts = await readDrafts(nodeFilesystem, project);
    expect(drafts.locked.map((draft) => [draft.name, draft.locked, draft.note])).toEqual([["1", DAY, "First pass, for Sam."]]);
    expect(continues(drafts, TRUNK)?.name).toBe("1");
  });

  it("then offers a revision or a new draft, by name: 1.1 or 2, 1.2 or 2, then 2.1 or 3", async () => {
    await lock("1");
    expect(await offered()).toEqual(["1.1", "2"]);
    await lock("1.1");
    expect(await offered()).toEqual(["1.2", "2"]);
    await lock("1.2");
    await lock("2");
    expect(await offered()).toEqual(["2.1", "3"]);
    await lock("3");
    expect(await offered()).toEqual(["3.1", "4"]);
    expect(readdirSync(at(DRAFTS_FOLDER)).sort()).toEqual(["1.1.fountain", "1.2.fountain", "1.fountain", "2.fountain", "3.fountain"]);
  });

  it("refuses a name that is not next, and never writes over a locked draft", async () => {
    await lock("1");
    await expect(lock("3")).rejects.toThrow(CannotChangeDrafts);
    await expect(lock("1")).rejects.toThrow(/not the next name/);
    // A Draft 2 put there by hand is Draft 2: the next is 2.1 or 3.
    writeFileSync(at("drafts/2.fountain"), "Someone else's draft 2.\n");
    expect(await offered()).toEqual(["2.1", "3"]);
    await expect(lock("2")).rejects.toThrow(/not the next name/);
    expect(read("drafts/2.fountain")).toBe("Someone else's draft 2.\n");
  });

  it("never writes over a locked draft that arrived after the folder was read", async () => {
    await lock("1");
    writeFileSync(at("drafts/2.fountain"), "Arrived meanwhile.\n");
    // The listing missed it, as one taken a moment before it arrived would.
    const late: Filesystem = {
      ...nodeFilesystem,
      readDirectory: async (path) => (await nodeFilesystem.readDirectory(path)).filter((entry) => entry.name !== "2.fountain"),
    };
    await expect(
      lockDraft(late, project, { open: TRUNK, name: "2", bytes: encode("Mine.\n"), note: "", today: DAY }),
    ).rejects.toThrow(/already a Draft 2/);
    expect(read("drafts/2.fountain")).toBe("Arrived meanwhile.\n");
    expect(parseDraftIndex(read(DRAFTS_INDEX)).records.has("2")).toBe(false);
  });

  it("keeps the comments in the locked copy, whatever is done to the open draft after", async () => {
    const commented = "INT. FERRY - NIGHT\n\n[[c:1 too slow]]The deck rolls.[[/c:1]]\n";
    writeFileSync(at(MANUSCRIPT_FILE), commented);
    await lock("1");
    // Unticking Carry comments forward takes them out of the open draft only.
    writeFileSync(at(MANUSCRIPT_FILE), "INT. FERRY - NIGHT\n\nThe deck rolls.\n");
    const frozen = importScreenplay(readFileSync(at("drafts/1.fountain"))).document;
    expect(frozen.comments.map((comment) => [comment.id, comment.remark])).toEqual([["1", "too slow"]]);
    expect(read("drafts/1.fountain")).toBe(commented);
  });

  it("lands whole or not at all: an index that cannot be written takes the locked file back", async () => {
    const failing: Filesystem = {
      ...nodeFilesystem,
      writeFile: (path, bytes) =>
        path.endsWith(DRAFTS_INDEX) ? Promise.reject(new Error("The disk is full.")) : nodeFilesystem.writeFile(path, bytes),
    };
    const live = readFileSync(at(MANUSCRIPT_FILE));
    await expect(
      lockDraft(failing, project, { open: TRUNK, name: "1", bytes: live, note: "", today: DAY }),
    ).rejects.toThrow(/disk is full/);
    expect(existsSync(at("drafts/1.fountain"))).toBe(false);
    expect(existsSync(at(DRAFTS_INDEX))).toBe(false);
    expect(readFileSync(at(MANUSCRIPT_FILE))).toEqual(live);
    // And the next try is the first lock still.
    expect(await offered()).toEqual(["1"]);
  });

  it("writes nothing when the locked file itself cannot be written", async () => {
    const failing: Filesystem = {
      ...nodeFilesystem,
      writeFile: (path, bytes) =>
        path.includes(`/${DRAFTS_FOLDER}/`) ? Promise.reject(new Error("The disk is full.")) : nodeFilesystem.writeFile(path, bytes),
    };
    await expect(
      lockDraft(failing, project, { open: TRUNK, name: "1", bytes: encode("x"), note: "", today: DAY }),
    ).rejects.toThrow(/disk is full/);
    expect(existsSync(at(DRAFTS_INDEX))).toBe(false);
    expect(readdirSync(at(DRAFTS_FOLDER))).toEqual([]);
  });

  it("never writes over a drafts.md that will not read, and locks nothing", async () => {
    writeFileSync(at(DRAFTS_INDEX), "This is not the index.\n");
    const drafts = await readDrafts(nodeFilesystem, project);
    expect(drafts.index).toBeUndefined();
    expect(drafts.trouble).toMatch(/could not read this project's drafts\.md/);
    await expect(lock("1")).rejects.toThrow(/Nothing was changed/);
    expect(read(DRAFTS_INDEX)).toBe("This is not the index.\n");
    expect(existsSync(at("drafts/1.fountain"))).toBe(false);
  });

  it("costs only dates and notes when drafts.md is lost: the drafts and their order are their names", async () => {
    await lock("1", TRUNK, "a note");
    await lock("2");
    await lock("2.1");
    writeFileSync(at(DRAFTS_INDEX), "# Drafts\n");
    const drafts = await readDrafts(nodeFilesystem, project);
    expect(drafts.locked.map((draft) => [draft.name, draft.locked, draft.note])).toEqual([
      ["1", undefined, undefined],
      ["2", undefined, undefined],
      ["2.1", undefined, undefined],
    ]);
    expect(await offered()).toEqual(["2.2", "3"]);
  });
});

describe("branching, and several open drafts", () => {
  /** Draft 1, 2 and 3 locked on the trunk, and the trunk's open draft with words of its own. */
  async function threeDrafts(): Promise<void> {
    for (const [name, words] of [["1", "One."], ["2", "Two."], ["3", "Three."]] as const) {
      writeFileSync(at(MANUSCRIPT_FILE), `${words}\n`);
      await lock(name);
    }
    writeFileSync(at(MANUSCRIPT_FILE), "Four, being written.\n");
  }

  it("branches from an earlier draft as 2a, a new open draft that starts as a copy of it", async () => {
    await threeDrafts();
    const open = await branchFrom(nodeFilesystem, project, "2");
    expect(open).toEqual({ line: "2a", file: "manuscript 2a.fountain" });
    expect(read("manuscript 2a.fountain")).toBe("Two.\n");
    const drafts = await readDrafts(nodeFilesystem, project);
    expect(drafts.active).toEqual(open);
    expect(read(DRAFTS_INDEX)).toContain("Writing in: manuscript 2a.fountain");
  });

  it("does not lock or disturb the trunk's open draft, which stays open beside it", async () => {
    await threeDrafts();
    const lockedBefore = readdirSync(at(DRAFTS_FOLDER)).sort();
    await branchFrom(nodeFilesystem, project, "2");
    expect(read(MANUSCRIPT_FILE)).toBe("Four, being written.\n");
    expect(readdirSync(at(DRAFTS_FOLDER)).sort()).toEqual(lockedBefore);
    const drafts = await readDrafts(nodeFilesystem, project);
    expect(drafts.open).toEqual([TRUNK, { line: "2a", file: "manuscript 2a.fountain" }]);
    // The trunk still locks as it would have.
    expect(lockNames(drafts, TRUNK)).toEqual({ kind: "choose", revision: "3.1", newDraft: "4" });
  });

  it("names a second departure from 2 as 2b, and one from a branch's draft with its own letter", async () => {
    await threeDrafts();
    await branchFrom(nodeFilesystem, project, "2");
    expect(nextBranch(await readDrafts(nodeFilesystem, project), "2")).toBe("2b");
    const second = await branchFrom(nodeFilesystem, project, "2");
    expect(second.line).toBe("2b");
    const fromRevision = await branchFrom(nodeFilesystem, project, "1");
    expect(fromRevision.line).toBe("1a");
  });

  it("locks a branch first as its own name, then 2a.1 for a revision or 2a-2 for a new draft — never 2b", async () => {
    await threeDrafts();
    const branch = await branchFrom(nodeFilesystem, project, "2");
    expect(await offered(branch)).toEqual(["2a"]);
    await lock("2a", branch);
    expect(await offered(branch)).toEqual(["2a.1", "2a-2"]);
    await lock("2a.1", branch);
    expect(await offered(branch)).toEqual(["2a.2", "2a-2"]);
    await lock("2a-2", branch);
    expect(await offered(branch)).toEqual(["2a-2.1", "2a-3"]);
    // A departure from 2 is still free as 2b; from 2a, it is 2aa.
    const drafts = await readDrafts(nodeFilesystem, project);
    expect(nextBranch(drafts, "2")).toBe("2b");
    expect(nextBranch(drafts, "2a")).toBe("2aa");
    // And the trunk is untouched by all of it.
    expect(await offered(TRUNK)).toEqual(["3.1", "4"]);
  });

  it("moves between open drafts by writing only which one is in front", async () => {
    await threeDrafts();
    const branch = await branchFrom(nodeFilesystem, project, "2");
    const words = { trunk: read(MANUSCRIPT_FILE), branch: read(branch.file) };
    await chooseOpenDraft(nodeFilesystem, project, TRUNK);
    expect((await readDrafts(nodeFilesystem, project)).active).toEqual(TRUNK);
    await chooseOpenDraft(nodeFilesystem, project, branch);
    expect((await readDrafts(nodeFilesystem, project)).active).toEqual(branch);
    expect({ trunk: read(MANUSCRIPT_FILE), branch: read(branch.file) }).toEqual(words);
    // The dates are kept through it.
    expect((await readDrafts(nodeFilesystem, project)).locked.map((draft) => draft.locked)).toEqual([DAY, DAY, DAY]);
  });

  it("refuses to branch from a draft that is not locked", async () => {
    await expect(branchFrom(nodeFilesystem, project, "1")).rejects.toThrow(/no locked Draft 1/);
  });

  it("opens on the trunk when drafts.md names an open draft that is not there", async () => {
    writeFileSync(at(DRAFTS_INDEX), "# Drafts\n\nWriting in: manuscript 9z.fountain\n");
    expect((await readDrafts(nodeFilesystem, project)).active).toEqual(TRUNK);
  });
});

describe("the Draft Tree's rows", () => {
  const shape = (rows: readonly TreeRow[]): string[] =>
    rows.map((row) => `${"  ".repeat(row.depth)}${row.kind === "locked" ? row.draft.name : `open:${row.open.line || "trunk"}`}`);

  it("run the trunk down the left, revisions a step in, branches under where they depart, open drafts at each foot", async () => {
    await lock("1");
    await lock("1.1");
    await lock("2");
    await lock("3");
    const branch = await branchFrom(nodeFilesystem, project, "2");
    await lock("2a", branch);
    await lock("2a.1", branch);
    await branchFrom(nodeFilesystem, project, "2");
    await branchFrom(nodeFilesystem, project, "1.1");
    const rows = draftTree(await readDrafts(nodeFilesystem, project));
    expect(shape(rows)).toEqual([
      "1",
      "  1.1",
      "    open:1.1a",
      "2",
      "  2a",
      "    2a.1",
      "  open:2a",
      "  open:2b",
      "3",
      "open:trunk",
    ]);
    const open = rows.filter((row) => row.kind === "open");
    expect(open.map((row) => [row.open.line, row.after?.name, row.first])).toEqual([
      ["1.1a", undefined, "1.1a"],
      ["2a", "2a.1", "2a"],
      ["2b", undefined, "2b"],
      ["", "3", "1"],
    ]);
  });

  it("is one open Draft 1 for a project that has never locked", async () => {
    const rows = draftTree(await readDrafts(nodeFilesystem, project));
    expect(rows).toEqual([{ kind: "open", open: TRUNK, depth: 0, after: undefined, first: "1" }]);
  });
});

describe("the day a lock is dated", () => {
  it("is the writer's own, year first", () => {
    expect(localDay(new Date(2026, 10, 26, 23, 59))).toBe("2026-11-26");
    expect(localDay(new Date(2027, 0, 3))).toBe("2027-01-03");
  });
});

describe("a locked copy", () => {
  it("is exactly what the serialiser writes for the open draft, so it opens as the same screenplay", async () => {
    const document = importScreenplay(readFixtureBytes("Brick-&-Steel.fountain")).document;
    const bytes = exportScreenplay(document);
    await lockDraft(nodeFilesystem, project, { open: TRUNK, name: "1", bytes, note: "", today: DAY });
    const back = importScreenplay(readFileSync(at("drafts/1.fountain"))).document;
    expect(back.elements.length).toBe(document.elements.length);
    expect(back.elements.map((element) => element.type)).toEqual(document.elements.map((element) => element.type));
  });
});
