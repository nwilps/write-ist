/**
 * Saving a copy as Fountain, with real files in a temporary folder (step 7).
 *
 * The assertions are about files: what lands at the chosen path, and what the
 * manuscript and the rest of the bundle hold afterwards.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MANUSCRIPT_FILE } from "../../src/project/bundle.ts";
import { saveFountainCopy, suggestedCopyName } from "../../src/project/copy.ts";
import { importProject } from "../../src/project/import.ts";
import { openProject } from "../../src/project/open.ts";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { readFixtureBytes } from "../support/files.ts";
import type { Filesystem } from "../../src/project/filesystem.ts";

let temporary: { path: string; remove: () => void };
beforeEach(() => void (temporary = temporaryDirectory()));
afterEach(() => temporary.remove());

async function project() {
  const source = join(temporary.path, "Big Fish.fountain");
  writeFileSync(source, readFixtureBytes("Big-Fish.fountain"));
  const imported = await importProject(
    { filesystem: nodeFilesystem, newProjectId: () => "3f2a1c44-0000-4000-8000-0123456789ab" },
    { sourcePath: source, projectsDirectory: join(temporary.path, "write-ist") },
  );
  return await openProject(nodeFilesystem, imported.project);
}

const WITH_REMARKS = "Hi [[c:a1 secret remark]]there[[/c:a1]].\n\n/*\ncut words\n*/\n\nEnd.\n";

describe("saving a copy as Fountain", () => {
  it("writes the copy where the writer chose, without comments or boneyard", async () => {
    const opened = await project();
    const elsewhere = join(temporary.path, "Elsewhere");
    await nodeFilesystem.createDirectory(elsewhere);
    const destination = join(elsewhere, "Big Fish.fountain");

    await saveFountainCopy(nodeFilesystem, opened.project, parse(WITH_REMARKS), destination);

    expect(readFileSync(destination, "utf8")).toBe("Hi there.\n\nEnd.\n");
  });

  it("leaves the manuscript on disk byte for byte as it was", async () => {
    const opened = await project();
    const manuscript = join(opened.project.path, MANUSCRIPT_FILE);
    const before = readFileSync(manuscript);
    const folder = readdirSync(opened.project.path).sort();

    await saveFountainCopy(
      nodeFilesystem,
      opened.project,
      parse(WITH_REMARKS),
      join(temporary.path, "copy.fountain"),
    );

    expect(readFileSync(manuscript).equals(before)).toBe(true);
    expect(readdirSync(opened.project.path).sort()).toEqual(folder);
  });

  it("exports the current state of an unsaved edit, and saves nothing as a side effect", async () => {
    const opened = await project();
    const manuscript = join(opened.project.path, MANUSCRIPT_FILE);
    const before = readFileSync(manuscript);
    // The model the editor holds right now, edited and not yet saved.
    const state = editorStateFor(parse("Unsaved edit only on screen.\n"));
    const destination = join(temporary.path, "unsaved.fountain");

    await saveFountainCopy(nodeFilesystem, opened.project, manuscriptOf(state.doc), destination);

    expect(readFileSync(destination, "utf8")).toContain("Unsaved edit only on screen.");
    expect(readFileSync(manuscript).equals(before)).toBe(true);
  });

  it("refuses to write over the project's own manuscript", async () => {
    const opened = await project();
    const manuscript = join(opened.project.path, MANUSCRIPT_FILE);
    const before = readFileSync(manuscript);

    await expect(
      saveFountainCopy(nodeFilesystem, opened.project, parse(WITH_REMARKS), manuscript),
    ).rejects.toThrow(/own manuscript/);

    expect(readFileSync(manuscript).equals(before)).toBe(true);
  });

  it("reports a failed write rather than swallowing it, and leaves nothing under the name", async () => {
    const opened = await project();
    const failing: Filesystem = {
      ...nodeFilesystem,
      writeFile: async () => {
        throw new Error("disk full");
      },
    };
    const destination = join(temporary.path, "never.fountain");

    await expect(
      saveFountainCopy(failing, opened.project, parse(WITH_REMARKS), destination),
    ).rejects.toThrow("disk full");
    expect(existsSync(destination)).toBe(false);
  });

  it("replaces an earlier copy whole", async () => {
    const opened = await project();
    const destination = join(temporary.path, "copy.fountain");
    writeFileSync(destination, "old old old old old old old old old old old old\n");

    await saveFountainCopy(nodeFilesystem, opened.project, parse("New.\n"), destination);

    expect(readFileSync(destination, "utf8")).toBe("New.\n");
  });
});

describe("the name offered", () => {
  it("is the project's name with .fountain", async () => {
    const opened = await project();
    expect(suggestedCopyName(opened.project)).toBe("Big Fish.fountain");
  });

  it("leaves out characters a file name cannot hold", () => {
    const named = (name: string) => suggestedCopyName({ path: "/p", marker: { name } } as never);
    expect(named('A/B: "C"?')).toBe("AB C.fountain");
    expect(named("   ")).toBe("Untitled.fountain");
  });
});

