/**
 * Turning a file's bytes into text, whatever encoding it was saved in.
 *
 * **Write-ist never refuses to open a writer's file, and never replaces a
 * character it does not understand.** Both halves matter, and the second is
 * the one an easy fix breaks: a lenient decoder turns every byte it cannot
 * read into `�`, and the next save writes those over the writer's real
 * characters. So nothing here is ever lenient. Every attempt is strict, and
 * the last one cannot fail.
 *
 * The order is the whole design:
 *
 *   1. **A UTF-16 marker.** `FF FE` or `FE FF` at the start is what Windows
 *      Notepad writes when it saves as "Unicode". It has to be checked first:
 *      such a file is not UTF-8, so without this step it falls through to
 *      windows-1252 and opens as `ÿþI\0N\0T\0…` — which the next save would
 *      write over the script.
 *   2. **UTF-8, strictly.** Every file Write-ist writes, and all five
 *      manuscripts it is tested on. Decoded exactly as before this existed.
 *   3. **Windows-1252**, what older Windows applications save in. It decodes
 *      all 256 possible byte values to 256 distinct characters and none of
 *      them to `�`, so it cannot fail and cannot lose anything — the writer's
 *      bytes can always be recovered from the text it produces.
 *
 * The text is saved back as UTF-8, which is ADR-0020's entry for this: every
 * character kept, only the bytes spelling them changed.
 */

export interface DecodedFile {
  readonly text: string;
  /**
   * How many characters are spelled in different bytes once saved as UTF-8 —
   * zero for a file that was already UTF-8. Occurrences changed, as ADR-0020
   * counts everything in the report.
   */
  readonly converted: number;
}

/** All this file asks of a decoder. */
interface Decoder {
  decode(bytes: Uint8Array): string;
}

const UTF8 = new TextDecoder("utf-8", { fatal: true });
const UTF16LE = new TextDecoder("utf-16le", { fatal: true });
const UTF16BE = new TextDecoder("utf-16be", { fatal: true });
// Strict too, though it never needs to be: windows-1252 has no invalid byte.
// Written this way so that nothing in this file is lenient, ever.
const WINDOWS_1252 = new TextDecoder("windows-1252", { fatal: true });

export function decodeFile(bytes: Uint8Array): DecodedFile {
  const utf16 = markedUtf16(bytes);
  if (utf16 !== null) {
    const text = attempt(utf16, bytes);
    // Every character changes bytes: two per character in, one to four out.
    // The marker itself is not a character and is not counted.
    if (text !== null) return { text, converted: [...text].length };
    // A marker followed by something that is not UTF-16 was not a marker.
    // Fall through, and let windows-1252 keep every byte of it.
  }

  const utf8 = attempt(UTF8, bytes);
  if (utf8 !== null) return { text: utf8, converted: 0 };

  // Only the bytes above 0x7F change: below that, windows-1252 and UTF-8
  // spell every character identically.
  const text = WINDOWS_1252.decode(bytes);
  return { text, converted: bytes.filter((byte) => byte > 0x7f).length };
}

/** The UTF-16 decoder the file's marker names, or null if it has none. */
function markedUtf16(bytes: Uint8Array): Decoder | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return UTF16LE;
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return UTF16BE;
  return null;
}

/** Decode strictly, or return null. Never a replacement character. */
function attempt(decoder: Decoder, bytes: Uint8Array): string | null {
  try {
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}
