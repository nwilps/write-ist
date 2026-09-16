/**
 * Reading fixtures and writing test output as real files.
 *
 * Everything here deals in bytes. ADR-0020 records that the v1-era gate
 * compared two in-memory strings and reported a JavaScript character count as
 * a byte count; both mistakes are impossible if nothing in the pipeline is
 * allowed to be a string with a length.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, "..", "fixtures");
const OUTPUT = join(here, "..", ".out");

/** The raw bytes of a fixture, exactly as they sit on disk. */
export function readFixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, name)));
}

/** A fixture decoded as UTF-8, with no normalisation of any kind applied. */
export function readFixtureText(name: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(readFixtureBytes(name));
}

/**
 * Write text to a real file as UTF-8 and read the bytes back off the disk.
 *
 * The round trip through the filesystem is the point, not ceremony: an
 * encoding difference, a stray byte-order mark or a platform line-ending
 * rewrite only exists in the file, and a comparison held in memory cannot see
 * any of them.
 */
export function writeAndReadBack(name: string, text: string): Uint8Array {
  const path = join(OUTPUT, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, { encoding: "utf8" });
  return new Uint8Array(readFileSync(path));
}

/**
 * Write bytes to a real file, unchanged, and read them back.
 *
 * Preferred over `writeAndReadBack` wherever the thing under test already
 * produced bytes: converting them to a string and letting the filesystem
 * re-encode would put a UTF-8 round trip between the exporter and the
 * comparison, and that is precisely the layer a byte gate exists to watch.
 */
export function writeBytesAndReadBack(name: string, bytes: Uint8Array): Uint8Array {
  const path = join(OUTPUT, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  return new Uint8Array(readFileSync(path));
}

/** Where `writeAndReadBack` puts a file, for naming it in a failure message. */
export function outputPath(name: string): string {
  return join(OUTPUT, name);
}
