/**
 * Ranges: the structure the flat sequence only implies (ADR-0019).
 *
 * A scene is not a container. It is the run of elements from one scene
 * heading up to the next, and this is where it is computed — once, so the
 * scene list, the name lists and per-scene spellcheck cannot each keep their
 * own idea of where a scene ends.
 *
 * Indices are into whatever sequence the caller hands over, and the caller
 * says which numbering that is (`numbering.ts`: the paper's, blank lines counted,
 * or the manuscript's). Nothing here knows about ProseMirror.
 *
 * **Cut material takes no part.** A scene heading inside the boneyard is
 * omitted from the output, so it does not begin a scene (`GLOSSARY.md`,
 * *Boneyard*).
 */
import type { Element } from "./document.ts";

/** The least of an element that a range needs to see. */
export interface RangeLine {
  readonly type: Element["type"];
  readonly omitted?: boolean;
}

/** One scene: the elements `start` up to but not including `end`. */
export interface SceneRange {
  /**
   * Index of the scene heading that opens the scene, which is also `start`.
   * Undefined for the stretch before the first heading, if there is one.
   */
  readonly heading: number | undefined;
  readonly start: number;
  readonly end: number;
}

/** Whether a line begins a scene. */
export function beginsScene(line: RangeLine): boolean {
  return line.type === "scene-heading" && line.omitted !== true;
}

/**
 * Every scene in order, covering the sequence with no gaps. A sequence that
 * does not open with a heading begins with a headless range for what comes
 * first. An empty sequence has no ranges.
 */
export function sceneRanges(lines: readonly RangeLine[]): SceneRange[] {
  const scenes: SceneRange[] = [];
  let start = 0;
  let heading: number | undefined;
  for (let i = 0; i < lines.length; i++) {
    if (!beginsScene(lines[i]!)) continue;
    if (i > start) scenes.push({ heading, start, end: i });
    start = i;
    heading = i;
  }
  if (lines.length > start) scenes.push({ heading, start, end: lines.length });
  return scenes;
}

/**
 * The scene containing `index`, found by walking out from it — the cost of
 * one scene, not of the manuscript. Undefined when `index` is outside the
 * sequence.
 */
export function sceneAround(lines: readonly RangeLine[], index: number): SceneRange | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= lines.length) return undefined;

  let start = index;
  while (start > 0 && !beginsScene(lines[start]!)) start--;
  const heading = beginsScene(lines[start]!) ? start : undefined;

  let end = index + 1;
  while (end < lines.length && !beginsScene(lines[end]!)) end++;
  return { heading, start, end };
}

/** The position of `index`'s scene among `scenes`, by binary search. */
export function sceneNumberAt(scenes: readonly SceneRange[], index: number): number | undefined {
  let low = 0;
  let high = scenes.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const scene = scenes[middle]!;
    if (index < scene.start) high = middle - 1;
    else if (index >= scene.end) low = middle + 1;
    else return middle;
  }
  return undefined;
}
