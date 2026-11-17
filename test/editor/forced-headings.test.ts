/**
 * A scene heading the parser would not recognise on its own survives a save.
 *
 * `LATER`, made a heading with Tab, used to be written as the bare word and
 * reopen as action — a misread element that the byte gate cannot see, because
 * an unforced heading and an action line with the same text serialise alike
 * (ADR-0021). So the census is asserted after the reopen, not only the bytes.
 */
import { describe, expect, it } from "vitest";
import type { Command, EditorState } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { cycleTypeBack, setElementType } from "../../src/screenplay/element-keys.ts";
import { fountainCopyOf } from "../../src/screenplay/fountain-copy.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { pdfPagesOf } from "../../src/screenplay/pdf-pages.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { startOfElement } from "../support/editor-positions.ts";

const SCENE = ["INT. KITCHEN - DAY", "", "Mary makes toast.", "", "LATER", "", "She eats it."].join("\n");

/** The third line, `LATER`, made a scene heading the way the writer does. */
function headed(command: Command): EditorState {
  let state = editorStateFor(parse(SCENE));
  const at = startOfElement(state, 2) + 2;
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
  command(state, (tr) => {
    state = state.apply(tr);
  });
  return state;
}

const saved = (state: EditorState): string => serialise(manuscriptOf(state.doc));

describe("a scene heading with no INT. or EXT.", () => {
  for (const [how, command] of [
    ["Ctrl+1", setElementType("scene-heading")],
    ["Shift-Tab from action", cycleTypeBack],
  ] as const) {
    it(`made with ${how}, is saved forced and reopens as a heading`, () => {
      const state = headed(command);
      // The paper holds the words as typed, with no dot in them.
      expect(manuscriptOf(state.doc).elements[2]).toMatchObject({ type: "scene-heading", text: "LATER" });

      const file = saved(state);
      expect(file).toBe(SCENE.replace("\nLATER\n", "\n.LATER\n"));
      const reopened = parse(file).elements;
      expect(reopened.map((element) => element.type)).toEqual([
        "scene-heading",
        "action",
        "scene-heading",
        "action",
      ]);
      expect(reopened[2]).toMatchObject({ text: "LATER", forced: true });
      // And saving the reopened file changes nothing.
      expect(serialise(parse(file))).toBe(file);
    });
  }

  it("keeps the dot in Save a Copy as Fountain, and leaves it out of the PDF", () => {
    const document = manuscriptOf(headed(setElementType("scene-heading")).doc);
    const copy = new TextDecoder().decode(fountainCopyOf(document));
    expect(copy.split("\n")).toContain(".LATER");
    const words = pdfPagesOf(document).pages.flat().map((run) => run.text);
    expect(words).toContain("LATER");
    expect(words.some((text) => text.includes(".LATER"))).toBe(false);
  });
});

describe("which headings are written forced", () => {
  const heading = (text: string, extra: object = {}): string =>
    serialise({
      titlePage: [],
      elements: [{ type: "scene-heading", text, forced: false, ...extra }],
      comments: [],
      endsWithNewline: false,
    });

  it("leaves a heading the parser already recognises as written", () => {
    expect(heading("INT. KITCHEN - DAY")).toBe("INT. KITCHEN - DAY");
    expect(heading("EXT/INT. CAR - NIGHT")).toBe("EXT/INT. CAR - NIGHT");
    expect(heading("INT. KITCHEN - DAY", { sceneNumber: "5" })).toBe("INT. KITCHEN - DAY #5#");
  });

  it("forces one that would read as another element", () => {
    for (const [text, would] of [
      ["CUT TO:", "transition"],
      ["MONTAGE", "action"],
      ["!BANG", "action"],
      ["@BOB", "character"],
      ["INT", "action"],
    ] as const) {
      // Below a heading, so that `CUT TO:` is not read as a title page key.
      const below = (line: string) => parse(`INT. KITCHEN - DAY\n\n${line}`).elements[1];
      expect(below(text)!.type).toBe(would);
      const file = heading(text);
      expect(file).toBe(`.${text}`);
      expect(below(file)).toMatchObject({ type: "scene-heading", text, forced: true });
    }
  });

  it("puts the dot outside a mark and before a scene number", () => {
    const marked = heading("LATER", { marks: [{ mark: "bold", start: 0, end: 5 }], sceneNumber: "7" });
    expect(marked).toBe(".**LATER** #7#");
    expect(parse(marked).elements[0]).toMatchObject({
      type: "scene-heading",
      text: "LATER",
      sceneNumber: "7",
      forced: true,
    });
  });

  it("does not add a dot to a commented heading the parser recognises", () => {
    const source = "[[c:a1 weak]]INT. KITCHEN - DAY[[/c:a1]]\n\nShe waits.\n";
    expect(serialise(parse(source))).toBe(source);
  });
});
