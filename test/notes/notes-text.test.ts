/**
 * Notes' document is plain text and nothing else: what the writer types is
 * what the file holds, character for character (`src/notes/text.ts`).
 */
import { describe, expect, it } from "vitest";
import { docOf, offsetOf, positionOf, sliceOf, textOf, textOfSlice, wordsOf } from "../../src/notes/text.ts";

const SAMPLES = [
  "",
  "one line",
  "two\nlines",
  "trailing newline\n",
  "\n\nblank lines first",
  "# Not a heading, just a hash\n**not bold**\n- not a list",
  "\ttabs\tand   spaces  kept  ",
  "unicode — “quotes” and café",
];

describe("the notes document", () => {
  it("gives back exactly the text it was made from", () => {
    for (const text of SAMPLES) expect(textOf(docOf(text))).toBe(text);
  });

  it("holds Markdown as the characters typed, with no marks and no elements but lines", () => {
    const doc = docOf("# Act one\n**bold**");
    expect(doc.childCount).toBe(2);
    doc.forEach((line) => {
      expect(line.type.name).toBe("line");
      line.forEach((text) => expect(text.marks).toEqual([]));
    });
    expect(doc.child(0).textContent).toBe("# Act one");
  });

  it("turns a character offset into a position and back, at every offset", () => {
    for (const text of SAMPLES) {
      const doc = docOf(text);
      for (let offset = 0; offset <= text.length; offset++) {
        expect(offsetOf(doc, positionOf(doc, offset))).toBe(offset);
      }
    }
  });

  it("clamps an offset past the end to the end", () => {
    const doc = docOf("short\ntext");
    expect(offsetOf(doc, positionOf(doc, 500))).toBe("short\ntext".length);
  });

  it("pastes and copies plain lines, Windows line endings as \\n", () => {
    expect(textOfSlice(sliceOf("one\r\ntwo"))).toBe("one\ntwo");
  });

  it("counts words as runs of anything but whitespace", () => {
    expect(wordsOf("")).toBe(0);
    expect(wordsOf("  The boat\n\tis paper.  ")).toBe(4);
  });
});
