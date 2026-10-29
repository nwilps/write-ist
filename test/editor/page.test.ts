/**
 * @vitest-environment jsdom
 *
 * What the Editor puts in the page (#39).
 *
 * Six of this ticket's acceptance criteria are claims about the page rather
 * than about the model: every element type displayed, each carrying its type;
 * marks shown as formatting and no delimiter shown at all; the title page at
 * the top; cut material marked as cut; dual dialogue one speech above the
 * other; comments absent; and the text real text a screen reader can read.
 *
 * **This is not the window, and it is not ProseMirror's internals.** It is the
 * markup the surface declares — `prosemirror-view` draws the page from exactly
 * these specifications, and `DOMSerializer` is the same machinery reading them
 * without a webview. Seam 4 leaves the window itself to the writer; what can be
 * checked here is what is *in* it.
 */
import { DOMSerializer } from "prosemirror-model";
import { describe, expect, it } from "vitest";
import { fromEditorDocument, toEditorDocument } from "../../src/screenplay/editor.ts";
import { exportScreenplay, importScreenplay } from "../../src/screenplay/import.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { ELEMENT_TYPES, screenplaySchema } from "../../src/screenplay/schema.ts";
import type { ScreenplayDocument } from "../../src/screenplay/document.ts";
import { decodeFile } from "../../src/decode.ts";
import { readFixtureBytes } from "../support/files.ts";

/** The augmented fixture is the one holding all fourteen element types. */
const FIXTURE = "Big-Fish-augmented.fountain";

function manuscript(): ScreenplayDocument {
  return parse(decodeFile(exportScreenplay(importScreenplay(readFixtureBytes(FIXTURE)).document)).text);
}

/** The manuscript, drawn — the same specifications the view draws from. */
function page(document: ScreenplayDocument = manuscript()): HTMLElement {
  const editorDocument = toEditorDocument(document);
  const into = window.document.createElement("div");
  into.append(
    DOMSerializer.fromSchema(screenplaySchema).serializeFragment(editorDocument.content, {
      document: window.document,
    }),
  );
  return into;
}

/** Every drawn element, in the order the page holds them. */
function drawn(into: HTMLElement): readonly HTMLElement[] {
  return [...into.querySelectorAll<HTMLElement>("[data-element]")];
}

describe("every element type is displayed, carrying its type (ADR-0021, ADR-0029)", () => {
  it("draws all fourteen of ADR-0021's element types", () => {
    // Read off the surface's own list rather than retyped here, so a type added
    // to the vocabulary cannot be quietly missing from this check.
    const types = new Set(drawn(page()).map((node) => node.dataset["element"]));

    expect([...types].sort()).toEqual([...ELEMENT_TYPES].sort());
    expect(ELEMENT_TYPES).toHaveLength(14);
  });

  it("draws one node per element, and nothing else", () => {
    const document = manuscript();
    expect(drawn(page(document))).toHaveLength(document.elements.length);
  });

  it("gives spellcheck something to key on (ADR-0029)", () => {
    // Spellcheck is the system's and has to be switched off on cues and scene
    // headings. It can only be told which those are if the element's type is in
    // the page — so the attribute is the hook the next slice keys on, and it is
    // on every element, not only the two that will use it.
    for (const node of drawn(page())) {
      expect(node.dataset["element"]).toBeTruthy();
      expect(ELEMENT_TYPES).toContain(node.dataset["element"]);
    }
  });
});

describe("marks are formatting, never syntax (ADR-0018, ADR-0027)", () => {
  it("shows the file's opening bold transition as bold, with no asterisks", () => {
    // The fixture writes it `**FADE IN:**`.
    const strong = [...page().querySelectorAll("strong")].map((node) => node.textContent);

    expect(strong).toContain("FADE IN:");
    expect(strong.join("")).not.toContain("*");
  });

  it("shows the sung speeches that italicise across lines as italic (ADR-0027)", () => {
    const italic = [...page().querySelectorAll("em")].map((node) => node.textContent);

    expect(italic).toContain("Sometimes a girl can feel so alone");
    expect(italic).toContain("Without a lover to call her own.");
  });

  it("shows the underlined ending underlined, inside its bold", () => {
    // `> _**THE END**_ <` — the corpus's one piece of evidence for
    // underline-outermost (ADR-0019).
    const underlined = [...page().querySelectorAll("u")];

    expect(underlined.map((node) => node.textContent)).toContain("THE END");
    expect(underlined.some((node) => node.querySelector("strong") !== null)).toBe(true);
  });

  it("draws the writer's text and only the writer's text", () => {
    // The strongest form of "no delimiter appears in the displayed text": the
    // page's text is the elements' text, line for line. Anything syntactic
    // still in it — an asterisk, an underscore, a forcing marker, a scene
    // number's hashes, a dual caret — would show up as a difference here.
    const document = manuscript();

    expect(drawn(page(document)).map((node) => node.textContent)).toEqual(
      document.elements.map((element) => element.text),
    );
  });
});

describe("the title page is displayed at the top (ADR-0021)", () => {
  it("draws its lines, before any element", () => {
    const rows = [...page().children];
    const lines = rows.filter((row) => row.hasAttribute("data-title-line"));

    expect(lines.length).toBeGreaterThan(0);
    // Every title line comes before the first element, which is what "at the
    // top" means when the sequence is flat.
    expect(rows.indexOf(lines[lines.length - 1]!)).toBeLessThan(
      rows.findIndex((row) => row.hasAttribute("data-element")),
    );
  });

  it("draws the writer's values, and keeps each key out of the text", () => {
    // **The values are what a title page is.** `Title:` is the file's structure,
    // not the writer's words, and a page that printed it would be showing
    // syntax — which ADR-0018 rules out. The key rides on the element instead,
    // where the form that edits the title page will find it (a later ticket).
    const lines = [...page().querySelectorAll<HTMLElement>("[data-title-line]")];
    const titled = lines.find((line) => line.dataset["titleLine"] === "Title");

    expect(titled?.textContent).toBe(" Big Fish");
    expect(page().textContent).not.toContain("Title:");
    // A continuation line carries no key of its own: the field is the run.
    expect(lines.some((line) => line.dataset["titleLine"] === "")).toBe(true);
  });

  it("gives every title-page line the field it belongs to (#62)", () => {
    // Continuations carry no key; without `data-title-field` the stylesheet
    // cannot right-align Notes. The attribute is view-only — fromEditorDocument
    // never reads it.
    const lines = [...page().querySelectorAll<HTMLElement>("[data-title-field]")];
    const notes = lines.filter((line) => line.dataset["titleField"] === "Notes");

    expect(notes.length).toBeGreaterThan(1);
    expect(notes.every((line) => line.dataset["titleField"] === "Notes")).toBe(true);
    expect(notes.map((line) => line.dataset["titleFieldLine"])).toEqual(
      notes.map((_, index) => String(index)),
    );
    // The key line still carries its key; continuations do not.
    expect(notes[0]!.dataset["titleLine"]).toBe("Notes");
    expect(notes.slice(1).every((line) => line.dataset["titleLine"] === "")).toBe(true);
  });
});

describe("cut material is displayed and marked as cut (ADR-0021)", () => {
  it("marks every element between the boneyard's delimiters, and nothing else", () => {
    const cut = drawn(page()).filter((node) => node.dataset["omitted"] === "true");

    expect(cut).toHaveLength(6);
    expect(cut.map((node) => node.dataset["element"])).toEqual([
      "boneyard-start",
      "action",
      "action",
      "character",
      "dialogue",
      "boneyard-end",
    ]);
  });

  it("displays the cut text rather than hiding it", () => {
    const cut = drawn(page()).filter((node) => node.dataset["omitted"] === "true");

    expect(cut.map((node) => node.textContent)).toContain(
      "Kept in case the wedding scene needs it back.",
    );
  });
});

describe("dual dialogue is one speech above the other (#37, story 18)", () => {
  it("draws the second cue with its dual flag, after the first speech", () => {
    const rows = drawn(page());
    const dual = rows.filter((node) => node.dataset["dual"] === "true");

    expect(dual.map((node) => node.textContent)).toEqual(["BILL"]);
    // Stacked, which is what a flat sequence draws by default — and the flag is
    // what lets a later slice lay the pair out side by side with no change to
    // the model.
    const joe = rows.findIndex((node) => node.textContent === "JOE");
    expect(joe).toBeGreaterThan(-1);
    expect(rows.indexOf(dual[0]!)).toBeGreaterThan(joe);
  });
});

describe("comments are not displayed, and are not lost (ADR-0018)", () => {
  it("puts no comment delimiter and no remark in the page", () => {
    const drawing = page();

    expect(drawing.innerHTML).not.toContain("[[c:");
    expect(drawing.innerHTML).not.toContain("[[/c:");
    for (const remark of [
      "is this too on the nose?",
      "tighten",
      "cut superstition?",
      "Edward's voice, not mine",
    ]) {
      expect(drawing.textContent).not.toContain(remark);
    }
  });

  it("still has all five, with the text they cover, in the model behind it", () => {
    const document = fromEditorDocument(toEditorDocument(manuscript()));

    expect(document.comments.map((comment) => comment.id)).toEqual(["a1", "b1", "b2", "c1", "c2"]);
    const a1 = document.comments[0]!;
    expect(document.elements[a1.start.element]!.text.slice(a1.start.offset, a1.end.offset)).toBe(
      "There are some fish that cannot be caught.",
    );
  });
});

describe("the text is real text (#37)", () => {
  it("draws no element from CSS and no element as an image", () => {
    const drawing = page();

    // Nothing is drawn in place of text, so a screen reader keeps working — the
    // catalog's warning that accessibility is cheap if the surface is chosen
    // with it in mind and near-impossible to bolt on.
    expect(drawing.querySelectorAll("img, canvas, svg")).toHaveLength(0);
    expect(drawing.innerHTML).not.toContain("style=");
    expect(drawing.innerHTML).not.toContain("aria-hidden");
  });

  it("holds every word of the manuscript as selectable text", () => {
    const document = manuscript();
    const text = page(document).textContent ?? "";

    for (const element of document.elements) {
      if (element.text === "") continue;
      expect(text).toContain(element.text);
    }
  });
});
