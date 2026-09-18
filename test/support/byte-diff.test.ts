import { describe, expect, it } from "vitest";
import { assertBytesEqual, describeByteDifference, firstByteDifference } from "./byte-diff.ts";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("firstByteDifference", () => {
  it("reports nothing when the two sequences are byte-identical", () => {
    expect(firstByteDifference(utf8("INT. KITCHEN - DAY\n"), utf8("INT. KITCHEN - DAY\n"))).toBeNull();
  });

  it("locates an inserted blank line by byte, line and column", () => {
    const expectedBytes = utf8("A long beat.\nLonger than is funny.\n");
    const actualBytes = utf8("A long beat.\n\nLonger than is funny.\n");

    const difference = firstByteDifference(expectedBytes, actualBytes);

    expect(difference).not.toBeNull();
    // "A long beat.\n" is 13 bytes; the two sides part company at the 14th.
    expect(difference?.byteOffset).toBe(13);
    expect(difference?.line).toBe(2);
    expect(difference?.column).toBe(1);
    expect(difference?.expectedByte).toBe(0x4c); // "L"
    expect(difference?.actualByte).toBe(0x0a); // "\n"
  });

  it("reports truncation at the point the shorter side ran out", () => {
    const difference = firstByteDifference(utf8("FADE OUT.\n"), utf8("FADE OUT."));

    expect(difference?.byteOffset).toBe(9);
    expect(difference?.expectedByte).toBe(0x0a);
    expect(difference?.actualByte).toBeNull();
    expect(difference?.expectedLength).toBe(10);
    expect(difference?.actualLength).toBe(9);
  });

  it("sees an encoding change that a string comparison cannot", () => {
    // Same character to a reader, and to ===, but not the same file on disk.
    const composed = "café"; // NFC
    const decomposed = "café"; // NFD
    expect(composed.normalize("NFC")).toBe(decomposed.normalize("NFC"));

    const difference = firstByteDifference(utf8(composed), utf8(decomposed));

    expect(difference).not.toBeNull();
    expect(difference?.byteOffset).toBe(3);
    expect(difference?.expectedLength).toBe(5);
    expect(difference?.actualLength).toBe(6);
  });

  it("counts lines across a long run", () => {
    const head = "line\n".repeat(1_703);
    const difference = firstByteDifference(utf8(`${head}same\n`), utf8(`${head}diff\n`));

    expect(difference?.line).toBe(1_704);
    expect(difference?.column).toBe(1);
  });
});

describe("describeByteDifference", () => {
  it("reports nothing for identical sequences", () => {
    expect(describeByteDifference(utf8("EXT. RIVER - DAY\n"), utf8("EXT. RIVER - DAY\n"))).toBeNull();
  });

  it("shows the position, both sides in context, and a caret on the differing byte", () => {
    // 71 bytes, so the 60 bytes of leading context start mid-word and elide.
    const before = "INT. BAR - NIGHT\n\nThey drink the beers.\n\nAnd then there's a long beat.\n";
    const expectedBytes = utf8(`${before}Longer than is funny.\n`);
    const actualBytes = utf8(`${before}\nLonger than is funny.\n`);
    expect(before.length).toBe(71);

    const report = describeByteDifference(expectedBytes, actualBytes)!;
    const lines = report.split("\n");

    expect(lines[0]).toBe("mismatch at byte 71 (line 6, column 1)");
    expect(lines[1]).toBe("  expected is 93 bytes, actual is 94 bytes");
    expect(lines[2]).toBe(
      '  expected: "...NIGHT\\n\\nThey drink the beers.\\n\\nAnd then there\'s a long beat.' +
        '\\nLonger than is funny.\\n"',
    );
    expect(lines[3]).toBe(
      '  actual  : "...NIGHT\\n\\nThey drink the beers.\\n\\nAnd then there\'s a long beat.' +
        '\\n\\nLonger than is funny.\\n"',
    );
    expect(lines[4]).toMatch(/^ +\^ expected L \(0x4c\), actual \\n \(0x0a\)$/);

    // The caret lands on the first differing byte as rendered in the `actual`
    // line. The newline that ends "...long beat." is common to both sides and
    // sits to the left of it; the caret is on the inserted one.
    const caretIndex = lines[4]!.indexOf("^");
    expect(lines[3]!.slice(caretIndex)).toBe('\\nLonger than is funny.\\n"');
    expect(lines[3]!.slice(caretIndex - 2, caretIndex)).toBe("\\n");
  });

  it("elides with ellipses when the difference is deep inside a large file", () => {
    const filler = "x".repeat(500);
    const report = describeByteDifference(utf8(`${filler}a${filler}`), utf8(`${filler}b${filler}`))!;

    expect(report).toContain("mismatch at byte 500 (line 1, column 501)");
    // 60 bytes of context either side of the differing byte itself.
    expect(report).toContain(`  expected: "...${"x".repeat(60)}a${"x".repeat(60)}..."`);
    expect(report).toContain(`  actual  : "...${"x".repeat(60)}b${"x".repeat(60)}..."`);
  });

  it("names the side that ended when one sequence is a prefix of the other", () => {
    const report = describeByteDifference(utf8("FADE OUT.\n"), utf8("FADE OUT."))!;

    expect(report).toContain("actual ended");
    expect(report).toContain("expected is 10 bytes, actual is 9 bytes");
  });

  it("renders non-ASCII as raw bytes rather than decoding them", () => {
    const report = describeByteDifference(utf8("café"), utf8("café"))!;

    expect(report).toContain("\\xc3\\xa9");
    expect(report).toContain("e\\xcc\\x81");
  });
});

describe("assertBytesEqual", () => {
  it("passes silently on identical bytes", () => {
    expect(() => assertBytesEqual(utf8("INT. BAR - NIGHT\n"), utf8("INT. BAR - NIGHT\n"))).not.toThrow();
  });

  it("throws the full report, with the caller's message first", () => {
    expect(() => assertBytesEqual(utf8("a\n"), utf8("b\n"), { message: "round-trip lost bytes" }))
      .toThrowError(/^round-trip lost bytes\nmismatch at byte 0 \(line 1, column 1\)/);
  });
});
