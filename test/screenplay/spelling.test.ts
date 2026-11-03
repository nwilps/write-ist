/**
 * What a word is and what a verdict means (slice 2, step 10; ADR-0032),
 * without an editor and without a dictionary: the engine is the fake.
 */
import { describe, expect, it } from "vitest";
import { NameLists } from "../../src/screenplay/names.ts";
import {
  contextOf,
  editDistance,
  isChecked,
  matchCase,
  NO_CONTEXT,
  sameContext,
  Spelling,
  tokensOf,
  type SpellContext,
} from "../../src/screenplay/spelling.ts";
import { fakeEngine } from "../support/spell-engine.ts";

const OPTIONS = { nearDistance: 1, nearMinLength: 4 };

async function spelling(words: string[]): Promise<Spelling> {
  const held = new Spelling(fakeEngine(), OPTIONS);
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

describe("edit distance", () => {
  it("counts a swap of neighbours as one edit", () => {
    expect(editDistance("MICHEAL", "MICHAEL", 1)).toBe(1);
    expect(editDistance("KITCHNE", "KITCHEN", 1)).toBe(1);
  });

  it("counts an insertion, a deletion and a substitution as one each", () => {
    expect(editDistance("ANN", "ANNE", 1)).toBe(1);
    expect(editDistance("ANNE", "ANN", 1)).toBe(1);
    expect(editDistance("MIKE", "MAKE", 1)).toBe(1);
  });

  it("gives up past the limit", () => {
    expect(editDistance("ABC", "XYZ", 1)).toBeGreaterThan(1);
    expect(editDistance("A", "ABCDEF", 1)).toBeGreaterThan(1);
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
  const known = new Set(["EDWARD", "MICHAEL", "KITCHEN", "ANN", "BENNETT'S"]);
  const context: SpellContext = { known, unconfirmed: new Set(["ANNE", "ZORBLAX"]) };

  it("is nothing for a word the dictionary knows", async () => {
    const held = await spelling(["kitchen"]);
    expect(held.judge("kitchen", context)).toBeUndefined();
  });

  it("is nothing for a confirmed word, its possessive, or a screenplay term", async () => {
    const held = await spelling(["EDWARD", "Edward’s", "EDWARD'S", "INT", "CONT'D", "bennett's", "POV"]);
    for (const word of ["EDWARD", "Edward’s", "EDWARD'S", "INT", "CONT'D", "POV"]) {
      expect(held.judge(word, context), word).toBeUndefined();
    }
  });

  it("is a misspelling for a word the dictionary does not know", async () => {
    const held = await spelling(["teh"]);
    expect(held.judge("teh", context)).toEqual({ kind: "misspelled" });
  });

  it("is a near-match when a confirmed word is one edit away", async () => {
    const held = await spelling(["MICHEAL", "KITCHNE", "kitchne"]);
    expect(held.judge("MICHEAL", context)).toEqual({ kind: "near", suggestion: "MICHAEL" });
    expect(held.judge("KITCHNE", context)).toEqual({ kind: "near", suggestion: "KITCHEN" });
    expect(held.judge("kitchne", context)).toEqual({ kind: "near", suggestion: "kitchen" });
  });

  it("is a near-match for an unconfirmed name the dictionary knows, as ANNE is to ANN", async () => {
    // The dictionary knows `anne`; only the lists say it is a stray beside a confirmed ANN.
    const held = new Spelling(fakeEngine(["anne"]), OPTIONS);
    await held.prepare(["ANNE"]);
    expect(held.judge("ANNE", context)).toEqual({ kind: "near", suggestion: "ANN" });
    // Once the writer confirms ANNE it is a known word, and the flag ends.
    const confirmed = { known: new Set([...context.known, "ANNE"]), unconfirmed: new Set<string>() };
    expect(held.judge("ANNE", confirmed)).toBeUndefined();
    // A dictionary word that is not a name is never second-guessed against the lists.
    await held.prepare(["room"]);
    expect(held.judge("room", { known: new Set(["ROOM", "ROOF"]), unconfirmed: new Set() })).toBeUndefined();
  });

  it("is never a near-match for a word too short to be a typo", async () => {
    const held = await spelling(["Mik"]);
    expect(held.judge("Mik", { known: new Set(["MIKE"]), unconfirmed: new Set() })).toEqual({ kind: "misspelled" });
  });

  it("is nothing for a word that has no verdict yet", () => {
    const held = new Spelling(fakeEngine(), OPTIONS);
    expect(held.judge("teh", NO_CONTEXT)).toBeUndefined();
    expect(held.has("teh")).toBe(false);
  });
});

describe("the verdict cache", () => {
  it("sends each distinct word once", async () => {
    const engine = fakeEngine();
    const held = new Spelling(engine, OPTIONS);
    await held.prepare(["teh", "kitchen", "teh", "KITCHEN", "INT"]);
    await held.prepare(["teh", "kitchen"]);
    // INT is a term and never asked; "teh" and "kitchen" once; "KITCHEN" is its own word.
    expect(engine.asked).toEqual([["teh", "kitchen", "KITCHEN"]]);
    expect(held.wordsLookedUp).toBe(3);
  });

  it("forgets a word in every case when it is added", async () => {
    const engine = fakeEngine();
    const held = new Spelling(engine, OPTIONS);
    await held.prepare(["zorblax", "Zorblax", "ZORBLAX"]);
    expect(held.judge("Zorblax", NO_CONTEXT)).toEqual({ kind: "misspelled" });
    await held.add("Zorblax");
    expect(held.has("zorblax")).toBe(false);
    await held.prepare(["zorblax", "Zorblax", "ZORBLAX"]);
    expect(held.judge("Zorblax", NO_CONTEXT)).toBeUndefined();
    expect(held.epoch).toBe(1);
  });

  it("suggests in the case the word was typed in, once each", async () => {
    const held = new Spelling(fakeEngine(), OPTIONS);
    expect(await held.suggestions("KITCHNE")).toContain("KITCHEN");
    expect(await held.suggestions("kitchne")).toContain("kitchen");
  });
});

describe("the context a script makes", () => {
  const lines = (names: string[]) =>
    names.flatMap((name) => [
      { type: "character" as const, text: name },
      { type: "dialogue" as const, text: "Hello." },
    ]);

  it("knows the words of confirmed names and sets the others aside", () => {
    const lists = NameLists.of(
      [
        ...lines(["EDWARD", "EDWARD", "EDWARD", "EDNA"]),
        ...[0, 1, 2].map(() => ({ type: "scene-heading" as const, text: "INT. BENNETT'S HOSPITAL ROOM - DAY" })),
      ],
      { confirmAfterUses: 3 },
    );
    const context = contextOf(lists);
    expect([...context.known].sort()).toEqual(["BENNETT'S", "HOSPITAL", "ROOM", "EDWARD"].sort());
    expect([...context.unconfirmed]).toEqual(["EDNA"]);
  });

  it("is the same context while it means the same, so what was judged stands", () => {
    const a = contextOf(NameLists.of(lines(["EDWARD", "EDWARD", "EDWARD"])));
    const b = contextOf(NameLists.of(lines(["EDWARD", "EDWARD", "EDWARD", "EDWARD"])));
    const c = contextOf(NameLists.of(lines(["EDWARD", "EDWARD"])));
    expect(sameContext(a, b)).toBe(true);
    expect(sameContext(a, c)).toBe(false);
  });
});
