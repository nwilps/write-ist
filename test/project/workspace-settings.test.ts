/**
 * A workspace's own settings (ADR-0045), where they are kept: per project, a
 * line each in `details.md`; for the application, `workspaceSettings` in
 * `settings.json`; and what a new project starts with, in New Project
 * Defaults. No workspace declares one today, so a file without any must read
 * and write exactly as it did — and one with them must keep them, a newer
 * workspace's too.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Project } from "../../src/project/bundle.ts";
import { createProject } from "../../src/project/create.ts";
import { parseDetails, readDetails, saveProjectDetails, serialiseDetails } from "../../src/project/details.ts";
import { DEFAULT_SETTINGS, settingsFrom, settingsText } from "../../src/settings/settings.ts";
import { settingValue, workspaceSettingValuesOf, type WorkspaceSetting } from "../../src/settings/workspace-settings.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

const WRAP: WorkspaceSetting = { id: "wrap", label: "Wrap Lines", place: "project", default: true };

describe("in details.md", () => {
  it("writes nothing for a project with none, so every file written before reads and writes as it did", () => {
    const text = serialiseDetails({ targetPages: 110, workspaces: ["editor", "notes"] });
    expect(text).toBe("# Project details\n\nTarget pages: 110\nWorkspaces: editor, notes\n");
    expect(parseDetails(text)).toEqual({ targetPages: 110, workspaces: ["editor", "notes"] });
  });

  it("is a line each, in order, read back as it was written", () => {
    const details = { targetPages: 0, workspaces: undefined, workspaceSettings: { sketch: { wrap: false, guides: true }, board: { grid: true } } };
    const text = serialiseDetails(details);
    expect(text.split("\n").filter((line) => line.startsWith("Setting"))).toEqual([
      "Setting board.grid: yes",
      "Setting sketch.guides: yes",
      "Setting sketch.wrap: no",
    ]);
    expect(parseDetails(text)).toEqual(details);
  });

  it("is put right quietly: a line that is not one is left out and reads as the default", () => {
    const parsed = parseDetails(
      ["# Project details", "Setting sketch.wrap: maybe", "Setting Sketch.Wrap: yes", "Setting sketch.wrap: NO", "Setting .x: yes", "Setting sketch.wrap: yes"].join("\n"),
    )!;
    // The first good line for a setting is the one kept, as for every other label.
    expect(parsed.workspaceSettings).toEqual({ sketch: { wrap: false } });
    expect(settingValue(parsed.workspaceSettings, "sketch", WRAP)).toBe(false);
    expect(settingValue(undefined, "sketch", WRAP)).toBe(true);
  });

  describe("saved from Edit Project Details", () => {
    let temporary: { path: string; remove: () => void };
    let project: Project;
    beforeEach(async () => {
      temporary = temporaryDirectory();
      project = await createProject({ filesystem: nodeFilesystem, newProjectId: () => "id-brick" }, join(temporary.path, "write-ist"), {
        title: "Brick & Steel",
        type: "Feature",
      });
    });
    afterEach(() => temporary.remove());

    it("changes the one asked for and keeps a setting this version does not offer", async () => {
      writeFileSync(join(project.path, "details.md"), "# Project details\n\nTarget pages: 90\nSetting later.thing: yes\n");
      await saveProjectDetails(nodeFilesystem, join(temporary.path, "write-ist"), project, {
        name: "Brick & Steel",
        format: "Feature",
        details: { targetPages: 90, workspaces: undefined, workspaceSettings: { sketch: { wrap: false } } },
      });
      expect(readFileSync(join(project.path, "details.md"), "utf8")).toBe(
        "# Project details\n\nTarget pages: 90\nSetting later.thing: yes\nSetting sketch.wrap: no\n",
      );
      expect((await readDetails(nodeFilesystem, project.path)).details.workspaceSettings).toEqual({ later: { thing: true }, sketch: { wrap: false } });
    });

    it("never writes over a details.md that will not read, for a setting either", async () => {
      writeFileSync(join(project.path, "details.md"), "not a heading in sight");
      await expect(
        saveProjectDetails(nodeFilesystem, join(temporary.path, "write-ist"), project, {
          name: "Brick & Steel",
          format: "Feature",
          details: { targetPages: 0, workspaces: undefined, workspaceSettings: { sketch: { wrap: false } } },
        }),
      ).rejects.toThrow(/could not be read/);
      expect(readFileSync(join(project.path, "details.md"), "utf8")).toBe("not a heading in sight");
    });
  });
});

describe("in settings.json", () => {
  it("is absent from a file with none, so the file is byte for byte what it was", () => {
    expect(settingsText(DEFAULT_SETTINGS)).not.toContain("workspaceSettings");
    expect(settingsFrom(JSON.parse(settingsText(DEFAULT_SETTINGS)))).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps the application's and the New Project Defaults' values, put right quietly", () => {
    const kept = settingsFrom({
      workspaceSettings: { sketch: { wrap: false, bad: "yes" }, "Not An Id": { x: true }, empty: {} },
      projectDefaults: { Feature: { workspaceSettings: { sketch: { guides: true } } } },
    });
    expect(kept.workspaceSettings).toEqual({ sketch: { wrap: false } });
    expect(kept.projectDefaults["Feature"]!.workspaceSettings).toEqual({ sketch: { guides: true } });
    expect(kept.projectDefaults["Short"]?.workspaceSettings).toBeUndefined();
    expect(settingsFrom(JSON.parse(settingsText(kept)))).toEqual(kept);
    expect(workspaceSettingValuesOf("nothing like it")).toEqual({});
  });
});
