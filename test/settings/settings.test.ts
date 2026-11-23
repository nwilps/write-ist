/**
 * The writer's settings file: every value put right on the way in, quietly,
 * and a file that is there and cannot be read never written over (ADR-0008
 * rule 3). Real files in a temporary folder; every name here is invented.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  MOST_BINDINGS,
  MOST_PAGES,
  MOST_WORDS,
  openSettingsStore,
  penNamesFrom,
  SETTINGS_FILE,
  settingsFrom,
  settingsText,
  timeFrom,
  timeSaid,
  wholeNumber,
} from "../../src/settings/settings.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

describe("a time of day, as the writer types it", () => {
  it.each([
    ["12:00 AM", { hour: 0, minute: 0 }],
    ["12:01 am", { hour: 0, minute: 1 }],
    ["12:01AM", { hour: 0, minute: 1 }],
    ["0:01", { hour: 0, minute: 1 }],
    ["00:01", { hour: 0, minute: 1 }],
    ["4am", { hour: 4, minute: 0 }],
    ["4 p.m.", { hour: 16, minute: 0 }],
    ["12 pm", { hour: 12, minute: 0 }],
    ["16:30", { hour: 16, minute: 30 }],
    ["1630", { hour: 16, minute: 30 }],
    ["  23:59  ", { hour: 23, minute: 59 }],
  ])("reads %j", (typed, time) => {
    expect(timeFrom(typed)).toEqual(time);
  });

  it.each(["", "noon", "24:00", "13pm", "0am", "4:60", "4:5", "-1", "four"])("is not a time: %j", (typed) => {
    expect(timeFrom(typed)).toBeUndefined();
  });

  it("is said in twelve hours, as the notes write it", () => {
    expect(timeSaid({ hour: 0, minute: 0 })).toBe("12:00 AM");
    expect(timeSaid({ hour: 0, minute: 1 })).toBe("12:01 AM");
    expect(timeSaid({ hour: 12, minute: 0 })).toBe("12:00 PM");
    expect(timeSaid({ hour: 16, minute: 5 })).toBe("4:05 PM");
    // Said and read back, it is the same time.
    for (let hour = 0; hour < 24; hour++) expect(timeFrom(timeSaid({ hour, minute: 7 }))).toEqual({ hour, minute: 7 });
  });
});

describe("putting a value right", () => {
  it("rounds, holds to the range, and falls back for blank or not a number", () => {
    expect(wholeNumber("499.6", 1, MOST_WORDS, 500)).toBe(500);
    expect(wholeNumber("-3", 0, MOST_PAGES, 7)).toBe(0);
    expect(wholeNumber("9999999", 1, MOST_WORDS, 500)).toBe(MOST_WORDS);
    expect(wholeNumber("", 1, MOST_WORDS, 500)).toBe(500);
    expect(wholeNumber("words", 1, MOST_WORDS, 500)).toBe(500);
    expect(wholeNumber(120, 0, MOST_PAGES, 0)).toBe(120);
  });

  it("keeps pen names trimmed, without blanks, and each once", () => {
    expect(penNamesFrom(" Ada Quill, , J. Tern ,ada quill")).toEqual(["Ada Quill", "J. Tern"]);
    expect(penNamesFrom(["Ada Quill", 4, "  "])).toEqual(["Ada Quill"]);
    expect(penNamesFrom(undefined)).toEqual([]);
  });
});

describe("settings from anything at all", () => {
  it("are the defaults for nothing, and for what is not settings", () => {
    for (const nothing of [undefined, null, 4, "settings", [], {}]) expect(settingsFrom(nothing)).toEqual(DEFAULT_SETTINGS);
  });

  it("start the day at midnight, the code's default, with rounded corners and every project type shown", () => {
    expect(DEFAULT_SETTINGS.dayEndsAt).toEqual({ hour: 0, minute: 0 });
    expect(DEFAULT_SETTINGS.appearance).toEqual({
      theme: "dark",
      whitePaper: false,
      interfaceCorners: "rounded",
      paperCorners: "rounded",
      backgroundAnimation: true,
      backgroundMotion: "reactive",
      backgroundPreset: "field",
    });
    // Every type New Project lists, the coming ones too (Noah: "Show all types right now").
    expect(Object.keys(DEFAULT_SETTINGS.projectDefaults)).toEqual(["Feature", "Episode", "Short Film", "Novel", "Short Story", "Novella", "Flash Fiction", "Poem"]);
    expect(DEFAULT_SETTINGS.keyBindings).toEqual({});
    expect(Object.values(DEFAULT_SETTINGS.projectDefaults).every((defaults) => defaults.shown)).toBe(true);
  });

  it("keep what is right and put the rest back to its default, part by part", () => {
    const kept = settingsFrom({
      author: { name: "  Paper Boats Writer ", penNames: "A. Quill, A. Quill", email: 7 },
      dayEndsAt: { hour: 4, minute: 30 },
      appearance: { theme: "neon", whitePaper: "yes", interfaceCorners: "sharp", paperCorners: "curly" },
      projectDefaults: {
        Feature: { shown: false, dailyGoal: 1e9, targetPages: 110.4, blankLinesBeforeSceneHeadings: 2, boldTransitions: true },
        Novel: { shown: false },
        Epic: { shown: false },
      },
    });
    expect(kept.author).toEqual({ name: "Paper Boats Writer", penNames: ["A. Quill"], email: "", phone: "", address: "" });
    expect(kept.dayEndsAt).toEqual({ hour: 4, minute: 30 });
    expect(kept.appearance).toEqual({
      theme: "dark",
      whitePaper: false,
      interfaceCorners: "sharp",
      paperCorners: "rounded",
      backgroundAnimation: true,
      backgroundMotion: "reactive",
      backgroundPreset: "field",
    });
    expect(kept.projectDefaults["Feature"]).toEqual({
      shown: false,
      dailyGoalOn: false,
      dailyGoal: MOST_WORDS,
      targetPages: 110,
      boldSceneHeadings: false,
      boldTransitions: true,
      blankLinesBeforeSceneHeadings: 2,
    });
    // Every type New Project lists is kept, the coming ones too; a type it does not list is not.
    expect(Object.keys(kept.projectDefaults)).toEqual(["Feature", "Episode", "Short Film", "Novel", "Short Story", "Novella", "Flash Fiction", "Poem"]);
    expect(kept.projectDefaults["Novel"]!.shown).toBe(false);
    expect(kept.projectDefaults["Episode"]!.shown).toBe(true);
  });

  it("keep a type's workspaces as details.md keeps them, and none chosen as every one offered", () => {
    const kept = settingsFrom({
      projectDefaults: {
        Feature: { workspaces: ["Editor", " notes ", "notes", "not an id!", 7, "outline"] },
        Episode: { workspaces: "notes" },
        Novel: { workspaces: [] },
      },
    });
    expect(kept.projectDefaults["Feature"]!.workspaces).toEqual(["editor", "notes", "outline"]);
    // Not a list: never chosen.
    expect(kept.projectDefaults["Episode"]!.workspaces).toBeUndefined();
    expect(kept.projectDefaults["Short Film"]!.workspaces).toBeUndefined();
    // Chosen, and none of the optional ones: kept as chosen, not as "every one".
    expect(kept.projectDefaults["Novel"]!.workspaces).toEqual([]);
    expect(settingsFrom(JSON.parse(settingsText(kept))).projectDefaults["Feature"]!.workspaces).toEqual(["editor", "notes", "outline"]);
  });

  it.each([
    { hour: 24, minute: 0 },
    { hour: 3, minute: 60 },
    { hour: 1.5, minute: 0 },
    { hour: "4", minute: 0 },
    "04:00",
  ])("read a day end that is not a time as midnight: %j", (dayEndsAt) => {
    expect(settingsFrom({ dayEndsAt }).dayEndsAt).toEqual({ hour: 0, minute: 0 });
  });

  it("keep the background animation on unless it was turned off, and read anything but false as on", () => {
    // A file from before the setting existed has no key for it: on.
    expect(settingsFrom({ appearance: { whitePaper: true } }).appearance.backgroundAnimation).toBe(true);
    expect(settingsFrom({ appearance: { backgroundAnimation: false } }).appearance.backgroundAnimation).toBe(false);
    expect(settingsFrom({ appearance: { backgroundAnimation: "off" } }).appearance.backgroundAnimation).toBe(true);
    expect(settingsFrom({ appearance: { backgroundAnimation: 0 } }).appearance.backgroundAnimation).toBe(true);
  });

  it("read the background's motion as Reactive unless it is Ambient", () => {
    expect(settingsFrom({ appearance: { backgroundMotion: "ambient" } }).appearance.backgroundMotion).toBe("ambient");
    expect(settingsFrom({ appearance: { backgroundMotion: "reactive" } }).appearance.backgroundMotion).toBe("reactive");
    for (const wrong of [undefined, null, "Ambient", "still", 0, true, {}]) {
      expect(settingsFrom({ appearance: { backgroundMotion: wrong } }).appearance.backgroundMotion).toBe("reactive");
    }
    // Kept as it was while the animation itself is off.
    const off = settingsFrom({ appearance: { backgroundAnimation: false, backgroundMotion: "ambient" } });
    expect(off.appearance).toMatchObject({ backgroundAnimation: false, backgroundMotion: "ambient" });
  });

  it("write the same bytes for the same settings, and read them back as they were", () => {
    const settings = settingsFrom({ author: { name: "Ada Quill" }, dayEndsAt: { hour: 0, minute: 1 } });
    expect(settingsText(settings)).toBe(settingsText(settingsFrom(JSON.parse(settingsText(settings)))));
    expect(settingsFrom(JSON.parse(settingsText(settings)))).toEqual(settings);
  });
});

describe("the settings file", () => {
  let temporary: { path: string; remove: () => void };
  let folder: string;
  beforeEach(() => {
    temporary = temporaryDirectory();
    folder = join(temporary.path, "app-data");
  });
  afterEach(() => temporary.remove());

  it("is the defaults before there is one, and writes nothing to find that out", async () => {
    const store = openSettingsStore(nodeFilesystem, folder);
    expect(await store.load()).toEqual(DEFAULT_SETTINGS);
    expect(existsSync(folder)).toBe(false);
  });

  it("keeps what is saved, in app data, for the next launch", async () => {
    const first = openSettingsStore(nodeFilesystem, folder);
    await first.load();
    const settings = settingsFrom({ author: { name: "Ada Quill", penNames: ["J. Tern"] }, dayEndsAt: { hour: 4, minute: 0 } });
    expect(await first.save(settings)).toBe(true);
    expect(readFileSync(join(folder, SETTINGS_FILE), "utf8")).toBe(settingsText(settings));
    expect(await openSettingsStore(nodeFilesystem, folder).load()).toEqual(settings);
  });

  it("keeps the background animation turned off, and reads a file from before the setting as on", async () => {
    const store = openSettingsStore(nodeFilesystem, folder);
    await store.load();
    const off = settingsFrom({ appearance: { backgroundAnimation: false } });
    expect(await store.save(off)).toBe(true);
    const written = JSON.parse(readFileSync(join(folder, SETTINGS_FILE), "utf8")) as { appearance: Record<string, unknown> };
    expect(written.appearance["backgroundAnimation"]).toBe(false);
    expect((await openSettingsStore(nodeFilesystem, folder).load()).appearance.backgroundAnimation).toBe(false);

    // The file as the last version wrote it: no key for the animation.
    writeFileSync(
      join(folder, SETTINGS_FILE),
      JSON.stringify({ appearance: { theme: "dark", whitePaper: true, interfaceCorners: "sharp", paperCorners: "rounded" } }),
    );
    const older = await openSettingsStore(nodeFilesystem, folder).load();
    expect(older.appearance.backgroundAnimation).toBe(true);
    expect(older.appearance.whitePaper).toBe(true);
  });

  it("keeps Ambient, and reads a file from before the setting as Reactive", async () => {
    const store = openSettingsStore(nodeFilesystem, folder);
    await store.load();
    const ambient = settingsFrom({ appearance: { backgroundMotion: "ambient" } });
    expect(await store.save(ambient)).toBe(true);
    const written = JSON.parse(readFileSync(join(folder, SETTINGS_FILE), "utf8")) as { appearance: Record<string, unknown> };
    expect(written.appearance["backgroundMotion"]).toBe("ambient");
    expect((await openSettingsStore(nodeFilesystem, folder).load()).appearance.backgroundMotion).toBe("ambient");

    // The file as the last version wrote it: the animation, but no key for its motion.
    writeFileSync(
      join(folder, SETTINGS_FILE),
      JSON.stringify({ appearance: { theme: "dark", whitePaper: false, interfaceCorners: "rounded", paperCorners: "rounded", backgroundAnimation: false } }),
    );
    const older = await openSettingsStore(nodeFilesystem, folder).load();
    expect(older.appearance.backgroundMotion).toBe("reactive");
    expect(older.appearance.backgroundAnimation).toBe(false);
  });

  it("keeps the background's look by the engine's id, and reads a file from before the setting as Field", async () => {
    const store = openSettingsStore(nodeFilesystem, folder);
    await store.load();
    expect(await store.save(settingsFrom({ appearance: { backgroundPreset: "mesh" } }))).toBe(true);
    const written = JSON.parse(readFileSync(join(folder, SETTINGS_FILE), "utf8")) as { appearance: Record<string, unknown> };
    expect(written.appearance["backgroundPreset"]).toBe("mesh");
    expect((await openSettingsStore(nodeFilesystem, folder).load()).appearance.backgroundPreset).toBe("mesh");

    // The file as the last version wrote it: the animation and its motion, but no key for the look.
    writeFileSync(
      join(folder, SETTINGS_FILE),
      JSON.stringify({ appearance: { theme: "dark", backgroundAnimation: false, backgroundMotion: "ambient" } }),
    );
    const older = await openSettingsStore(nodeFilesystem, folder).load();
    expect(older.appearance).toMatchObject({ backgroundPreset: "field", backgroundAnimation: false, backgroundMotion: "ambient" });
  });

  it("leaves a writer who chose Drift, when it was the default, on Drift: the file is read, not rewritten", async () => {
    const text = JSON.stringify({ appearance: { theme: "dark", backgroundPreset: "drift" } });
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, SETTINGS_FILE), text);
    const kept = await openSettingsStore(nodeFilesystem, folder).load();
    expect(kept.appearance.backgroundPreset).toBe("drift");
    expect(readFileSync(join(folder, SETTINGS_FILE), "utf8")).toBe(text);
    expect(DEFAULT_SETTINGS.appearance.backgroundPreset).toBe("field");
  });

  it.each([["aurora"], ["wordField"], ["Drift"], [""], [7], [null], [["mesh"]]])(
    "reads a look this version does not have (%j) as Field, and leaves the rest alone",
    (preset) => {
      const kept = settingsFrom({ appearance: { backgroundPreset: preset, backgroundMotion: "ambient" } });
      expect(kept.appearance.backgroundPreset).toBe("field");
      expect(kept.appearance.backgroundMotion).toBe("ambient");
    },
  );

  it.each(["drift", "contour", "mesh", "estuary", "capillary", "field", "fluid", "dune", "etch", "morph", "noise", "silk", "weave"])(
    "keeps %s through the file",
    (preset) => {
      expect(settingsFrom(JSON.parse(settingsText(settingsFrom({ appearance: { backgroundPreset: preset } })))).appearance.backgroundPreset).toBe(preset);
    },
  );

  it("lands the last of several saves last", async () => {
    const store = openSettingsStore(nodeFilesystem, folder);
    await store.load();
    const saves = [1, 2, 3, 4].map((hour) => store.save(settingsFrom({ dayEndsAt: { hour, minute: 0 } })));
    expect(await Promise.all(saves)).toEqual([true, true, true, true]);
    expect((await openSettingsStore(nodeFilesystem, folder).load()).dayEndsAt).toEqual({ hour: 4, minute: 0 });
  });

  it.each([
    ["is not JSON", "{ author: "],
    ["is not UTF-8", "ÿ"],
  ])("that %s is left exactly as it was, and nothing is saved over it", async (_, text) => {
    mkdirSync(folder, { recursive: true });
    const path = join(folder, SETTINGS_FILE);
    if (text === "ÿ") writeFileSync(path, Buffer.from([0xff, 0xfe, 0x7b]));
    else writeFileSync(path, text);
    const before = readFileSync(path);

    const store = openSettingsStore(nodeFilesystem, folder);
    expect(await store.load()).toEqual(DEFAULT_SETTINGS);
    expect(await store.save(settingsFrom({ author: { name: "Ada Quill" } }))).toBe(false);
    expect(readFileSync(path)).toEqual(before);
  });

  it("that is a folder is never written over", async () => {
    mkdirSync(join(folder, SETTINGS_FILE), { recursive: true });
    const store = openSettingsStore(nodeFilesystem, folder);
    expect(await store.load()).toEqual(DEFAULT_SETTINGS);
    expect(await store.save(DEFAULT_SETTINGS)).toBe(false);
  });
});

describe("the writer's own keys", () => {
  it("keep each command's keys, put right: one modifier, a named key, each once, single characters in lower case", () => {
    const kept = settingsFrom({
      keyBindings: {
        search: [{ key: "F", mod: true }, { key: "Enter", alt: true }, { key: "f", mod: true }],
        "toggle-spellcheck": [],
        "zoom-in": [
          { key: "=" },
          { key: "=", mod: true, alt: true },
          { key: "", mod: true },
          { key: 7, mod: true },
          { key: "a\tb", alt: true },
          "Ctrl+Q",
          { key: "q", mod: "yes" },
          { key: "PageDown", alt: true },
        ],
        "Not An Id": [{ key: "x", mod: true }],
        "previous-scene": "Ctrl+,",
      },
    });
    expect(kept.keyBindings).toEqual({
      search: [{ key: "f", mod: true }, { key: "Enter", alt: true }],
      "toggle-spellcheck": [],
      "zoom-in": [{ key: "PageDown", alt: true }],
    });
  });

  it("keep at most eight keys for one command", () => {
    const many = "abcdefghijk".split("").map((key) => ({ key, alt: true }));
    expect(settingsFrom({ keyBindings: { search: many } }).keyBindings["search"]).toHaveLength(MOST_BINDINGS);
  });

  it("read nothing that is not a list of commands as no changes", () => {
    for (const keyBindings of [null, [], "search", 4]) expect(settingsFrom({ keyBindings }).keyBindings).toEqual({});
  });

  it("round-trip through the file's text", () => {
    const settings = settingsFrom({ keyBindings: { search: [{ key: "f", mod: true }], "reset-zoom": [] } });
    expect(settingsFrom(JSON.parse(settingsText(settings)))).toEqual(settings);
  });
});
