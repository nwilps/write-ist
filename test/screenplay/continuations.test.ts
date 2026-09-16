/**
 * Where `(CONT'D)` goes, and what it must never touch (ADR-0026).
 *
 * The corpus and the fixtures prove the counts. These prove the placement,
 * including the two cases no fixture happens to contain.
 */
import { describe, expect, it } from "vitest";
import {
  characterName,
  hasContinuation,
  maintainContinuations,
} from "../../src/screenplay/continuations.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";

/** Parse, maintain, serialise — the shape of an import, minus normalisation. */
const maintained = (source: string): string =>
  serialise(maintainContinuations(parse(source)).document);

const cues = (source: string): string[] =>
  maintainContinuations(parse(source))
    .document.elements.filter((element) => element.type === "character")
    .map((element) => element.text);

describe("characterName", () => {
  it("sets aside every extension and the dual marker", () => {
    expect(characterName("EDWARD")).toBe("EDWARD");
    expect(characterName("EDWARD (V.O.)")).toBe("EDWARD");
    expect(characterName("EDWARD (V.O.) (CONT'D)")).toBe("EDWARD");
    expect(characterName("BRICK ^")).toBe("BRICK");
    expect(characterName("VINNIE (HALF O.S.)")).toBe("VINNIE");
  });
});

describe("hasContinuation", () => {
  it("recognises the spellings that occur in the wild", () => {
    expect(hasContinuation("EDWARD (CONT'D)")).toBe(true);
    expect(hasContinuation("EDWARD (CONTD)")).toBe(true);
    expect(hasContinuation("EDWARD (cont'd)")).toBe(true);
    expect(hasContinuation("EDWARD (V.O.)")).toBe(false);
    expect(hasContinuation("EDWARD")).toBe(false);
  });
});

describe("when a continuation is added", () => {
  const resuming = (cue: string): string =>
    [`@${cue}`, "First line.", "", "!He crosses the room.", "", `@${cue}`, "Second line."].join(
      "\n",
    );

  it("adds one where the same character resumes after action", () => {
    expect(cues(resuming("EDWARD"))).toEqual(["EDWARD", "EDWARD (CONT'D)"]);
  });

  it("adds none when another character speaks in between", () => {
    const source = [
      "@EDWARD",
      "First.",
      "",
      "@SANDRA",
      "Second.",
      "",
      "@EDWARD",
      "Third.",
    ].join("\n");

    expect(cues(source)).toEqual(["EDWARD", "SANDRA", "EDWARD"]);
  });

  it("adds none across a scene heading, because a new scene starts the speaker fresh", () => {
    const source = [
      "@EDWARD",
      "First.",
      "",
      "!He crosses the room.",
      "",
      ".INT. HALLWAY - DAY",
      "",
      "@EDWARD",
      "Second.",
    ].join("\n");

    expect(cues(source)).toEqual(["EDWARD", "EDWARD"]);
  });

  it("adds none to a cue that already carries one", () => {
    const source = [
      "@EDWARD",
      "First.",
      "",
      "!He crosses the room.",
      "",
      "@EDWARD (CONT'D)",
      "Second.",
    ].join("\n");

    expect(cues(source)).toEqual(["EDWARD", "EDWARD (CONT'D)"]);
    expect(maintainContinuations(parse(source)).added).toBe(0);
  });
});

describe("where the continuation is written", () => {
  it("appends after an extension already present, not in place of it", () => {
    // Big Fish contains 21 cues reading `EDWARD (V.O.) (CONT'D)`, so a
    // bare-only rule gets 21 cues wrong in the reference script.
    const source = [
      "@EDWARD (V.O.)",
      "First.",
      "",
      "!He crosses the room.",
      "",
      "@EDWARD (V.O.)",
      "Second.",
    ].join("\n");

    expect(cues(source)).toEqual(["EDWARD (V.O.)", "EDWARD (V.O.) (CONT'D)"]);
  });

  it("stays inside the dual-dialogue marker, which must end the cue", () => {
    const source = [
      "@EDWARD ^",
      "First.",
      "",
      "!He crosses the room.",
      "",
      "@EDWARD ^",
      "Second.",
    ].join("\n");

    // The caret lives on the element, so the serialiser puts it last.
    expect(cues(source)).toEqual(["EDWARD", "EDWARD (CONT'D)"]);
    expect(maintained(source)).toContain("@EDWARD (CONT'D) ^");
  });

  it("stays inside a caret the parser left in the text", () => {
    // `EDWARD^` with no space is not the dual form the parser lifts out, so
    // the caret stays in the cue text and the extension has to go before it.
    const source = [
      "@EDWARD^",
      "First.",
      "",
      "!He crosses the room.",
      "",
      "@EDWARD^",
      "Second.",
    ].join("\n");

    expect(cues(source)).toEqual(["EDWARD^", "EDWARD (CONT'D)^"]);
  });
});

describe("what maintenance must never do", () => {
  it("never adds or removes an authored (V.O.) or (O.S.)", () => {
    const source = [
      "@EDWARD (V.O.)",
      "First.",
      "",
      "!He crosses the room.",
      "",
      "@EDWARD (O.S.)",
      "Second.",
    ].join("\n");

    // Same speaker resuming, so a continuation is due — but the authored
    // extension is left exactly as the writer wrote it.
    expect(cues(source)).toEqual(["EDWARD (V.O.)", "EDWARD (O.S.) (CONT'D)"]);
  });

  it("never corrects an extension the writer typed wrong", () => {
    // Big Fish contains `(V.0.)` with a zero. Correcting it would be Write-ist
    // changing the writer's characters, which ADR-0020 forbids.
    const source = ["@EDWARD (V.0.)", "First."].join("\n");

    expect(maintained(source)).toBe(source);
  });

  it("never removes an extension the rule would not have written", () => {
    // ADR-0020's list permits "missing (CONT'D) extensions added" and says
    // nothing about removing one. Big Fish has four such cues.
    const source = ["@EDWARD (CONT'D)", "First, with nothing before it."].join("\n");

    expect(maintained(source)).toBe(source);
    expect(maintainContinuations(parse(source)).added).toBe(0);
  });

  it("is idempotent", () => {
    const source = [
      "@EDWARD",
      "First.",
      "",
      "!He crosses the room.",
      "",
      "@EDWARD",
      "Second.",
    ].join("\n");

    const once = maintained(source);
    expect(maintained(once)).toBe(once);
  });
});
