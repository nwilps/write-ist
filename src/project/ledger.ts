/**
 * The ledger — an append-only record of the writer's days (ADR-0017).
 *
 * Lives above every bundle, beside the registry (ADR-0016), one file per
 * writer. Nothing in slice 1 reads it; it exists so Tuesday's words and pages
 * still exist on Wednesday. Losing it costs a chart, never a word.
 *
 * Format: one record per line, tab-separated, dates and numbers in plain
 * sight (ADR-0012 as ADR-0016 extends it above bundles):
 *
 *   opened\t<ISO-8601>
 *   closed\t<ISO-8601>
 *   days\tlocal\t<ISO-8601>
 *   day\t<YYYY-MM-DD>\t<projectId>\t<words>\t<pages>\t<projectName>
 *
 * A `day` date is the writer's local day (`writingDayOf`, ADR-0041). The
 * `days` line is written once, before the first local-dated `day` line, and
 * marks the change: `day` lines above it were dated in UTC and stay as
 * written — the file is append-only, so they are read as the date they carry.
 *
 * The name is last so a name that contains tabs (vanishingly rare) only
 * affects itself. Words skip omitted elements; comments never enter element
 * text. Pages come from `pageCount` (ADR-0024).
 */
import type { Instant } from "../instant.ts";
import { systemInstant } from "../instant.ts";
import type { ScreenplayDocument } from "../screenplay/document.ts";
import { writingDayOf } from "../goals/day.ts";
import { pageCount } from "../screenplay/paginate.ts";
import type { Filesystem } from "./filesystem.ts";
import { join } from "./filesystem.ts";

/** The ledger's filename inside `appLocalDataDir()`. */
export const LEDGER_FILE = "ledger.txt";

/** The line that says the `day` lines after it are dated in local time. */
const LOCAL_DAYS_MARKER = "days\tlocal";

/** Enough of a project to date a day line. */
export interface LedgerProject {
  readonly id: string;
  readonly name: string;
}

export interface Ledger {
  /** The application opened. One line. */
  recordOpened(): Promise<void>;
  /** The application closed. One line. */
  recordClosed(): Promise<void>;
  /**
   * Words and pages for a project on the writer's local day.
   *
   * Absolute counts at the moment of recording — the manuscript as it stood
   * then. A later chart that wants "words written that day" subtracts the
   * previous day line for the same project.
   */
  recordDay(project: LedgerProject, document: ScreenplayDocument): Promise<void>;
}

/**
 * Open the ledger at `directory/ledger.txt`.
 *
 * `directory` is `appLocalDataDir()` in production and a temporary folder in
 * tests. The Instant is injected so a test can rewind it between cases.
 */
export function openLedger(
  filesystem: Filesystem,
  directory: string,
  instant: Instant = systemInstant,
): Ledger {
  const path = join(directory, LEDGER_FILE);

  async function append(line: string): Promise<void> {
    await appendAll([line]);
  }

  async function appendAll(batch: readonly string[]): Promise<void> {
    // ADR-0008 rule 3: absent is first run; unreadable is refuse to write.
    if (await filesystem.exists(path)) {
      await filesystem.readFile(path);
    } else {
      await filesystem.createDirectory(directory);
    }
    const bytes = new TextEncoder().encode(batch.map((line) => `${line}\n`).join(""));
    await filesystem.appendFile(path, bytes);
  }

  async function hasLocalDaysMarker(): Promise<boolean> {
    if (!(await filesystem.exists(path))) return false;
    const text = new TextDecoder().decode(await filesystem.readFile(path));
    return text.split("\n").some((line) => line.startsWith(`${LOCAL_DAYS_MARKER}\t`));
  }

  return {
    async recordOpened(): Promise<void> {
      await append(`opened\t${instant.now().toISOString()}`);
    },
    async recordClosed(): Promise<void> {
      await append(`closed\t${instant.now().toISOString()}`);
    },
    async recordDay(project, document): Promise<void> {
      const when = instant.now();
      const day = writingDayOf(when);
      const words = wordCount(document);
      const pages = pageCount(document);
      const name = project.name.replace(/\t/g, " ");
      const record = `day\t${day}\t${project.id}\t${words}\t${pages}\t${name}`;
      // One write, so a crash cannot leave the marker without its day line.
      await appendAll(
        (await hasLocalDaysMarker())
          ? [record]
          : [`${LOCAL_DAYS_MARKER}\t${when.toISOString()}`, record],
      );
    },
  };
}

/**
 * Words in the manuscript: element text, skipping cut material.
 *
 * Comments are not in element text (ADR-0018), so they never reach the count.
 * Title-page fields are not elements either.
 */
export function wordCount(document: ScreenplayDocument): number {
  let total = 0;
  for (const element of document.elements) {
    if (element.omitted === true) continue;
    const text = element.text.trim();
    if (text === "") continue;
    total += text.split(/\s+/).length;
  }
  return total;
}
