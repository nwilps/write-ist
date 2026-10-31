/**
 * The four text normalisations ADR-0020 permits on first opening a file, and
 * the report that must name every one it applies.
 *
 * These are surface-agnostic: they are about the text, not about screenplay or
 * prose. The other three entries on ADR-0020's list belong further along —
 * mark ordering to a serialiser, `(CONT'D)` to its own pass, and spacing a
 * tight run to the spacing table.
 */
import { describe, expect, it } from "vitest";
import { isNormalised, normaliseSource } from "../src/normalise.ts";

const applied = (source: string) => normaliseSource(source).applied;
const normalised = (source: string) => normaliseSource(source).text;

describe("line endings", () => {
  it("makes CRLF and a lone CR into LF, and counts both", () => {
    expect(normalised("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
    expect(applied("a\r\nb\rc\nd")).toEqual([{ kind: "line-endings-to-lf", count: 2 }]);
  });

  it("reports nothing for a file that is already LF", () => {
    expect(applied("a\nb\n")).toEqual([]);
  });
});

describe("Unicode", () => {
  // The rule exists because declining to normalise does not leave the file
  // alone, it leaves it mixed — and then Find fails on one spelling of a word
  // with nothing on screen to explain why.
  const composed = "café";
  const decomposed = "café";

  it("composes a decomposed character", () => {
    expect(normalised(decomposed)).toBe(composed);
  });

  it("counts the character, not the code points it was written with", () => {
    // Counted per grapheme. `e` and the combining acute are each already NFC
    // on their own, so a per-code-point count reports zero here — which is
    // what it did until a fixture that was not already NFC arrived.
    expect(applied(decomposed)).toEqual([{ kind: "unicode-to-nfc", count: 1 }]);
    expect(applied(`${decomposed} and ${decomposed}`)).toEqual([
      { kind: "unicode-to-nfc", count: 2 },
    ]);
  });

  it("reports nothing for text that is already NFC", () => {
    expect(applied(composed)).toEqual([]);
  });

  it("never applies the compatibility forms", () => {
    // NFKC would rewrite these, changing the writer's characters. ADR-0020
    // excludes it by name, because the function is one keystroke away.
    for (const text of ["ﬁnd", "½", "ＡＢ", "Ⅳ"]) {
      expect(normalised(text), text).toBe(text);
      expect(applied(text), text).toEqual([]);
    }
  });
});

describe("trailing whitespace", () => {
  it("trims it from every line and counts the lines, not the characters", () => {
    expect(normalised("a   \nb\t\t\nc")).toBe("a\nb\nc");
    expect(applied("a   \nb\t\t\nc")).toEqual([
      { kind: "trailing-whitespace-trimmed", count: 2 },
    ]);
  });

  it("trims it at the end of a file with no final newline", () => {
    expect(normalised("a  ")).toBe("a");
  });

  it("leaves leading whitespace to the parsers", () => {
    // Dropped on the screenplay surface (issue #15, ADR-0020's tenth entry) by
    // the screenplay parser; verse on the prose surface keeps it. Neither is a
    // property of the text alone, so this function does not touch it.
    expect(normalised("    (quietly)\n\tindented")).toBe("    (quietly)\n\tindented");
  });
});

describe("blank-line runs", () => {
  it("collapses three or more newlines to two, counting runs", () => {
    expect(normalised("a\n\n\nb\n\n\n\n\nc")).toBe("a\n\nb\n\nc");
    expect(applied("a\n\n\nb\n\n\n\n\nc")).toEqual([
      { kind: "blank-line-runs-collapsed", count: 2 },
    ]);
  });

  it("leaves a single blank line alone", () => {
    expect(applied("a\n\nb")).toEqual([]);
  });
});

describe("the order the rules run in", () => {
  it("trims whitespace before collapsing runs, so a line of spaces counts as blank", () => {
    // Otherwise `\n   \n\n` is not a run of three newlines and the stray blank
    // line survives, which is the case the corpus actually contains.
    expect(normalised("a\n   \n\nb")).toBe("a\n\nb");
  });

  it("makes line endings LF first, so CRLF runs collapse too", () => {
    expect(normalised("a\r\n\r\n\r\n\r\nb")).toBe("a\n\nb");
  });
});

describe("the report", () => {
  it("names every rule that fired, in the order they ran", () => {
    const source = "a  \r\n\r\n\r\n\r\ncafé";

    expect(applied(source)).toEqual([
      { kind: "line-endings-to-lf", count: 4 },
      { kind: "unicode-to-nfc", count: 1 },
      { kind: "trailing-whitespace-trimmed", count: 1 },
      { kind: "blank-line-runs-collapsed", count: 1 },
    ]);
  });

  it("never reports a rule that changed nothing", () => {
    expect(applied("Already clean.\n\nNothing to do.")).toEqual([]);
    for (const entry of applied("a  \r\ncafé")) {
      expect(entry.count, entry.kind).toBeGreaterThan(0);
    }
  });
});

describe("normalising is a fixed point", () => {
  it("leaves an already-normalised file untouched", () => {
    const once = normalised("a  \r\n\r\n\r\n\r\ncafé  ");

    expect(applied(once)).toEqual([]);
    expect(normalised(once)).toBe(once);
    expect(isNormalised(once)).toBe(true);
  });

  it("says when a file is not normalised", () => {
    expect(isNormalised("a\r\nb")).toBe(false);
    expect(isNormalised("café")).toBe(false);
    expect(isNormalised("a  ")).toBe(false);
    expect(isNormalised("a\n\n\nb")).toBe(false);
  });
});
