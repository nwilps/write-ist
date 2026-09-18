/**
 * The acceptance corpus, which lives outside this repository.
 *
 * `script.fountain` is an unpublished screenplay. The other four fixtures are
 * published documents and are committed; this one is not, and the repo may go
 * public. So it is read from wherever the writer keeps it, and the tests that
 * need it skip rather than fail when it is not there — a collaborator or a CI
 * runner should see why, not a red suite.
 *
 * Point `WRITE_IST_CORPUS` at the file to run them.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe } from "vitest";

const DEFAULT_PATH = "/home/noah/Projects/write-ist-ng/spike/public/script.fountain";

/** Where the corpus is being looked for. */
export const CORPUS_PATH = process.env["WRITE_IST_CORPUS"] ?? DEFAULT_PATH;

/** Whether it is actually there. */
export const corpusAvailable = existsSync(CORPUS_PATH);

/**
 * `describe` for a block that needs the corpus, skipped with its reason in the
 * title when the file is absent.
 */
export function describeCorpus(name: string, suite: () => void): void {
  if (corpusAvailable) {
    describe(name, suite);
    return;
  }
  describe.skip(
    `${name} — corpus not found at ${CORPUS_PATH}; set WRITE_IST_CORPUS to run these`,
    suite,
  );
}

/** The corpus as raw bytes, exactly as it sits on disk. */
export function readCorpusBytes(): Uint8Array {
  return new Uint8Array(readFileSync(CORPUS_PATH));
}

/** The corpus decoded as UTF-8, with no normalisation of any kind applied. */
export function readCorpusText(): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(readCorpusBytes());
}
