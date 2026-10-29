/**
 * Never overwriting a change made elsewhere (#42, ADR-0028) — with real files
 * in a temporary folder, the other editor simulated by writing the manuscript
 * directly.
 *
 * > **Before each save, and whenever the writer switches back to Write-ist, it
 * > checks whether the file on disk is still the one it last read or wrote.**
 *
 * Switching back asks the same routine a save does (the Editor calls it), so
 * every case here is a save, and the three outcomes are what the files hold
 * afterwards: unchanged; changed with no typing, so reloaded and nothing
 * written; changed with typing, so both kept.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MANUSCRIPT_FILE } from "../../src/project/bundle.ts";
import type { Filesystem } from "../../src/project/filesystem.ts";
import { importProject } from "../../src/project/import.ts";
import { openProject, type OpenedProject } from "../../src/project/open.ts";
import {
  copyNameFor,
  editingSession,
  type ChangedElsewhere,
} from "../../src/project/save.ts";
import type { ScreenplayDocument } from "../../src/screenplay/document.ts";
import type { ImportedScreenplay } from "../../src/screenplay/import.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { readFixtureBytes } from "../support/files.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

let temporary: { path: string; remove: () => void };

beforeEach(() => {
  temporary = temporaryDirectory();
});

afterEach(() => temporary.remove());

async function aProject(fixture = "Brick-&-Steel.fountain"): Promise<OpenedProject> {
  const source = join(temporary.path, fixture);
  writeFileSync(source, readFixtureBytes(fixture));
  const imported = await importProject(
    { filesystem: nodeFilesystem, newProjectId: () => "3f2a1c44-0000-4000-8000-0123456789ab" },
    { sourcePath: source, projectsDirectory: join(temporary.path, "write-ist") },
  );
  return openProject(nodeFilesystem, imported.project);
}

function manuscriptPath(opened: OpenedProject): string {
  return join(opened.project.path, MANUSCRIPT_FILE);
}

function onDisk(opened: OpenedProject): Uint8Array {
  return new Uint8Array(readFileSync(manuscriptPath(opened)));
}

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** The other editor: something that is not Write-ist writing the manuscript. */
function writtenElsewhere(opened: OpenedProject, bytes: Uint8Array): void {
  writeFileSync(manuscriptPath(opened), bytes);
}

function edited(document: ScreenplayDocument, at: number, value: string): ScreenplayDocument {
  const elements = [...document.elements];
  elements[at] = { ...elements[at]!, text: value };
  return { ...document, elements };
}

/**
 * The editor's half, as a test holds it: the model the writer has, which a
 * reload replaces, and what the session reported to it (the Editor shows none of it, ADR-0031).
 */
function aWriter(opened: OpenedProject) {
  const writer = {
    document: opened.document,
    reloads: [] as ImportedScreenplay[],
    kept: [] as string[],
  };
  const handlers: ChangedElsewhere = {
    reload: (imported) => {
      writer.reloads.push(imported);
      writer.document = imported.document;
    },
    keptBoth: (path) => void writer.kept.push(path),
    // A fixed moment, so the copy's name is a number this file can assert.
    now: () => new Date(2026, 8, 23, 14, 5, 9),
  };
  return { writer, handlers };
}

/** The first scene heading's text, which every case below edits. */
const EDITED_BY_WRITER = "INT. THE WRITER'S VERSION - DAY";
const EDITED_ELSEWHERE = "INT. THE OTHER MACHINE'S VERSION - NIGHT";

/** The manuscript as another editor would save it after changing one line. */
function elsewhereVersion(opened: OpenedProject): Uint8Array {
  const original = text(onDisk(opened));
  const heading = opened.document.elements[0]!.text;
  expect(original).toContain(heading);
  return new TextEncoder().encode(original.replace(heading, EDITED_ELSEWHERE));
}

describe("the disk unchanged since Write-ist last read or wrote it", () => {
  it("reloads nothing and keeps nothing, with or without typing", async () => {
    const opened = await aProject();
    const { writer, handlers } = aWriter(opened);
    const session = editingSession(nodeFilesystem, opened, () => writer.document, handlers);

    await session.save();
    writer.document = edited(writer.document, 0, EDITED_BY_WRITER);
    session.changed();
    await session.save();
    // Its own write is not a change made elsewhere.
    writer.document = edited(writer.document, 0, `${EDITED_BY_WRITER} AGAIN`);
    session.changed();
    await session.save();

    expect(writer.reloads).toHaveLength(0);
    expect(writer.kept).toHaveLength(0);
    expect(readdirSync(opened.project.path).sort()).toEqual([MANUSCRIPT_FILE, "project.md"]);
    expect(parse(text(onDisk(opened))).elements[0]!.text).toBe(`${EDITED_BY_WRITER} AGAIN`);
  });
});

describe("changed elsewhere, with no typing since the last save", () => {
  it("loads the new version, and writes nothing", async () => {
    const opened = await aProject();
    const { writer, handlers } = aWriter(opened);
    const session = editingSession(nodeFilesystem, opened, () => writer.document, handlers);

    const theirs = elsewhereVersion(opened);
    writtenElsewhere(opened, theirs);
    const stamp = statSync(manuscriptPath(opened)).mtimeMs;

    // What switching back to Write-ist does.
    const outcome = await session.save();

    expect(outcome.written).toBe(false);
    expect(writer.reloads).toHaveLength(1);
    // What the writer now has is the other version — the element that changed
    // and the element census both.
    expect(writer.document.elements[0]!.text).toBe(EDITED_ELSEWHERE);
    expect(writer.document.elements.map((element) => element.type)).toEqual(
      opened.document.elements.map((element) => element.type),
    );
    // The file is the other editor's, untouched: loading is not saving.
    expect(onDisk(opened)).toEqual(theirs);
    expect(statSync(manuscriptPath(opened)).mtimeMs).toBe(stamp);
    expect(readdirSync(opened.project.path).sort()).toEqual([MANUSCRIPT_FILE, "project.md"]);
  });

  it("treats it as an import: ADR-0020's normalisations applied, and reported", async () => {
    const opened = await aProject();
    const { writer, handlers } = aWriter(opened);
    const session = editingSession(nodeFilesystem, opened, () => writer.document, handlers);

    // Another editor on Windows: every line ending turned to CRLF, and one
    // line left with spaces at its end.
    const lf = text(elsewhereVersion(opened));
    const crlf = lf.replace(EDITED_ELSEWHERE, `${EDITED_ELSEWHERE}   `).replace(/\n/g, "\r\n");
    // Counted from the file before the report is read.
    const lineEndings = crlf.match(/\r\n/g)!.length;
    expect(lineEndings).toBeGreaterThan(100);
    writtenElsewhere(opened, new TextEncoder().encode(crlf));

    await session.save();

    const [reload] = writer.reloads;
    expect(reload!.report.applied).toContainEqual({ kind: "line-endings-to-lf", count: lineEndings });
    expect(reload!.report.applied).toContainEqual({ kind: "trailing-whitespace-trimmed", count: 1 });
    expect(writer.document.elements[0]!.text).toBe(EDITED_ELSEWHERE);
  });

  it("writes the normalised version at the writer's next save, and keeps no copy", async () => {
    const opened = await aProject();
    const { writer, handlers } = aWriter(opened);
    const session = editingSession(nodeFilesystem, opened, () => writer.document, handlers);

    writtenElsewhere(opened, new TextEncoder().encode(text(elsewhereVersion(opened)).replace(/\n/g, "\r\n")));
    await session.save();

    // A save with no typing after the reload still writes nothing.
    expect((await session.save()).written).toBe(false);

    // The writer types into the version they were given.
    writer.document = edited(writer.document, 1, "Typed after the reload.");
    session.changed();
    const outcome = await session.save();

    expect(outcome.written).toBe(true);
    expect(writer.kept).toHaveLength(0);
    const saved = text(onDisk(opened));
    expect(saved).not.toContain("\r");
    const elements = parse(saved).elements;
    expect(elements[0]!.text).toBe(EDITED_ELSEWHERE);
    expect(elements[1]!.text).toBe("Typed after the reload.");
    expect(readdirSync(opened.project.path).sort()).toEqual([MANUSCRIPT_FILE, "project.md"]);
  });
});

describe("changed elsewhere, while the writer was also typing", () => {
  it("saves the typed version as the manuscript and keeps the other beside it, byte for byte", async () => {
    const opened = await aProject();
    const { writer, handlers } = aWriter(opened);
    const session = editingSession(nodeFilesystem, opened, () => writer.document, handlers);

    writer.document = edited(writer.document, 0, EDITED_BY_WRITER);
    session.changed();
    // Byte for byte means exactly that: CRLF and all, nothing normalised.
    const theirs = new TextEncoder().encode(text(elsewhereVersion(opened)).replace(/\n/g, "\r\n"));
    writtenElsewhere(opened, theirs);

    const outcome = await session.save();

    expect(outcome.written).toBe(true);
    // Nothing swapped out mid-scene.
    expect(writer.reloads).toHaveLength(0);
    expect(writer.document.elements[0]!.text).toBe(EDITED_BY_WRITER);

    // The manuscript is the writer's.
    const manuscript = parse(text(onDisk(opened)));
    expect(manuscript.elements[0]!.text).toBe(EDITED_BY_WRITER);
    expect(manuscript.elements).toHaveLength(opened.document.elements.length);

    // The other is beside it, dated, and the writer was told where.
    const copy = copyNameFor(new Date(2026, 8, 23, 14, 5, 9), new Set());
    expect(copy).toBe("manuscript changed elsewhere 2026-09-23 14.05.09.fountain");
    expect(readdirSync(opened.project.path).sort()).toEqual([copy, MANUSCRIPT_FILE, "project.md"]);
    expect(writer.kept).toEqual([join(opened.project.path, copy)]);
    expect(new Uint8Array(readFileSync(join(opened.project.path, copy)))).toEqual(theirs);
  });

  it("keeps a second clash in the same second under a name of its own", async () => {
    const opened = await aProject();
    const { writer, handlers } = aWriter(opened);
    const session = editingSession(nodeFilesystem, opened, () => writer.document, handlers);

    const first = elsewhereVersion(opened);
    writer.document = edited(writer.document, 0, EDITED_BY_WRITER);
    session.changed();
    writtenElsewhere(opened, first);
    await session.save();

    writer.document = edited(writer.document, 0, `${EDITED_BY_WRITER} AGAIN`);
    session.changed();
    const second = new TextEncoder().encode("INT. A THIRD PLACE - DAY\n\nSomething else again.\n");
    writtenElsewhere(opened, second);
    await session.save();

    expect(writer.kept).toHaveLength(2);
    expect(writer.kept[0]).not.toBe(writer.kept[1]);
    expect(new Uint8Array(readFileSync(writer.kept[0]!))).toEqual(first);
    expect(new Uint8Array(readFileSync(writer.kept[1]!))).toEqual(second);
    expect(parse(text(onDisk(opened))).elements[0]!.text).toBe(`${EDITED_BY_WRITER} AGAIN`);
  });

  it("does not write over the other version when its copy could not be kept", async () => {
    const opened = await aProject();
    const { writer, handlers } = aWriter(opened);
    const manuscript = manuscriptPath(opened);
    const refusingCopies: Filesystem = {
      ...nodeFilesystem,
      writeFile: (path, bytes) =>
        path === manuscript
          ? nodeFilesystem.writeFile(path, bytes)
          : Promise.reject(new Error("the disk is full")),
    };
    const session = editingSession(refusingCopies, opened, () => writer.document, handlers);

    writer.document = edited(writer.document, 0, EDITED_BY_WRITER);
    session.changed();
    const theirs = elsewhereVersion(opened);
    writtenElsewhere(opened, theirs);

    await expect(session.save()).rejects.toThrow("the disk is full");

    // The other version is still the only copy of itself, so it is still there.
    expect(onDisk(opened)).toEqual(theirs);
    expect(session.unsaved()).toBe(true);
    expect(writer.kept).toHaveLength(0);
  });

  it("keeps the other version once, even when saving the writer's then fails and is retried", async () => {
    const opened = await aProject();
    const { writer, handlers } = aWriter(opened);
    const manuscript = manuscriptPath(opened);
    let refuse = true;
    const refusingOnce: Filesystem = {
      ...nodeFilesystem,
      writeFile: (path, bytes) =>
        path === manuscript && refuse
          ? ((refuse = false), Promise.reject(new Error("the disk is full")))
          : nodeFilesystem.writeFile(path, bytes),
    };
    const session = editingSession(refusingOnce, opened, () => writer.document, handlers);

    writer.document = edited(writer.document, 0, EDITED_BY_WRITER);
    session.changed();
    writtenElsewhere(opened, elsewhereVersion(opened));

    await expect(session.save()).rejects.toThrow("the disk is full");
    // Not told yet: being told says the writer's version is saved, and it is
    // not.
    expect(writer.kept).toHaveLength(0);
    await session.save();

    const copy = copyNameFor(new Date(2026, 8, 23, 14, 5, 9), new Set());
    expect(writer.kept).toEqual([join(opened.project.path, copy)]);
    expect(parse(text(onDisk(opened))).elements[0]!.text).toBe(EDITED_BY_WRITER);
    expect(readdirSync(opened.project.path).sort()).toEqual([copy, MANUSCRIPT_FILE, "project.md"]);
  });
});

describe("a disk that never answers while a copy is being kept (#64)", () => {
  it("stops waiting for the folder listing, and writes nothing", async () => {
    const opened = await aProject();
    const { writer, handlers } = aWriter(opened);
    let pending: (() => void) | undefined;
    const clock = {
      wait: (run: () => void) => ((pending = run), run),
      cancel: () => void (pending = undefined),
    };
    const silentListing: Filesystem = {
      ...nodeFilesystem,
      readDirectory: () => new Promise(() => {}),
    };
    const session = editingSession(silentListing, opened, () => writer.document, {
      ...handlers,
      clock,
    });

    writer.document = edited(writer.document, 0, EDITED_BY_WRITER);
    session.changed();
    const theirs = elsewhereVersion(opened);
    writtenElsewhere(opened, theirs);

    const saving = session.save();
    // The read answers on its own; the listing after it never does.
    while (pending === undefined) await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    pending();

    await expect(saving).rejects.toThrow("Your disk did not answer within 10 seconds.");
    expect(onDisk(opened)).toEqual(theirs);
    expect(session.unsaved()).toBe(true);
  });
});

describe("a manuscript that cannot be read at save time is never written over (ADR-0008 rule 3)", () => {
  it("refuses to save, keeps the typing unsaved, and leaves the file alone", async () => {
    const opened = await aProject();
    const { writer, handlers } = aWriter(opened);
    let written = 0;
    const unreadable: Filesystem = {
      ...nodeFilesystem,
      readFile: () => Promise.reject(new Error("input/output error")),
      writeFile: async (path, bytes) => {
        written++;
        await nodeFilesystem.writeFile(path, bytes);
      },
    };
    const before = onDisk(opened);
    const session = editingSession(unreadable, opened, () => writer.document, handlers);

    writer.document = edited(writer.document, 0, EDITED_BY_WRITER);
    session.changed();

    await expect(session.save()).rejects.toThrow("input/output error");
    expect(written).toBe(0);
    expect(session.unsaved()).toBe(true);
    expect(onDisk(opened)).toEqual(before);
  });
});

describe("the copy's name", () => {
  it("is dated in the writer's own time, sorts by date, and never takes a name already there", () => {
    const moment = new Date(2026, 0, 2, 3, 4, 5);
    const name = copyNameFor(moment, new Set());
    expect(name).toBe("manuscript changed elsewhere 2026-01-02 03.04.05.fountain");
    // Compared without case, as `folderNameFor` compares, for the same reason.
    expect(copyNameFor(moment, new Set([name.toUpperCase()]))).toBe(
      "manuscript changed elsewhere 2026-01-02 03.04.05 2.fountain",
    );
  });
});
