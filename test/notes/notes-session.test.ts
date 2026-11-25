/**
 * One note open for writing, with no window (`src/notes/notes-session.ts`):
 * typing saves its file in the notes folder after the pause, undo and redo walk the writer's
 * edits, the caret is kept as an offset in the text, and spellcheck is the
 * plain-text pass over the same dictionary — off until asked. Real files in a
 * temporary folder; an invented project.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PAUSE, type Clock } from "../../src/project/autosave.ts";
import type { Project } from "../../src/project/bundle.ts";
import { readWorkspaceFile, type FileSaveState } from "../../src/project/workspace-file.ts";
import { notePath, NOTES_FILES } from "../../src/notes/notes-folder.ts";
import { workspaceFiles } from "../../src/project/workspace-files.ts";
import { notesSession } from "../../src/notes/notes-session.ts";

/** The note these tests write, in the project's notes folder. */
const NOTE = notePath("Ideas");
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { fakeEngine } from "../support/spell-engine.ts";

function handClock(): Clock & { readonly turn: (by: number) => void } {
  let now = 0;
  let next = 0;
  const waiting = new Map<number, { at: number; run: () => void }>();
  return {
    wait: (run, after) => {
      next += 1;
      waiting.set(next, { at: now + after, run });
      return next;
    },
    cancel: (pending) => void waiting.delete(pending as number),
    turn: (by) => {
      now += by;
      for (const [id, { at, run }] of [...waiting]) {
        if (at > now) continue;
        waiting.delete(id);
        run();
      }
    },
  };
}

let temporary: { path: string; remove: () => void };
let project: Project;
beforeEach(() => {
  temporary = temporaryDirectory();
  const path = join(temporary.path, "Paper Boats");
  // The notes folder is there; a note in it is written by the tests that need one.
  mkdirSync(join(path, "notes"), { recursive: true });
  project = { path, marker: { name: "Paper Boats", projectId: "id-paper-boats" } } as Project;
});
afterEach(() => temporary.remove());

const notesPath = () => join(project.path, NOTE);

async function open(engine = fakeEngine()) {
  const clock = handClock();
  const status: string[] = [];
  const states: FileSaveState[] = [];
  const spellcheck: boolean[] = [];
  const reports: string[] = [];
  const read = await readWorkspaceFile(nodeFilesystem, project, NOTE);
  const session = notesSession(
    {
      files: workspaceFiles({
        filesystem: nodeFilesystem,
        project: () => project,
        declared: NOTES_FILES,
        report: (trouble) => void reports.push(trouble),
        clock,
      }),
      file: NOTE,
      report: (trouble) => void reports.push(trouble),
      setSaved: (state) => void states.push(state),
      setStatus: (text) => void status.push(text),
      setSpellcheck: (on) => void spellcheck.push(on),
      spellEngine: engine,
      redraw: () => {},
    },
    read,
  );
  /** Type at the end of the text, as one transaction. */
  const type = (text: string): void => {
    const end = session.state.doc.content.size - 1;
    session.apply(session.state.tr.insertText(text, end));
  };
  /** Press Enter at the end: a new line. */
  const enter = (): void => {
    const end = session.state.doc.content.size - 1;
    session.apply(session.state.tr.split(end));
  };
  return { session, clock, status, states, spellcheck, reports, type, enter, engine };
}

describe("typing in Notes", () => {
  it("saves the note a couple of seconds after the writer stops, as plain text", async () => {
    const { session, clock, type, enter, states, status } = await open();
    type("# Ideas");
    enter();
    type("**The ferry** crosses at night.");
    expect(session.unsaved()).toBe(true);
    clock.turn(PAUSE - 1);
    await session.settled();
    expect(existsSync(notesPath())).toBe(false);
    clock.turn(1);
    await session.settled();
    // Exactly what was typed: the hash and the asterisks are characters, not formatting.
    expect(readFileSync(notesPath(), "utf8")).toBe("# Ideas\n**The ferry** crosses at night.");
    expect(states.at(-1)).toBe("saved");
    // Runs of anything but whitespace, the lone "#" among them, as the Editor counts.
    expect(status.at(-1)).toBe("w. 7");
  });

  it("opens what the file holds, and writes nothing for notes opened and left", async () => {
    writeFileSync(notesPath(), "Already here.\nSecond line.\n");
    const { session } = await open();
    expect(session.text()).toBe("Already here.\nSecond line.\n");
    expect(await session.leave()).toBe(true);
    expect(readFileSync(notesPath(), "utf8")).toBe("Already here.\nSecond line.\n");
  });

  it("saves on leaving, and the next opening finds the text as it was left", async () => {
    const first = await open();
    first.type("The boat is paper.");
    expect(await first.session.leave()).toBe(true);
    const second = await open();
    expect(second.session.text()).toBe("The boat is paper.");
  });
});

describe("undo and redo in Notes", () => {
  it("walk back and forward through the writer's edits, and the file follows", async () => {
    const { session, type } = await open();
    type("one");
    // A pause between edits makes two steps of history, as in any editor.
    session.apply(session.state.tr.setMeta("addToHistory", true).setTime(Date.now() + 10_000).insertText(" two", 4));
    expect(session.text()).toBe("one two");
    expect(session.undo()).toBe(true);
    expect(session.text()).toBe("one");
    expect(session.redo()).toBe(true);
    expect(session.text()).toBe("one two");
    expect(session.undo()).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.text()).toBe("");
    expect(session.undo()).toBe(false);
    expect(session.redo()).toBe(true);
    await session.save();
    expect(readFileSync(notesPath(), "utf8")).toBe("one");
  });
});

describe("the caret in Notes", () => {
  it("is kept as offsets in the text, and put back clamped to it", async () => {
    writeFileSync(notesPath(), "first line\nsecond line");
    const { session } = await open();
    session.select(14, 17);
    expect(session.caret()).toEqual({ anchor: 14, head: 17 });
    expect(session.state.doc.textBetween(session.state.selection.from, session.state.selection.to)).toBe("ond");
    session.select(900, 900);
    expect(session.caret()).toEqual({ anchor: 22, head: 22 });
  });

  it("stays near where it was when the file changed elsewhere and was loaded", async () => {
    writeFileSync(notesPath(), "abcdef");
    const { session } = await open();
    session.select(3, 3);
    writeFileSync(notesPath(), "abcdefghij");
    await session.save();
    expect(session.text()).toBe("abcdefghij");
    expect(session.caret()).toEqual({ anchor: 3, head: 3 });
  });
});

describe("spellcheck in Notes", () => {
  it("is off until asked, sends the dictionary nothing while off, and marks unknown words once on", async () => {
    const { session, type, engine, spellcheck } = await open();
    type("the dog barks at the moonn");
    expect(engine.sent()).toBe(0);
    expect(session.decorations().find()).toEqual([]);
    await session.spelling.toggle();
    expect(session.spelling.isOn()).toBe(true);
    expect(spellcheck).toContain(true);
    const marked = session.decorations().find();
    expect(marked).toHaveLength(1);
    expect(session.state.doc.textBetween(marked[0]!.from, marked[0]!.to)).toBe("moonn");
    // A misspelling under the caret is the menu's to correct.
    const wrong = session.spelling.at(marked[0]!.from + 1)!;
    session.spelling.replace(wrong, "moon");
    expect(session.text()).toBe("the dog barks at the moon");
  });

  it("is not offered without a dictionary", async () => {
    const read = await readWorkspaceFile(nodeFilesystem, project, NOTE);
    const session = notesSession(
      {
        files: workspaceFiles({ filesystem: nodeFilesystem, project: () => project, declared: NOTES_FILES }),
        file: NOTE,
        report: () => {},
        setSaved: () => {},
        setStatus: () => {},
        setSpellcheck: () => {},
        redraw: () => {},
      },
      read,
    );
    expect(session.spelling.available()).toBe(false);
  });
});
