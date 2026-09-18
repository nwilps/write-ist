/**
 * Files in another encoding open, with every character kept (ADR-0020).
 *
 * Write-ist must never refuse to open a writer's file, and must never swap a
 * character it does not understand for `�` — because the next save writes
 * that `�` over the writer's real character. Both fixtures below would have
 * failed the first rule before this existed, and an easy fix fails the second.
 *
 * The fixtures are built here as bytes rather than kept as files: the point of
 * each is its exact bytes, and they are short enough to read in full.
 */
import { describe, expect, it } from "vitest";
import { decodeFile } from "../src/decode.ts";
import { exportProse, importProse, reopenAndSave as reopenProse } from "../src/prose/import.ts";
import {
  exportScreenplay,
  importScreenplay,
  reopenAndSave as reopenScreenplay,
} from "../src/screenplay/import.ts";
import { readFixtureBytes } from "./support/files.ts";

/** One page of text, readable on both surfaces, with the three hard cases in it. */
const TEXT = "INT. CAFé - DAY\n\nIt’s “fine”, she says.\n";

/**
 * TEXT as windows-1252 bytes, spelled out: é is 0xE9, the curly apostrophe
 * 0x92, the curly quotes 0x93 and 0x94. Everything else is ASCII.
 */
const WINDOWS_1252_BYTES: Record<string, number> = { é: 0xe9, "’": 0x92, "“": 0x93, "”": 0x94 };
const windows1252 = Uint8Array.from([...TEXT].map((char) => WINDOWS_1252_BYTES[char] ?? char.charCodeAt(0)));

/** TEXT as Windows Notepad saves "Unicode": FF FE, then two bytes a character. */
const utf16le = Uint8Array.from([
  0xff,
  0xfe,
  ...[...TEXT].flatMap((char) => [char.charCodeAt(0) & 0xff, char.charCodeAt(0) >> 8]),
]);

const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

const surfaces = [
  {
    name: "screenplay",
    open: (bytes: Uint8Array) => {
      const { document, report } = importScreenplay(bytes);
      const texts = document.elements.map((element) => element.text);
      return { texts, report, saved: exportScreenplay(document) };
    },
    reopen: reopenScreenplay,
  },
  {
    name: "prose",
    open: (bytes: Uint8Array) => {
      const { document, report } = importProse(bytes);
      const texts = document.elements.map((element) => element.text);
      return { texts, report, saved: exportProse(document) };
    },
    reopen: reopenProse,
  },
] as const;

const fixtures = [
  {
    name: "windows-1252",
    bytes: windows1252,
    // Only the four characters above 0x7F are spelled differently in UTF-8.
    converted: windows1252.filter((byte) => byte > 0x7f).length,
  },
  {
    name: "UTF-16LE with its marker",
    bytes: utf16le,
    // Every character changes bytes. The marker is not a character.
    converted: (utf16le.length - 2) / 2,
  },
] as const;

describe("the fixtures are what they claim to be", () => {
  it("spells the windows-1252 characters in the bytes named", () => {
    expect([...windows1252].filter((byte) => byte > 0x7f)).toEqual([0xe9, 0x92, 0x93, 0x94]);
    // It is not UTF-8, so a strict UTF-8 reader would refuse it.
    expect(() => strictUtf8.decode(windows1252)).toThrow();
  });

  it("starts the UTF-16 file with FF FE and puts a zero byte after every ASCII letter", () => {
    expect([...utf16le.slice(0, 6)]).toEqual([0xff, 0xfe, 0x49, 0x00, 0x4e, 0x00]); // "IN"
    expect(() => strictUtf8.decode(utf16le)).toThrow();
  });
});

for (const fixture of fixtures) {
  for (const surface of surfaces) {
    describe(`a ${fixture.name} file on the ${surface.name} surface`, () => {
      it("opens", () => {
        expect(() => surface.open(fixture.bytes)).not.toThrow();
      });

      it("keeps every character, with no � and no zero byte anywhere", () => {
        const { texts } = surface.open(fixture.bytes);
        const all = texts.join("\n");

        expect(all).toContain("CAFé");
        expect(all).toContain("It’s");
        expect(all).toContain("“fine”");
        expect(all).not.toContain("�");
        expect(all).not.toContain("\0");
        // The two ways the UTF-16 file goes wrong if its marker is not read first.
        expect(all).not.toContain("ÿþ");
      });

      it("saves as valid UTF-8, and the text is the text that went in", () => {
        const { saved } = surface.open(fixture.bytes);

        expect(strictUtf8.decode(saved)).toBe(TEXT);
      });

      it("saves the same bytes when opened and saved a second time", () => {
        const { saved } = surface.open(fixture.bytes);

        expect([...surface.reopen(saved)]).toEqual([...saved]);
        // And a second import finds nothing left to convert.
        const again = surface.open(saved);
        expect(again.report.applied.find((entry) => entry.kind === "converted-to-utf-8"))
          .toBeUndefined();
      });

      it("reports the conversion first, counted per character whose bytes changed", () => {
        const { report } = surface.open(fixture.bytes);

        expect(report.applied[0]).toEqual({ kind: "converted-to-utf-8", count: fixture.converted });
      });
    });
  }
}

describe("windows-1252 cannot lose a character", () => {
  it("decodes all 256 byte values to 256 distinct characters, none of them �", () => {
    // Every byte value once. Not UTF-8 and no UTF-16 marker, so it reaches
    // windows-1252 — the step that has to be unable to fail.
    const every = Uint8Array.from({ length: 256 }, (_, byte) => byte);
    const characters = [...decodeFile(every).text];

    expect(characters).toHaveLength(256);
    expect(new Set(characters).size).toBe(256);
    expect(characters).not.toContain("�");
  });
});

describe("a UTF-8 file is read exactly as before", () => {
  it("reports no conversion for any of the committed manuscripts", () => {
    for (const fixture of [
      "Brick-&-Steel.fountain",
      "Big-Fish.fountain",
      "Big-Fish-augmented.fountain",
    ]) {
      const { report } = importScreenplay(readFixtureBytes(fixture));
      expect(report.applied.map((entry) => entry.kind), fixture).not.toContain("converted-to-utf-8");
    }
    const { report } = importProse(readFixtureBytes("Republic-manuscript.md"));
    expect(report.applied.map((entry) => entry.kind)).not.toContain("converted-to-utf-8");
  });
});
