/**
 * Opening a project, with real files in a temporary folder — slice 1's third
 * testing seam (#37), and the front half of #39.
 *
 * **Opening is not importing** (`GLOSSARY.md`). An import brings a script
 * Write-ist has never seen into a new bundle, applying ADR-0020's enumerated
 * normalisations and reporting them. Opening a bundle Write-ist already holds
 * changes nothing at all: the manuscript is read and parsed as it stands, and
 * nothing is written. That distinction is the one this file exists to hold,
 * because the cheapest way to get it wrong is to reuse the importer and
 * quietly re-normalise a writer's file every time they open it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MANUSCRIPT_FILE } from "../../src/project/bundle.ts";
import { importProject } from "../../src/project/import.ts";
import { openProject } from "../../src/project/open.ts";
import { exportScreenplay } from "../../src/screenplay/import.ts";
import { readFixtureBytes } from "../support/files.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

let temporary: { path: string; remove: () => void };
let projects: string;

beforeEach(() => {
  temporary = temporaryDirectory();
  projects = join(temporary.path, "write-ist");
});

afterEach(() => temporary.remove());

/** Import a fixture, and answer the project it made. */
async function imported(fixture: string) {
  const sourcePath = join(temporary.path, fixture);
  writeFileSync(sourcePath, readFixtureBytes(fixture));
  return importProject(
    { filesystem: nodeFilesystem, newProjectId: () => "6ba7b810-9dad-11d1-80b4-00c04fd430c8" },
    { sourcePath, projectsDirectory: projects },
  );
}

describe("opening a project reads its manuscript", () => {
  it("parses the elements the bundle holds", async () => {
    const { project } = await imported("Brick-&-Steel.fountain");

    const opened = await openProject(nodeFilesystem, project);

    expect(opened.project).toEqual(project);
    expect(opened.document.elements.length).toBeGreaterThan(0);
    expect(opened.document.titlePage.map((field) => field.key)).toEqual([
      "Title",
      "Credit",
      "Author",
      "Source",
      "Draft date",
      "Contact",
    ]);
    expect(opened.manuscript.length).toBe(2_901);
  });

  it("gives back the document the import wrote, element for element", async () => {
    // The same model, reached two ways: once from the fixture through the
    // importer, once from the bundle through the opener. They have to agree, or
    // reopening a project is not "exactly as I left it" (#37, story 13).
    const { project } = await imported("Big-Fish-augmented.fountain");

    const opened = await openProject(nodeFilesystem, project);
    const manuscript = readFileSync(join(project.path, MANUSCRIPT_FILE));

    expect(exportScreenplay(opened.document)).toEqual(new Uint8Array(manuscript));
    expect(opened.document.comments.map((comment) => comment.id)).toEqual([
      "a1",
      "b1",
      "b2",
      "c1",
      "c2",
    ]);
  });

  it("changes nothing on disk", async () => {
    // #37, story 39: opening and saving without changing anything changes
    // nothing. This is the first half — opening alone writes nothing at all.
    const { project } = await imported("Brick-&-Steel.fountain");
    const path = join(project.path, MANUSCRIPT_FILE);
    const before = new Uint8Array(readFileSync(path));

    await openProject(nodeFilesystem, project);

    expect(new Uint8Array(readFileSync(path))).toEqual(before);
  });

  it("applies no normalisation, because opening is not importing", async () => {
    // A manuscript edited outside Write-ist, left un-normalised: trailing
    // whitespace, a tight action run. Opening it parses what is there and
    // reports nothing. Reconciling a file changed elsewhere is #42's, and
    // re-importing on every open would spend the writer's file on tidiness
    // ADR-0020 does not permit.
    const { project } = await imported("Brick-&-Steel.fountain");
    const path = join(project.path, MANUSCRIPT_FILE);
    const edited = ".INT. KITCHEN - DAY\n\nShe waits.   \nHe does not come.";
    writeFileSync(path, edited);

    const opened = await openProject(nodeFilesystem, project);

    expect(opened.document.elements.map((element) => element.text)).toEqual([
      "INT. KITCHEN - DAY",
      "She waits.   ",
      "He does not come.",
    ]);
    expect(new TextDecoder().decode(opened.manuscript)).toBe(edited);
  });

  it("refuses rather than inventing an empty screenplay when the read fails", async () => {
    // ADR-0008 rule 3, and the reason it exists: v1 initialised empty state
    // from a failed read and the next save wrote it over the good file. An
    // opener that resolved to an empty document would be that bug rebuilt.
    const { project } = await imported("Brick-&-Steel.fountain");

    await expect(
      openProject(nodeFilesystem, { ...project, path: join(projects, "not-a-bundle") }),
    ).rejects.toThrow();
  });
});
