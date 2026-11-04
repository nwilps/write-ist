/**
 * The manuscript session: everything between a keystroke and the paper, and
 * between the paper and the disk, with no window (the headless-editor-session
 * refactor; ADR-0024, ADR-0028, ADR-0033).
 *
 * The seam is the session's interface — transactions and outside changes in;
 * the state, the seams, the counts and what is said out. Real files in a
 * temporary folder, a driven autosave clock, a fake spelling engine.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAUSE, type Clock } from "../../src/project/autosave.ts";
import { MANUSCRIPT_FILE, NAMES_FILE } from "../../src/project/bundle.ts";
import { importProject } from "../../src/project/import.ts";
import type { Ledger } from "../../src/project/ledger.ts";
import {
  manuscriptSession,
  readManuscript,
  type ManuscriptSession,
  type SessionPorts,
} from "../../src/project/manuscript-session.ts";
import { openProject, type OpenedProject } from "../../src/project/open.ts";
import { manuscriptOf } from "../../src/screenplay/editing.ts";
import { layout } from "../../src/screenplay/layout.ts";
import { paperDecorations } from "../../src/screenplay/sheets.ts";
import { TextSelection } from "prosemirror-state";
import type { Filesystem } from "../../src/project/filesystem.ts";
import { startOfElement } from "../support/editor-positions.ts";
import { readFixtureBytes } from "../support/files.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { fakeEngine } from "../support/spell-engine.ts";

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

/** What the window would have been told, in order. */
interface Heard {
  reports: string[];
  saved: string[];
  status: string[];
  reloads: boolean[];
  switchedAway: (() => void)[];
  stopped: number;
  waiting: (() => void)[];
}

function ports(
  opened: OpenedProject,
  overrides: Partial<SessionPorts> = {},
): { ports: SessionPorts; heard: Heard } {
  const heard: Heard = {
    reports: [],
    saved: [],
    status: [],
    reloads: [],
    switchedAway: [],
    stopped: 0,
    waiting: [],
  };
  // The pause is driven: `waiting` holds what autosave is counting down to.
  const clock: Clock = {
    wait: (run, after) => {
      expect(after).toBe(PAUSE);
      heard.waiting.push(run);
      return run;
    },
    cancel: (pending) => {
      heard.waiting = heard.waiting.filter((run) => run !== pending);
    },
  };
  return {
    heard,
    ports: {
      filesystem: nodeFilesystem,
      project: opened.project,
      report: (text) => heard.reports.push(text),
      setSaved: (state) => heard.saved.push(state),
      setStatus: (text) => heard.status.push(text),
      setGoal: () => {},
      ledger: () => undefined,
      whenSwitchedAway: (act) => {
        heard.switchedAway.push(act);
        return () => void heard.stopped++;
      },
      whenSwitchedBack: () => () => void heard.stopped++,
      spellEngine: fakeEngine(),
      drawSeam: () => ({}) as HTMLElement,
      drawOffer: () => ({}) as HTMLElement,
      reloaded: (spellingWasOn) => heard.reloads.push(spellingWasOn),
      autosaveClock: clock,
      ...overrides,
    },
  };
}

async function aSession(
  overrides: Partial<SessionPorts> = {},
  fixture?: string,
): Promise<{ session: ManuscriptSession; heard: Heard; opened: OpenedProject }> {
  const opened = await aProject(fixture);
  const made = ports(opened, overrides);
  // Read through the real disk: a filesystem made to fail is for what comes after.
  const read = await readManuscript(nodeFilesystem, made.ports.project, made.ports.report);
  return { session: manuscriptSession(made.ports, read), heard: made.heard, opened };
}

/** Type a letter at the start of the n'th manuscript element's text. */
function typeInto(session: ManuscriptSession, elementIndex: number, text = "x"): void {
  const at = startOfElement(session.state, elementIndex);
  const tr = session.state.tr.setSelection(TextSelection.create(session.state.doc, at));
  session.apply(tr.insertText(text));
}

describe("opening a manuscript", () => {
  it("lays the paper out from the model, and draws a seam between every pair of sheets", async () => {
    const { session, opened } = await aSession();
    const full = layout(opened.document);
    expect(session.layout.totalPages).toBe(full.totalPages);
    expect(session.layout.pagination.pageOfElement).toEqual(full.pagination.pageOfElement);
    expect(session.seams.find().length).toBeGreaterThanOrEqual(full.totalPages - 1);
  });

  it("derives the name lists from the manuscript", async () => {
    const { session } = await aSession();
    expect(session.names.entries("character").length).toBeGreaterThan(0);
  });
});

describe("a keystroke", () => {
  it("marks the work unsaved, restarts the pause and says so", async () => {
    const { session, heard } = await aSession();
    typeInto(session, 3);
    expect(session.unsaved()).toBe(true);
    expect(heard.saved.at(-1)).toBe("unsaved");
    expect(heard.waiting).toHaveLength(1);
    typeInto(session, 3);
    expect(heard.waiting).toHaveLength(1); // restarted, not stacked
  });

  it("leaves the layout, the seams and the names as a fresh read of the same words would", async () => {
    const { session } = await aSession();
    for (const index of [2, 40, 7, 60]) typeInto(session, index, "ZED ");
    const words = manuscriptOf(session.state.doc);
    const fresh = layout(words);
    expect(session.layout.pagination.pageOfElement).toEqual(fresh.pagination.pageOfElement);
    expect(session.layout.totalPages).toBe(fresh.totalPages);
    const drawn = (set: typeof session.seams) =>
      set.find().map((d) => [d.from, (d.spec as { key: string }).key]);
    expect(drawn(session.seams)).toEqual(drawn(paperDecorations(session.state.doc, fresh, () => ({}) as HTMLElement)));
  });

  it("puts the page and the words in the counts", async () => {
    const { session, heard } = await aSession();
    typeInto(session, 3);
    expect(heard.status.at(-1)).toMatch(/^Pages: ~\d+ \/ \d+ \| Words: [\d,]+$/);
  });
});

/** The same filesystem with some calls made to fail. */
function failing(fails: { write?: boolean; read?: boolean }): Filesystem {
  return {
    ...nodeFilesystem,
    writeFile: (path, bytes) =>
      fails.write ? Promise.reject(new Error("the disk is full")) : nodeFilesystem.writeFile(path, bytes),
    readFile: (path) =>
      fails.read ? Promise.reject(new Error("the disk went away")) : nodeFilesystem.readFile(path),
  };
}

/** Something else rewrites the manuscript with a different one. */
function otherwiseWritten(opened: OpenedProject, fixture: string): void {
  writeFileSync(join(opened.project.path, MANUSCRIPT_FILE), readFixtureBytes(fixture));
}

describe("a manuscript changed elsewhere, with nothing typed here", () => {
  it("becomes the screenplay, drawn by the same pipeline as an edit", async () => {
    const { session, heard, opened } = await aSession();
    otherwiseWritten(opened, "Big-Fish-augmented.fountain");
    await session.save();

    expect(heard.reloads).toEqual([false]);
    const words = manuscriptOf(session.state.doc);
    expect(words.elements.length).toBeGreaterThan(2000);
    const fresh = layout(words);
    expect(session.layout.totalPages).toBe(fresh.totalPages);
    expect(session.layout.pagination.pageOfElement).toEqual(fresh.pagination.pageOfElement);
    const drawn = (set: typeof session.seams) =>
      set.find().map((d) => [d.from, (d.spec as { key: string }).key]);
    expect(drawn(session.seams)).toEqual(
      drawn(paperDecorations(session.state.doc, fresh, () => ({}) as HTMLElement)),
    );
    expect(session.unsaved()).toBe(false);
    expect(heard.status.at(-1)).toContain(`/ ${fresh.totalPages} |`);
  });

  it("tells the window whether a spelling pass was running", async () => {
    const { session, heard, opened } = await aSession();
    // A pass is on in this state, as the Editor would have turned it on.
    const on = session.spellcheck.isOn(session.state);
    otherwiseWritten(opened, "Big-Fish-augmented.fountain");
    await session.save();
    expect(heard.reloads).toEqual([on]);
  });
});

describe("saving, and failing to", () => {
  it("writes what was typed and shows the pill going saving → saved", async () => {
    const { session, heard, opened } = await aSession();
    typeInto(session, 3, "QQQ");
    await session.save();
    expect(heard.saved.slice(-2)).toEqual(["saving", "saved"]);
    expect(readFileSync(join(opened.project.path, MANUSCRIPT_FILE), "utf8")).toContain("QQQ");
  });

  it("autosaves when the pause runs out", async () => {
    const { session, heard, opened } = await aSession();
    typeInto(session, 3, "PAUSED");
    heard.waiting[0]!();
    await vi.waitFor(() => expect(heard.saved.at(-1)).toBe("saved"));
    expect(readFileSync(join(opened.project.path, MANUSCRIPT_FILE), "utf8")).toContain("PAUSED");
  });

  it("says the words are only on screen when a write fails, and stays unsaved", async () => {
    const { session, heard } = await aSession({ filesystem: failing({ write: true }) });
    typeInto(session, 3);
    await session.save();
    expect(heard.reports).toHaveLength(1);
    expect(heard.reports[0]).toContain("only on screen");
    expect(heard.reports[0]).toContain("the disk is full");
    expect(heard.reports[0]).toContain("It will try again.");
    expect(heard.saved.at(-1)).toBe("unsaved");
  });

  it("says nothing is at risk when a check with nothing typed cannot read the disk", async () => {
    const { session, heard } = await aSession({ filesystem: failing({ read: true }) });
    await session.save();
    expect(heard.reports).toHaveLength(1);
    expect(heard.reports[0]).toContain("could not check whether your screenplay was changed outside it");
    expect(heard.reports[0]).not.toContain("only on screen");
  });

  it("saves when the writer switches to another application", async () => {
    const { session, heard, opened } = await aSession();
    typeInto(session, 3, "AWAY");
    heard.switchedAway[0]!();
    await vi.waitFor(() => expect(heard.saved.at(-1)).toBe("saved"));
    expect(readFileSync(join(opened.project.path, MANUSCRIPT_FILE), "utf8")).toContain("AWAY");
  });
});

/** A ledger that remembers what it was asked. */
function aLedger(fail?: Error): { ledger: Ledger; days: { id: string; name: string; elements: number }[] } {
  const days: { id: string; name: string; elements: number }[] = [];
  return {
    days,
    ledger: {
      recordOpened: () => Promise.resolve(),
      recordClosed: () => Promise.resolve(),
      recordDay: (project, document) => {
        if (fail) return Promise.reject(fail);
        days.push({ id: project.id, name: project.name, elements: document.elements.length });
        return Promise.resolve();
      },
    },
  };
}

describe("leaving", () => {
  it("saves the last words, records the day in the ledger, stops listening, and lets go", async () => {
    const { ledger, days } = aLedger();
    const { session, heard, opened } = await aSession({ ledger: () => ledger });
    typeInto(session, 3, "LAST");
    expect(await session.leave()).toBe(true);
    expect(readFileSync(join(opened.project.path, MANUSCRIPT_FILE), "utf8")).toContain("LAST");
    expect(days).toEqual([
      { id: opened.project.marker.projectId, name: opened.project.marker.name, elements: expect.any(Number) },
    ]);
    expect(days[0]!.elements).toBe(manuscriptOf(session.state.doc).elements.length);
    expect(heard.stopped).toBe(2);
    expect(heard.reports).toEqual([]);
  });

  it("will not let go over a save it could not finish, and says what to expect — once", async () => {
    const { ledger, days } = aLedger();
    const { session, heard } = await aSession({ filesystem: failing({ write: true }), ledger: () => ledger });
    typeInto(session, 3);
    expect(await session.leave()).toBe(false);
    expect(heard.reports).toHaveLength(1);
    expect(heard.reports[0]).toContain("only on screen");
    expect(heard.reports[0]).toContain("This project stays open until it saves");
    expect(heard.reports[0]).not.toContain("It will try again");
    expect(days).toEqual([]); // no day is recorded for a manuscript that did not save
    expect(heard.stopped).toBe(0); // still listening: the project is still open
  });

  it("can try again after a failed leave", async () => {
    let broken = true;
    const filesystem: Filesystem = {
      ...nodeFilesystem,
      writeFile: (path, bytes) =>
        broken ? Promise.reject(new Error("the disk is full")) : nodeFilesystem.writeFile(path, bytes),
    };
    const { ledger } = aLedger();
    const { session, heard, opened } = await aSession({ filesystem, ledger: () => ledger });
    typeInto(session, 3, "RETRY");
    expect(await session.leave()).toBe(false);
    broken = false;
    expect(await session.leave()).toBe(true);
    expect(readFileSync(join(opened.project.path, MANUSCRIPT_FILE), "utf8")).toContain("RETRY");
    expect(heard.reports).toHaveLength(1);
  });

  it("still leaves when there is no ledger, and says the record did not start", async () => {
    const { session, heard } = await aSession({ ledger: () => undefined });
    expect(await session.leave()).toBe(true);
    expect(heard.reports).toHaveLength(1);
    expect(heard.reports[0]).toContain("could not record today's writing in the ledger");
    expect(heard.reports[0]).toContain("The record of your writing days did not start.");
  });

  it("still leaves when the ledger fails — it costs a chart, never the manuscript", async () => {
    const { ledger } = aLedger(new Error("ledger is read-only"));
    const { session, heard } = await aSession({ ledger: () => ledger });
    expect(await session.leave()).toBe(true);
    expect(heard.reports).toHaveLength(1);
    expect(heard.reports[0]).toContain("Your screenplay is saved. ledger is read-only");
  });
});

/** Put the caret in the first element of a type, and answer its name. */
function caretInFirst(session: ManuscriptSession, type: string): void {
  const words = manuscriptOf(session.state.doc);
  const index = words.elements.findIndex((element) => element.type === type);
  expect(index).toBeGreaterThanOrEqual(0);
  const at = startOfElement(session.state, index);
  session.apply(session.state.tr.setSelection(TextSelection.create(session.state.doc, at)));
}

describe("confirming a name", () => {
  it("writes the names file whole, and the lists hold it", async () => {
    const { session, opened } = await aSession();
    caretInFirst(session, "character");
    expect(session.confirmableKind()).toBe("character");
    expect(session.confirm("character")).toBe(true);
    const name = session.names.explicit("character")[0]!;
    await session.settled();
    expect(readFileSync(join(opened.project.path, NAMES_FILE), "utf8")).toContain(name);
    expect(session.names.isConfirmed("character", name)).toBe(true);
  });

  it("asks the location list for a scene heading", async () => {
    const { session } = await aSession();
    caretInFirst(session, "scene-heading");
    expect(session.confirmableKind()).toBe("location");
    expect(session.confirm("location")).toBe(true);
    expect(session.names.explicit("location")).toHaveLength(1);
  });

  it("has nothing to confirm where the caret is not in a name of that kind", async () => {
    const { session } = await aSession();
    caretInFirst(session, "scene-heading");
    expect(session.confirm("character")).toBe(false);
    expect(session.names.explicit("character")).toEqual([]);
  });

  it("keeps a confirmation through a reload from outside, without a second copy to go stale", async () => {
    const { session, opened } = await aSession();
    caretInFirst(session, "character");
    session.confirm("character");
    const name = session.names.explicit("character")[0]!;
    await session.settled();
    otherwiseWritten(opened, "Big-Fish-augmented.fountain");
    await session.save();
    expect(session.names.explicit("character")).toEqual([name]);
  });

  it("reads the confirmations already in the bundle", async () => {
    const opened = await aProject();
    writeFileSync(join(opened.project.path, NAMES_FILE), "characters\n  KNOWN PERSON\n");
    const made = ports(opened);
    const read = await readManuscript(made.ports.filesystem, made.ports.project, made.ports.report);
    const session = manuscriptSession(made.ports, read);
    expect(session.names.isConfirmed("character", "known person")).toBe(true);
  });

  it("refuses to change a names file it could not read, and says so", async () => {
    const opened = await aProject();
    writeFileSync(join(opened.project.path, NAMES_FILE), new Uint8Array([0xff, 0xfe, 0xfd]));
    const made = ports(opened);
    const read = await readManuscript(made.ports.filesystem, made.ports.project, made.ports.report);
    expect(made.heard.reports).toHaveLength(1);
    expect(made.heard.reports[0]).toContain("will not change them");
    const session = manuscriptSession(made.ports, read);
    caretInFirst(session, "character");
    expect(session.confirm("character")).toBe(false);
    expect(session.names.explicit("character")).toEqual([]);
  });

  it("says so when the file cannot be written, and the confirmation holds while the project is open", async () => {
    const { session, heard } = await aSession({ filesystem: failing({ write: true }) });
    caretInFirst(session, "character");
    session.confirm("character");
    await session.settled();
    expect(heard.reports).toHaveLength(1);
    expect(heard.reports[0]).toContain("could not save the confirmed name");
    expect(session.names.explicit("character")).toHaveLength(1);
  });
});
