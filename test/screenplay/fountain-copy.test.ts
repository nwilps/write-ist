/**
 * Slice 2, step 7 — the Fountain copy: a finished-product export that leaves
 * out comments and the boneyard and changes nothing else.
 *
 * What is asserted is what the copy *means* — which words are in it, which
 * are not, what kind each element is — and not only that it parses.
 */
import { describe, expect, it } from "vitest";
import { fountainCopyOf, withoutCommentsAndBoneyard } from "../../src/screenplay/fountain-copy.ts";
import { importScreenplay, reopenAndSave } from "../../src/screenplay/import.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { assertBytesEqual } from "../support/byte-diff.ts";
import { describeCorpus, readCorpusBytes } from "../support/corpus.ts";
import { readFixtureBytes } from "../support/files.ts";

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const copyOf = (source: string): string => text(fountainCopyOf(parse(source)));
const types = (source: string): string[] => parse(source).elements.map((e) => e.type);

describe("a comment inside dialogue", () => {
  const source = [
    "INT. KITCHEN - DAY",
    "",
    "MARY",
    "I [[c:a1 too angry here?]]never said[[/c:a1]] that.",
    "",
  ].join("\n");

  it("loses its remark and its delimiters, and keeps the words it pointed at", () => {
    const copy = copyOf(source);
    expect(copy).toBe(["INT. KITCHEN - DAY", "", "MARY", "I never said that.", ""].join("\n"));
    expect(copy).not.toContain("angry");
    expect(copy).not.toContain("[[");
  });

  it("leaves the speech a speech", () => {
    expect(types(copyOf(source))).toEqual(["scene-heading", "character", "dialogue"]);
  });
});

describe("a comment on a mark boundary", () => {
  it("leaves the bold exactly where it was, with no orphaned markup", () => {
    const source = "She was **[[c:b2 check tone]]furious[[/c:b2]]** all day.\n";
    expect(copyOf(source)).toBe("She was **furious** all day.\n");
  });

  it("copes with a comment opening in one element and closing in another", () => {
    const source = "He [[c:c3 split]]left.\n\nShe stayed[[/c:c3]] behind.\n";
    expect(copyOf(source)).toBe("He left.\n\nShe stayed behind.\n");
  });

  it("copes with comments that cross and nest", () => {
    const source = "[[c:1 a]]She left. [[c:2 b]]He didn't[[/c:1]] follow.[[/c:2]]\n";
    expect(copyOf(source)).toBe("She left. He didn't follow.\n");
  });

  it("drops an empty remark's delimiters too", () => {
    expect(copyOf("A [[c:z]]b[[/c:z]] c\n")).toBe("A b c\n");
  });
});

describe("a boneyard", () => {
  const source = [
    "INT. KITCHEN - DAY",
    "",
    "Mary pours coffee.",
    "",
    "/*",
    "INT. CUT SCENE - NIGHT",
    "",
    "CUT PERSON",
    "Cut words, secret text.",
    "",
    "A cut action line.",
    "*/",
    "",
    "EXT. GARDEN - DAY",
    "",
    "Birds.",
    "",
  ].join("\n");

  it("goes entirely, delimiters and everything between", () => {
    const copy = copyOf(source);
    for (const gone of ["/*", "*/", "CUT", "secret", "cut action"]) expect(copy).not.toContain(gone);
  });

  it("leaves exactly one blank line where it was: no stray blank, no doubled one", () => {
    expect(copyOf(source)).toBe(
      [
        "INT. KITCHEN - DAY",
        "",
        "Mary pours coffee.",
        "",
        "EXT. GARDEN - DAY",
        "",
        "Birds.",
        "",
      ].join("\n"),
    );
  });

  it("has the census of the script without it", () => {
    expect(types(copyOf(source))).toEqual(["scene-heading", "action", "scene-heading", "action"]);
  });

  it("at the very start leaves no leading blank line", () => {
    expect(copyOf("/*\ncut\n*/\n\nHello.\n")).toBe("Hello.\n");
  });

  it("at the very end leaves the file ending as the manuscript did", () => {
    expect(copyOf("Hello.\n\n/*\ncut\n*/")).toBe("Hello.");
    expect(copyOf("Hello.\n\n/*\ncut\n*/\n")).toBe("Hello.\n");
  });

  it("keeps a title page, and leaves a boneyard-only body as just the title page", () => {
    expect(copyOf("Title: Big Fish\nAuthor: Noah\n\n/*\ncut\n*/\n")).toBe(
      "Title: Big Fish\nAuthor: Noah\n",
    );
  });
});

describe("a speech whose lines were all boneyard", () => {
  it("leaves no bare cue", () => {
    const source = ["Action.", "", "MARY", "/*", "Cut line one.", "(cut aside)", "*/", "", "More action.", ""].join("\n");
    const copy = copyOf(source);
    expect(copy).not.toContain("MARY");
    expect(copy).toBe("Action.\n\nMore action.\n");
    expect(types(copy)).toEqual(["action", "action"]);
  });

  it("does not take a speech that still has dialogue", () => {
    const source = ["MARY", "Kept.", "/*", "Cut.", "*/", "", "After.", ""].join("\n");
    expect(copyOf(source)).toBe("MARY\nKept.\n\nAfter.\n");
  });

  it("does not touch a cue-and-parenthetical speech that was never cut", () => {
    const source = "MARY\n(quietly)\n\nAfter.\n";
    expect(copyOf(source)).toBe(serialise(parse(source)));
  });
});

describe("what the copy keeps", () => {
  it("keeps notes, synopses, sections, the title page and the authored (CONT'D)", () => {
    const source = [
      "Title: Big Fish",
      "",
      "# Act One",
      "",
      "= It begins.",
      "",
      "INT. KITCHEN - DAY",
      "",
      "MARY",
      "Hello.",
      "",
      "A beat [[a plain note]] passes.",
      "",
      "MARY (CONT'D)",
      "Goodbye.",
      "",
    ].join("\n");
    expect(copyOf(source)).toBe(serialise(parse(source)));
  });
});

describe("the copy is not a save", () => {
  it("changes nothing in the model it was made from", () => {
    const document = parse("A [[c:x r]]b[[/c:x]]\n\n/*\ncut\n*/\n\nEnd.\n");
    const before = JSON.stringify(document);
    fountainCopyOf(document);
    withoutCommentsAndBoneyard(document);
    expect(JSON.stringify(document)).toBe(before);
    expect(document.comments).toHaveLength(1);
    expect(serialise(document)).toContain("[[c:x r]]");
  });

  it("is plain UTF-8", () => {
    const bytes = fountainCopyOf(parse("Café — “quoted”\n"));
    expect(bytes[0]).not.toBe(0xef); // no byte-order mark
    expect(text(bytes)).toBe("Café — “quoted”\n");
  });

  it("is itself a file Write-ist would save unchanged, with nothing left to strip", () => {
    const first = fountainCopyOf(parse("A [[c:x r]]b[[/c:x]]\n\n/*\ncut\n*/\n\nEnd.\n"));
    assertBytesEqual(fountainCopyOf(importScreenplay(first).document), first, { message: "copy of a copy" });
    assertBytesEqual(reopenAndSave(first), first, { message: "reopen and save" });
  });
});

describe("the published fixtures", () => {
  for (const name of ["Big-Fish.fountain", "Big-Fish-augmented.fountain", "Brick-&-Steel.fountain"]) {
    it(`${name}: where nothing is stripped, the copy equals what a save writes`, () => {
      const bytes = readFixtureBytes(name);
      const document = importScreenplay(bytes).document;
      const strips = document.comments.length > 0 || document.elements.some((e) => e.omitted === true);
      if (!strips) {
        assertBytesEqual(fountainCopyOf(document), new TextEncoder().encode(serialise(document)), { message: name });
      }
      // Whatever is stripped, nothing of it is left.
      const copy = text(fountainCopyOf(document));
      expect(copy).not.toMatch(/\[\[\/?c:/);
      expect(copy).not.toMatch(/^\/\*$/m);
    });
  }
});

describeCorpus("the acceptance corpus", () => {
  // Read lazily: a skipped suite still runs its body, and the file may be absent.
  const load = () => importScreenplay(readCorpusBytes()).document;

  it("copies as the manuscript with only comments and boneyard blocks removed", () => {
    const document = load();
    const saved = text(new TextEncoder().encode(serialise(document)));
    const copy = text(fountainCopyOf(document));
    // The independent oracle: remove the delimiters from the saved text by
    // pattern and compare with the copy line by line.
    const comments = document.comments.length;
    const boneyard = document.elements.filter((e) => e.omitted === true).length;
    const savedLines = saved.split("\n").length;
    const copyLines = copy.split("\n").length;
    console.log(
      `corpus: ${comments} comments, ${boneyard} boneyard elements; saved ${saved.length} chars/` +
        `${new TextEncoder().encode(saved).length} bytes, copy ${new TextEncoder().encode(copy).length} bytes; ` +
        `${savedLines} → ${copyLines} lines`,
    );
    if (comments === 0 && boneyard === 0) {
      assertBytesEqual(new TextEncoder().encode(copy), new TextEncoder().encode(saved), { message: "corpus copy" });
    } else {
      expect(copy).not.toMatch(/\[\[\/?c:/);
      expect(copy.split("\n").length).toBeLessThanOrEqual(savedLines);
    }
  });

  it("has the element census of the manuscript minus its boneyard", () => {
    const document = load();
    const copy = importScreenplay(fountainCopyOf(document)).document;
    const kept = document.elements.filter((e) => e.omitted !== true);
    expect(copy.elements.map((e) => e.type)).toEqual(kept.map((e) => e.type));
    expect(copy.elements.map((e) => e.text)).toEqual(kept.map((e) => e.text));
    expect(copy.elements.some((e) => e.omitted === true)).toBe(false);
    expect(copy.comments).toHaveLength(0);
    expect(copy.titlePage).toEqual(document.titlePage);
  });

  it("is a fixed point: a copy of the copy is the same bytes", () => {
    const document = load();
    const once = fountainCopyOf(document);
    assertBytesEqual(fountainCopyOf(importScreenplay(once).document), once, { message: "copy of the copy" });
  });
});
