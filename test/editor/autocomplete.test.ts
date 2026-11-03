/**
 * Autocomplete for cues and headings (slice 2, step 9).
 *
 * The offer is drawn and never written, so most of what is checked here is
 * what the *document* says — before the writer accepts, after, and after an
 * undo — and not what the offer looks like. Keys go through the real plugin
 * order (`editorStateFor`), so "Enter is the offer's, and then the old Enter"
 * is tested where it could break.
 */
import { describe, expect, it } from "vitest";
import { undo } from "prosemirror-history";
import { Selection, TextSelection, type EditorState } from "prosemirror-state";
import type { DecorationSet, EditorView } from "prosemirror-view";
import { visibleOffer, completions, TIMES_OF_DAY } from "../../src/screenplay/autocomplete.ts";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { setElementType, splitElement } from "../../src/screenplay/element-keys.ts";
import { namesOf, syncNames } from "../../src/screenplay/names-sync.ts";
import type { NameLists } from "../../src/screenplay/names.ts";
import { parse } from "../../src/screenplay/parse.ts";

/** EDWARD five times, EDNA twice; KITCHEN three times, HALL twice. */
const SCRIPT = [
  "INT. KITCHEN - DAY",
  "",
  "@EDWARD",
  "One.",
  "",
  "@EDNA",
  "Two.",
  "",
  "INT. KITCHEN - NIGHT",
  "",
  "@EDWARD",
  "Three.",
  "",
  "@EDNA",
  "Four.",
  "",
  "INT. HALL - DAY",
  "",
  "@EDWARD",
  "Five.",
  "",
  "@EDWARD",
  "Six.",
  "",
  "INT. HALL - NIGHT",
  "",
  "@EDWARD",
  "Seven.",
  "",
  "INT. KITCHEN - DAY",
  "",
  "A pause.",
].join("\n");

/** A running editor: the state, its lists, and the keys going through every plugin. */
class Writer {
  state: EditorState;
  readonly names: NameLists;

  constructor(fountain = SCRIPT) {
    // The lists are made from the document first and read through a getter,
    // as the window does.
    const document = parse(fountain);
    const holder: { names?: NameLists } = {};
    this.state = editorStateFor(document, {
      autocomplete: { names: () => holder.names!, draw: () => ({}) as HTMLElement },
    });
    this.names = holder.names = namesOf(this.state.doc);
  }

  readonly dispatch = (transaction: Parameters<EditorState["apply"]>[0]): void => {
    const before = this.state.doc;
    this.state = this.state.apply(transaction);
    syncNames(this.names, before, this.state.doc);
  };

  /** A new line of this type at the very end, as Enter then a type change would make. */
  newLine(type: Parameters<typeof setElementType>[0]): this {
    this.state = this.state.apply(
      this.state.tr.setSelection(Selection.atEnd(this.state.doc)),
    );
    splitElement(this.state, this.dispatch);
    setElementType(type)(this.state, this.dispatch);
    return this;
  }

  type(text: string): this {
    for (const character of text) {
      this.dispatch(this.state.tr.insertText(character));
    }
    return this;
  }

  /** Press a key; whether the editor took it. */
  press(name: string): boolean {
    const view = {
      get state() {
        return writer.state;
      },
      dispatch: this.dispatch,
    } as unknown as EditorView;
    const writer = this;
    const event = { key: name, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
    for (const plugin of this.state.plugins) {
      const handle = plugin.props.handleKeyDown;
      if (handle?.call(plugin, view, event as KeyboardEvent) === true) return true;
    }
    return false;
  }

  get offer() {
    return visibleOffer(this.state, this.names);
  }

  /** The widget the view would draw, if any. */
  get drawn(): number {
    let found = 0;
    for (const plugin of this.state.plugins) {
      const set = plugin.props.decorations?.call(plugin, this.state) as DecorationSet | null | undefined;
      found += set?.find().length ?? 0;
    }
    return found;
  }

  /** The lines of the manuscript, as the file will say them. */
  get elements(): readonly { type: string; text: string }[] {
    return manuscriptOf(this.state.doc).elements.map(({ type, text }) => ({ type, text }));
  }

  get last(): { type: string; text: string } {
    return this.elements[this.elements.length - 1]!;
  }
}

describe("what is offered for a cue", () => {
  it("is only a confirmed name: the one used 5 times, not the one used twice", () => {
    const names = new Writer().names;
    expect(names.uses("character", "EDWARD")).toBe(5);
    expect(names.uses("character", "EDNA")).toBe(2);
    expect(completions("character", "ED", names)?.choices).toEqual(["EDWARD"]);
    expect(completions("character", "EDN", names)).toBeUndefined();
  });

  it("answers typing in either case, and offers capitals", () => {
    const names = new Writer().names;
    expect(completions("character", "edw", names)?.choices).toEqual(["EDWARD"]);
    expect(completions("character", "Ed", names)?.choices).toEqual(["EDWARD"]);
  });

  it("has nothing to say once the name is complete, or empty, or not begun", () => {
    const names = new Writer().names;
    expect(completions("character", "EDWARD", names)).toBeUndefined();
    expect(completions("character", "", names)).toBeUndefined();
    expect(completions("character", "ZZ", names)).toBeUndefined();
    expect(completions("character", "EDWARD (V", names)).toBeUndefined();
    expect(completions("action", "ED", names)).toBeUndefined();
  });
});

describe("what is offered for a heading", () => {
  it("is a prefix first, then a confirmed location, then a time of day", () => {
    const names = new Writer().names;
    expect(completions("scene-heading", "I", names)?.choices).toEqual(["INT. ", "INT./EXT. ", "I/E. "]);
    expect(completions("scene-heading", "e", names)?.choices).toEqual(["EXT. ", "EXT./INT. ", "EST. "]);
    expect(completions("scene-heading", "INT. K", names)).toMatchObject({
      piece: "location",
      start: 5,
      choices: ["KITCHEN - "],
    });
    expect(completions("scene-heading", "INT. KITCHEN - ni", names)).toMatchObject({
      piece: "time",
      start: 15,
      choices: ["NIGHT"],
    });
  });

  it("never offers a location used fewer times than it takes", () => {
    const names = new Writer().names;
    expect(names.uses("location", "HALL")).toBe(2);
    expect(completions("scene-heading", "INT. H", names)).toBeUndefined();
  });

  it("offers the whole vocabulary of times for one letter, and nothing for a full one", () => {
    const names = new Writer().names;
    expect(completions("scene-heading", "INT. HALL - D", names)?.choices).toEqual(["DAY", "DAWN", "DUSK"]);
    expect(completions("scene-heading", "INT. HALL - DAY", names)).toBeUndefined();
    expect(TIMES_OF_DAY).toContain("MOMENTS LATER");
  });

  it("is quiet before anything is typed of a piece", () => {
    const names = new Writer().names;
    expect(completions("scene-heading", "", names)).toBeUndefined();
    expect(completions("scene-heading", "INT. ", names)).toBeUndefined();
    expect(completions("scene-heading", "INT. KITCHEN - ", names)).toBeUndefined();
  });

  it("finishes a location that holds a dash of its own", () => {
    const names = new Writer(
      ["INT. HOUSE - KITCHEN - DAY", "", "INT. HOUSE - KITCHEN - NIGHT", "", "INT. HOUSE - KITCHEN - DAY"].join("\n"),
    ).names;
    expect(completions("scene-heading", "INT. HOUSE - K", names)?.choices).toEqual(["HOUSE - KITCHEN - "]);
  });
});

describe("a cue, in the editor", () => {
  it("shows the offer without writing it", () => {
    const writer = new Writer().newLine("character").type("ed");
    expect(writer.offer?.choices).toEqual(["EDWARD"]);
    expect(writer.drawn).toBe(1);
    // Nothing but the typed letters is in the document.
    expect(writer.last).toEqual({ type: "character", text: "ED" });
    expect(writer.names.uses("character", "EDWARD")).toBe(5);
  });

  it("is accepted by Enter, which goes on to the dialogue, as one undo step", () => {
    const writer = new Writer().newLine("character").type("ed");
    const before = writer.elements.length;
    expect(writer.press("Enter")).toBe(true);
    // The new line is empty, so it is spacing and not in the file; the caret stands on it.
    expect(writer.last).toEqual({ type: "character", text: "EDWARD" });
    expect(writer.state.selection.$head.parent.attrs["type"]).toBe("dialogue");
    expect(writer.names.uses("character", "EDWARD")).toBe(6);
    expect(writer.elements.length).toBe(before);

    // One step takes back the name and the new line together.
    undo(writer.state, writer.dispatch);
    expect(writer.last).toEqual({ type: "character", text: "ED" });
    expect(writer.state.selection.$head.parent.attrs["type"]).toBe("character");
  });

  it("is accepted by Tab, which takes the name and leaves the line a cue", () => {
    const writer = new Writer().newLine("character").type("Edw");
    expect(writer.press("Tab")).toBe(true);
    expect(writer.last).toEqual({ type: "character", text: "EDWARD" });
    expect(writer.state.selection.$head.parent.attrs["type"]).toBe("character");
    expect(writer.state.selection.$head.parentOffset).toBe("EDWARD".length);
    // Nothing is offered for a name that is whole, so the next Tab is the old Tab.
    expect(writer.offer).toBeUndefined();
    writer.press("Tab");
    expect(writer.last).toEqual({ type: "dialogue", text: "EDWARD" });
  });

  it("leaves (CONT'D) to the rule: added when the writer moves on, not before", () => {
    // EDWARD speaks, then action, then EDWARD again in the same scene.
    const writer = new Writer(
      [
        "INT. KITCHEN - DAY", "", "@EDWARD", "One.", "", "@EDWARD", "Two.", "", "@EDWARD", "Three.", "",
        "He waits.",
      ].join("\n"),
    )
      .newLine("character")
      .type("ed");
    // While the cue is under the writer's hands, no extension is written.
    expect(writer.last.text).toBe("ED");
    writer.press("Enter");
    // Accepting by Enter moves on, and moving on is what ADR-0026 maintains at.
    const cues = writer.elements.filter((line) => line.type === "character").map((line) => line.text);
    expect(cues[cues.length - 1]).toBe("EDWARD (CONT'D)");
    expect(writer.state.selection.$head.parent.attrs["type"]).toBe("dialogue");
  });
});

describe("a heading, in the editor", () => {
  it("is finished in three accepted pieces and is the typed form", () => {
    const writer = new Writer().newLine("scene-heading");
    writer.type("i");
    expect(writer.offer?.piece).toBe("prefix");
    writer.press("Tab");
    expect(writer.last).toEqual({ type: "scene-heading", text: "INT. " });
    expect(writer.state.selection.$head.parentOffset).toBe(5);

    writer.type("k");
    expect(writer.offer?.piece).toBe("location");
    writer.press("Enter");
    expect(writer.last).toEqual({ type: "scene-heading", text: "INT. KITCHEN - " });
    // Accepting a piece does not move on to a new line.
    expect(writer.state.selection.$head.parent.attrs["type"]).toBe("scene-heading");

    writer.type("d");
    expect(writer.offer?.choices).toEqual(["DAY", "DAWN", "DUSK"]);
    writer.press("Tab");
    expect(writer.last).toEqual({ type: "scene-heading", text: "INT. KITCHEN - DAY" });

    // Over the model, not the bytes: the element is a heading, the one typed by hand would be.
    const element = manuscriptOf(writer.state.doc).elements.at(-1)!;
    expect(element.type).toBe("scene-heading");
    expect(element.text).toBe("INT. KITCHEN - DAY");
    expect(element.forced).toBe(false);
    expect(writer.names.uses("location", "KITCHEN")).toBe(4);
    expect(writer.offer).toBeUndefined();
  });

  it("takes the choice the arrow keys moved to", () => {
    const writer = new Writer().newLine("scene-heading").type("INT. HALL - d");
    expect(writer.offer?.selected).toBe(0);
    expect(writer.press("ArrowDown")).toBe(true);
    expect(writer.offer?.selected).toBe(1);
    expect(writer.press("ArrowUp")).toBe(true);
    expect(writer.press("ArrowUp")).toBe(true);
    expect(writer.offer?.selected).toBe(2);
    writer.press("Enter");
    expect(writer.last.text).toBe("INT. HALL - DUSK");
  });
});

describe("never in the way", () => {
  it("lets Escape close the offer, and keeps it closed while the writer goes on typing", () => {
    const writer = new Writer().newLine("character").type("ed");
    expect(writer.press("Escape")).toBe(true);
    expect(writer.offer).toBeUndefined();
    expect(writer.drawn).toBe(0);
    writer.type("w");
    expect(writer.offer).toBeUndefined();
    // And Enter is Enter again: the cue is left as typed.
    writer.press("Enter");
    expect(writer.elements.find((line) => line.text === "EDW")).toEqual({ type: "character", text: "EDW" });
    expect(writer.state.selection.$head.parent.attrs["type"]).toBe("dialogue");
  });

  it("offers again on another line", () => {
    const writer = new Writer().newLine("character").type("ed");
    writer.press("Escape");
    writer.newLine("character").type("ed");
    expect(writer.offer?.choices).toEqual(["EDWARD"]);
  });

  it("passes Enter and Tab on when nothing is on offer", () => {
    const writer = new Writer().newLine("character").type("Z");
    expect(writer.offer).toBeUndefined();
    writer.press("Tab");
    expect(writer.last).toEqual({ type: "dialogue", text: "Z" });

    const empty = new Writer().newLine("scene-heading");
    empty.press("Tab");
    expect(empty.state.selection.$head.parent.attrs["type"]).toBe("action");
  });

  it("does not take the arrow keys for a single choice", () => {
    const writer = new Writer().newLine("character").type("ed");
    expect(writer.press("ArrowDown")).toBe(false);
    expect(writer.press("ArrowUp")).toBe(false);
  });

  it("offers nothing unless the caret is at the end of the line", () => {
    const writer = new Writer().newLine("character").type("ed");
    const head = writer.state.selection.head;
    writer.state = writer.state.apply(
      writer.state.tr.setSelection(TextSelection.create(writer.state.doc, head - 1)),
    );
    expect(writer.offer).toBeUndefined();
    expect(writer.drawn).toBe(0);
  });

  it("offers nothing over a selection", () => {
    const writer = new Writer().newLine("character").type("ed");
    const head = writer.state.selection.head;
    writer.state = writer.state.apply(
      writer.state.tr.setSelection(TextSelection.create(writer.state.doc, head - 2, head)),
    );
    expect(writer.offer).toBeUndefined();
  });

  it("is not in the file, the copy, or the page's seams", () => {
    const writer = new Writer().newLine("character").type("ed");
    expect(writer.offer).toBeDefined();
    expect(manuscriptOf(writer.state.doc).elements.at(-1)!.text).toBe("ED");
    expect(writer.state.doc.textContent).not.toContain("EDWARD (");
  });
});

describe("the cost of a keystroke with an offer open", () => {
  it("is measured with the measurer's own cost inside it, and is far under a frame", () => {
    const writer = new Writer().newLine("character");
    const KEYSTROKES = 500;
    const names = writer.names;
    const from = performance.now();
    for (let at = 0; at < KEYSTROKES; at++) {
      // Type "E", look at what the view would draw, and take the letter back.
      writer.type("E");
      for (const plugin of writer.state.plugins) plugin.props.decorations?.call(plugin, writer.state);
      writer.state = writer.state.apply(
        writer.state.tr.delete(writer.state.selection.head - 1, writer.state.selection.head),
      );
    }
    const each = (performance.now() - from) / KEYSTROKES;
    console.log(`  a keystroke with the offer open, including the measurement: ${each.toFixed(4)} ms (budget 16 ms)`);
    expect(names.uses("character", "EDWARD")).toBe(5);
    expect(each).toBeLessThan(16);
  });
});
