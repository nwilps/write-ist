/**
 * Undo steps that change nothing on the paper (`off-paper-undo.ts`), with no
 * window and no dictionary: only where in the history they sit.
 * `test/project/manuscript-session.test.ts` drives Add to Dictionary itself.
 */
import { describe, expect, it } from "vitest";
import type { EditorState, Transaction } from "prosemirror-state";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { OffPaperHistory } from "../../src/screenplay/off-paper-undo.ts";
import { HISTORY_DEPTH } from "../../src/screenplay/undo-grouping.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { startOfElement } from "../support/editor-positions.ts";

function editor() {
  const history = new OffPaperHistory();
  let state = editorStateFor(parse("INT. KITCHEN - DAY\n\nHe waits.\n"), { undo: history });
  const dispatch = (transaction: Transaction): void => {
    const before = state;
    state = state.apply(transaction);
    history.applied(transaction, before, state);
  };
  let clock = 0;
  return {
    history,
    text: () => serialise(manuscriptOf(state.doc)),
    /** One undo step of typing: a pause of a second before it. */
    type: (text: string) => {
      clock += 1000;
      dispatch(state.tr.insertText(text, startOfElement(state, 1)).setTime(clock));
    },
    step: (log: string[], name: string) => {
      const begun = history.begin(state);
      dispatch(begun.close);
      log.push(name);
      begun.record({ undo: () => log.push(`undo ${name}`), redo: () => log.push(`redo ${name}`) });
    },
    press: (which: "undo" | "redo"): boolean => history[which](state as EditorState, dispatch),
  };
}

describe("undo steps off the paper", () => {
  it("keep their place when the text history drops its oldest steps", () => {
    const writing = editor();
    const log: string[] = [];
    // Counted from what the text history keeps (`HISTORY_DEPTH`, and twenty
    // over), so some of the typing before the step is dropped while the step
    // stays in reach.
    const after = 100;
    for (let n = 0; n < HISTORY_DEPTH - after + 30; n++) writing.type("a");
    writing.step(log, "added");
    const before = writing.text();
    for (let n = 0; n < after; n++) writing.type("b");
    for (let n = 0; n < after; n++) writing.press("undo");
    expect(writing.text()).toBe(before);
    expect(log).toEqual(["added"]);
    writing.press("undo");
    expect(log).toEqual(["added", "undo added"]);
    expect(writing.text()).toBe(before);
  });

  it("is dropped with the text steps around it once those are out of reach", () => {
    const writing = editor();
    const log: string[] = [];
    writing.step(log, "added");
    for (let n = 0; n < HISTORY_DEPTH + 50; n++) writing.type("b");
    // Undo runs out where the text history does, without reaching the step.
    while (writing.press("undo"));
    expect(log).toEqual(["added"]);
  });
});
