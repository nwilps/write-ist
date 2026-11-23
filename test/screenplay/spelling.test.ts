/**
 * What a word is and what a verdict means (slice 2, step 10; ADR-0032),
 * without an editor and without a dictionary: the engine is the fake.
 */
import { describe, expect, it } from "vitest";
import { isChecked, matchCase, Spelling, tokensOf } from "../../src/screenplay/spelling.ts";
import { fakeEngine } from "../support/spell-engine.ts";

async function spelling(words: string[]): Promise<Spelling> {
  const held = new Spelling(fakeEngine());
  await held.prepare(words);
  return held;
}

describe("the words of a line", () => {
  it("finds words with their offsets", () => {
    expect(tokensOf("She walks, slowly.")).toEqual([
      { word: "She", start: 0, end: 3 },
      { word: "walks", start: 4, end: 9 },
      { word: "slowly", start: 11, end: 17 },
    ]);
  });

  it("keeps an apostrophe inside a word and splits at a hyphen or a dot", () => {
    expect(tokensOf("DON'T ANTI-MATTER").map((t) => t.word)).toEqual(["DON'T", "ANTI", "MATTER"]);
    expect(tokensOf("Edward’s dog").map((t) => t.word)).toEqual(["Edward’s", "dog"]);
    expect(tokensOf("INT./EXT. HALL").map((t) => t.word)).toEqual(["INT", "EXT", "HALL"]);
  });

  it("leaves out numbers, ordinals and single letters", () => {
    expect(tokensOf("1987 4TH V.O. a I").map((t) => t.word)).toEqual([]);
  });

  it("blanks an inline note without moving the words after it", () => {
    expect(tokensOf("Run [[tehn]] now")).toEqual([
      { word: "Run", start: 0, end: 3 },
      { word: "now", start: 13, end: 16 },
    ]);
  });

  it("checks everything the writer sees and nothing cut or noted", () => {
    for (const type of ["action", "dialogue", "parenthetical", "transition", "centered", "character", "scene-heading", "lyrics"] as const) {
      expect(isChecked(type, false)).toBe(true);
    }
    for (const type of ["note", "boneyard-start", "boneyard-end", "page-break", "section", "synopsis"] as const) {
      expect(isChecked(type, false)).toBe(false);
    }
    expect(isChecked("action", true)).toBe(false);
  });
});

describe("case", () => {
  it("answers in the case the word was typed in", () => {
    expect(matchCase("kitchen", "KITCHNE")).toBe("KITCHEN");
    expect(matchCase("KITCHEN", "kitchne")).toBe("kitchen");
    expect(matchCase("kitchen", "Kitchne")).toBe("Kitchen");
    expect(matchCase("Michael", "micHeal")).toBe("Michael");
  });
});

describe("a verdict", () => {
  it("is nothing for a word the dictionary knows", async () => {
    const held = await spelling(["kitchen"]);
    expect(held.judge("kitchen")).toBeUndefined();
  });

  it("is nothing for a screenplay term", async () => {
    const held = await spelling(["INT", "CONT'D", "POV"]);
    for (const word of ["INT", "CONT'D", "POV"]) expect(held.judge(word), word).toBeUndefined();
  });

  it("is a misspelling for a word the dictionary does not know", async () => {
    const held = await spelling(["teh"]);
    expect(held.judge("teh")).toEqual({ kind: "misspelled" });
  });

  it("is a misspelling for a name the dictionary does not know, whatever the script says of it", async () => {
    // The character and location lists play no part (Noah, 2026-11-22): a
    // name that is a cue fifty times is still only right once it is a word.
    const held = await spelling(["MICHEAL", "EDWRAD", "KITCHNE", "Edward’s"]);
    for (const word of ["MICHEAL", "EDWRAD", "KITCHNE"]) expect(held.judge(word), word).toEqual({ kind: "misspelled" });
    // A name the dictionary knows is not second-guessed either.
    const knows = new Spelling(fakeEngine(["anne", "ann"]));
    await knows.prepare(["ANNE", "ANN"]);
    expect(knows.judge("ANNE")).toBeUndefined();
    expect(knows.judge("ANN")).toBeUndefined();
  });

  it("is nothing for a word that has no verdict yet", () => {
    const held = new Spelling(fakeEngine());
    expect(held.judge("teh")).toBeUndefined();
    expect(held.has("teh")).toBe(false);
  });
});

describe("the verdict cache", () => {
  it("sends each distinct word once", async () => {
    const engine = fakeEngine();
    const held = new Spelling(engine);
    await held.prepare(["teh", "kitchen", "teh", "KITCHEN", "INT"]);
    await held.prepare(["teh", "kitchen"]);
    // INT is a term and never asked; "teh" and "kitchen" once; "KITCHEN" is its own word.
    expect(engine.asked).toEqual([["teh", "kitchen", "KITCHEN"]]);
    expect(held.wordsLookedUp).toBe(3);
  });

  it("forgets a word in every case when it is added", async () => {
    const engine = fakeEngine();
    const held = new Spelling(engine);
    await held.prepare(["zorblax", "Zorblax", "ZORBLAX"]);
    expect(held.judge("Zorblax")).toEqual({ kind: "misspelled" });
    await held.add("Zorblax");
    expect(held.has("zorblax")).toBe(false);
    await held.prepare(["zorblax", "Zorblax", "ZORBLAX"]);
    expect(held.judge("Zorblax")).toBeUndefined();
    expect(held.epoch).toBe(1);
  });

  it("suggests in the case the word was typed in, once each", async () => {
    const held = new Spelling(fakeEngine());
    expect(await held.suggestions("KITCHNE")).toContain("KITCHEN");
    expect(await held.suggestions("kitchne")).toContain("kitchen");
  });
});
