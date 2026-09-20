/**
 * The projects screen's list, against real folders in a temporary one.
 *
 * The rule under test is ADR-0015's, and it is a rule about what the
 * application *declines* to do: a folder with no readable marker is not a
 * project, is not listed, and is never written into.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importProject } from "../../src/project/import.ts";
import { MANUSCRIPT_FILE, MARKER_FILE, folderNameFor } from "../../src/project/bundle.ts";
import { FORMAT_VERSION, parseMarker, serialiseMarker } from "../../src/project/marker.ts";
import { listProjects } from "../../src/project/projects.ts";
import type { Project } from "../../src/project/bundle.ts";
import { readFixtureBytes } from "../support/files.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

let temporary: { path: string; remove: () => void };
let projects: string;

beforeEach(() => {
  temporary = temporaryDirectory();
  projects = join(temporary.path, "write-ist");
  mkdirSync(projects, { recursive: true });
});

afterEach(() => temporary.remove());

/** Just the projects, for the assertions that are about what is listed. */
async function listed(): Promise<readonly Project[]> {
  return (await listProjects(nodeFilesystem, projects)).projects;
}

/** Just the folders declined, for the assertions that are about ADR-0008 rule 4. */
async function declined(): Promise<readonly string[]> {
  return (await listProjects(nodeFilesystem, projects)).unreadable;
}

/** A folder in the default location holding exactly the files given. */
function folder(name: string, files: Record<string, string> = {}): string {
  const path = join(projects, name);
  mkdirSync(path, { recursive: true });
  for (const [file, contents] of Object.entries(files)) {
    writeFileSync(join(path, file), contents);
  }
  return path;
}

function markerFor(name: string, projectId: string): string {
  return serialiseMarker({ name, formatVersion: FORMAT_VERSION, projectId, format: "Feature" });
}

/** Everything inside a folder, with each file's size — a fingerprint to compare. */
function contentsOf(path: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const name of readdirSync(path)) result[name] = statSync(join(path, name)).size;
  return result;
}

describe("listing the default location", () => {
  it("is empty on a first run, when the location does not exist yet", async () => {
    const listing = await listProjects(nodeFilesystem, join(temporary.path, "never-created"));
    expect(listing).toEqual({ projects: [], unreadable: [] });
  });

  it("lists a folder holding a readable marker", async () => {
    folder("The Pilot", { [MARKER_FILE]: markerFor("The Pilot", "id-1") });

    const found = await listed();

    expect(found).toEqual([
      {
        path: join(projects, "The Pilot"),
        marker: {
          name: "The Pilot",
          formatVersion: FORMAT_VERSION,
          projectId: "id-1",
          format: "Feature",
        },
      },
    ]);
  });

  it("lists the writer's name for a project, not the folder's", async () => {
    // The folder was renamed by hand, or deduplicated at import. The marker is
    // what says which project this is (ADR-0015).
    folder("Big Fish 2", { [MARKER_FILE]: markerFor("Big Fish", "id-1") });

    const found = await listed();

    expect(found[0]?.marker.name).toBe("Big Fish");
    expect(found[0]?.path).toBe(join(projects, "Big Fish 2"));
  });

  it("sorts by name without case, so the order never depends on the filesystem", async () => {
    folder("c", { [MARKER_FILE]: markerFor("charlie", "id-3") });
    folder("a", { [MARKER_FILE]: markerFor("Alpha", "id-1") });
    folder("b", { [MARKER_FILE]: markerFor("bravo", "id-2") });

    const found = await listed();

    expect(found.map((project) => project.marker.name)).toEqual(["Alpha", "bravo", "charlie"]);
  });
});

describe("a folder that is not a bundle", () => {
  const notBundles: readonly (readonly [string, Record<string, string>])[] = [
    ["has no marker at all", { "manuscript.fountain": "INT. ROOM - DAY\n" }],
    ["is empty", {}],
    ["has a marker that is not one", { [MARKER_FILE]: "# Notes\n\nJust my notes.\n" }],
    ["has a marker missing its id", { [MARKER_FILE]: "# The Pilot\n\nFormat: Feature\n" }],
    [
      "has a marker naming a format Write-ist does not know",
      { [MARKER_FILE]: markerFor("The Pilot", "id-1").replace("Feature", "Stage Play") },
    ],
    ["has a marker with no name", { [MARKER_FILE]: markerFor("", "id-1") }],
  ];

  for (const [description, files] of notBundles) {
    it(`is not listed when it ${description}`, async () => {
      folder("Ambiguous", files);
      expect(await listed()).toEqual([]);
    });

    it(`is left untouched when it ${description}`, async () => {
      const path = folder("Ambiguous", files);
      const before = contentsOf(path);

      await listProjects(nodeFilesystem, projects);

      expect(contentsOf(path)).toEqual(before);
    });
  }

  it("does not stop the projects around it from being listed", async () => {
    folder("Ambiguous", {});
    folder("The Pilot", { [MARKER_FILE]: markerFor("The Pilot", "id-1") });

    const found = await listed();

    expect(found.map((project) => project.marker.name)).toEqual(["The Pilot"]);
  });

  it("is not listed when a loose file sits in the default location", async () => {
    writeFileSync(join(projects, "stray.fountain"), "INT. ROOM - DAY\n");
    expect(await listed()).toEqual([]);
  });
});

describe("absent and unparseable are different (ADR-0016, ADR-0008 rule 4)", () => {
  // A folder with no marker is not a project and is not mentioned: most
  // folders in `Documents` are not projects, and naming them all would be
  // noise. A folder that *has* a marker Write-ist cannot read is a
  // project-shaped thing that went wrong, and must fail loudly.
  it("says nothing about a folder with no marker", async () => {
    folder("Holiday photos", {});
    folder("Tax", { "return.pdf": "not a screenplay" });

    expect(await declined()).toEqual([]);
  });

  it("says nothing about the writer's v1 bundles, which carry project.json", async () => {
    // The real case: three of these sit in the writer's own default location.
    folder("In the Wake of August", { "project.json": '{"name":"In the Wake of August"}' });

    expect(await listed()).toEqual([]);
    expect(await declined()).toEqual([]);
  });

  it("says nothing about a hidden folder, whatever is in it", async () => {
    // The real case: the writer's own `.catalog-snapshot` sits in the default
    // location. A hidden folder is never a project, so it is never read and
    // never mentioned.
    folder(".catalog-snapshot", { [MARKER_FILE]: "not a marker" });

    expect(await listed()).toEqual([]);
    expect(await declined()).toEqual([]);
  });

  it("names a folder whose marker will not parse", async () => {
    folder("Broken", { [MARKER_FILE]: "# The Pilot\n\nFormat: Feature\n" });

    expect(await declined()).toEqual(["Broken"]);
    expect(await listed()).toEqual([]);
  });

  it("names a folder whose marker is not text at all", async () => {
    const path = folder("Corrupt");
    writeFileSync(join(path, MARKER_FILE), Buffer.from([0x00, 0xff, 0xfe, 0x41, 0x00]));

    expect(await declined()).toEqual(["Corrupt"]);
  });

  it("names every such folder, in a settled order, beside the projects that are fine", async () => {
    folder("Zebra", { [MARKER_FILE]: "not a marker" });
    folder("Apple", { [MARKER_FILE]: "not a marker either" });
    folder("The Pilot", { [MARKER_FILE]: markerFor("The Pilot", "id-1") });

    expect(await declined()).toEqual(["Apple", "Zebra"]);
    expect((await listed()).map((project) => project.marker.name)).toEqual(["The Pilot"]);
  });

  it("still never writes into the folder it named", async () => {
    const path = folder("Broken", { [MARKER_FILE]: "# The Pilot\n\nFormat: Feature\n" });
    const before = contentsOf(path);

    await listProjects(nodeFilesystem, projects);

    expect(contentsOf(path)).toEqual(before);
  });
});

describe("importing where a folder of that name already sits", () => {
  // #38: a folder that is not a bundle "is never written into". The listing
  // half of that is above; this is the writing half, and it is the half that
  // could destroy something — the folder may be the writer's own.
  it("leaves a same-named folder that is not a bundle completely alone", async () => {
    const existing = folder("Big Fish", {
      "notes.txt": "my notes about the film",
      "draft.fountain": "INT. SOMEWHERE - DAY\n",
    });
    const before = contentsOf(existing);

    const source = join(temporary.path, "Big-Fish.fountain");
    writeFileSync(source, readFixtureBytes("Big-Fish.fountain"));
    const imported = await importProject(
      { filesystem: nodeFilesystem, newProjectId: () => "minted-id" },
      { sourcePath: source, projectsDirectory: projects },
    );

    expect(imported.bundlePath).toBe(join(projects, "Big Fish 2"));
    expect(contentsOf(existing)).toEqual(before);
    expect((await listed()).map((project) => project.marker.name)).toEqual(["Big Fish"]);
  });

  it("leaves a same-named project alone and makes a second one", async () => {
    const source = join(temporary.path, "Big-Fish.fountain");
    writeFileSync(source, readFixtureBytes("Big-Fish.fountain"));

    const first = await importProject(
      { filesystem: nodeFilesystem, newProjectId: () => "id-1" },
      { sourcePath: source, projectsDirectory: projects },
    );
    const before = contentsOf(first.bundlePath);

    const second = await importProject(
      { filesystem: nodeFilesystem, newProjectId: () => "id-2" },
      { sourcePath: source, projectsDirectory: projects },
    );

    expect(second.bundlePath).not.toBe(first.bundlePath);
    expect(contentsOf(first.bundlePath)).toEqual(before);
    expect((await listed()).map((project) => project.marker.projectId).sort()).toEqual([
      "id-1",
      "id-2",
    ]);
  });
});

describe("what import leaves for the list to find", () => {
  it("appears in the list straight away, with the id it was given", async () => {
    const source = join(temporary.path, "Big-Fish.fountain");
    writeFileSync(source, readFixtureBytes("Big-Fish.fountain"));

    const imported = await importProject(
      { filesystem: nodeFilesystem, newProjectId: () => "minted-id" },
      { sourcePath: source, projectsDirectory: projects },
    );

    const found = await listed();
    expect(found).toEqual([imported.project]);
    expect(found[0]?.marker.projectId).toBe("minted-id");
  });

  it("reopens as exactly the manuscript that was written", async () => {
    const source = join(temporary.path, "Brick-&-Steel.fountain");
    writeFileSync(source, readFixtureBytes("Brick-&-Steel.fountain"));

    const imported = await importProject(
      { filesystem: nodeFilesystem, newProjectId: () => "minted-id" },
      { sourcePath: source, projectsDirectory: projects },
    );

    const [only] = await listed();
    const manuscript = await nodeFilesystem.readFile(join(only!.path, MANUSCRIPT_FILE));
    expect(manuscript.length).toBe(2_901);
  });
});

describe("the marker itself", () => {
  it("round-trips everything it holds", () => {
    const marker = {
      name: "BRICK & STEEL FULL RETIRED",
      formatVersion: FORMAT_VERSION,
      projectId: "9c5b94b1-35ad-49bb-b118-8e8fc24abf80",
      format: "Feature",
    } as const;

    expect(parseMarker(serialiseMarker(marker))).toEqual(marker);
  });

  it("round-trips a name with a colon in it", () => {
    const marker = {
      name: "Big Fish: A Story",
      formatVersion: FORMAT_VERSION,
      projectId: "id-1",
      format: "Feature",
    } as const;

    expect(parseMarker(serialiseMarker(marker))).toEqual(marker);
  });

  it("reads a marker written with Windows line endings", () => {
    const text = serialiseMarker({
      name: "The Pilot",
      formatVersion: FORMAT_VERSION,
      projectId: "id-1",
      format: "Feature",
    }).replace(/\n/g, "\r\n");

    expect(parseMarker(text)?.projectId).toBe("id-1");
  });
});

describe("naming a project's folder", () => {
  it("uses the project's name when it can", () => {
    expect(folderNameFor("The Pilot", new Set())).toBe("The Pilot");
  });

  it("numbers a name already taken, so an import never lands on another project", () => {
    expect(folderNameFor("Big Fish", new Set(["Big Fish"]))).toBe("Big Fish 2");
    expect(folderNameFor("Big Fish", new Set(["Big Fish", "Big Fish 2"]))).toBe("Big Fish 3");
  });

  it("treats two names differing only in case as taken", () => {
    // One folder on macOS and on Windows, whatever Linux thinks.
    expect(folderNameFor("big fish", new Set(["Big Fish"]))).toBe("big fish 2");
  });

  it("drops characters a folder may not carry", () => {
    expect(folderNameFor('INT/EXT: "The Car"', new Set())).toBe("INT EXT The Car");
  });

  it("falls back to Untitled when nothing usable is left", () => {
    expect(folderNameFor("///", new Set())).toBe("Untitled");
    expect(folderNameFor("   ", new Set())).toBe("Untitled");
  });

  it("never ends in a dot or a space, which Windows would silently drop", () => {
    expect(folderNameFor("Episode 1.", new Set())).toBe("Episode 1");
  });

  it("shortens a name too long for a path", () => {
    expect(folderNameFor("A".repeat(300), new Set())).toHaveLength(80);
  });
});
