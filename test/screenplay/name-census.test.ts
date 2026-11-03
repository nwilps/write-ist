/**
 * What the name lists mean on real scripts (slice 2, step 8).
 *
 * Two defects in Slice 1 passed the byte gate while being wrong — a cue read as
 * action, marks stopping at the wrong place — so this asserts the lists'
 * *meaning*: how many distinct names, how many are confirmed at N = 3, how
 * many wait, and that each count agrees with an independent reading of the
 * script. The acceptance corpus's census is measured the same way when it is
 * present, and printed.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { maintainContinuations, characterName } from "../../src/screenplay/continuations.ts";
import type { Element, ScreenplayDocument } from "../../src/screenplay/document.ts";
import { importScreenplay } from "../../src/screenplay/import.ts";
import { NameLists, locationName, normaliseName, type NameKind } from "../../src/screenplay/names.ts";
import { describeCorpus, readCorpusBytes } from "../support/corpus.ts";
import { readFixtureBytes } from "../support/files.ts";

const load = (fixture: string): ScreenplayDocument => importScreenplay(readFixtureBytes(fixture)).document;

interface Census {
  readonly distinct: number;
  readonly confirmed: number;
  readonly waiting: number;
  readonly uses: number;
}

function census(lists: NameLists, kind: NameKind): Census {
  const entries = lists.entries(kind);
  return {
    distinct: entries.length,
    confirmed: entries.filter((entry) => entry.confirmed).length,
    waiting: entries.filter((entry) => !entry.confirmed).length,
    uses: entries.reduce((sum, entry) => sum + entry.uses, 0),
  };
}

const live = (elements: readonly Element[]): Element[] => elements.filter((e) => e.omitted !== true);

/** An independent reading of a cue: everything before the first `(` or `^`. */
const speaker = (cue: string): string => normaliseName(cue.split(/[(^]/, 1)[0]!);

/** The same, by counting, with no help from the module under test. */
function countCues(elements: readonly Element[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const element of live(elements)) {
    if (element.type !== "character") continue;
    const name = speaker(element.text);
    if (name !== "") counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

function report(label: string, document: ScreenplayDocument): { characters: Census; locations: Census } {
  const lists = NameLists.of(document.elements);
  const result = { characters: census(lists, "character"), locations: census(lists, "location") };
  console.log(
    `${label}: ${document.elements.length} elements — characters ${result.characters.distinct} ` +
      `(${result.characters.confirmed} confirmed at N=3, ${result.characters.waiting} used once or twice), ` +
      `locations ${result.locations.distinct} ` +
      `(${result.locations.confirmed} confirmed, ${result.locations.waiting} used once or twice)`,
  );
  return result;
}

describe("the census, on the committed manuscripts", () => {
  it("Big Fish", () => {
    const document = load("Big-Fish.fountain");
    expect(report("Big Fish", document)).toEqual({
      characters: { distinct: 48, confirmed: 20, waiting: 28, uses: 768 },
      locations: { distinct: 142, confirmed: 11, waiting: 131, uses: 192 },
    });
  });

  it("Big Fish, augmented", () => {
    const document = load("Big-Fish-augmented.fountain");
    expect(report("Big Fish augmented", document)).toEqual({
      characters: { distinct: 50, confirmed: 20, waiting: 30, uses: 771 },
      locations: { distinct: 144, confirmed: 11, waiting: 133, uses: 194 },
    });
  });

  it("Brick & Steel", () => {
    const document = load("Brick-&-Steel.fountain");
    expect(report("Brick & Steel", document)).toEqual({
      characters: { distinct: 7, confirmed: 3, waiting: 4, uses: 20 },
      locations: { distinct: 8, confirmed: 0, waiting: 8, uses: 8 },
    });
  });
});

describe.each(["Big-Fish.fountain", "Big-Fish-augmented.fountain", "Brick-&-Steel.fountain"])(
  "what the lists mean on %s",
  (fixture) => {
    const document = load(fixture);
    const lists = NameLists.of(document.elements);

    it("counts every cue as a use of the speaker it names — extensions and ^ set aside", () => {
      const expected = countCues(document.elements);
      const found = new Map(lists.entries("character").map((entry) => [entry.name, entry.uses]));
      expect(found).toEqual(expected);
      // Not one name carries an extension or a marker.
      for (const name of found.keys()) expect(name).not.toMatch(/[()^]/);
    });

    it("counts every heading once, under a place with no prefix, time or scene number", () => {
      const headings = live(document.elements).filter((element) => element.type === "scene-heading");
      const total = lists.entries("location").reduce((sum, entry) => sum + entry.uses, 0);
      // Every heading names a place in these scripts.
      expect(total).toBe(headings.length);
      for (const { name } of lists.entries("location")) {
        expect(name).not.toMatch(/^(INT|EXT|EST|I\/E)\b/);
        expect(name).not.toMatch(/ - (DAY|NIGHT|CONTINUOUS|LATER|DAWN|DUSK)$/);
        expect(name).not.toMatch(/#/);
      }
    });

    it("marks a name confirmed exactly when it is used three or more times", () => {
      for (const kind of ["character", "location"] as const) {
        for (const entry of lists.entries(kind)) {
          expect(entry.confirmed).toBe(entry.uses >= 3);
          expect(entry.explicit).toBe(false);
        }
      }
    });

    it("is changed by the threshold and not by the manuscript", () => {
      const copy = NameLists.of(document.elements);
      const at3 = copy.confirmed("character").length;
      copy.setConfirmAfterUses(2);
      const at2 = copy.confirmed("character").length;
      copy.setConfirmAfterUses(5);
      const at5 = copy.confirmed("character").length;
      expect(at2).toBeGreaterThanOrEqual(at3);
      expect(at5).toBeLessThanOrEqual(at3);
      expect(copy.entries("character").map((e) => e.uses)).toEqual(
        lists.entries("character").map((e) => e.uses),
      );
    });

    it("gives the same lists after (CONT'D) is added, which it is not a new speaker", () => {
      const maintained = maintainContinuations(document).document;
      const after = NameLists.of(maintained.elements);
      expect(after.entries("character")).toEqual(lists.entries("character"));
      expect(after.entries("location")).toEqual(lists.entries("location"));
    });
  },
);

describe("one rule for who is speaking", () => {
  it("is called from continuations.ts and not copied", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "..", "..", "src", "screenplay", "names.ts"), "utf8");
    expect(source).toMatch(/import \{ characterName \} from "\.\/continuations\.ts"/);
    // And the cue branch really goes through it.
    expect(source).toContain("normaliseName(characterName(line.text))");
  });

  it("gives import, typing and the list the same name for every cue", () => {
    for (const fixture of ["Big-Fish.fountain", "Big-Fish-augmented.fountain", "Brick-&-Steel.fountain"]) {
      const document = load(fixture);
      // Import's rule adds (CONT'D); the speaker it names must not move.
      const maintained = maintainContinuations(document).document;
      document.elements.forEach((element, index) => {
        if (element.type !== "character") return;
        const imported = maintained.elements[index]!;
        expect(normaliseName(characterName(imported.text))).toBe(normaliseName(characterName(element.text)));
        expect(speaker(imported.text)).toBe(speaker(element.text));
      });
    }
  });
});

describeCorpus("the census, on the acceptance corpus", () => {
  it("is measured, and means what the script says", () => {
    const document = importScreenplay(readCorpusBytes()).document;
    const { characters, locations } = report("corpus", document);

    const lists = NameLists.of(document.elements);
    expect(new Map(lists.entries("character").map((e) => [e.name, e.uses]))).toEqual(countCues(document.elements));
    const headings = live(document.elements).filter((e) => e.type === "scene-heading");
    expect(locations.uses).toBe(headings.filter((h) => locationName(h.text) !== undefined).length);
    expect(characters.distinct).toBeGreaterThan(0);
    expect(characters.confirmed + characters.waiting).toBe(characters.distinct);
    expect(locations.confirmed + locations.waiting).toBe(locations.distinct);
  });
});
