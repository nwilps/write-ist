/**
 * Settings ▸ New Project Defaults, read (Noah, 2026-11-21: "saved but never
 * read"). New Project gives a new project the defaults of its type — its
 * target pages, workspaces and a screenplay's formatting in `details.md`, its daily goal in
 * `goals.md` — and the project keeps them as its own. An existing project is
 * never changed by them, and a later change in Settings reaches none.
 *
 * The formatting is then the project's look: its spacing on the paper, in the
 * page count and in the PDF; its bold on the paper only — the PDF's bold is
 * chosen in Export As, for one export at a time.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DETAILS_FILE, GOALS_FILE, MANUSCRIPT_FILE, MARKER_FILE } from "../../src/project/bundle.ts";
import { createProject } from "../../src/project/create.ts";
import {
  DEFAULT_DETAILS,
  formattingOf,
  parseDetails,
  readDetails,
  saveProjectDetails,
  serialiseDetails,
  workspaceShown,
} from "../../src/project/details.ts";
import { readGoals } from "../../src/goals/file.ts";
import { DEFAULT_FORMATTING, type Formatting } from "../../src/screenplay/formatting.ts";
import { layout } from "../../src/screenplay/layout.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { PLAIN_EMPHASIS, pdfPagesOf, printedPageCount, type PdfEmphasis } from "../../src/screenplay/pdf-pages.ts";
import { DEFAULT_PROJECT_DEFAULTS, DEFAULT_SETTINGS, type ProjectDefaults } from "../../src/settings/settings.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

let temporary: { path: string; remove: () => void };
let projects: string;
beforeEach(() => {
  temporary = temporaryDirectory();
  projects = join(temporary.path, "write-ist");
});
afterEach(() => temporary.remove());

let minted = 0;
const make = (title: string, defaults?: ProjectDefaults) =>
  createProject({ filesystem: nodeFilesystem, newProjectId: () => `id-${++minted}` }, projects, { title, type: "Feature" }, defaults);

const CHOSEN: ProjectDefaults = {
  shown: true,
  dailyGoalOn: true,
  dailyGoal: 750,
  targetPages: 110,
  boldSceneHeadings: true,
  boldTransitions: true,
  blankLinesBeforeSceneHeadings: 1,
};

describe("New Project, given the type's defaults", () => {
  it("starts the project with its target pages and formatting in details.md", async () => {
    const project = await make("Paper Boats", CHOSEN);
    const { details, readable } = await readDetails(nodeFilesystem, project.path);
    expect(readable).toBe(true);
    expect(details.targetPages).toBe(110);
    expect(details.formatting).toEqual({ boldSceneHeadings: true, boldTransitions: true, blankLinesBeforeSceneHeadings: 1 });
    expect(readFileSync(join(project.path, DETAILS_FILE), "utf8")).toBe(
      "# Project details\n\nTarget pages: 110\nBold scene headings: yes\nBold transitions: yes\nBlank lines before scene headings: 1\n",
    );
  });

  it("starts the project with the type's workspaces in details.md, and every one when none were chosen", async () => {
    const chosen = await make("Notes Only", { ...CHOSEN, workspaces: ["editor", "notes"] });
    const { details } = await readDetails(nodeFilesystem, chosen.path);
    expect(details.workspaces).toEqual(["editor", "notes"]);
    expect(readFileSync(join(chosen.path, DETAILS_FILE), "utf8")).toContain("Workspaces: editor, notes\n");
    expect(workspaceShown(details, "plan", false)).toBe(false);
    expect(workspaceShown(details, "notes", false)).toBe(true);
    // The Editor is always on, whatever the list says.
    expect(workspaceShown({ ...details, workspaces: [] }, "editor", true)).toBe(true);

    const never = await make("Every One", CHOSEN);
    const read = (await readDetails(nodeFilesystem, never.path)).details;
    expect(read.workspaces).toBeUndefined();
    expect(readFileSync(join(never.path, DETAILS_FILE), "utf8")).not.toContain("Workspaces");
    expect(["notes", "plan"].every((id) => workspaceShown(read, id, false))).toBe(true);
  });

  it("starts it with the daily goal when that is on, and with no goal file when it is off", async () => {
    const on = await make("Goal On", CHOSEN);
    expect((await readGoals(nodeFilesystem, on)).goal).toBe(750);
    const off = await make("Goal Off", { ...CHOSEN, dailyGoalOn: false });
    expect(existsSync(join(off.path, GOALS_FILE))).toBe(false);
    expect((await readGoals(nodeFilesystem, off)).goal).toBeUndefined();
  });

  it("writes the marker last, so the folder is not a project until everything else is there", async () => {
    const written: string[] = [];
    const watching = { ...nodeFilesystem, writeFile: async (path: string, bytes: Uint8Array) => {
      written.push(path.split(/[\\/]/).at(-1)!);
      return nodeFilesystem.writeFile(path, bytes);
    } };
    await createProject({ filesystem: watching, newProjectId: () => "id-x" }, projects, { title: "Order", type: "Feature" }, CHOSEN);
    expect(written).toEqual([MANUSCRIPT_FILE, DETAILS_FILE, GOALS_FILE, MARKER_FILE]);
  });

  it("gives Settings' own defaults: no target, no goal, two lines before a heading, and bold on the paper", async () => {
    const project = await make("Plain", DEFAULT_SETTINGS.projectDefaults["Feature"]);
    const { details } = await readDetails(nodeFilesystem, project.path);
    expect(details.targetPages).toBe(0);
    // A new project's paper draws both bold (Noah, 2026-11-22); the PDF's are Export As's.
    expect(formattingOf(details)).toEqual({ boldSceneHeadings: true, boldTransitions: true, blankLinesBeforeSceneHeadings: 2 });
    expect(DEFAULT_PROJECT_DEFAULTS.blankLinesBeforeSceneHeadings).toBe(2);
    expect(existsSync(join(project.path, GOALS_FILE))).toBe(false);
  });
});

describe("a project keeps its own values", () => {
  it("whatever Settings says later: the defaults are read once, when it is made", async () => {
    let settings: ProjectDefaults = CHOSEN;
    const project = await make("Kept", settings);
    settings = { ...settings, targetPages: 90, boldTransitions: false, blankLinesBeforeSceneHeadings: 2 };
    const { details } = await readDetails(nodeFilesystem, project.path);
    expect(details.targetPages).toBe(110);
    expect(formattingOf(details)).toEqual({ boldSceneHeadings: true, boldTransitions: true, blankLinesBeforeSceneHeadings: 1 });
    expect(settings.targetPages).toBe(90);
  });

  it("through Edit Project Details, which changes the target and keeps the formatting it does not offer", async () => {
    const project = await make("Edited", CHOSEN);
    const saved = await saveProjectDetails(nodeFilesystem, projects, project, {
      name: "Edited",
      format: "Feature",
      details: { targetPages: 95, workspaces: undefined },
    });
    expect(saved.details.targetPages).toBe(95);
    const { details } = await readDetails(nodeFilesystem, project.path);
    expect(details).toEqual({ targetPages: 95, workspaces: undefined, formatting: formattingOf(details) });
    expect(formattingOf(details)).toEqual({ boldSceneHeadings: true, boldTransitions: true, blankLinesBeforeSceneHeadings: 1 });
  });

  it("and an existing project — made before, with no details — is never given any", async () => {
    const existing = await make("Before");
    expect(await nodeFilesystem.exists(join(existing.path, DETAILS_FILE))).toBe(false);
    await make("After", CHOSEN);
    expect(await nodeFilesystem.exists(join(existing.path, DETAILS_FILE))).toBe(false);
    expect(formattingOf((await readDetails(nodeFilesystem, existing.path)).details)).toEqual(DEFAULT_FORMATTING);
  });
});

describe("the formatting in details.md", () => {
  it("is absent from a file that never chose, which reads as the paper always was", () => {
    expect(serialiseDetails(DEFAULT_DETAILS)).toBe("# Project details\n\nTarget pages: none\n");
    expect(parseDetails("# Project details\n\nTarget pages: none\n")?.formatting).toBeUndefined();
    // As the paper always drew it: headings bold, transitions regular.
    expect(formattingOf(DEFAULT_DETAILS)).toEqual({ boldSceneHeadings: true, boldTransitions: false, blankLinesBeforeSceneHeadings: 2 });
  });

  it("reads back as written, and puts a hand-edited value right quietly", () => {
    const formatting: Formatting = { boldSceneHeadings: false, boldTransitions: true, blankLinesBeforeSceneHeadings: 2 };
    const text = serialiseDetails({ targetPages: 0, workspaces: undefined, formatting });
    expect(parseDetails(text)?.formatting).toEqual(formatting);
    // A line that is missing is the paper as it always was: headings bold.
    expect(parseDetails("# x\nBold transitions: YES\nBlank lines before scene headings: 7\n")?.formatting).toEqual({
      boldSceneHeadings: true,
      boldTransitions: true,
      blankLinesBeforeSceneHeadings: 2,
    });
  });
});

/** Sixty short scenes: enough headings for the gap above them to move a page (8 pages to 7). */
const SCENES = Array.from({ length: 60 }, (_, at) => `INT. ROOM ${at} - DAY\n\nSomebody waits.\n\nCUT TO:\n`).join("\n");

describe("the formatting, set", () => {
  const one: Formatting = { ...DEFAULT_FORMATTING, blankLinesBeforeSceneHeadings: 1 };

  it("leaves a project that never chose exactly as the paper and the PDF were", () => {
    const document = parse(SCENES);
    expect(layout(document, undefined, undefined, DEFAULT_FORMATTING)).toEqual(layout(document));
    expect(pdfPagesOf(document, DEFAULT_FORMATTING)).toEqual(pdfPagesOf(document));
  });

  it("puts one blank line above a scene heading for 1, on the pages and in the count", () => {
    const document = parse(SCENES);
    const two = layout(document);
    const single = layout(document, undefined, undefined, one);
    // The rows between "CUT TO:" and the next heading: three for 2, two for 1.
    const gapAbove = (laid: typeof two) => {
      const lines = laid.pages[0]!.lines;
      const heading = lines.findIndex((line, at) => at > 0 && line.text.startsWith("INT. ROOM 1 "));
      return lines[heading]!.row - lines[heading - 1]!.row - 1;
    };
    expect(gapAbove(two)).toBe(2);
    expect(gapAbove(single)).toBe(1);
    expect([two.totalPages, single.totalPages]).toEqual([8, 7]);
    expect(printedPageCount(document, one)).toBe(single.totalPages);
  });

  it("is the same laid out a page at a time as all at once", () => {
    const document = parse(SCENES);
    const full = layout(document, undefined, undefined, one);
    const edited = parse(SCENES.replace("Somebody waits.", "Somebody waits a long while."));
    const again = layout(edited, full, 1, one);
    expect(again.totalPages).toBe(layout(edited, undefined, undefined, one).totalPages);
    expect(again.pages.map((page) => page.lines)).toEqual(layout(edited, undefined, undefined, one).pages.map((page) => page.lines));
  });

  it("never prints the project's bold in the PDF: headings and transitions are regular unless the export asks", () => {
    const document = parse(SCENES);
    const boldOf = (pages: ReturnType<typeof pdfPagesOf>, text: string) => pages.pages[0]!.find((run) => run.text.startsWith(text))!.bold;
    const both: Formatting = { ...DEFAULT_FORMATTING, boldSceneHeadings: true, boldTransitions: true };
    const neither: Formatting = { ...DEFAULT_FORMATTING, boldSceneHeadings: false, boldTransitions: false };
    for (const formatting of [both, neither, DEFAULT_FORMATTING]) {
      const plain = pdfPagesOf(document, formatting);
      expect([boldOf(plain, "INT. ROOM 0"), boldOf(plain, "CUT TO:")]).toEqual([false, false]);
      // The project's bold changes nothing in the PDF at all.
      expect(plain).toEqual(pdfPagesOf(document, DEFAULT_FORMATTING));
    }
  });

  it("prints headings, transitions or both bold when the export asks, and nothing else", () => {
    const document = parse(SCENES);
    const pdf = (emphasis: PdfEmphasis) => pdfPagesOf(document, DEFAULT_FORMATTING, emphasis);
    const boldOf = (emphasis: PdfEmphasis, text: string) => pdf(emphasis).pages[0]!.find((run) => run.text.startsWith(text))!.bold;
    const said = (emphasis: PdfEmphasis) => [boldOf(emphasis, "INT. ROOM 0"), boldOf(emphasis, "CUT TO:"), boldOf(emphasis, "Somebody")];
    expect(said(PLAIN_EMPHASIS)).toEqual([false, false, false]);
    expect(said({ boldSceneHeadings: true, boldTransitions: false })).toEqual([true, false, false]);
    expect(said({ boldSceneHeadings: false, boldTransitions: true })).toEqual([false, true, false]);
    expect(said({ boldSceneHeadings: true, boldTransitions: true })).toEqual([true, true, false]);
    expect(pdfPagesOf(document)).toEqual(pdf(PLAIN_EMPHASIS));
  });

  it("moves no line and no page with bold, on the paper or in the PDF", () => {
    const document = parse(SCENES);
    const where = (pages: ReturnType<typeof pdfPagesOf>) => pages.pages.map((page) => page.map((run) => [run.text, run.x, run.y]));
    const plain = pdfPagesOf(document);
    const bold = pdfPagesOf(document, DEFAULT_FORMATTING, { boldSceneHeadings: true, boldTransitions: true });
    expect(where(bold)).toEqual(where(plain));
    expect(bold.pages.length).toBe(plain.pages.length);
    // The paper: the project's bold is not an input to the layout, so every break is where it was.
    const paper = (formatting: Formatting) => layout(document, undefined, undefined, formatting);
    const neither = paper({ ...DEFAULT_FORMATTING, boldSceneHeadings: false, boldTransitions: false });
    const both = paper({ ...DEFAULT_FORMATTING, boldSceneHeadings: true, boldTransitions: true });
    expect(both.pagination).toEqual(neither.pagination);
    expect(both.totalPages).toBe(neither.totalPages);
    // And the paper's page count is the PDF's.
    expect(printedPageCount(document)).toBe(plain.pages.length);
    expect(both.totalPages).toBe(plain.pages.length);
  });
});
