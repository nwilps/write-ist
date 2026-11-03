/**
 * Scenes as ranges over the flat sequence (ADR-0019), computed in one place.
 */
import { describe, expect, it } from "vitest";
import type { Element } from "../../src/screenplay/document.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { sceneAround, sceneNumberAt, sceneRanges, type RangeLine } from "../../src/screenplay/ranges.ts";
import { readFixtureText } from "../support/files.ts";

const line = (type: Element["type"], omitted = false): RangeLine => ({ type, omitted });

describe("sceneRanges", () => {
  it("has no ranges for nothing", () => {
    expect(sceneRanges([])).toEqual([]);
  });

  it("runs from each heading to the next, with no gaps", () => {
    const lines = [
      line("scene-heading"), line("action"), line("character"), line("dialogue"),
      line("scene-heading"), line("action"),
      line("scene-heading"),
    ];
    expect(sceneRanges(lines)).toEqual([
      { heading: 0, start: 0, end: 4 },
      { heading: 4, start: 4, end: 6 },
      { heading: 6, start: 6, end: 7 },
    ]);
  });

  it("gives what comes before the first heading a headless range", () => {
    const lines = [line("action"), line("action"), line("scene-heading"), line("action")];
    expect(sceneRanges(lines)).toEqual([
      { heading: undefined, start: 0, end: 2 },
      { heading: 2, start: 2, end: 4 },
    ]);
  });

  it("does not let a heading in the boneyard begin a scene", () => {
    const lines = [
      line("scene-heading"), line("action"),
      line("boneyard-start"), line("scene-heading", true), line("action", true), line("boneyard-end"),
      line("action"),
    ];
    expect(sceneRanges(lines)).toEqual([{ heading: 0, start: 0, end: 7 }]);
  });

  it("covers the whole sequence on a real script", () => {
    const elements = parse(readFixtureText("Big-Fish.fountain")).elements;
    const scenes = sceneRanges(elements);
    expect(scenes[0]!.start).toBe(0);
    expect(scenes[scenes.length - 1]!.end).toBe(elements.length);
    scenes.slice(1).forEach((scene, at) => expect(scene.start).toBe(scenes[at]!.end));
    const headings = elements.filter((e) => e.type === "scene-heading" && e.omitted !== true).length;
    expect(scenes.filter((s) => s.heading !== undefined)).toHaveLength(headings);
  });
});

describe("sceneAround", () => {
  const lines = [
    line("action"), line("scene-heading"), line("action"), line("character"),
    line("scene-heading"), line("dialogue"),
  ];

  it("finds the scene by walking out from the element", () => {
    expect(sceneAround(lines, 0)).toEqual({ heading: undefined, start: 0, end: 1 });
    expect(sceneAround(lines, 1)).toEqual({ heading: 1, start: 1, end: 4 });
    expect(sceneAround(lines, 3)).toEqual({ heading: 1, start: 1, end: 4 });
    expect(sceneAround(lines, 4)).toEqual({ heading: 4, start: 4, end: 6 });
    expect(sceneAround(lines, 5)).toEqual({ heading: 4, start: 4, end: 6 });
  });

  it("is undefined outside the sequence", () => {
    expect(sceneAround(lines, -1)).toBeUndefined();
    expect(sceneAround(lines, 6)).toBeUndefined();
    expect(sceneAround([], 0)).toBeUndefined();
  });

  it("agrees with sceneRanges for every element of a real script", () => {
    const elements = parse(readFixtureText("Brick-&-Steel.fountain")).elements;
    const scenes = sceneRanges(elements);
    elements.forEach((_, index) => {
      expect(sceneAround(elements, index)).toEqual(scenes[sceneNumberAt(scenes, index)!]);
    });
  });
});

describe("sceneNumberAt", () => {
  it("finds the scene an index falls in, and nothing outside", () => {
    const scenes = sceneRanges([
      line("scene-heading"), line("action"), line("scene-heading"), line("action"), line("action"),
    ]);
    expect([0, 1, 2, 3, 4].map((i) => sceneNumberAt(scenes, i))).toEqual([0, 0, 1, 1, 1]);
    expect(sceneNumberAt(scenes, 5)).toBeUndefined();
    expect(sceneNumberAt(scenes, -1)).toBeUndefined();
  });
});
