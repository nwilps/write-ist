/**
 * The round-trip gate, now running through the editor (#39).
 *
 * Seam 1 already proves **bytes ↔ document**. This is the same gate one layer
 * up: **document → the editor's document → document → bytes**, with the bytes
 * required to be identical and the census required to be identical with them.
 *
 * Both halves are load-bearing, and the second is the one this project has
 * been bitten by. `docs/STANDARDS.md` and ADR-0021 both record the same defect
 * twice over: two scene headings read as action while **every byte test
 * passed**, because an unforced heading and an action line with the same text
 * serialise identically. A mapping that dropped `dual`, `omitted` or a
 * comment's id could do exactly that again — the file would come back byte for
 * byte and the model behind it would be wrong.
 *
 * So the gate here is `toEqual` on the whole document, and the counts the
 * ticket names are pinned beside it as numbers a reader can check.
 *
 * **No window.** `prosemirror-model` is pure data; nothing in this file touches
 * a DOM, which is seam 2's shape — "editing, with no window".
 */
import { describe, expect, it } from "vitest";
import { decodeFile } from "../../src/decode.ts";
import { fromEditorDocument, toEditorDocument } from "../../src/screenplay/editor.ts";
import { exportScreenplay, importScreenplay } from "../../src/screenplay/import.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import type { ElementType, ScreenplayDocument } from "../../src/screenplay/document.ts";
import { assertBytesEqual } from "../support/byte-diff.ts";
import { describeCorpus, readCorpusBytes } from "../support/corpus.ts";
import { readFixtureBytes, writeBytesAndReadBack } from "../support/files.ts";

/** A census of the model: every number the ticket asks to be identical. */
interface Census {
  readonly elements: number;
  readonly types: readonly (readonly [ElementType, number])[];
  readonly marks: readonly (readonly [string, number])[];
  readonly comments: readonly (readonly [string, string, string])[];
  readonly dual: number;
  readonly omitted: number;
  readonly titlePage: readonly string[];
  readonly endsWithNewline: boolean;
}

function census(document: ScreenplayDocument): Census {
  const types = new Map<ElementType, number>();
  const marks = new Map<string, number>();
  let dual = 0;
  let omitted = 0;

  for (const element of document.elements) {
    types.set(element.type, (types.get(element.type) ?? 0) + 1);
    for (const mark of element.marks ?? []) {
      marks.set(mark.mark, (marks.get(mark.mark) ?? 0) + 1);
    }
    if (element.dual === true) dual++;
    if (element.omitted === true) omitted++;
  }

  return {
    elements: document.elements.length,
    types: [...types].sort(),
    marks: [...marks].sort(),
    // A comment's id, its remark, and the text it covers — the three things
    // the ticket names, and the third is the one a dropped offset breaks.
    comments: document.comments.map((comment) => [comment.id, comment.remark, covered(document, comment.id)]),
    dual,
    omitted,
    titlePage: document.titlePage.map((field) => field.key),
    endsWithNewline: document.endsWithNewline,
  };
}

/** The text one comment covers, from its opening end to its closing one. */
function covered(document: ScreenplayDocument, id: string): string {
  const comment = document.comments.find((held) => held.id === id);
  if (comment === undefined) return "";
  const parts: string[] = [];
  for (let at = comment.start.element; at <= comment.end.element; at++) {
    const text = document.elements[at]!.text;
    parts.push(
      text.slice(
        at === comment.start.element ? comment.start.offset : 0,
        at === comment.end.element ? comment.end.offset : text.length,
      ),
    );
  }
  return parts.join("\n");
}

/** What a manuscript Write-ist wrote looks like: seam 1's output. */
function manuscriptOf(source: Uint8Array): Uint8Array {
  return exportScreenplay(importScreenplay(source).document);
}

/** The manuscript, through the editor, and back out as bytes. */
function through(manuscript: Uint8Array): {
  readonly before: ScreenplayDocument;
  readonly after: ScreenplayDocument;
  readonly bytes: Uint8Array;
} {
  const before = parse(decodeFile(manuscript).text);
  const after = fromEditorDocument(toEditorDocument(before));
  return { before, after, bytes: new TextEncoder().encode(serialise(after)) };
}

/**
 * The three committed screenplay manuscripts, with the byte counts seam 1
 * pinned. The fourth is the acceptance corpus, which is not in the repo and so
 * has its own block at the foot of this file.
 *
 * The editor may not move one of them by a byte.
 */
const MANUSCRIPTS: readonly (readonly [string, number])[] = [
  ["Brick-&-Steel.fountain", 2_886],
  ["Big-Fish.fountain", 146_097],
  ["Big-Fish-augmented.fountain", 147_139],
];

describe.each(MANUSCRIPTS)("%s, through the editor", (fixture, bytes) => {
  const manuscript = (): Uint8Array => manuscriptOf(readFixtureBytes(fixture));
  const slug = fixture.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-fountain$/, "");

  it(`comes back as the same ${bytes.toLocaleString("en")} bytes`, () => {
    const source = manuscript();
    expect(source.length).toBe(bytes);

    const written = writeBytesAndReadBack(`${slug}.editor.fountain`, through(source).bytes);

    assertBytesEqual(source, written, {
      expectedLabel: "the manuscript",
      actualLabel: "after the editor",
      message: "mapping into the editor and back changed the manuscript",
    });
  });

  it("comes back as the same model", () => {
    // The byte gate above cannot see a misread element (ADR-0021). This can.
    const { before, after } = through(manuscript());
    expect(after).toEqual(before);
  });

  it("comes back with the same census", () => {
    const { before, after } = through(manuscript());
    expect(census(after)).toEqual(census(before));
  });
});

describe("the censuses, pinned", () => {
  const censusOf = (fixture: string): Census => census(through(manuscriptOf(readFixtureBytes(fixture))).after);

  it("keeps Big Fish's 2,767 elements and its eight types", () => {
    const found = censusOf("Big-Fish.fountain");

    expect(found.elements).toBe(2_767);
    // Seam 1's numbers, unchanged: `test/screenplay/big-fish.test.ts`.
    expect(found.types).toEqual(
      (
        [
          ["action", 861],
          ["centered", 2],
          ["character", 768],
          ["dialogue", 811],
          ["page-break", 1],
          ["parenthetical", 97],
          ["scene-heading", 192],
          ["transition", 35],
        ] as Array<[ElementType, number]>
      ).sort(),
    );
    // The same six keys `test/screenplay/big-fish.test.ts` pins.
    expect(found.titlePage).toEqual([
      "Title",
      "Credit",
      "Author",
      "Source",
      "Notes",
      "Copyright",
    ]);
  });

  it("keeps a title-page field's indented continuation lines", () => {
    // The title page is the one thing in the format that is not a text element
    // (ADR-0019), and this is why: `Notes:` carries nothing on its key line and
    // three indented lines under it. A mapping that flattened a field to one
    // line would lose two of them, and the byte gate would catch it — but only
    // after the writer's production-draft note had already gone.
    const document = through(manuscriptOf(readFixtureBytes("Big-Fish.fountain"))).after;

    expect(document.titlePage[4]).toEqual({
      key: "Notes",
      inline: { text: "" },
      continuations: [
        { text: "FINAL PRODUCTION DRAFT" },
        { text: "includes post-production dialogue" },
        { text: "and omitted scenes" },
      ],
    });
  });

  it("keeps the augmented fixture's fourteen types, its boneyard and its dual cue", () => {
    const found = censusOf("Big-Fish-augmented.fountain");

    // Seam 1's numbers, unchanged: `test/screenplay/big-fish-augmented.test.ts`.
    expect(found.types).toEqual(
      (
        [
          ["action", 866],
          ["boneyard-end", 1],
          ["boneyard-start", 1],
          ["centered", 4],
          ["character", 772],
          ["dialogue", 815],
          ["lyrics", 2],
          ["note", 1],
          ["page-break", 2],
          ["parenthetical", 98],
          ["scene-heading", 194],
          ["section", 2],
          ["synopsis", 2],
          ["transition", 36],
        ] as Array<[ElementType, number]>
      ).sort(),
    );
    // Every element between the two delimiters, the delimiters included.
    expect(found.omitted).toBe(6);
    expect(found.dual).toBe(1);
  });

  it("keeps the augmented fixture's five comments, with their remarks and their spans", () => {
    // ADR-0018's whole point: a comment that comes back without the words it
    // was written round is the v1 failure, and the round-trip cannot see it.
    expect(censusOf("Big-Fish-augmented.fountain").comments).toEqual([
      ["a1", "is this too on the nose?", "There are some fish that cannot be caught."],
      ["b1", "tighten", "I didn't put any stock into such speculation"],
      ["b2", "cut superstition?", "into such speculation or superstition."],
      [
        "c1",
        "keep",
        "All I knew was I'd been trying to catch that fish since I was a boy no bigger than you.",
      ],
      ["c2", "Edward's voice, not mine", "I'd been trying to catch that fish"],
    ]);
  });
});

describeCorpus("the acceptance corpus, through the editor", () => {
  const manuscript = (): Uint8Array => manuscriptOf(readCorpusBytes());

  it("comes back as the same 172,327 bytes", () => {
    const source = manuscript();
    expect(source.length).toBe(172_327);

    const written = writeBytesAndReadBack("script.editor.fountain", through(source).bytes);

    assertBytesEqual(source, written, {
      expectedLabel: "the manuscript",
      actualLabel: "after the editor",
      message: "mapping the corpus into the editor and back changed it",
    });
  });

  it("comes back as the same model, with the same census", () => {
    const { before, after } = through(manuscript());
    expect(after).toEqual(before);
    expect(census(after)).toEqual(census(before));
  });
});
