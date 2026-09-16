/**
 * Locating and describing the first difference between two byte sequences.
 *
 * Bytes, not characters. A round-trip that preserves every character while
 * changing the encoding — NFC to NFD, say — is a file mutation that a string
 * comparison cannot see, and seeing it is the whole point of this gate
 * (ADR-0004, ADR-0020).
 *
 * Nothing here decides whether a difference is acceptable. It only says
 * precisely where the two sequences stopped agreeing.
 */

/** How many bytes of context to show either side of the difference. */
const DEFAULT_CONTEXT_BYTES = 60;

export interface ByteDifference {
  /**
   * 0-based index of the first byte that differs. When one sequence is a
   * prefix of the other, this is the length of the shorter one.
   */
  readonly byteOffset: number;
  /** 1-based line the difference falls on, counted by LF bytes. */
  readonly line: number;
  /** 1-based column within that line, counted in bytes. */
  readonly column: number;
  /** The byte expected at that offset, or null if the expected side ended. */
  readonly expectedByte: number | null;
  /** The byte found at that offset, or null if the actual side ended. */
  readonly actualByte: number | null;
  readonly expectedLength: number;
  readonly actualLength: number;
}

/**
 * The first byte at which `actual` departs from `expected`, or null if the two
 * are identical. Trailing bytes count: a sequence that is a correct prefix of
 * the other is still a difference, reported at the point it ran out.
 */
export function firstByteDifference(
  expected: Uint8Array,
  actual: Uint8Array,
): ByteDifference | null {
  const shared = Math.min(expected.length, actual.length);

  let byteOffset = -1;
  for (let i = 0; i < shared; i++) {
    if (expected[i] !== actual[i]) {
      byteOffset = i;
      break;
    }
  }
  if (byteOffset === -1) {
    if (expected.length === actual.length) return null;
    byteOffset = shared;
  }

  // Count the line in whichever side actually reaches the offset.
  const counted = byteOffset < expected.length ? expected : actual;
  const { line, column } = lineAndColumnAt(counted, byteOffset);

  return {
    byteOffset,
    line,
    column,
    expectedByte: byteOffset < expected.length ? expected[byteOffset]! : null,
    actualByte: byteOffset < actual.length ? actual[byteOffset]! : null,
    expectedLength: expected.length,
    actualLength: actual.length,
  };
}

/** 1-based line and byte column of `offset`, counting LF bytes before it. */
function lineAndColumnAt(
  bytes: Uint8Array,
  offset: number,
): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < bytes.length; i++) {
    if (bytes[i] === 0x0a) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

/**
 * A human-readable report of the first difference, with context either side,
 * or null if the two sequences are byte-identical.
 */
export function describeByteDifference(
  expected: Uint8Array,
  actual: Uint8Array,
  options: { contextBytes?: number; expectedLabel?: string; actualLabel?: string } = {},
): string | null {
  const difference = firstByteDifference(expected, actual);
  if (difference === null) return null;

  const contextBytes = options.contextBytes ?? DEFAULT_CONTEXT_BYTES;
  const expectedLabel = options.expectedLabel ?? "expected";
  const actualLabel = options.actualLabel ?? "actual";
  const labelWidth = Math.max(expectedLabel.length, actualLabel.length);

  // The differing byte itself, plus `contextBytes` on each side of it.
  const start = Math.max(0, difference.byteOffset - contextBytes);
  const end = difference.byteOffset + 1 + contextBytes;
  const expectedEnd = Math.min(expected.length, end);
  const actualEnd = Math.min(actual.length, end);

  const expectedLine = contextLine(expected, start, expectedEnd);
  const actualLine = contextLine(actual, start, actualEnd);

  // The caret sits under the first differing byte on the `actual` line. Each
  // byte renders to a variable number of characters, so the offset is measured
  // in rendered width rather than in bytes.
  const gutter = `  ${actualLabel.padEnd(labelWidth)}: `;
  const beforeDifference = actualLine.prefix + escapeBytes(actual.subarray(start, difference.byteOffset));
  const caretColumn = gutter.length + 1 + beforeDifference.length;

  const lines = [
    `mismatch at byte ${group(difference.byteOffset)} ` +
      `(line ${group(difference.line)}, column ${group(difference.column)})`,
    `  ${expectedLabel} is ${group(difference.expectedLength)} bytes, ` +
      `${actualLabel} is ${group(difference.actualLength)} bytes`,
    `  ${expectedLabel.padEnd(labelWidth)}: ${expectedLine.text}`,
    `  ${actualLabel.padEnd(labelWidth)}: ${actualLine.text}`,
    `${" ".repeat(caretColumn)}^ ${byteSummary(expectedLabel, difference.expectedByte)}, ` +
      `${byteSummary(actualLabel, difference.actualByte)}`,
  ];
  return lines.join("\n");
}

/** Throw a fully diagnosed error unless the two byte sequences are identical. */
export function assertBytesEqual(
  expected: Uint8Array,
  actual: Uint8Array,
  options: { contextBytes?: number; expectedLabel?: string; actualLabel?: string; message?: string } = {},
): void {
  const report = describeByteDifference(expected, actual, options);
  if (report === null) return;
  throw new Error(options.message === undefined ? report : `${options.message}\n${report}`);
}

function contextLine(
  bytes: Uint8Array,
  start: number,
  end: number,
): { prefix: string; text: string } {
  const prefix = start > 0 ? "..." : "";
  const suffix = end < bytes.length ? "..." : "";
  return {
    prefix,
    text: `"${prefix}${escapeBytes(bytes.subarray(start, end))}${suffix}"`,
  };
}

/**
 * Render bytes so that every one of them is visible and unambiguous. Printable
 * ASCII shows as itself; everything else, including the bytes of a multi-byte
 * UTF-8 character, shows as \xNN. Decoding to text here would hide precisely
 * the encoding differences this module exists to find.
 */
function escapeBytes(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    if (byte === 0x0a) out += "\\n";
    else if (byte === 0x0d) out += "\\r";
    else if (byte === 0x09) out += "\\t";
    else if (byte === 0x22) out += '\\"';
    else if (byte === 0x5c) out += "\\\\";
    else if (byte >= 0x20 && byte <= 0x7e) out += String.fromCharCode(byte);
    else out += `\\x${byte.toString(16).padStart(2, "0")}`;
  }
  return out;
}

function byteSummary(label: string, byte: number | null): string {
  if (byte === null) return `${label} ended`;
  return `${label} ${escapeBytes(Uint8Array.of(byte))} (0x${byte.toString(16).padStart(2, "0")})`;
}

/** Thousands separators, fixed rather than locale-dependent. */
function group(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
