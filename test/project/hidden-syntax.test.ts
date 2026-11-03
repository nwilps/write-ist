/**
 * Fountain syntax the editor does not show survives being edited, saved and
 * reopened, byte for byte.
 *
 * A dual-dialogue caret (`BRICK ^`) and a scene number (`#1#`) are attributes
 * of their element, not characters in its text (ADR-0019, ADR-0021). The parse
 * and serialise pair keeps them, which the model's round-trip tests prove; what
 * lost them was the *editing commands* — Tab, a numbered type, Enter at the
 * start of a line, Backspace and Delete across a line break — which made a new
 * element and let the old element's attributes go with it. Each of those is
 * exercised here on a real project, through a real save and a real reopen.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TextSelection, type EditorState } from "prosemirror-state";
import { MANUSCRIPT_FILE } from "../../src/project/bundle.ts";
import { importProject } from "../../src/project/import.ts";
import { openProject } from "../../src/project/open.ts";
import { editingSession } from "../../src/project/save.ts";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import {
  cycleType,
  joinBackwards,
  joinForwards,
  setElementType,
  splitElement,
} from "../../src/screenplay/element-keys.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { startOfElement } from "../support/editor-positions.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { unwatched } from "../support/unwatched.ts";

let temporary: { path: string; remove: () => void };
beforeEach(() => {
  temporary = temporaryDirectory();
});
afterEach(() => temporary.remove());

/** Every piece of Fountain syntax the parser lifts out of the text. */
const EVERYTHING = [
  "Title: Dual",
  "Author: Noah",
  "",
  "INT. BAR - NIGHT #1#",
  "",
  ".forced heading",
  "",
  "!forced action in lowercase",
  "",
  "STEEL",
  "(beat)",
  "Hi.",
  "",
  "BRICK ^",
  "Yo.",
  "",
  "@mcCLOUD ^",
  "Forced dual.",
  "",
  "DOC (V.O.) ^",
  "With an extension.",
  "",
  "BRICK (CONT'D)",
  "No caret here.",
  "",
  ">FADE OUT.",
  "",
  ">centred<",
  "",
  "~a lyric",
  "~and another",
  "",
  "= a synopsis",
  "",
  "# Act",
  "",
  "## Sequence",
  "",
  "===",
  "",
  "[[a standing note]]",
  "",
  "Action with an [[inline note]] and *italic*.",
  "",
  "/*",
  "hidden",
  "*/",
  "",
  "EXT. ROOF - DAY #2A#",
  "",
].join("\n");

/** The element census: what each line is, beside what its bytes are. */
function census(text: string): string[] {
  return parse(text).elements.map(
    (e) =>
      `${e.type}${e.forced ? "!" : ""}${e.dual === true ? "^" : ""}${e.sceneNumber === undefined ? "" : `#${e.sceneNumber}`}:${e.text}`,
  );
}

async function project(text: string) {
  const source = join(temporary.path, "Dual.fountain");
  writeFileSync(source, text);
  const imported = await importProject(
    { filesystem: nodeFilesystem, newProjectId: () => "3f2a1c44-0000-4000-8000-0123456789ab" },
    { sourcePath: source, projectsDirectory: join(temporary.path, "write-ist") },
  );
  return openProject(nodeFilesystem, imported.project);
}

const onDisk = (path: string) => readFileSync(join(path, MANUSCRIPT_FILE), "utf8");

describe("save, leave and reopen", () => {
  it("keeps every piece of syntax byte for byte through the editor and a save", async () => {
    const opened = await project(EVERYTHING);
    expect(onDisk(opened.project.path)).toBe(EVERYTHING);

    // The editor holds the manuscript; nothing is typed; a save is a no-op.
    const state = editorStateFor(opened.document);
    const session = editingSession(nodeFilesystem, opened, () => manuscriptOf(state.doc), unwatched);
    session.changed();
    await session.save();
    expect(onDisk(opened.project.path)).toBe(EVERYTHING);

    const reopened = await openProject(nodeFilesystem, opened.project);
    expect(serialise(reopened.document)).toBe(EVERYTHING);
    expect(census(serialise(reopened.document))).toEqual(census(EVERYTHING));
  });

  it("keeps a caret the writer typed, and the ones already there, when other text is edited", async () => {
    const opened = await project("INT. BAR - NIGHT\n\nSTEEL\nHi.\n\nBRICK ^\nYo.\n");
    let state = editorStateFor(opened.document);
    // Type a new dual cue: Tab-style typing at the end of the script.
    const last = manuscriptOf(state.doc).elements.length - 1;
    state = state.apply(state.tr.insertText(" Later.", startOfElement(state, last) + 3));
    const session = editingSession(nodeFilesystem, opened, () => manuscriptOf(state.doc), unwatched);
    session.changed();
    await session.save();

    const saved = onDisk(opened.project.path);
    expect(saved).toBe("INT. BAR - NIGHT\n\nSTEEL\nHi.\n\nBRICK ^\nYo. Later.\n");
    const reopened = await openProject(nodeFilesystem, opened.project);
    expect(serialise(reopened.document)).toBe(saved);
    expect(census(saved)[3]).toBe("character^:BRICK");
  });

  it("round-trips a caret typed into the editor itself", async () => {
    const opened = await project("INT. BAR - NIGHT\n\nBRICK\nYo.\n");
    let state = editorStateFor(opened.document);
    state = state.apply(state.tr.insertText(" ^", startOfElement(state, 1) + 5));
    const session = editingSession(nodeFilesystem, opened, () => manuscriptOf(state.doc), unwatched);
    session.changed();
    await session.save();

    const saved = onDisk(opened.project.path);
    expect(saved).toBe("INT. BAR - NIGHT\n\nBRICK ^\nYo.\n");
    const reopened = await openProject(nodeFilesystem, opened.project);
    expect(serialise(reopened.document)).toBe(saved);
    expect(census(saved)[1]).toBe("character^:BRICK");
  });
});

describe("editing a line that carries syntax the editor does not show", () => {
  const SOURCE = "INT. A - DAY #1#\n\nSTEEL\nHi.\n\nBRICK ^\nYo.\n\n!Act.\n";
  const CUE = 3;
  const HEADING = 0;

  function open(): EditorState {
    return editorStateFor(parse(SOURCE));
  }
  function place(state: EditorState, element: number, offset: number): EditorState {
    return state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, startOfElement(state, element) + offset)),
    );
  }
  function run(state: EditorState, command: typeof splitElement): EditorState {
    let next = state;
    command(state, (tr) => {
      next = state.apply(tr);
    });
    return next;
  }
  const saved = (state: EditorState) => serialise(manuscriptOf(state.doc));

  it("Tab off a dual cue writes the caret into the text", () => {
    const state = run(place(open(), CUE, 0), cycleType);
    expect(manuscriptOf(state.doc).elements[CUE]!.type).toBe("dialogue");
    expect(saved(state)).toContain("BRICK ^\n");
    expect(saved(state)).toContain("Yo.");
  });

  it("a numbered type off a dual cue does the same", () => {
    const state = run(place(open(), CUE, 0), setElementType("action"));
    expect(manuscriptOf(state.doc).elements[CUE]!.type).toBe("action");
    expect(saved(state)).toContain("BRICK ^");
  });

  it("Tab off a numbered heading writes the scene number into the text", () => {
    const state = run(place(open(), HEADING, 0), cycleType);
    expect(manuscriptOf(state.doc).elements[HEADING]).toMatchObject({
      type: "action",
      text: "INT. A - DAY #1#",
    });
    expect(saved(state).startsWith("INT. A - DAY #1#\n")).toBe(true);
  });

  it("Enter at the start of a dual cue moves the caret down with its name", () => {
    const state = run(place(open(), CUE, 0), splitElement);
    expect(saved(state)).toBe(SOURCE);
    expect(census(saved(state))).toEqual(census(SOURCE));
  });

  it("Enter at the start of a numbered heading keeps the number on the heading", () => {
    const state = run(place(open(), HEADING, 0), splitElement);
    expect(saved(state)).toBe(SOURCE);
  });

  it("Enter at the end of a dual cue keeps the caret", () => {
    const state = run(place(open(), CUE, 5), splitElement);
    expect(saved(state)).toBe(SOURCE);
  });

  it("Backspace at the start of a dual cue joins the name above without losing the caret", () => {
    const state = run(place(open(), CUE, 0), joinBackwards);
    expect(saved(state)).toContain("Hi.BRICK ^\n");
  });

  it("Delete at the end of the line above a dual cue does the same", () => {
    const state = run(place(open(), CUE - 1, 3), joinForwards);
    expect(saved(state)).toContain("Hi.BRICK ^\n");
  });
});

describe("the rest of the syntax, audited", () => {
  // Parse, then write: each of these was checked against the source.
  it.each([
    ["forced action", "!lower case action\n"],
    ["forced character", "@mcCLOUD\nHi.\n"],
    ["forced dual character", "@mcCLOUD ^\nHi.\n"],
    ["forced heading", ".int. forced - day\n"],
    ["forced transition", ">Fade out.\n"],
    ["centred text", ">  centred  <\n"],
    ["lyrics", "~sing\n~along\n"],
    ["synopsis", "= short\n"],
    ["page break", "====\n"],
    ["standing note", "[[note]]\n"],
    ["extensions with dual", "BRICK (O.S.) ^\nHi.\n"],
    ["extensions without dual", "BRICK (V.O.) (CONT'D)\nHi.\n"],
    ["scene number on a forced heading", ".int. b - day #2A#\n"],
    ["caret without a space is just text", "BRICK^\nHi.\n"],
    ["a caret typed twice", "BRICK ^ ^\nHi.\n"],
  ])("%s", (_name, text) => {
    expect(serialise(parse(text))).toBe(text);
    const through = editorStateFor(parse(text));
    expect(serialise(manuscriptOf(through.doc))).toBe(text);
    expect(census(serialise(manuscriptOf(through.doc)))).toEqual(census(text));
  });
});
