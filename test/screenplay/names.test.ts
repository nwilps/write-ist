/**
 * The character and location lists (slice 2, step 8): what a cue and a
 * heading are reduced to, when an entry is confirmed, and what moves when the
 * manuscript changes.
 */
import { describe, expect, it } from "vitest";
import {
  locationName,
  NameLists,
  nameOf,
  normaliseName,
  wordsOf,
  type NameLine,
} from "../../src/screenplay/names.ts";

const cue = (text: string, omitted = false): NameLine => ({ type: "character", text, omitted });
const heading = (text: string, omitted = false): NameLine => ({ type: "scene-heading", text, omitted });
const action = (text: string): NameLine => ({ type: "action", text });
const dialogue = (text: string): NameLine => ({ type: "dialogue", text });

/** Cues, one use each. */
const cues = (...names: string[]): NameLine[] => names.map((name) => cue(name));

describe("who is speaking", () => {
  it.each([
    ["EDWARD", "EDWARD"],
    ["EDWARD (V.O.)", "EDWARD"],
    ["EDWARD (V.O.) (CONT'D)", "EDWARD"],
    ["EDWARD (CONT'D)", "EDWARD"],
    ["BRICK ^", "BRICK"],
    ["BRICK (O.S.) ^", "BRICK"],
    ["Edward", "EDWARD"],
    ["  DR.   BENNETT ", "DR. BENNETT"],
    // Q-M's default: exactly what remains, no splitting.
    ["MARY & JOHN", "MARY & JOHN"],
    ["BOY #2", "BOY #2"],
    ["EDWARD'S VOICE", "EDWARD'S VOICE"],
  ])("reads the cue %j as %j", (text, name) => {
    expect(nameOf(cue(text))).toEqual({ kind: "character", name });
  });

  it("counts EDWARD, EDWARD (V.O.) (CONT'D) and a dual-dialogue EDWARD ^ as three uses of one name", () => {
    const lists = NameLists.of(cues("EDWARD", "EDWARD (V.O.) (CONT'D)", "EDWARD ^"));
    expect(lists.entries("character")).toEqual([
      { name: "EDWARD", uses: 3, confirmed: true, explicit: false },
    ]);
  });

  it("finds nothing in a cue with no name left", () => {
    expect(nameOf(cue("(V.O.)"))).toBeUndefined();
    expect(nameOf(cue(""))).toBeUndefined();
  });

  it("reads only cues and headings", () => {
    expect(nameOf(action("EDWARD"))).toBeUndefined();
    expect(nameOf(dialogue("EDWARD"))).toBeUndefined();
  });

  it("skips cut material", () => {
    expect(nameOf(cue("EDWARD", true))).toBeUndefined();
    expect(nameOf(heading("INT. KITCHEN - DAY", true))).toBeUndefined();
  });
});

describe("where a scene is", () => {
  it.each([
    ["INT. KITCHEN - DAY", "KITCHEN"],
    ["EXT. KITCHEN - NIGHT", "KITCHEN"],
    ["EST. KITCHEN - DAY", "KITCHEN"],
    ["INT./EXT. CAR - DAY", "CAR"],
    ["EXT./INT. CAR - DAY", "CAR"],
    ["INT/EXT. CAR - DAY", "CAR"],
    ["EXT/INT. CAR - DAY", "CAR"],
    ["I/E. CAR - DAY", "CAR"],
    ["int. kitchen - day", "KITCHEN"],
    ["INT KITCHEN - DAY", "KITCHEN"],
    ["INT. KITCHEN - NIGHT (1987)", "KITCHEN"],
    ["INT. KITCHEN - CONTINUOUS", "KITCHEN"],
    ["INT. KITCHEN - LATER", "KITCHEN"],
    ["INT. KITCHEN - MOMENTS LATER", "KITCHEN"],
    ["INT. KITCHEN - LATER THAT NIGHT", "KITCHEN"],
    ["INT. KITCHEN - DAY #12A#", "KITCHEN"],
    ["INT. KITCHEN #1#", "KITCHEN"],
    ["INT. KITCHEN – DAY", "KITCHEN"],
    ["INT. KITCHEN — DAY", "KITCHEN"],
    ["INT. KITCHEN", "KITCHEN"],
    ["INT. KITCHEN - DAY [LATER]", "KITCHEN"],
    ["INT. BLOOM HOUSE [MID/LATE '70'S]", "BLOOM HOUSE"],
    ["EXT. FIELD - PRE-DAWN", "FIELD"],
    ["EXT. SWAMP - ANOTHER DAY", "SWAMP"],
    ["EXT. JENNY HILL'S KITCHEN - PRESENT DAY", "JENNY HILL'S KITCHEN"],
    ["INT. KITCHEN - NIGHT - LATER", "KITCHEN"],
    // Only a time of day goes: a place that has a part is kept whole.
    ["INT. HOUSE - KITCHEN - DAY", "HOUSE - KITCHEN"],
    ["INT. HOUSE - KITCHEN", "HOUSE - KITCHEN"],
    // A hyphen inside a word is not a separator.
    ["INT. ANTI-MATTER LAB - DAY", "ANTI-MATTER LAB"],
    // A forced heading names its place as written.
    ["SOMEWHERE ELSE", "SOMEWHERE ELSE"],
    ["INT.   THE  KITCHEN  - DAY", "THE KITCHEN"],
  ])("reads the heading %j as %j", (text, name) => {
    expect(locationName(text)).toBe(name);
  });

  it("calls INT. KITCHEN - DAY and EXT. KITCHEN - NIGHT the same place", () => {
    expect(locationName("INT. KITCHEN - DAY")).toBe(locationName("EXT. KITCHEN - NIGHT"));
  });

  it("names no place for a heading with only a prefix or a time", () => {
    expect(locationName("INT.")).toBeUndefined();
    expect(locationName("INT. - DAY")).toBeUndefined();
    expect(locationName("")).toBeUndefined();
  });

  it("reads a heading element as a location", () => {
    expect(nameOf(heading("INT. KITCHEN - DAY"))).toEqual({ kind: "location", name: "KITCHEN" });
  });
});

describe("confirmed", () => {
  it("confirms a name used three times and leaves a rarer one waiting", () => {
    const lists = NameLists.of(cues("EDWARD", "EDWARD", "EDWARD", "EDWRAD"));
    expect(lists.entries("character")).toEqual([
      { name: "EDWARD", uses: 3, confirmed: true, explicit: false },
      { name: "EDWRAD", uses: 1, confirmed: false, explicit: false },
    ]);
    expect(lists.confirmed("character")).toEqual(["EDWARD"]);
    expect(lists.unconfirmed("character").map((entry) => entry.name)).toEqual(["EDWRAD"]);
  });

  it("offers a misspelling used once to nobody", () => {
    const lists = NameLists.of(cues("EDWARD", "EDWARD", "EDWARD", "EDWRAD"));
    expect(lists.confirmedStartingWith("character", "EDW")).toEqual(["EDWARD"]);
    expect(lists.knownWords().has("EDWRAD")).toBe(false);
    expect(lists.knownWords().has("EDWARD")).toBe(true);
  });

  it("offers by prefix in any case, in capitals", () => {
    const lists = NameLists.of(cues("EDWARD", "EDWARD", "EDWARD", "EDITH", "EDITH", "EDITH", "ED"));
    expect(lists.confirmedStartingWith("character", "ed")).toEqual(["EDITH", "EDWARD"]);
    expect(lists.confirmedStartingWith("character", "EDW")).toEqual(["EDWARD"]);
    expect(lists.confirmedStartingWith("character", "x")).toEqual([]);
  });

  it("moves the confirmed set when the threshold moves, touching nothing else", () => {
    const lines = [...cues("ANN", "ANN", "ANN", "ANNE", "ANNE", "BO")];
    const lists = NameLists.of(lines);
    expect(lists.confirmAfterUses).toBe(3);
    expect(lists.confirmed("character")).toEqual(["ANN"]);
    const version = lists.version;

    lists.setConfirmAfterUses(2);
    expect(lists.confirmed("character")).toEqual(["ANN", "ANNE"]);
    expect(lists.version).toBeGreaterThan(version);

    lists.setConfirmAfterUses(5);
    expect(lists.confirmed("character")).toEqual([]);
    expect(lists.entries("character").map((entry) => entry.uses)).toEqual([3, 2, 1]);

    lists.setConfirmAfterUses(1);
    expect(lists.confirmed("character")).toEqual(["ANN", "ANNE", "BO"]);
  });

  it("takes the threshold from the options", () => {
    expect(NameLists.of(cues("A", "A"), { confirmAfterUses: 2 }).confirmed("character")).toEqual(["A"]);
  });

  it("confirms a location the same way, by heading", () => {
    const lists = NameLists.of([
      heading("INT. KITCHEN - DAY"),
      heading("EXT. KITCHEN - NIGHT"),
      heading("INT. KITCHEN - CONTINUOUS"),
      heading("INT. CELLAR - DAY"),
    ]);
    expect(lists.confirmed("location")).toEqual(["KITCHEN"]);
    expect(lists.unconfirmed("location").map((entry) => entry.name)).toEqual(["CELLAR"]);
  });

  it("keeps characters and locations apart", () => {
    const lists = NameLists.of([cue("KITCHEN"), heading("INT. KITCHEN - DAY")]);
    expect(lists.uses("character", "KITCHEN")).toBe(1);
    expect(lists.uses("location", "KITCHEN")).toBe(1);
  });

  it("lets the writer confirm a name at once, and it stays when the uses go", () => {
    const lists = NameLists.of(cues("ANNE", "ANNE"));
    expect(lists.isConfirmed("character", "ANNE")).toBe(false);
    expect(lists.confirm("character", "anne")).toBe(true);
    expect(lists.isConfirmed("character", "ANNE")).toBe(true);
    expect(lists.entries("character")).toEqual([{ name: "ANNE", uses: 2, confirmed: true, explicit: true }]);
    expect(lists.confirm("character", "ANNE")).toBe(false);

    lists.apply(cues("ANNE", "ANNE"), []);
    expect(lists.isConfirmed("character", "ANNE")).toBe(true);
    expect(lists.explicit("character")).toEqual(["ANNE"]);
    expect(lists.knownWords().has("ANNE")).toBe(true);
  });

  it("starts from the names file's confirmations", () => {
    const lists = NameLists.of([heading("INT. CELLAR - DAY")], {
      explicit: { character: ["MARA"], location: ["cellar"] },
    });
    expect(lists.confirmed("character")).toEqual(["MARA"]);
    expect(lists.confirmed("location")).toEqual(["CELLAR"]);
  });

  it("stops confirming a name by use when cues are deleted, live", () => {
    const lists = NameLists.of(cues("ANN", "ANN", "ANN"));
    expect(lists.isConfirmed("character", "ANN")).toBe(true);
    lists.apply([cue("ANN")], []);
    expect(lists.isConfirmed("character", "ANN")).toBe(false);
    lists.apply([], [cue("ANN")]);
    expect(lists.isConfirmed("character", "ANN")).toBe(true);
  });

  it("drops an entry when its last use goes", () => {
    const lists = NameLists.of(cues("ANN"));
    lists.apply(cues("ANN"), []);
    expect(lists.entries("character")).toEqual([]);
  });
});

describe("known words", () => {
  it("are the words inside confirmed names and locations only", () => {
    const lists = NameLists.of([
      ...Array.from({ length: 3 }, () => heading("INT. BENNETT'S HOSPITAL ROOM - DAY")),
      ...cues("DR. BENNETT", "DR. BENNETT", "DR. BENNETT", "MICHEAL"),
      heading("INT. KITCHNE - DAY"),
    ]);
    expect([...lists.knownWords()].sort()).toEqual(["BENNETT", "BENNETT'S", "DR", "HOSPITAL", "ROOM"]);
  });

  it("splits a name into its words", () => {
    expect(wordsOf("HOUSE - KITCHEN")).toEqual(["HOUSE", "KITCHEN"]);
    expect(wordsOf("A.P. NEWSROOM (PARIS)")).toEqual(["A", "P", "NEWSROOM", "PARIS"]);
  });

  it("are recomputed only when something changed", () => {
    const lists = NameLists.of(cues("ANN", "ANN", "ANN"));
    const first = lists.knownWords();
    expect(lists.knownWords()).toBe(first);
    lists.apply(cues("ANN"), []);
    expect(lists.knownWords()).not.toBe(first);
  });
});

describe("apply", () => {
  it("says whether anything moved", () => {
    const lists = new NameLists();
    expect(lists.apply([action("x")], [dialogue("y")])).toBe(false);
    expect(lists.apply([], [cue("ANN")])).toBe(true);
    expect(lists.version).toBe(1);
  });

  it("is the same as counting afterwards", () => {
    const before = [cue("ANN"), action("x"), heading("INT. A - DAY"), cue("BO")];
    const after = [cue("ANN"), cue("CY"), heading("EXT. A - NIGHT"), heading("INT. B - DAY")];
    const lists = NameLists.of(before);
    lists.apply(before.slice(1), after.slice(1));
    const fresh = NameLists.of(after);
    expect(lists.entries("character")).toEqual(fresh.entries("character"));
    expect(lists.entries("location")).toEqual(fresh.entries("location"));
  });

  it("counts a name typed in capitals or not as one", () => {
    expect(normaliseName(" edward  ")).toBe("EDWARD");
  });
});
