/**
 * The ledger (ADR-0017 / #50).
 *
 * The Instant is rewound between cases — `docs/STANDARDS.md`: a generator
 * claimed as reproducible has to be rewound, not merely seeded.
 */
import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Instant } from "../../src/instant.ts";
import {
  dayOf,
  LEDGER_FILE,
  openLedger,
  wordCount,
} from "../../src/project/ledger.ts";
import type { ScreenplayDocument } from "../../src/screenplay/document.ts";
import { pageCount } from "../../src/screenplay/paginate.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

function documentOf(
  elements: ScreenplayDocument["elements"],
): ScreenplayDocument {
  return { titlePage: [], elements, comments: [], endsWithNewline: true };
}

function rewoundInstant(iso: string): Instant & { rewind(to: string): void } {
  let current = new Date(iso);
  return {
    now: () => new Date(current.getTime()),
    rewind(to: string) {
      current = new Date(to);
    },
  };
}

describe("wordCount", () => {
  it("counts words in element text and skips omitted (cut) material", () => {
    const document = documentOf([
      { type: "action", text: "Hello there world", indent: "", forced: false },
      { type: "action", text: "cut these four words", indent: "", forced: false, omitted: true },
      { type: "dialogue", text: "One two", indent: "", forced: false },
    ]);
    expect(wordCount(document)).toBe(5);
  });

  it("ignores the title page — only elements count", () => {
    const document: ScreenplayDocument = {
      titlePage: [{ key: "Title", inline: { text: "Many Words Here" }, continuations: [] }],
      elements: [{ type: "action", text: "Alone", indent: "", forced: false }],
      comments: [],
      endsWithNewline: true,
    };
    expect(wordCount(document)).toBe(1);
  });
});

describe("the ledger", () => {
  let folder: { path: string; remove: () => void };
  let clock: ReturnType<typeof rewoundInstant>;

  beforeEach(() => {
    folder = temporaryDirectory();
    clock = rewoundInstant("2026-03-15T10:00:00.000Z");
  });

  afterEach(() => {
    folder.remove();
  });

  async function lines(): Promise<string[]> {
    const bytes = await nodeFilesystem.readFile(join(folder.path, LEDGER_FILE));
    return new TextDecoder().decode(bytes).split("\n").filter((line) => line !== "");
  }

  it("records opened and closed with the Instant's time", async () => {
    const ledger = openLedger(nodeFilesystem, folder.path, clock);
    await ledger.recordOpened();
    clock.rewind("2026-03-15T12:30:00.000Z");
    await ledger.recordClosed();

    expect(await lines()).toEqual([
      "opened\t2026-03-15T10:00:00.000Z",
      "closed\t2026-03-15T12:30:00.000Z",
    ]);
  });

  it("records a day line with id, words, pages and name", async () => {
    const ledger = openLedger(nodeFilesystem, folder.path, clock);
    const document = documentOf([
      { type: "scene-heading", text: "INT. ROOM - DAY", indent: "", forced: false },
      { type: "action", text: "A cat walks in.", indent: "", forced: false },
    ]);
    await ledger.recordDay(
      { id: "550e8400-e29b-41d4-a716-446655440000", name: "Coastal Signal" },
      document,
    );

    expect(await lines()).toEqual([
      `day\t${dayOf(clock.now())}\t550e8400-e29b-41d4-a716-446655440000\t${wordCount(document)}\t${pageCount(document)}\tCoastal Signal`,
    ]);
  });

  it("appends without rewriting earlier lines", async () => {
    const ledger = openLedger(nodeFilesystem, folder.path, clock);
    await ledger.recordOpened();
    clock.rewind("2026-03-16T09:00:00.000Z");
    await ledger.recordOpened();

    const first = await lines();
    expect(first).toHaveLength(2);
    expect(first[0]).toBe("opened\t2026-03-15T10:00:00.000Z");
    expect(first[1]).toBe("opened\t2026-03-16T09:00:00.000Z");
  });

  it("rewinding the Instant between tests does not continue a prior sequence", async () => {
    // First case-shaped use.
    {
      const ledger = openLedger(nodeFilesystem, folder.path, clock);
      await ledger.recordOpened();
    }
    // Rewound — STANDARDS.md's scar. A seeded-only clock would keep walking.
    clock.rewind("2020-01-01T00:00:00.000Z");
    const ledger = openLedger(nodeFilesystem, folder.path, clock);
    await ledger.recordClosed();

    const recorded = await lines();
    expect(recorded[recorded.length - 1]).toBe("closed\t2020-01-01T00:00:00.000Z");
  });

  it("creates the file on first run (absent is fine)", async () => {
    const ledger = openLedger(nodeFilesystem, folder.path, clock);
    await ledger.recordOpened();
    expect(await nodeFilesystem.exists(join(folder.path, LEDGER_FILE))).toBe(true);
  });

  it("refuses to write over an unreadable ledger (ADR-0008 rule 3)", async () => {
    const path = join(folder.path, LEDGER_FILE);
    await writeFile(path, "opened\told\n");
    await chmod(path, 0);

    const ledger = openLedger(nodeFilesystem, folder.path, clock);
    await expect(ledger.recordOpened()).rejects.toThrow();

    // Restore so afterEach can remove the folder.
    await chmod(path, 0o644);
    const bytes = await nodeFilesystem.readFile(path);
    expect(new TextDecoder().decode(bytes)).toBe("opened\told\n");
  });
});
