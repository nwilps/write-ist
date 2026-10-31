/**
 * Importing a screenplay, with real files in a temporary folder — slice 1's
 * third testing seam (#37), and #38's acceptance criteria one by one.
 *
 * Everything here writes to a real directory and reads back what landed. The
 * assertions are about *files*: how many bytes the manuscript is, what the
 * marker says, and — the one that matters most — that the file the writer
 * imported from is byte-identical afterwards.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importProject } from "../../src/project/import.ts";
import { MANUSCRIPT_FILE, MARKER_FILE } from "../../src/project/bundle.ts";
import { FORMAT_VERSION } from "../../src/project/marker.ts";
import { readFixtureBytes } from "../support/files.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { CORPUS_PATH, describeCorpus, readCorpusBytes } from "../support/corpus.ts";

let temporary: { path: string; remove: () => void };
/** Stands in for `~/Documents/write-ist/` (ADR-0016). */
let projects: string;
/** Where the writer's own files sit — outside the default location, as they do. */
let elsewhere: string;

beforeEach(() => {
  temporary = temporaryDirectory();
  projects = join(temporary.path, "write-ist");
  elsewhere = join(temporary.path, "elsewhere");
  // Synchronously: `beforeEach` must finish having made the folder, and an
  // unawaited promise here only loses the race once the suite is under load.
  mkdirSync(elsewhere, { recursive: true });
});

afterEach(() => temporary.remove());

/** Put a file where the writer keeps theirs, and answer its path. */
function sourceFile(name: string, bytes: Uint8Array): string {
  const path = join(elsewhere, name);
  writeFileSync(path, bytes);
  return path;
}

/** A fixture, copied to where the writer keeps theirs. */
function fixtureSource(name: string): string {
  return sourceFile(name, readFixtureBytes(name));
}

/** Project ids handed out in order, so a test can name the one it expects. */
function idsInOrder(...ids: readonly string[]): () => string {
  let next = 0;
  return () => ids[next++] ?? `unexpected-${next}`;
}

const A_PROJECT_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const ANOTHER_PROJECT_ID = "9c5b94b1-35ad-49bb-b118-8e8fc24abf80";

async function importFrom(sourcePath: string, newProjectId = idsInOrder(A_PROJECT_ID)) {
  return importProject(
    { filesystem: nodeFilesystem, newProjectId },
    { sourcePath, projectsDirectory: projects },
  );
}

describe("the bundle an import creates", () => {
  it("holds a marker and a manuscript, and nothing else", async () => {
    const imported = await importFrom(fixtureSource("Big-Fish.fountain"));

    const entries = await nodeFilesystem.readDirectory(imported.bundlePath);
    expect(entries.map((entry) => entry.name).sort()).toEqual([MANUSCRIPT_FILE, MARKER_FILE]);
  });

  it("sits directly in the default location", async () => {
    const imported = await importFrom(fixtureSource("Big-Fish.fountain"));

    const folders = await nodeFilesystem.readDirectory(projects);
    expect(folders).toEqual([{ name: "Big Fish", isDirectory: true }]);
    expect(imported.bundlePath).toBe(join(projects, "Big Fish"));
  });

  it("records the format version, a minted id, Feature, and the name (ADR-0004, ADR-0015)", async () => {
    const imported = await importFrom(fixtureSource("Big-Fish.fountain"));

    expect(imported.project.marker).toEqual({
      name: "Big Fish",
      formatVersion: FORMAT_VERSION,
      projectId: A_PROJECT_ID,
      format: "Feature",
    });
  });

  it("writes that marker as readable text carrying the id (ADR-0012)", async () => {
    const imported = await importFrom(fixtureSource("Big-Fish.fountain"));

    const marker = readFileSync(join(imported.bundlePath, MARKER_FILE), "utf8");
    expect(marker).toContain("Big Fish");
    expect(marker).toContain(A_PROJECT_ID);
    expect(marker).toContain("Feature");
    expect(marker).toContain(FORMAT_VERSION);
  });
});

describe("the name a project gets", () => {
  it("comes from the title page's Title", async () => {
    const imported = await importFrom(fixtureSource("Big-Fish.fountain"));
    expect(imported.project.marker.name).toBe("Big Fish");
  });

  it("gathers a Title spread over continuation lines, without its marks", async () => {
    // Brick & Steel writes its title `_**BRICK & STEEL**_` over two indented
    // lines. The writer's name for it is neither the underscores nor one line.
    const imported = await importFrom(fixtureSource("Brick-&-Steel.fountain"));
    expect(imported.project.marker.name).toBe("BRICK & STEEL FULL RETIRED");
  });

  it("falls back to the file name when there is no title page", async () => {
    const source = sourceFile(
      "The Pilot.fountain",
      new TextEncoder().encode("INT. ROOM - DAY\n\nShe waits.\n"),
    );

    const imported = await importFrom(source);
    expect(imported.project.marker.name).toBe("The Pilot");
  });

  it("falls back to the file name when the title page has no Title", async () => {
    const source = sourceFile(
      "Untitled Draft.fountain",
      new TextEncoder().encode("Author: Someone\n\nINT. ROOM - DAY\n\nShe waits.\n"),
    );

    const imported = await importFrom(source);
    expect(imported.project.marker.name).toBe("Untitled Draft");
  });
});

describe("the manuscript an import writes", () => {
  // #38's acceptance criterion, and seam 1's byte counts: what the existing
  // import and export already produce for these files, now measured from the
  // file on disk rather than from an in-memory result.
  const counts: readonly (readonly [string, number])[] = [
    ["Brick-&-Steel.fountain", 2_886],
    ["Big-Fish.fountain", 146_097],
    ["Big-Fish-augmented.fountain", 147_139],
  ];

  for (const [name, bytes] of counts) {
    it(`is ${bytes.toLocaleString("en-GB")} bytes for ${name}`, async () => {
      const imported = await importFrom(fixtureSource(name));

      const manuscript = readFileSync(join(imported.bundlePath, MANUSCRIPT_FILE));
      expect(manuscript.length).toBe(bytes);
    });
  }

  it("is plain Fountain, named so any Fountain tool opens it (ADR-0003, ADR-0025)", async () => {
    const imported = await importFrom(fixtureSource("Big-Fish.fountain"));

    expect(MANUSCRIPT_FILE).toBe("manuscript.fountain");
    const manuscript = readFileSync(join(imported.bundlePath, MANUSCRIPT_FILE), "utf8");
    expect(manuscript.startsWith("Title: Big Fish\n")).toBe(true);
  });
});

describeCorpus("the manuscript an import writes, for the acceptance corpus", () => {
  it("is 172,327 bytes", async () => {
    const imported = await importFrom(sourceFile("script.fountain", readCorpusBytes()));

    const manuscript = readFileSync(join(imported.bundlePath, MANUSCRIPT_FILE));
    expect(manuscript.length).toBe(172_327);
  });

  it("leaves the corpus itself byte-identical", async () => {
    const before = readFileSync(CORPUS_PATH);
    await importFrom(sourceFile("script.fountain", readCorpusBytes()));
    expect(readFileSync(CORPUS_PATH).equals(before)).toBe(true);
  });
});

describe("the file the writer imported from", () => {
  for (const name of ["Brick-&-Steel.fountain", "Big-Fish.fountain", "Big-Fish-augmented.fountain"]) {
    it(`is byte-identical after importing ${name}`, async () => {
      const source = fixtureSource(name);
      const before = readFileSync(source);

      await importFrom(source);

      expect(readFileSync(source).equals(before)).toBe(true);
    });
  }

  it("is byte-identical even when the import normalised a great deal", async () => {
    // Every text normalisation at once: CRLF endings, trailing spaces, a run
    // of blank lines, and a decomposed é. None of it may reach the source.
    const source = sourceFile(
      "Messy.fountain",
      new TextEncoder().encode("Title: Café\r\n\r\n\r\n\r\nINT. ROOM - DAY   \r\n\r\nShe waits.\r\n"),
    );
    const before = readFileSync(source);

    const imported = await importFrom(source);

    expect(readFileSync(source).equals(before)).toBe(true);
    expect(imported.report.applied.length).toBeGreaterThan(0);
  });
});

describe("importing the same file twice", () => {
  it("makes two separate projects with different ids", async () => {
    const source = fixtureSource("Big-Fish.fountain");
    const ids = idsInOrder(A_PROJECT_ID, ANOTHER_PROJECT_ID);

    const first = await importFrom(source, ids);
    const second = await importFrom(source, ids);

    expect(first.bundlePath).not.toBe(second.bundlePath);
    expect(first.project.marker.projectId).toBe(A_PROJECT_ID);
    expect(second.project.marker.projectId).toBe(ANOTHER_PROJECT_ID);

    const folders = (await nodeFilesystem.readDirectory(projects)).map((entry) => entry.name);
    expect(folders.sort()).toEqual(["Big Fish", "Big Fish 2"]);
  });

  it("leaves the first project's manuscript untouched", async () => {
    const source = fixtureSource("Big-Fish.fountain");
    const ids = idsInOrder(A_PROJECT_ID, ANOTHER_PROJECT_ID);

    const first = await importFrom(source, ids);
    const before = readFileSync(join(first.bundlePath, MANUSCRIPT_FILE));
    await importFrom(source, ids);

    expect(readFileSync(join(first.bundlePath, MANUSCRIPT_FILE)).equals(before)).toBe(true);
  });
});

describe("a screenplay saved in another encoding", () => {
  /** What Windows Notepad writes when it saves as "Unicode". */
  function utf16le(text: string): Uint8Array {
    const bytes = new Uint8Array(2 + text.length * 2);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 0xfeff, true);
    for (let index = 0; index < text.length; index++) {
      view.setUint16(2 + index * 2, text.charCodeAt(index), true);
    }
    return bytes;
  }

  /** What an older Windows application writes. */
  function windows1252(text: string): Uint8Array {
    const map: Record<string, number> = { "’": 0x92, "é": 0xe9, "—": 0x97 };
    return new Uint8Array([...text].map((char) => map[char] ?? char.charCodeAt(0)));
  }

  const script = "Title: Café\n\nINT. ROOM - DAY\n\nShe’s waiting — still.\n";

  it("imports from UTF-16 with every character kept", async () => {
    const imported = await importFrom(sourceFile("Unicode.fountain", utf16le(script)));

    const manuscript = readFileSync(join(imported.bundlePath, MANUSCRIPT_FILE), "utf8");
    expect(manuscript).toContain("Café");
    expect(manuscript).toContain("She’s waiting — still.");
    expect(manuscript).not.toContain("�");
    expect(imported.project.marker.name).toBe("Café");
  });

  it("imports from windows-1252 with every character kept", async () => {
    const imported = await importFrom(sourceFile("Legacy.fountain", windows1252(script)));

    const manuscript = readFileSync(join(imported.bundlePath, MANUSCRIPT_FILE), "utf8");
    expect(manuscript).toContain("Café");
    expect(manuscript).toContain("She’s waiting — still.");
    expect(manuscript).not.toContain("�");
  });

  it("reports the conversion, so the writer is told (ADR-0020)", async () => {
    const imported = await importFrom(sourceFile("Unicode.fountain", utf16le(script)));

    const converted = imported.report.applied.find((one) => one.kind === "converted-to-utf-8");
    expect(converted?.count).toBe(script.length);
  });

  it("refuses nothing: a file that is not Fountain at all still opens (#33)", async () => {
    const imported = await importFrom(sourceFile("notes.fountain", new Uint8Array([0xff, 0x80, 0x41])));

    expect(imported.project.marker.name).toBe("notes");
    expect(readFileSync(join(imported.bundlePath, MANUSCRIPT_FILE)).length).toBeGreaterThan(0);
  });
});
