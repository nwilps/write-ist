/**
 * A character cue needs a blank line above it (issue #23).
 *
 * Fountain's cue is an upper-case line **preceded by a blank line** and
 * followed by a non-blank one. The parser checked only the second condition,
 * so an upper-case line sitting in a tight run of action became a cue, the
 * action line under it became dialogue, and — because a cue names a speaker —
 * `(CONT'D)` maintenance wrote visible words into a line of action.
 *
 * ## Why this file exists rather than an assertion on a fixture
 *
 * **No fixture reaches it.** Measured across the acceptance corpus, *Big Fish*
 * and *Brick & Steel*: zero cues lack a blank line above them. Every
 * upper-case line that could trip this happens to have a blank above it, so
 * the corpus can never fail on it.
 *
 * **And the byte gate cannot see it.** A cue misread as action serialises
 * identically. This is the third sighting of that one shape — two sluglines
 * read as action, a boneyard whose cue was invisible, and now this — which
 * `docs/STANDARDS.md` calls a structural cause: element classification has no
 * gate of its own, only assertions bolted onto fixture tests after the fact.
 *
 * So the reproduction is the test.
 */
import { describe, expect, it } from "vitest";
import { exportScreenplay, importScreenplay } from "../../src/screenplay/import.ts";
import { parse } from "../../src/screenplay/parse.ts";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** The reproduction from issue #23, verbatim. */
const WOODS = [
  "INT. THE WOODS - NIGHT",
  "",
  "He runs.",
  "THE BEAST",
  "It roars behind him.",
  "",
  "He keeps running.",
  "",
  "THE BEAST",
  "It roars again.",
].join("\n");

describe("an upper-case line in a tight run of action is action", () => {
  it("reads all three lines of the run as action", () => {
    const { elements } = parse(WOODS);

    expect(elements.map((element) => element.type)).toEqual([
      "scene-heading",
      "action",
      // `THE BEAST` with `He runs.` directly above it. Upper case and followed
      // by text, but no blank line above, so it is not a cue.
      "action",
      "action",
      "action",
      // This one has a blank line above it, so it is.
      "character",
      "dialogue",
    ]);
  });

  it("does not write (CONT'D) into a line of action", () => {
    const { document, report } = importScreenplay(utf8(WOODS));
    const output = text(exportScreenplay(document));

    expect(output).not.toContain("(CONT'D)");
    expect(report.applied).not.toContainEqual(
      expect.objectContaining({ kind: "continuations-added" }),
    );
  });

  it("still speaks the second THE BEAST, because a blank line precedes it", () => {
    const { elements } = parse(WOODS);
    const cues = elements.filter((element) => element.type === "character");

    expect(cues).toHaveLength(1);
    expect(cues[0]?.text).toBe("THE BEAST");
  });
});

describe("the blank line is the only thing the rule adds", () => {
  it("still reads a cue that has one, and its speech under it", () => {
    const { elements } = parse(["BOB", "Hello."].join("\n"));

    // The first line of the body counts as having a blank above it: there is
    // nothing above it at all, so it is not in a run of anything.
    expect(elements.map((element) => element.type)).toEqual(["character", "dialogue"]);
  });

  it("leaves a forced cue forced, wherever it sits", () => {
    // `@CROSSWALK` and `@BENNETT.` are both deliberate in the acceptance
    // corpus. The writer who typed the `@` has already answered the question,
    // so the blank-line rule must not reach them.
    const { elements } = parse(["He runs.", "@CROSSWALK", "It changes."].join("\n"));

    expect(elements.map((element) => element.type)).toEqual([
      "action",
      "character",
      "dialogue",
    ]);
    expect(elements[1]?.forced).toBe(true);
  });

  it("still needs a non-blank line below, which was the condition already there", () => {
    const { elements } = parse(["", "THE BEAST", "", "It roars."].join("\n"));

    expect(elements.map((element) => element.type)).toEqual(["action", "action"]);
  });
});
