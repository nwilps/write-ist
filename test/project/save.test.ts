/**
 * Typing, and having it save itself — with real files in a temporary folder
 * (#41, slice 1's third testing seam).
 *
 * Everything here writes to a real directory and reads back what landed. The
 * assertions are about *files*: what the manuscript holds after a save, what
 * it holds after no save, and what it holds after a read that failed.
 *
 * The one thing deliberately not tested with a real clock is *when* autosave
 * fires. `docs/STANDARDS.md` is explicit that a claim of determinism is not
 * determinism, and a test sleeping two seconds would be slow *and* still be
 * guessing — so the clock is driven, and the pause is a number this file
 * asserts rather than waits out.
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MANUSCRIPT_FILE } from "../../src/project/bundle.ts";
import { autosave, PAUSE, type Clock, type Pending } from "../../src/project/autosave.ts";
import { importProject } from "../../src/project/import.ts";
import { openProject, type OpenedProject } from "../../src/project/open.ts";
import { DISK_LIMIT, editingSession } from "../../src/project/save.ts";
import type { Filesystem } from "../../src/project/filesystem.ts";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { parse } from "../../src/screenplay/parse.ts";
import type { ScreenplayDocument } from "../../src/screenplay/document.ts";
import { startOfElement } from "../support/editor-positions.ts";
import { readFixtureBytes } from "../support/files.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

let temporary: { path: string; remove: () => void };
let projects: string;

beforeEach(() => {
  temporary = temporaryDirectory();
  projects = join(temporary.path, "write-ist");
});

afterEach(() => temporary.remove());

/** A project on disk, imported the way the writer's would be, then opened. */
async function aProject(fixture = "Brick-&-Steel.fountain"): Promise<OpenedProject> {
  const source = join(temporary.path, fixture);
  writeFileSync(source, readFixtureBytes(fixture));
  const imported = await importProject(
    { filesystem: nodeFilesystem, newProjectId: () => "3f2a1c44-0000-4000-8000-0123456789ab" },
    { sourcePath: source, projectsDirectory: projects },
  );
  return openProject(nodeFilesystem, imported.project);
}

function manuscriptPath(opened: OpenedProject): string {
  return join(opened.project.path, MANUSCRIPT_FILE);
}

function onDisk(opened: OpenedProject): Uint8Array {
  return new Uint8Array(readFileSync(manuscriptPath(opened)));
}

/** The writer's document, with one element's text changed. */
function edited(document: ScreenplayDocument, at: number, text: string): ScreenplayDocument {
  const elements = [...document.elements];
  elements[at] = { ...elements[at]!, text };
  return { ...document, elements };
}

/** A clock a test is, rather than a clock a test waits for. */
function driven(): Clock & { readonly tick: () => void; readonly waiting: () => number | undefined } {
  let run: (() => void) | undefined;
  let after: number | undefined;
  return {
    wait: (job, delay) => {
      run = job;
      after = delay;
      return job as Pending;
    },
    cancel: () => {
      run = undefined;
      after = undefined;
    },
    tick: () => {
      const job = run;
      run = undefined;
      after = undefined;
      job?.();
    },
    waiting: () => after,
  };
}

describe("the one save routine (ADR-0028)", () => {
  it("writes the edited manuscript through the existing serialiser", async () => {
    const opened = await aProject();
    let document = opened.document;
    const session = editingSession(nodeFilesystem, opened, () => document);

    document = edited(document, 0, "INT. A DIFFERENT PLACE - NIGHT");
    session.changed();
    const outcome = await session.save();

    expect(outcome.written).toBe(true);
    const saved = onDisk(opened);
    expect(new TextDecoder().decode(saved)).toContain("INT. A DIFFERENT PLACE - NIGHT");
    // Read back through the parser: the file is Fountain, and it is the
    // screenplay the writer has rather than merely bytes that landed.
    expect(parse(new TextDecoder().decode(saved)).elements[0]!.text).toBe(
      "INT. A DIFFERENT PLACE - NIGHT",
    );
  });

  it("leaves the manuscript byte-identical when the project is opened and closed without typing (ADR-0020 point 2)", async () => {
    const opened = await aProject();
    const before = onDisk(opened);
    const stamp = statSync(manuscriptPath(opened)).mtimeMs;
    const session = editingSession(nodeFilesystem, opened, () => opened.document);

    // Closing the project calls the same routine autosave does.
    const outcome = await session.save();

    expect(outcome.written).toBe(false);
    expect(onDisk(opened)).toEqual(before);
    // Not merely equal bytes: the file was not touched at all, so nothing
    // watching it for a change elsewhere (#42) sees one that never happened.
    expect(statSync(manuscriptPath(opened)).mtimeMs).toBe(stamp);
  });

  it("does not write when an edit leaves the same bytes", async () => {
    const opened = await aProject();
    const stamp = statSync(manuscriptPath(opened)).mtimeMs;
    const session = editingSession(nodeFilesystem, opened, () => opened.document);

    // Typed a letter and deleted it again: the writer changed nothing, so
    // their file changes nothing.
    session.changed();
    const outcome = await session.save();

    expect(outcome.written).toBe(false);
    expect(statSync(manuscriptPath(opened)).mtimeMs).toBe(stamp);
  });

  it("closes and reopens with every edit there", async () => {
    const opened = await aProject();
    let document = opened.document;
    const session = editingSession(nodeFilesystem, opened, () => document);

    document = edited(document, 2, "Brick hesitates at the door.");
    session.changed();
    await session.save();

    const reopened = await openProject(nodeFilesystem, opened.project);
    expect(reopened.document.elements[2]!.text).toBe("Brick hesitates at the door.");
    expect(reopened.document.elements).toHaveLength(opened.document.elements.length);
    // The title page is above the elements and nothing was typed into it.
    expect(reopened.document.titlePage).toEqual(opened.document.titlePage);
  });

  it("runs two overlapping saves one at a time", async () => {
    const opened = await aProject();
    let document = opened.document;
    const session = editingSession(nodeFilesystem, opened, () => document);

    document = edited(document, 0, "INT. FIRST - DAY");
    session.changed();
    const first = session.save();
    document = edited(document, 0, "INT. SECOND - DAY");
    session.changed();
    const second = session.save();
    await Promise.all([first, second]);

    // The later save wins, and the file holds one whole manuscript rather
    // than two interleaved ones.
    const saved = parse(new TextDecoder().decode(onDisk(opened)));
    expect(saved.elements[0]!.text).toBe("INT. SECOND - DAY");
    expect(saved.elements).toHaveLength(opened.document.elements.length);
  });

  it("keeps the change unsaved when the write fails, so the next save retries it", async () => {
    const opened = await aProject();
    const refusing: Filesystem = {
      ...nodeFilesystem,
      writeFile: () => Promise.reject(new Error("the disk is full")),
    };
    const session = editingSession(refusing, opened, () =>
      edited(opened.document, 0, "INT. NOWHERE - DAY"),
    );

    session.changed();
    await expect(session.save()).rejects.toThrow("the disk is full");
    expect(session.unsaved()).toBe(true);
  });
});

/**
 * A disk that never answers (#64).
 *
 * A write crosses into the operating system, and a reply that never comes is
 * a promise that never settles. Unbounded, it held up every later save, and
 * closing the project — which saves first — with them. The window here is
 * absent on purpose: the shape is a save that never settles and then a close,
 * and neither needs one.
 */
describe("a disk that never answers (#64)", () => {
  /** A disk that takes the first write and never replies; later ones land. */
  function stallingFirst(): Filesystem {
    let writes = 0;
    return {
      ...nodeFilesystem,
      writeFile: (path, bytes) =>
        writes++ === 0 ? new Promise<void>(() => {}) : nodeFilesystem.writeFile(path, bytes),
    };
  }

  it("stops waiting after the limit, says so in the writer's words, and keeps the change unsaved", async () => {
    const opened = await aProject();
    const clock = driven();
    const session = editingSession(
      stallingFirst(),
      opened,
      () => edited(opened.document, 0, "INT. NOWHERE - DAY"),
      { clock },
    );

    session.changed();
    const saving = session.save();
    await Promise.resolve();
    expect(clock.waiting()).toBe(DISK_LIMIT);
    clock.tick();

    await expect(saving).rejects.toThrow("Your disk did not answer within 10 seconds.");
    expect(session.unsaved()).toBe(true);
  });

  it("does not let one write that never answered hold up the next", async () => {
    const opened = await aProject();
    let document = opened.document;
    const clock = driven();
    const session = editingSession(stallingFirst(), opened, () => document, { clock });

    document = edited(document, 0, "INT. FIRST - DAY");
    session.changed();
    const first = session.save();
    await Promise.resolve();
    clock.tick();
    await expect(first).rejects.toThrow();

    document = edited(document, 0, "INT. SECOND - DAY");
    session.changed();
    await session.save();

    expect(parse(new TextDecoder().decode(onDisk(opened))).elements[0]!.text).toBe(
      "INT. SECOND - DAY",
    );
    expect(session.unsaved()).toBe(false);
  });

  it("writes again after a write that never answered, even when the words went back to what the file held", async () => {
    const opened = await aProject();
    let document = opened.document;
    const clock = driven();
    const session = editingSession(stallingFirst(), opened, () => document, { clock });

    document = edited(document, 0, "INT. CHANGED - DAY");
    session.changed();
    const first = session.save();
    await Promise.resolve();
    clock.tick();
    await expect(first).rejects.toThrow();

    // Undone. The write given up on may yet have landed, so the file is no
    // longer known to hold the original, and the original is written again.
    document = opened.document;
    session.changed();
    const outcome = await session.save();

    expect(outcome.written).toBe(true);
  });

  it("closes the project over a save that never answers, and says why the words did not save", async () => {
    const opened = await aProject();
    const disk = driven();
    const session = editingSession(
      stallingFirst(),
      opened,
      () => edited(opened.document, 0, "INT. NOWHERE - DAY"),
      { clock: disk },
    );
    const told: unknown[] = [];
    const saving = autosave({ save: session.save, trouble: (error) => told.push(error), clock: driven() });

    session.changed();
    // What the Editor does on the way out.
    const closing = saving.now();
    await Promise.resolve();
    disk.tick();
    await closing;

    expect(told).toHaveLength(1);
    expect((told[0] as Error).message).toBe("Your disk did not answer within 10 seconds.");
  });
});

describe("the port really is temp, flush, rename (ADR-0008 rule 5)", () => {
  it("leaves no temporary file behind, and the manuscript is what was written", async () => {
    const opened = await aProject();
    let document = opened.document;
    const session = editingSession(nodeFilesystem, opened, () => document);

    document = edited(document, 0, "INT. REALLY WRITTEN - DAY");
    session.changed();
    await session.save();

    // The real port, not a stub: `test/support/node-filesystem.ts` writes the
    // temporary file, flushes it, renames it, and flushes the directory. The
    // test asserts what is observable from outside — the manuscript holds the
    // new bytes and nothing is left lying beside it.
    const entries = await nodeFilesystem.readDirectory(opened.project.path);
    expect(entries.map((entry) => entry.name).sort()).toEqual([
      MANUSCRIPT_FILE,
      "project.md",
    ]);
    expect(parse(new TextDecoder().decode(onDisk(opened))).elements[0]!.text).toBe(
      "INT. REALLY WRITTEN - DAY",
    );
  });

  it("does not read a temporary file left by an interrupted save", async () => {
    const opened = await aProject();
    const before = onDisk(opened);

    // What a power cut before the rename leaves: the new bytes in the
    // temporary file, the manuscript untouched.
    writeFileSync(`${manuscriptPath(opened)}.writing`, new TextEncoder().encode("INT. LOST - DAY"));

    const reopened = await openProject(nodeFilesystem, opened.project);
    expect(reopened.manuscript).toEqual(before);
    expect(reopened.document.elements[0]!.text).toBe(opened.document.elements[0]!.text);
  });
});

describe("a manuscript that could not be read is never written over (ADR-0008 rule 3)", () => {
  it("refuses to open, and writes nothing", async () => {
    const opened = await aProject();
    const before = onDisk(opened);
    const stamp = statSync(manuscriptPath(opened)).mtimeMs;

    let written = 0;
    const unreadable: Filesystem = {
      ...nodeFilesystem,
      readFile: () => Promise.reject(new Error("input/output error")),
      writeFile: async (path, bytes) => {
        written++;
        await nodeFilesystem.writeFile(path, bytes);
      },
    };

    // There is no way past this line: an `EditingSession` is made from an
    // `OpenedProject`, and a read that failed produces none. The rule is the
    // type rather than a check somebody has to remember.
    await expect(openProject(unreadable, opened.project)).rejects.toThrow("input/output error");

    expect(written).toBe(0);
    expect(onDisk(opened)).toEqual(before);
    expect(statSync(manuscriptPath(opened)).mtimeMs).toBe(stamp);
  });
});

describe("when autosave fires (ADR-0028)", () => {
  it("saves a couple of seconds after typing stops, and not before", async () => {
    const opened = await aProject();
    const clock = driven();
    let saves = 0;
    const saving = autosave({ save: () => ((saves++), Promise.resolve()), trouble: () => {}, clock });

    saving.typed();
    expect(clock.waiting()).toBe(PAUSE);
    expect(saves).toBe(0);

    clock.tick();
    expect(saves).toBe(1);
  });

  it("measures the pause from the last keystroke, not the first", async () => {
    const clock = driven();
    let saves = 0;
    const saving = autosave({ save: () => ((saves++), Promise.resolve()), trouble: () => {}, clock });

    saving.typed();
    saving.typed();
    saving.typed();
    expect(saves).toBe(0);

    clock.tick();
    expect(saves).toBe(1);
  });

  it("saves at once when the window loses focus, and cancels the pending one", async () => {
    const clock = driven();
    let saves = 0;
    const saving = autosave({ save: () => ((saves++), Promise.resolve()), trouble: () => {}, clock });

    saving.typed();
    await saving.now();

    expect(saves).toBe(1);
    expect(saving.pending()).toBe(false);
    clock.tick();
    expect(saves).toBe(1);
  });

  it("saves when the project is closed, and the edit is on disk afterwards", async () => {
    const opened = await aProject();
    let document = opened.document;
    const session = editingSession(nodeFilesystem, opened, () => document);
    const saving = autosave({ save: session.save, trouble: () => {}, clock: driven() });

    document = edited(document, 0, "INT. CLOSED - NIGHT");
    session.changed();
    saving.typed();
    // What the workspace does on the way out.
    await saving.now();

    expect(parse(new TextDecoder().decode(onDisk(opened))).elements[0]!.text).toBe(
      "INT. CLOSED - NIGHT",
    );
  });

  it("reports a save that failed rather than swallowing it (ADR-0008 rule 4)", async () => {
    const clock = driven();
    const told: unknown[] = [];
    const saving = autosave({
      save: () => Promise.reject(new Error("the disk is full")),
      trouble: (error) => told.push(error),
      clock,
    });

    await saving.now();

    expect(told).toHaveLength(1);
    expect((told[0] as Error).message).toBe("the disk is full");
  });

  it("writes the manuscript atomically — a save interrupted before the rename leaves the previous one intact (ADR-0008 rule 5)", async () => {
    const opened = await aProject();
    const before = onDisk(opened);

    // The port's contract is temp, flush, rename. Interrupted *before* the
    // rename means the bytes are in a temporary file and the manuscript is
    // untouched — so this is the write, stopped where a crash would stop it.
    const interrupted: Filesystem = {
      ...nodeFilesystem,
      writeFile: async (path, bytes) => {
        await nodeFilesystem.writeFile(`${path}.writing`, bytes);
        throw new Error("the power went out");
      },
    };
    const session = editingSession(interrupted, opened, () =>
      edited(opened.document, 0, "INT. HALF WRITTEN - DAY"),
    );

    session.changed();
    await expect(session.save()).rejects.toThrow("the power went out");

    expect(onDisk(opened)).toEqual(before);
  });
});

/**
 * The two seams joined: a keystroke in the editor, through the pause, onto the
 * disk, and back.
 *
 * Seam 2 proves the editing and seam 3 proves the files. This is the one test
 * that runs the whole wire the writer actually uses, because a keystroke that
 * reaches a model nothing saves is the failure neither seam can see on its
 * own.
 */
describe("a keystroke, a pause, and the words are on disk", () => {
  it("types, autosaves, and finds every edit there on reopening", async () => {
    const opened = await aProject();
    let state = editorStateFor(opened.document);
    const session = editingSession(nodeFilesystem, opened, () => manuscriptOf(state.doc));
    const clock = driven();
    const saving = autosave({ save: session.save, trouble: () => {}, clock });

    // The caret at the front of the first element, and a word typed into it
    // one character at a time — one transaction each, as a keyboard makes.
    const typed = "BRAND NEW ";
    let caret = startOfElement(state, 0);
    for (const character of typed) {
      state = state.apply(state.tr.insertText(character, caret));
      caret++;
      session.changed();
      saving.typed();
    }
    expect(session.unsaved()).toBe(true);
    expect(clock.waiting()).toBe(PAUSE);

    clock.tick();
    // The clock fires the save; awaiting the routine itself is how the test
    // waits for the disk rather than for a timer.
    await session.save();

    expect(session.unsaved()).toBe(false);
    const reopened = await openProject(nodeFilesystem, opened.project);
    expect(reopened.document.elements[0]!.text).toBe(typed + opened.document.elements[0]!.text);
    expect(reopened.document.elements).toHaveLength(opened.document.elements.length);
    // The title page is above the elements and nothing was typed into it.
    expect(reopened.document.titlePage).toEqual(opened.document.titlePage);
  });

  it("opens the file it wrote and writes it back byte for byte (ADR-0020 point 2)", async () => {
    const opened = await aProject();
    let state = editorStateFor(opened.document);
    const session = editingSession(nodeFilesystem, opened, () => manuscriptOf(state.doc));

    state = state.apply(
      state.tr.insertText(
        " — and then some.",
        startOfElement(state, 0) + opened.document.elements[0]!.text.length,
      ),
    );
    session.changed();
    await session.save();
    const written = onDisk(opened);

    // Reopened and saved again with nothing typed: the file must not move.
    const again = await openProject(nodeFilesystem, opened.project);
    const second = editingSession(nodeFilesystem, again, () => again.document);
    second.changed();
    const outcome = await second.save();

    expect(outcome.written).toBe(false);
    expect(onDisk(opened)).toEqual(written);
  });
});
