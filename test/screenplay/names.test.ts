/**
 * The character and location lists (slice 2, step 8): what a cue and a
 * heading are reduced to, what is on a list, what Add and Remove do, and what
 * moves when the manuscript changes.
 */
import { describe, expect, it } from "vitest";
import {
  locationName,
  locationRange,
  NameLists,
  nameOf,
  normaliseName,
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
    expect(lists.list("character")).toEqual(["EDWARD"]);
    expect(lists.uses("character", "EDWARD")).toBe(3);
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

describe("where in a heading the place sits", () => {
  const placeOf = (text: string): string | undefined => {
    const range = locationRange(text);
    return range === undefined ? undefined : text.slice(range.from, range.to);
  };

  it.each([
    ["INT. KITCHEN - DAY", "KITCHEN"],
    ["I/E. CAR - DAY", "CAR"],
    ["INT. DAY ROOM - DAY", "DAY ROOM"],
    ["INT. HOUSE - KITCHEN - DAY", "HOUSE - KITCHEN"],
    ["INT. KITCHEN - DAY #12A#", "KITCHEN"],
    ["INT. KITCHEN [LATER] - NIGHT", "KITCHEN"],
    ["INT.   THE  KITCHEN  - DAY", "THE  KITCHEN"],
    ["SOMEWHERE ELSE", "SOMEWHERE ELSE"],
  ])("finds %j's place at %j", (text, place) => {
    expect(placeOf(text)).toBe(place);
  });

  it("is the span locationName reads, for every heading it names", () => {
    for (const text of ["INT. KITCHEN - DAY", "EXT. BLOOM HOUSE [MID/LATE '70'S] - NIGHT", "INT. ANTI-MATTER LAB - DAY #4#"]) {
      expect(normaliseName(placeOf(text)!)).toBe(locationName(text));
    }
  });

  it("is nothing where the heading names no place", () => {
    expect(locationRange("INT. - DAY")).toBeUndefined();
    expect(locationRange("INT.")).toBeUndefined();
  });
});

describe("on the list", () => {
  it("puts a name on its list after one use: there is no count to reach", () => {
    const lists = NameLists.of(cues("EDWARD", "EDWARD", "EDWARD", "EDWRAD"));
    expect(lists.list("character")).toEqual(["EDWARD", "EDWRAD"]);
    expect(lists.uses("character", "EDWARD")).toBe(3);
    expect(lists.uses("character", "EDWRAD")).toBe(1);
    expect(lists.isListed("character", "EDWRAD")).toBe(true);
  });

  it("offers by prefix in any case, in capitals", () => {
    const lists = NameLists.of(cues("EDWARD", "EDITH", "ED"));
    expect(lists.startingWith("character", "ed")).toEqual(["ED", "EDITH", "EDWARD"]);
    expect(lists.startingWith("character", "EDW")).toEqual(["EDWARD"]);
    expect(lists.startingWith("character", "x")).toEqual([]);
  });

  it("lists a location the same way, by heading", () => {
    const lists = NameLists.of([heading("INT. KITCHEN - DAY"), heading("EXT. KITCHEN - NIGHT"), heading("INT. CELLAR - DAY")]);
    expect(lists.list("location")).toEqual(["CELLAR", "KITCHEN"]);
  });

  it("keeps characters and locations apart", () => {
    const lists = NameLists.of([cue("KITCHEN"), heading("INT. KITCHEN - DAY")]);
    expect(lists.uses("character", "KITCHEN")).toBe(1);
    expect(lists.uses("location", "KITCHEN")).toBe(1);
  });

  it("drops a name when its last use goes, and lists it again with a new one", () => {
    const lists = NameLists.of(cues("ANN"));
    lists.apply(cues("ANN"), []);
    expect(lists.list("character")).toEqual([]);
    lists.apply([], cues("ANN"));
    expect(lists.list("character")).toEqual(["ANN"]);
  });

  it("starts from the names file's added names, used or not", () => {
    const lists = NameLists.of([heading("INT. CELLAR - DAY")], {
      added: { character: ["mara"], location: ["cellar"] },
    });
    expect(lists.list("character")).toEqual(["MARA"]);
    expect(lists.list("location")).toEqual(["CELLAR"]);
  });
});

describe("Add and Remove", () => {
  it("adds a name at once, and it stays when the uses go", () => {
    const lists = NameLists.of(cues("ANNE"));
    expect(lists.add("character", "zelda")).toBe(true);
    expect(lists.add("character", "ZELDA")).toBe(false);
    expect(lists.list("character")).toEqual(["ANNE", "ZELDA"]);
    expect(lists.add("character", "anne")).toBe(true);
    lists.apply(cues("ANNE"), []);
    expect(lists.list("character")).toEqual(["ANNE", "ZELDA"]);
    expect(lists.added("character")).toEqual(["ANNE", "ZELDA"]);
  });

  it("removes a name from its list, though the script still uses it", () => {
    const lists = NameLists.of(cues("EDWARD", "EDWARD", "EDNA"));
    expect(lists.remove("character", "edward")).toBe(true);
    expect(lists.list("character")).toEqual(["EDNA"]);
    expect(lists.startingWith("character", "ED")).toEqual(["EDNA"]);
    expect(lists.isRemoved("character", "EDWARD")).toBe(true);
    expect(lists.removed("character")).toEqual(["EDWARD"]);
    // Removing it again changes nothing.
    expect(lists.remove("character", "EDWARD")).toBe(false);
  });

  it("removes an added name the script does not use without keeping it as removed", () => {
    const lists = NameLists.of([], { added: { character: ["ZELDA"], location: [] } });
    expect(lists.remove("character", "ZELDA")).toBe(true);
    expect(lists.list("character")).toEqual([]);
    expect(lists.added("character")).toEqual([]);
    expect(lists.removed("character")).toEqual([]);
    expect(lists.remove("character", "NOBODY")).toBe(false);
  });

  it("does not bring a removed name back from the uses already there, however the lists are worked out", () => {
    const lists = NameLists.of(cues("EDWARD", "EDWARD"));
    lists.remove("character", "EDWARD");
    lists.apply([], cues("EDNA"));
    expect(lists.list("character")).toEqual(["EDNA"]);
    // Opened again, from what the names file holds: still off.
    const reopened = NameLists.of(cues("EDWARD", "EDWARD"), { removed: { character: lists.removed("character"), location: [] } });
    expect(reopened.list("character")).toEqual([]);
    expect(reopened.removed("character")).toEqual(["EDWARD"]);
  });

  it("brings a removed name back as soon as it is typed, with no counting", () => {
    const lists = NameLists.of(cues("EDWARD", "EDWARD"));
    lists.remove("character", "EDWARD");
    expect(lists.typed("character", "edward")).toBe(true);
    expect(lists.list("character")).toEqual(["EDWARD"]);
    expect(lists.removed("character")).toEqual([]);
    // A name that was not removed is not touched.
    expect(lists.typed("character", "EDWARD")).toBe(false);
  });

  it("brings it back when typed after every one of its cues was deleted", () => {
    const lists = NameLists.of(cues("EDWARD", "EDWARD"));
    lists.remove("character", "EDWARD");
    lists.apply(cues("EDWARD", "EDWARD"), []);
    lists.apply([], cues("EDWARD"));
    expect(lists.list("character")).toEqual([]);
    expect(lists.typed("character", "EDWARD")).toBe(true);
    expect(lists.list("character")).toEqual(["EDWARD"]);
  });

  it("is added back by hand at once", () => {
    const lists = NameLists.of(cues("EDWARD"));
    lists.remove("character", "EDWARD");
    expect(lists.add("character", "EDWARD")).toBe(true);
    expect(lists.list("character")).toEqual(["EDWARD"]);
    expect(lists.removed("character")).toEqual([]);
  });

  it("forgets a removed name the script no longer uses when the project opens", () => {
    const reopened = NameLists.of([], { removed: { character: ["EDWRAD"], location: [] } });
    expect(reopened.removed("character")).toEqual([]);
    reopened.apply([], cues("EDWRAD"));
    expect(reopened.list("character")).toEqual(["EDWRAD"]);
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
    expect(lists.list("character")).toEqual(fresh.list("character"));
    expect(lists.list("location")).toEqual(fresh.list("location"));
    expect(lists.uses("location", "A")).toBe(1);
  });

  it("counts a name typed in capitals or not as one", () => {
    expect(normaliseName(" edward  ")).toBe("EDWARD");
  });
});
