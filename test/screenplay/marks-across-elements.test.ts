/**
 * A mark is read across elements and written inside one (ADR-0027).
 *
 * The writer never types an asterisk. They select from here to there and press
 * the hotkey, so a rule that stops the mark at a line ending invents a
 * boundary they never drew — and *Big Fish* proves the point, setting three
 * sung speeches with one opening delimiter and one closing delimiter several
 * lines later. The produced PDF renders all three italic.
 *
 * **Reading crosses lines; storing and writing do not.** A `MarkRange` stays
 * offsets into one element's text, and every element emits its own delimiter
 * pair. That asymmetry is the decision, and it is what makes the file converge
 * on the one spelling a strict Fountain reader renders correctly — which is
 * ADR-0020's eighth normalisation, reported like the other seven.
 *
 * Byte equality cannot prove any of this. Before the change, the same three
 * songs round-tripped perfectly with the asterisks sitting in the text as
 * characters. So everything here asserts marks and element types.
 */
import { describe, expect, it } from "vitest";
import { exportScreenplay, importScreenplay } from "../../src/screenplay/import.ts";
import { parse, parseReporting } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { readFixtureBytes } from "../support/files.ts";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** The first of the three songs, lines 2751–2754 of Big-Fish.fountain. */
const SONG = [
  "PING",
  "*Sometimes a girl can feel so alone",
  "Without a lover to call her own.",
  "Sometimes it's so bad, she wants to explode.",
  "Wants to grab the first man she sees and tear off his clothes.*",
].join("\n");

describe("an opener with no partner on its line looks ahead for one", () => {
  it("marks all four elements of the song, over the whole of each", () => {
    const { elements } = parse(SONG);
    const sung = elements.slice(1);

    expect(elements[0]?.type).toBe("character");
    expect(sung).toHaveLength(4);
    for (const element of sung) {
      expect(element.type).toBe("dialogue");
      expect(element.marks).toEqual([{ mark: "italic", start: 0, end: element.text.length }]);
    }
  });

  it("leaves no asterisk in any element's text", () => {
    // The delimiters are syntax now, not characters. This is the assertion the
    // byte gate cannot make, and the one that failed before ADR-0027.
    for (const element of parse(SONG).elements) {
      expect(element.text).not.toContain("*");
    }
    expect(parse(SONG).elements[1]?.text).toBe("Sometimes a girl can feel so alone");
  });

  it("writes a delimiter pair on each element rather than one across them", () => {
    expect(serialise(parse(SONG)).split("\n")).toEqual([
      "PING",
      "*Sometimes a girl can feel so alone*",
      "*Without a lover to call her own.*",
      "*Sometimes it's so bad, she wants to explode.*",
      "*Wants to grab the first man she sees and tear off his clothes.*",
    ]);
  });

  it("reports it as ADR-0020's eighth normalisation, counted per line changed", () => {
    // One mark, four lines that each gained a delimiter pair. The report
    // counts occurrences changed, never findings (ADR-0020), so the answer is
    // four. This read 1 — the mark — until issue #27.
    const sung = SONG.split("\n").slice(1);
    const written = serialise(parse(SONG)).split("\n").slice(1);
    const changed = sung.filter((line, index) => line !== written[index]);
    expect(changed).toHaveLength(4);

    expect(parseReporting(SONG).markDelimitedLines).toBe(changed.length);
    const { report } = importScreenplay(utf8(SONG));
    expect(report.applied).toContainEqual({
      kind: "marks-spanning-elements",
      count: changed.length,
    });
  });

  it("converges: reading our own output finds every pair on its own line", () => {
    // The file is repaired once and never churns again. ADR-0020's contract
    // depends on this — forgiving on the way in, strict on the way out.
    const once = exportScreenplay(importScreenplay(utf8(SONG)).document);
    const twice = importScreenplay(once);

    expect(parseReporting(text(once)).markDelimitedLines).toBe(0);
    expect(twice.report.applied).not.toContainEqual(
      expect.objectContaining({ kind: "marks-spanning-elements" }),
    );
    expect(text(exportScreenplay(twice.document))).toBe(text(once));
  });
});

describe("the two bounds that keep the lookahead safe", () => {
  it("stops at a blank line, because a blank line ends a speech", () => {
    const source = ["BOB", "*This opens and never closes.", "", "!She waits.", "", "!A beat.*"].join(
      "\n",
    );
    const { elements } = parse(source);

    expect(elements[1]?.marks).toBeUndefined();
    expect(elements[1]?.text).toBe("*This opens and never closes.");
    // And the closer three elements later is equally alone.
    expect(elements[3]?.marks).toBeUndefined();
    expect(elements[3]?.text).toBe("A beat.*");
  });

  it("resolves element syntax before marks, so a boneyard is not an italic", () => {
    // The mistake ADR-0027 names by hand: a scan that paired asterisks before
    // classifying elements reads a boneyard's opening and closing delimiters
    // as one long italic span. Nothing here may carry a mark.
    const source = ["/*", "!Cut for length.", "!And this too.", "*/"].join("\n");
    const { elements } = parse(source);

    expect(elements.map((element) => element.type)).toEqual([
      "boneyard-start",
      "action",
      "action",
      "boneyard-end",
    ]);
    expect(elements.every((element) => element.marks === undefined)).toBe(true);
    expect(elements.map((element) => element.text)).toEqual([
      "/*",
      "Cut for length.",
      "And this too.",
      "*/",
    ]);
    // The delimiters come back as themselves. The blank line between the two
    // action lines is ADR-0020's seventh normalisation, not a mark: a tight
    // run of action is separate elements and separate elements are spaced.
    expect(serialise(parse(source)).split("\n")).toEqual([
      "/*",
      "!Cut for length.",
      "",
      "!And this too.",
      "*/",
    ]);
  });

  it("does not reach through an element that holds no prose", () => {
    // A page break cannot carry a mark, so a span cannot pass through one.
    const source = ["!He runs *and", "===", "!he runs.*"].join("\n");
    const { elements } = parse(source);

    expect(elements[1]?.type).toBe("page-break");
    expect(elements.every((element) => element.marks === undefined)).toBe(true);
    // Both asterisks survive as characters, which is the whole claim here.
    expect(elements[0]?.text).toBe("He runs *and");
    expect(elements[2]?.text).toBe("he runs.*");
  });
});

describe("a within-element mark inside a spanning one", () => {
  /** Line 2767 of Big-Fish.fountain, inside the second song. */
  const source = [
    "PING",
    "*But she won't.",
    "She needs a special **special** different unusual man.",
    "She has wants, but she has needs.*",
  ].join("\n");

  it("holds both at once, which is what a set of marks is for", () => {
    const middle = parse(source).elements[2]!;

    expect(middle.text).toBe("She needs a special special different unusual man.");
    expect(middle.marks).toEqual([
      // The italic reached this element from two lines above; the bold opened
      // and closed on this line.
      { mark: "italic", start: 0, end: 50 },
      { mark: "bold", start: 20, end: 27 },
    ]);
    expect(middle.marks?.map((mark) => middle.text.slice(mark.start, mark.end))).toEqual([
      "She needs a special special different unusual man.",
      "special",
    ]);
  });

  it("writes the bold inside the italic, per EMISSION_ORDER", () => {
    expect(serialise(parse(source)).split("\n")[2]).toBe(
      "*She needs a special **special** different unusual man.*",
    );
  });
});

describe("the three songs in Big Fish, and only those", () => {
  /** The report's entry, or undefined when there is none — never zero. */
  const entry = (fixture: string) =>
    importScreenplay(readFixtureBytes(fixture)).report.applied.find(
      (applied) => applied.kind === "marks-spanning-elements",
    );

  it("reports fifteen lines in each cut of Big Fish, and no entry for Brick & Steel", () => {
    // Three songs, fifteen lines changed. This read 3 until issue #27.
    expect(entry("Big-Fish.fountain")).toEqual({ kind: "marks-spanning-elements", count: 15 });
    expect(entry("Big-Fish-augmented.fountain")).toEqual({
      kind: "marks-spanning-elements",
      count: 15,
    });
    // Absent, not an entry of zero. This read `?? 0`, which could not tell
    // the difference.
    expect(entry("Brick-&-Steel.fountain")).toBeUndefined();
  });

  it("marks fifteen elements, which is where the 24 bytes go", () => {
    const { document } = importScreenplay(readFixtureBytes("Big-Fish.fountain"));
    const wholly = document.elements.filter((element) =>
      element.marks?.some(
        (mark) => mark.mark === "italic" && mark.start === 0 && mark.end === element.text.length,
      ),
    );

    // Six delimiter characters in the source become thirty on the way out.
    expect(wholly).toHaveLength(15);
    expect(wholly.length * 2 - 3 * 2).toBe(24);
  });
});
