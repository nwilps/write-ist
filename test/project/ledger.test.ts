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
  LEDGER_FILE,
  openLedger,
  wordCount,
} from "../../src/project/ledger.ts";
import type { ScreenplayDocument } from "../../src/screenplay/document.ts";
import { writingDayOf } from "../../src/goals/day.ts";
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
      { type: "action", text: "Hello there world", forced: false },
      { type: "action", text: "cut these four words", forced: false, omitted: true },
      { type: "dialogue", text: "One two", forced: false },
    ]);
    expect(wordCount(document)).toBe(5);
  });

  it("ignores the title page — only elements count", () => {
    const document: ScreenplayDocument = {
      titlePage: [{ key: "Title", inline: { text: "Many Words Here" }, continuations: [] }],
      elements: [{ type: "action", text: "Alone", forced: false }],
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
      { type: "scene-heading", text: "INT. ROOM - DAY", forced: false },
      { type: "action", text: "A cat walks in.", forced: false },
    ]);
    await ledger.recordDay(
      { id: "550e8400-e29b-41d4-a716-446655440000", name: "Coastal Signal" },
      document,
    );

    expect(await lines()).toEqual([
      "days\tlocal\t2026-03-15T10:00:00.000Z",
      `day\t${writingDayOf(clock.now())}\t550e8400-e29b-41d4-a716-446655440000\t${wordCount(document)}\t${pageCount(document)}\tCoastal Signal`,
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

describe("the ledger's day is the writer's local day (ADR-0041)", () => {
  let folder: { path: string; remove: () => void };
  const zone = process.env.TZ;
  const project = { id: "550e8400-e29b-41d4-a716-446655440000", name: "Coastal Signal" };
  const document = documentOf([{ type: "action", text: "One two", forced: false }]);

  beforeEach(() => {
    folder = temporaryDirectory();
  });

  afterEach(() => {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
    folder.remove();
  });

  async function lines(): Promise<string[]> {
    const bytes = await nodeFilesystem.readFile(join(folder.path, LEDGER_FILE));
    return new TextDecoder().decode(bytes).split("\n").filter((line) => line !== "");
  }

  async function dayDated(iso: string, tz: string): Promise<string> {
    process.env.TZ = tz;
    const ledger = openLedger(nodeFilesystem, folder.path, rewoundInstant(iso));
    await ledger.recordDay(project, document);
    const last = (await lines()).at(-1)!;
    return last.split("\t")[1]!;
  }

  it("dates 23:30 in Los Angeles by the Los Angeles day, not the UTC one", async () => {
    // 2026-03-16T06:30Z is still 23:30 on the 15th in Los Angeles (PDT).
    expect(await dayDated("2026-03-16T06:30:00.000Z", "America/Los_Angeles")).toBe("2026-03-15");
  });

  it("dates 00:30 in Sydney by the Sydney day, not the UTC one", async () => {
    // 2026-03-14T13:30Z is 00:30 on the 15th in Sydney (AEDT).
    expect(await dayDated("2026-03-14T13:30:00.000Z", "Australia/Sydney")).toBe("2026-03-15");
  });

  it("rolls over at local midnight exactly", async () => {
    expect(await dayDated("2026-11-04T04:59:59.000Z", "America/New_York")).toBe("2026-11-03");
    expect(await dayDated("2026-11-04T05:00:00.000Z", "America/New_York")).toBe("2026-11-04");
  });

  it("keeps one date per calendar day across daylight-saving changes", async () => {
    // US spring forward 2026-03-08 (23-hour day) and fall back 2026-11-01 (25-hour day).
    expect(await dayDated("2026-03-08T07:59:00.000Z", "America/New_York")).toBe("2026-03-08");
    expect(await dayDated("2026-03-09T03:59:00.000Z", "America/New_York")).toBe("2026-03-08");
    expect(await dayDated("2026-03-09T04:00:00.000Z", "America/New_York")).toBe("2026-03-09");
    expect(await dayDated("2026-11-02T04:59:00.000Z", "America/New_York")).toBe("2026-11-01");
    expect(await dayDated("2026-11-02T05:00:00.000Z", "America/New_York")).toBe("2026-11-02");
  });

  it("dates by the zone at the moment of recording when the zone changes", async () => {
    const instant = "2026-06-01T01:00:00.000Z";
    expect(await dayDated(instant, "Europe/London")).toBe("2026-06-01");
    expect(await dayDated(instant, "America/Los_Angeles")).toBe("2026-05-31");
  });

  it("leaves old UTC-dated lines as written and marks where local days begin, once", async () => {
    const old = "day\t2026-03-15\t550e8400-e29b-41d4-a716-446655440000\t10\t1\tCoastal Signal\n";
    await writeFile(join(folder.path, LEDGER_FILE), `opened\t2026-03-15T10:00:00.000Z\n${old}`);
    process.env.TZ = "America/Los_Angeles";
    const clock = rewoundInstant("2026-03-17T06:30:00.000Z");
    const ledger = openLedger(nodeFilesystem, folder.path, clock);
    await ledger.recordDay(project, document);
    clock.rewind("2026-03-18T06:30:00.000Z");
    await ledger.recordDay(project, document);

    const recorded = await lines();
    expect(recorded.slice(0, 2)).toEqual([
      "opened\t2026-03-15T10:00:00.000Z",
      old.trimEnd(),
    ]);
    expect(recorded.filter((line) => line.startsWith("days\tlocal\t"))).toEqual([
      "days\tlocal\t2026-03-17T06:30:00.000Z",
    ]);
    expect(recorded[2]).toBe("days\tlocal\t2026-03-17T06:30:00.000Z");
    expect(recorded[3]!.split("\t")[1]).toBe("2026-03-16");
    expect(recorded[4]!.split("\t")[1]).toBe("2026-03-17");
  });
});
