/**
 * Pairing: what counts as a speech and as a pair of them. The rules take
 * nothing but element types and two flags, so none of this needs an editor.
 * The commands that act on a pair are tested in `dual-dialogue.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  SPEECH,
  caretToPair,
  continuesSpeech,
  dualPairs,
  nearDualDialogue,
  pairOf,
  speechAt,
  speechesOf,
} from "../../src/screenplay/pairing.ts";
import type { Element } from "../../src/screenplay/document.ts";

const item = (type: Element["type"], dual = false) => ({ type, dual });

describe("what a speech is", () => {
  it("is a cue and the parentheticals and dialogue directly after it", () => {
    expect(SPEECH).toEqual(new Set(["character", "parenthetical", "dialogue"]));
    expect(continuesSpeech("dialogue")).toBe(true);
    expect(continuesSpeech("parenthetical")).toBe(true);
    expect(continuesSpeech("character")).toBe(false);
    expect(continuesSpeech("action")).toBe(false);
  });

  it("is found from its cue; a dialogue with no cue above it is not one", () => {
    expect(
      speechesOf([
        item("dialogue"),
        item("character"),
        item("parenthetical"),
        item("dialogue"),
        item("action"),
        item("character"),
      ]),
    ).toEqual([
      { cue: 1, end: 3 },
      { cue: 5, end: 5 },
    ]);
  });

  it("is looked up by any element in it", () => {
    const items = [item("action"), item("character"), item("dialogue"), item("character")];
    expect(speechAt(items, 0)).toBeUndefined();
    expect(speechAt(items, 1)).toBe(0);
    expect(speechAt(items, 2)).toBe(0);
    expect(speechAt(items, 3)).toBe(1);
  });
});

describe("what a pair is", () => {
  it("is two touching speeches, the second carrying the caret", () => {
    const pairs = dualPairs([
      item("scene-heading"),
      item("character"),
      item("dialogue"),
      item("character", true),
      item("parenthetical"),
      item("dialogue"),
    ]);
    expect(pairs).toEqual([{ left: { cue: 1, end: 2 }, right: { cue: 3, end: 5 } }]);
  });

  it.each(["action", "transition", "scene-heading", "centered", "note", "boneyard-start", "page-break", "lyrics"])(
    "is not a pair with %s between the speeches",
    (between) => {
      expect(
        dualPairs([
          item("character"),
          item("dialogue"),
          item(between as Element["type"]),
          item("character", true),
          item("dialogue"),
        ]),
      ).toEqual([]);
    },
  );

  it("pairs two speeches and never a third", () => {
    const pairs = dualPairs([
      item("character"),
      item("dialogue"),
      item("character", true),
      item("dialogue"),
      item("character", true),
      item("dialogue"),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.right.cue).toBe(2);
  });

  it("needs a speech above, and ignores omitted ones", () => {
    expect(dualPairs([item("character", true), item("dialogue")])).toEqual([]);
    expect(
      dualPairs([
        { type: "character", omitted: true },
        { type: "dialogue", omitted: true },
        { type: "character", dual: true, omitted: true },
      ]),
    ).toEqual([]);
  });

  it("is looked up from either of its speeches", () => {
    const items = [
      item("character"),
      item("dialogue"),
      item("character", true),
      item("dialogue"),
      item("character"),
    ];
    const pair = { left: { cue: 0, end: 1 }, right: { cue: 2, end: 3 } };
    expect(pairOf(items, 0)).toEqual(pair);
    expect(pairOf(items, 1)).toEqual(pair);
    expect(pairOf(items, 2)).toBeUndefined();
  });
});

describe("which speech gets the caret to make a pair", () => {
  const two = [item("character"), item("dialogue"), item("character"), item("dialogue")];

  it("is the later of two touching speeches, trying above first", () => {
    expect(caretToPair(two, 1, [-1, 1])).toEqual({ cue: 2, end: 3 });
    expect(caretToPair(two, 0, [-1, 1])).toEqual({ cue: 2, end: 3 });
  });

  it("honours the directions it is given", () => {
    expect(caretToPair(two, 0, [-1])).toBeUndefined();
    expect(caretToPair(two, 1, [1])).toBeUndefined();
  });

  it("is nobody when the speeches do not touch, are omitted, or are already paired", () => {
    expect(caretToPair([item("character"), item("action"), item("character")], 1, [-1, 1])).toBeUndefined();
    expect(
      caretToPair([item("character"), { type: "character", omitted: true }], 1, [-1, 1]),
    ).toBeUndefined();
    const three = [item("character"), item("character", true), item("character")];
    expect(caretToPair(three, 1, [-1, 1])).toBeUndefined();
    expect(caretToPair(three, 2, [-1, 1])).toBeUndefined();
  });
});

describe("an edit near a pair", () => {
  const run = [
    item("character"),
    item("dialogue"),
    item("character", true),
    item("dialogue"),
    item("action"),
    item("action"),
    item("action"),
  ];
  it("is in either speech, or just above the caret", () => {
    expect(nearDualDialogue(run, 0)).toBe(true);
    expect(nearDualDialogue(run, 3)).toBe(true);
    expect(nearDualDialogue([item("action"), item("character", true), item("dialogue")], 0)).toBe(true);
  });
  it("is not far from any", () => {
    expect(nearDualDialogue(run, 6)).toBe(false);
    expect(nearDualDialogue([item("character"), item("dialogue")], 1)).toBe(false);
  });
});
