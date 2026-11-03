// @vitest-environment jsdom
/**
 * On-demand spellcheck, as the view runs it (slice 2, step 10; ADR-0032).
 *
 * The dictionary is a fake (`test/support/spell-engine.ts`): this file is about
 * what the editor does with a verdict — what is underlined, what is left alone,
 * what the engine is and is not asked, and that **nothing in the text moves**.
 * The English itself is tested against the real dictionary in Rust.
 */
import { describe, expect, it } from "vitest";
import { undo } from "prosemirror-history";
import { TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { DEFAULT_PREFERENCES } from "../../src/preferences.ts";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { exportScreenplay } from "../../src/screenplay/import.ts";
import { namesOf, syncNames } from "../../src/screenplay/names-sync.ts";
import type { NameLists } from "../../src/screenplay/names.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { Spellcheck } from "../../src/screenplay/spellcheck.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { ENGLISH, fakeEngine, type FakeEngine } from "../support/spell-engine.ts";

/**
 * MICHAEL five times, a misspelling of him once, MARY twice (so unconfirmed),
 * ZORBLAX twice; KITCHEN three times (confirmed), HOSPITAL ROOM three times.
 */
const SCRIPT = [
  "INT. KITCHEN - DAY",
  "",
  "@MICHAEL",
  "Hello.",
  "",
  "@MARY",
  "Hello.",
  "",
  "INT. KITCHEN - NIGHT",
  "",
  "@MICHAEL",
  "Hello.",
  "",
  "@ZORBLAX",
  "Hello.",
  "",
  "INT. HOSPITAL ROOM - DAY",
  "",
  "@MICHAEL",
  "Hello.",
  "",
  "@ZORBLAX",
  "Hello.",
  "",
  "INT. KITCHEN - DAY",
  "",
  "She walks into the kitchne and looks around.",
  "",
  "@MICHEAL",
  "Goodbye.",
  "",
  "@MARY",
  "Hello.",
  "",
  "INT. HOSPITAL ROOM - NIGHT",
  "",
  "@MICHAEL",
  "Hello.",
  "",
  "INT. HOSPITAL ROOM - DAY",
  "",
  "@MICHAEL",
  "Hello.",
  "",
  "INT. KITCHNE - NIGHT",
  "",
  "The dog barks loudly.",
].join("\n");

/** An editor with a real view, the lists, and a spellcheck pass on a fake dictionary. */
function open(fountain = SCRIPT, engine: FakeEngine = fakeEngine()) {
  const document = parse(fountain);
  const holder: { names?: NameLists } = {};
  const spell = new Spellcheck({
    engine,
    names: () => holder.names,
    pause: 0,
    spelling: {
      nearDistance: DEFAULT_PREFERENCES.spellcheckNearDistance,
      nearMinLength: DEFAULT_PREFERENCES.spellcheckNearMinLength,
    },
  });
  const state = editorStateFor(document, { spellcheck: spell });
  holder.names = namesOf(state.doc);
  const view: EditorView = new EditorView(window.document.createElement("div"), {
    state,
    dispatchTransaction: (transaction) => {
      const before = view.state.doc;
      view.updateState(view.state.apply(transaction));
      if (transaction.docChanged) syncNames(holder.names!, before, view.state.doc);
    },
  });
  return { view, spell, engine, names: holder.names, document };
}

type Opened = ReturnType<typeof open>;

/** The underlined words, as the writer sees them, in order. */
const underlined = ({ view, spell }: Opened): string[] =>
  spell.issues(view.state).map((issue) => view.state.doc.textBetween(issue.from, issue.to));

/** Where a word's first occurrence in the document starts. */
function find(view: EditorView, text: string, nth = 0): number {
  let seen = 0;
  let found = -1;
  view.state.doc.descendants((node, pos) => {
    if (!node.isText || found >= 0) return;
    let at = node.text!.indexOf(text);
    while (at >= 0) {
      if (seen === nth) {
        found = pos + at;
        return;
      }
      seen += 1;
      at = node.text!.indexOf(text, at + 1);
    }
  });
  if (found < 0) throw new Error(`no "${text}" in the document`);
  return found;
}

describe("off by default", () => {
  it("draws nothing and asks the engine nothing until it is toggled on", async () => {
    const editor = open();
    expect(editor.spell.isOn(editor.view.state)).toBe(false);
    await editor.spell.flush(editor.view);
    // Typing with the pass off costs the engine nothing too.
    editor.view.dispatch(editor.view.state.tr.insertText("xx", find(editor.view, "Goodbye")));
    await editor.spell.flush(editor.view);
    expect(underlined(editor)).toEqual([]);
    expect(editor.engine.asked).toEqual([]);
  });

  it("toggles on to underlines and off to none, and the state is not in the file", async () => {
    const editor = open();
    expect(editor.spell.toggle(editor.view)).toBe(true);
    await editor.spell.flush(editor.view);
    expect(underlined(editor).length).toBeGreaterThan(0);

    expect(editor.spell.toggle(editor.view)).toBe(false);
    expect(underlined(editor)).toEqual([]);
    expect(serialise(manuscriptOf(editor.view.state.doc))).toBe(serialise(editor.document));
  });
});

describe("nothing is ever changed in the text", () => {
  it("leaves the document, the model and the file as they were", async () => {
    const editor = open();
    const before = editor.view.state.doc;
    const bytes = exportScreenplay(manuscriptOf(before));

    editor.spell.toggle(editor.view);
    await editor.spell.flush(editor.view);
    expect(underlined(editor).length).toBeGreaterThan(0);

    // The very same document: a decoration is not a change to it.
    expect(editor.view.state.doc).toBe(before);
    expect(manuscriptOf(editor.view.state.doc)).toEqual(manuscriptOf(before));
    expect(exportScreenplay(manuscriptOf(editor.view.state.doc))).toEqual(bytes);
  });

  it("puts no marker in what is copied", async () => {
    const editor = open();
    editor.spell.toggle(editor.view);
    await editor.spell.flush(editor.view);
    const from = find(editor.view, "She walks");
    const to = find(editor.view, "around") + "around".length;
    editor.view.dispatch(
      editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, from, to)),
    );
    expect(underlined(editor)).toContain("kitchne");

    const { dom, text } = editor.view.serializeForClipboard(editor.view.state.selection.content());
    expect(text).toBe("She walks into the kitchne and looks around");
    expect(dom.innerHTML).not.toContain("spell");
  });
});

describe("what is underlined", () => {
  it("does not underline a confirmed name, and does underline the same name used once", async () => {
    const editor = open();
    editor.spell.toggle(editor.view);
    await editor.spell.flush(editor.view);
    const words = underlined(editor);

    // MICHAEL (five uses) and KITCHEN (three) are confirmed: known words.
    expect(words).not.toContain("MICHAEL");
    expect(words).not.toContain("KITCHEN");
    // The words inside a confirmed location are known as well.
    expect(words).not.toContain("HOSPITAL");
    expect(words).not.toContain("ROOM");
    // ZORBLAX is used twice: unconfirmed, so the dictionary decides (Q-V).
    expect(words.filter((word) => word === "ZORBLAX")).toHaveLength(2);
    // MARY is used twice and is not in the fake dictionary either.
    expect(words).toContain("MARY");
  });

  it("underlines an ordinary word inside a heading, and offers the confirmed location", async () => {
    const editor = open();
    editor.spell.toggle(editor.view);
    await editor.spell.flush(editor.view);

    const at = find(editor.view, "KITCHNE");
    const issue = editor.spell.issueAt(editor.view.state, at + 2)!;
    expect(issue.word).toBe("KITCHNE");
    expect(issue.verdict).toEqual({ kind: "near", suggestion: "KITCHEN" });

    const offered = await editor.spell.suggestionsAt(editor.view.state, at + 2);
    expect(offered[0]).toEqual({ text: "KITCHEN", kind: "near" });
  });

  it("answers Did you mean MICHAEL for a typo of a confirmed name, and fixes it in one undo step", async () => {
    const editor = open();
    editor.spell.toggle(editor.view);
    await editor.spell.flush(editor.view);

    const at = find(editor.view, "MICHEAL");
    const issue = editor.spell.issueAt(editor.view.state, at)!;
    expect(issue.verdict).toEqual({ kind: "near", suggestion: "MICHAEL" });

    const before = editor.view.state.doc;
    editor.spell.replaceWord(editor.view, issue, "MICHAEL");
    expect(editor.view.state.doc.textBetween(issue.from, issue.to)).toBe("MICHAEL");

    // One undo step puts the typo back, whole.
    undo(editor.view.state, editor.view.dispatch);
    expect(editor.view.state.doc.eq(before)).toBe(true);
  });

  it("does not check notes, the boneyard or the title page", async () => {
    const editor = open(
      [
        "Title: Zzyzx",
        "",
        "INT. HALL - DAY",
        "",
        "[[a notte to self]]",
        "",
        "/*",
        "A cutt scene.",
        "*/",
        "",
        "She walks.",
      ].join("\n"),
    );
    editor.spell.toggle(editor.view);
    await editor.spell.flush(editor.view);
    expect(underlined(editor)).toEqual([]);
    expect(editor.engine.asked.flat()).not.toContain("notte");
    expect(editor.engine.asked.flat()).not.toContain("cutt");
    expect(editor.engine.asked.flat()).not.toContain("Zzyzx");
  });

  it("knows the screenplay's own terms and a confirmed name's possessive", async () => {
    const editor = open(
      [
        "INT./EXT. HALL - DAY",
        "",
        "@MICHAEL (V.O.)",
        "Hello.",
        "",
        "@MICHAEL (O.S.)",
        "Hello.",
        "",
        "@MICHAEL (CONT'D)",
        "Hello.",
        "",
        "Michael's dog barks.",
      ].join("\n"),
    );
    editor.spell.toggle(editor.view);
    await editor.spell.flush(editor.view);
    expect(underlined(editor)).toEqual([]);
  });
});

describe("the custom dictionary", () => {
  it("makes an invented word right, in this project and after a restart", async () => {
    const store: string[] = [];
    const editor = open(SCRIPT, fakeEngine(undefined, store));
    editor.spell.toggle(editor.view);
    await editor.spell.flush(editor.view);
    expect(underlined(editor)).toContain("ZORBLAX");

    await editor.spell.addToDictionary(editor.view, "ZORBLAX");
    await editor.spell.flush(editor.view);
    expect(underlined(editor)).not.toContain("ZORBLAX");
    expect(store).toEqual(["ZORBLAX"]);

    // A restart: a new editor, a new pass, the same stored words.
    const again = open(SCRIPT, fakeEngine(undefined, store));
    again.spell.toggle(again.view);
    await again.spell.flush(again.view);
    expect(underlined(again)).not.toContain("ZORBLAX");
  });
});

describe("rechecking", () => {
  it("sends only words it has not seen, and an edit with seen words sends none", async () => {
    const editor = open();
    editor.spell.toggle(editor.view);
    await editor.spell.flush(editor.view);
    const calls = editor.engine.asked.length;
    const lookedUp = editor.spell.spelling.wordsLookedUp;
    expect(lookedUp).toBe(editor.engine.sent());

    // A new sentence out of words already seen: the pass runs and asks nothing.
    editor.view.dispatch(editor.view.state.tr.insertText(" the dog barks", find(editor.view, "loudly") + 6));
    await editor.spell.flush(editor.view);
    expect(editor.engine.asked.length).toBe(calls);
    expect(editor.spell.spelling.wordsLookedUp).toBe(lookedUp);
  });

  it("after an edit in one scene, sends that scene's new word and no other scene's", async () => {
    const editor = open();
    editor.spell.toggle(editor.view);
    await editor.spell.flush(editor.view);
    const sentBefore = editor.engine.sent();

    editor.view.dispatch(editor.view.state.tr.insertText(" sloly", find(editor.view, "loudly") + 6));
    await editor.spell.flush(editor.view);

    expect(editor.engine.asked.slice(-1)[0]).toEqual(["sloly"]);
    expect(editor.engine.sent()).toBe(sentBefore + 1);
    expect(underlined(editor)).toContain("sloly");
  });

  it("checks the scene the caret is in first", async () => {
    const editor = open();
    const at = find(editor.view, "She walks");
    editor.view.dispatch(
      editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, at + 2)),
    );
    editor.spell.toggle(editor.view);
    await editor.spell.flush(editor.view);
    // The first thing the engine heard about is the caret's scene.
    expect(editor.engine.asked[0]).toContain("kitchne");
  });

  it("starts a pass again when a name is confirmed, without the engine", async () => {
    const editor = open();
    editor.spell.toggle(editor.view);
    await editor.spell.flush(editor.view);
    expect(underlined(editor)).toContain("MARY");
    const sent = editor.engine.sent();

    editor.names.confirm("character", "MARY");
    editor.spell.refresh(editor.view);
    await editor.spell.flush(editor.view);
    expect(underlined(editor)).not.toContain("MARY");
    expect(editor.engine.sent()).toBe(sent);
  });

  it("stops drawing when switched off mid-pass, and a later pass starts clean", async () => {
    const editor = open();
    editor.spell.toggle(editor.view);
    editor.spell.toggle(editor.view);
    await editor.spell.flush(editor.view);
    expect(underlined(editor)).toEqual([]);
    editor.spell.toggle(editor.view);
    await editor.spell.flush(editor.view);
    expect(underlined(editor).length).toBeGreaterThan(0);
  });
});

describe("the census of a pass", () => {
  it("counts what was checked and what was flagged, by kind of element", async () => {
    const editor = open();
    const census = await editor.spell.census(editor.view.state.doc);
    expect(census.checked).toBeGreaterThan(census.distinct);
    expect(census.flagged).toBeGreaterThan(0);
    // A defect that flags every name would show here as flagged ≈ checked.
    expect(census.flagged).toBeLessThan(census.checked / 2);
    // KITCHNE in the heading, `kitchne` in the action, and MICHEAL in the cue.
    expect(census.near).toBe(3);
    expect(census.flaggedByType["scene-heading"]).toBe(1);
    expect(census.flaggedByType["character"]).toBeGreaterThanOrEqual(3);
    expect(census.flaggedByType["action"]).toBe(1);
  });
});

/**
 * **Typing must never slow down** (the spec's 16 ms, and Slice 1's 0.07 ms).
 *
 * A script the size of the corpus, with the pass on and drawn. A keystroke maps
 * the underlines through the edit and restarts the pause timer; the engine is
 * not asked. The figure is the whole loop over the keystrokes, the real
 * `EditorView.dispatch` included — jsdom does the DOM work a browser would, so
 * it overstates the cost if anything. Measuring the measurer
 * (`docs/STANDARDS.md`): the two clock reads are inside the loop.
 */
describe("the keystroke budget, with a pass running", () => {
  const BUDGET = 16;
  const KEYSTROKES = 500;

  function script(): string {
    const speech = "She walks into the room and looks around slowly, and the light follows her to the far wall. ";
    const out: string[] = [];
    let bytes = 0;
    for (let scene = 0; bytes < 170_000; scene++) {
      // A misspelling in every scene, so the pass has underlines to carry.
      const text = [
        `INT. ROOM - DAY`,
        "",
        speech.repeat(1 + (scene % 4)).trim() + " sloly",
        "",
        `@SPEAKER ${["ONE", "TWO", "THREE"][scene % 3]}`,
        "(quietly)",
        speech.repeat(2 + (scene % 5)).trim(),
        "",
      ].join("\n");
      out.push(text);
      bytes += text.length + 1;
    }
    return out.join("\n") + "\n";
  }

  it(`stays under ${BUDGET} ms a keystroke, and does not ask the engine`, async () => {
    const editor = open(script(), fakeEngine([...ENGLISH_FOR_BUDGET]));
    editor.view.dispatch(
      editor.view.state.tr.setSelection(
        TextSelection.create(editor.view.state.doc, Math.floor(editor.view.state.doc.content.size / 2)),
      ),
    );
    // A pause long enough that no pass starts inside the loop; the keystroke
    // is what is measured, and the pass is off its path.
    const slow = new Spellcheck({
      engine: editor.engine,
      names: () => editor.names,
      pause: 60_000,
      spelling: { nearDistance: 1, nearMinLength: 4 },
    });
    const state = editorStateFor(editor.document, { spellcheck: slow });
    const view = new EditorView(window.document.createElement("div"), {
      state,
      dispatchTransaction: (transaction) => view.updateState(view.state.apply(transaction)),
    });
    const passStarted = performance.now();
    slow.setOn(view, true);
    await slow.flush(view);
    const firstPass = performance.now() - passStarted;
    const underlines = slow.issues(view.state).length;
    expect(underlines).toBeGreaterThan(100);

    const asked = editor.engine.asked.length;
    const caret = Math.floor(view.state.doc.content.size / 2);
    const keystroke = (): void => {
      view.dispatch(view.state.tr.insertText("a", caret));
    };
    for (let index = 0; index < 50; index++) keystroke();

    const samples: number[] = [];
    const from = performance.now();
    for (let index = 0; index < KEYSTROKES; index++) {
      const before = performance.now();
      keystroke();
      samples.push(performance.now() - before);
    }
    const measured = (performance.now() - from) / KEYSTROKES;
    const askedByKeystrokes = editor.engine.asked.length;
    // Off the keystroke path: the pass after the writer pauses, on the edited scene.
    const recheckStarted = performance.now();
    await slow.flush(view);
    const recheck = performance.now() - recheckStarted;
    const sorted = [...samples].sort((a, b) => a - b);
    console.log(
      [
        `first full pass (fake engine, in-process): ${firstPass.toFixed(1)} ms; recheck after a pause: ${recheck.toFixed(1)} ms`,
        `${underlines} underlines drawn, ${view.state.doc.childCount} elements`,
        `keystroke with a pass on, including the measurement: ${measured.toFixed(4)} ms (budget ${BUDGET} ms)`,
        `keystroke samples: median ${sorted[Math.floor(sorted.length / 2)]!.toFixed(4)} ms, ` +
          `worst ${sorted[sorted.length - 1]!.toFixed(4)} ms`,
      ].join("\n  "),
    );

    expect(measured).toBeLessThan(BUDGET);
    // The keystrokes asked the engine nothing, and the underlines are still drawn.
    expect(askedByKeystrokes).toBe(asked);
    expect(slow.issues(view.state).length).toBeGreaterThanOrEqual(underlines);
    slow.setOn(view, false);
    view.destroy();
  });
});

/** Words of the budget script that the dictionary knows (everything but "sloly" and the cue names). */
const ENGLISH_FOR_BUDGET = [
  ...ENGLISH,
  "speaker", "one", "two", "three",
];
