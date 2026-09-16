/**
 * The element rules, on small inputs where the expected answer can be read.
 *
 * The corpus tests prove the parser holds over 170 KB. These prove it holds
 * for the reasons we think it does.
 */
import { describe, expect, it } from "vitest";
import type { ScreenplayDocument } from "../../src/screenplay/document.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { assertBytesEqual, firstByteDifference } from "../support/byte-diff.ts";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const types = (document: ScreenplayDocument): string[] =>
  document.elements.map((element) => element.type);
const texts = (document: ScreenplayDocument): string[] =>
  document.elements.map((element) => element.text);

/** Parse and serialise, asserting the text comes back exactly as it went in. */
const roundTrips = (source: string): void => {
  assertBytesEqual(utf8(source), utf8(serialise(parse(source))), {
    expectedLabel: "source",
    actualLabel: "output",
  });
};

describe("forcing markers", () => {
  it("recognises each marker and keeps it on the way out", () => {
    const source = [
      ".INT. KITCHEN - DAY",
      "",
      "!A tight run of action.",
      "",
      "@EDWARD",
      "Hello.",
      "",
      ">CUT TO:",
    ].join("\n");

    const document = parse(source);

    expect(types(document)).toEqual([
      "scene-heading",
      "action",
      "character",
      "dialogue",
      "transition",
    ]);
    expect(texts(document)).toEqual([
      "INT. KITCHEN - DAY",
      "A tight run of action.",
      "EDWARD",
      "Hello.",
      "CUT TO:",
    ]);
    expect(document.elements.map((e) => e.forced)).toEqual([true, true, true, false, true]);
    roundTrips(source);
  });

  it("treats a leading ellipsis as text, not as a forced heading", () => {
    // `.` forces a scene heading; `..` is a writer typing an ellipsis.
    const document = parse("...and then nothing.");

    expect(types(document)).toEqual(["action"]);
    expect(texts(document)).toEqual(["...and then nothing."]);
    roundTrips("...and then nothing.");
  });

  it("does not invent a marker on a line that never had one", () => {
    const source = "INT. KITCHEN - DAY\n\nShe stands at the window.";
    const document = parse(source);

    expect(types(document)).toEqual(["scene-heading", "action"]);
    expect(document.elements.every((element) => !element.forced)).toBe(true);
    roundTrips(source);
  });

  it("reads a centered line before treating > as a transition", () => {
    const source = "> _**THE END**_ <";
    const document = parse(source);

    expect(types(document)).toEqual(["centered"]);
    expect(texts(document)).toEqual([" _**THE END**_ "]);
    roundTrips(source);
  });
});

describe("unforced transitions", () => {
  /**
   * The type this line takes in the body of a screenplay.
   *
   * A scene heading goes in front of it deliberately. Fountain puts the title
   * page first and does not restrict it to known keys, so a document whose
   * *first* line is `CUT TO:` is a title page with one field — correct, and
   * not what this rule is about.
   */
  const typeOf = (line: string): string => {
    const document = parse(`.INT. SOMEWHERE - DAY\n\n${line}`);
    expect(document.elements, line).toHaveLength(2);
    return document.elements[1]!.type;
  };

  it("recognises exactly the three that do not end in TO:", () => {
    // ADR-0021's list, and the whole of it.
    expect(typeOf("FADE OUT.")).toBe("transition");
    expect(typeOf("FADE TO BLACK.")).toBe("transition");
    expect(typeOf("CUT TO BLACK.")).toBe("transition");
  });

  it("requires the trailing period", () => {
    // Without it these are just upper-case lines, and upper-case lines are how
    // shot headings are written.
    expect(typeOf("FADE OUT")).toBe("action");
    expect(typeOf("FADE TO BLACK")).toBe("action");
    expect(typeOf("CUT TO BLACK")).toBe("action");
  });

  it("is gated on upper case", () => {
    expect(typeOf("Fade out.")).toBe("action");
    expect(typeOf("fade to black.")).toBe("action");
    expect(typeOf("Cut to black.")).toBe("action");
  });

  it("does not read a lowercase line ending in ' to:' as a transition", () => {
    // The `TO:` rule is upper-case only. Ordinary prose ending in a colon is
    // action, and inside a speech it is dialogue.
    expect(typeOf("He turns to:")).toBe("action");
    expect(typeOf("and then she said to:")).toBe("action");
    expect(typeOf("SMASH CUT to:")).toBe("action");

    const speech = parse(".INT. SOMEWHERE - DAY\n\n@EDWARD\nI gave it to:");
    expect(speech.elements.map((element) => element.type)).toEqual([
      "scene-heading",
      "character",
      "dialogue",
    ]);
  });

  it("still reads an upper-case line ending in TO: as a transition", () => {
    expect(typeOf("CUT TO:")).toBe("transition");
    expect(typeOf("SMASH CUT TO:")).toBe("transition");
    expect(typeOf("MATCH CUT TO:")).toBe("transition");
  });

  it("leaves an upper-case line ending in a period as action", () => {
    // The three above are a closed list, not a pattern. These are the lines
    // Big Fish uses as shot headings, and reading one as a transition would
    // put it on the right-hand side of the page.
    expect(typeOf("A RIVER.")).toBe("action");
    expect(typeOf("THE BEAST.")).toBe("action");
    expect(typeOf("UNDERWATER.")).toBe("action");
    expect(typeOf("TEN THOUSAND DAFFODILS.")).toBe("action");
    expect(typeOf("BACKSTAGE.")).toBe("action");
  });

  it("leaves an upper-case line with no period as action", () => {
    expect(typeOf("ON WILL AND SANDRA")).toBe("action");
    expect(typeOf("ON HIS SHOES")).toBe("action");
    expect(typeOf("TWO OVERSIZED HANDS")).toBe("action");
  });

  it("round-trips every one of these unchanged", () => {
    for (const line of [
      "FADE OUT.",
      "CUT TO BLACK.",
      "A RIVER.",
      "ON WILL AND SANDRA",
      "He turns to:",
      "CUT TO:",
    ]) {
      roundTrips(line);
    }
  });
});

describe("speech blocks", () => {
  it("reads a parenthetical inside a speech and dialogue around it", () => {
    const source = ["@EDWARD", "(quietly)", "I know.", "And I am sorry."].join("\n");

    expect(types(parse(source))).toEqual([
      "character",
      "parenthetical",
      "dialogue",
      "dialogue",
    ]);
    roundTrips(source);
  });

  it("ends the speech at a blank line, so the next line is action again", () => {
    const source = ["@EDWARD", "I know.", "", "He turns away."].join("\n");

    expect(types(parse(source))).toEqual(["character", "dialogue", "action"]);
    roundTrips(source);
  });

  it("keeps a parenthesised line inside a speech as a parenthetical, not a cue", () => {
    // Outside a speech the same line would be action.
    expect(types(parse("(a beat)"))).toEqual(["action"]);
    expect(types(parse("@EDWARD\n(a beat)\nRight."))).toEqual([
      "character",
      "parenthetical",
      "dialogue",
    ]);
  });
});

describe("derived spacing", () => {
  /** The exact bytes the serialiser emits, so a blank line in the wrong place fails. */
  const emits = (source: string): string => serialise(parse(source));

  it("puts a blank line between two action paragraphs", () => {
    expect(emits("!One.\n\n!Two.")).toBe("!One.\n\n!Two.");
  });

  it("puts no blank line anywhere inside a speech", () => {
    // ADR-0019's table says Dialogue to Dialogue takes no blank line, and
    // "everything else" takes one. Read literally that puts a blank line
    // between a cue and its own dialogue — which in Fountain ends the speech
    // and demotes the cue to an action line. The rule the format requires is
    // that no blank line falls anywhere inside a speech.
    expect(emits("@EDWARD\nHello.")).toBe("@EDWARD\nHello.");
    expect(emits("@EDWARD\n(quietly)\nHello.")).toBe("@EDWARD\n(quietly)\nHello.");
    expect(emits("@EDWARD\nHello.\nAnd goodbye.")).toBe("@EDWARD\nHello.\nAnd goodbye.");
  });

  it("puts no blank line between two centered lines or two lyric lines", () => {
    expect(emits(">FIRST<\n>SECOND<")).toBe(">FIRST<\n>SECOND<");
    expect(emits("~One line\n~Another")).toBe("~One line\n~Another");
  });

  it("puts a blank line between a speech and what follows it", () => {
    expect(emits("@EDWARD\nHello.\n\n!He leaves.")).toBe("@EDWARD\nHello.\n\n!He leaves.");
    expect(emits("@EDWARD\nHello.\n\n@SANDRA\nGoodbye.")).toBe(
      "@EDWARD\nHello.\n\n@SANDRA\nGoodbye.",
    );
  });

  it("puts a blank line between a scene heading and everything around it", () => {
    expect(emits(".INT. KITCHEN - DAY\n\n!She waits.\n\n>CUT TO:")).toBe(
      ".INT. KITCHEN - DAY\n\n!She waits.\n\n>CUT TO:",
    );
  });

  it("gives a tight run of action lines a blank line between each", () => {
    // ADR-0020's seventh normalisation, and the one genuine loss in the model:
    // three tight lines become three paragraphs.
    const tight = "And then there's a long beat.\nLonger than is funny.\nLong enough to be depressing.";

    const document = parse(tight);
    expect(types(document)).toEqual(["action", "action", "action"]);
    expect(serialise(document)).toBe(
      "And then there's a long beat.\n\nLonger than is funny.\n\nLong enough to be depressing.",
    );
  });
});

describe("leading whitespace", () => {
  it("strips indentation to decide the type, then puts it back verbatim", () => {
    const source = "@EDWARD\n    (quietly)\nI know.";
    const document = parse(source);

    expect(types(document)).toEqual(["character", "parenthetical", "dialogue"]);
    expect(document.elements[1]?.indent).toBe("    ");
    roundTrips(source);
  });

  it("preserves a leading tab as faithfully as leading spaces", () => {
    const source = "@EDWARD\n\t(quietly)\nI know.";
    const document = parse(source);

    expect(document.elements[1]?.indent).toBe("\t");
    roundTrips(source);
  });
});

describe("end of file", () => {
  it("does not add a trailing newline to a file that had none", () => {
    expect(serialise(parse("!Action."))).toBe("!Action.");
  });

  it("keeps a trailing newline on a file that had one", () => {
    expect(serialise(parse("!Action.\n"))).toBe("!Action.\n");
  });
});

describe("the gate is not vacuous", () => {
  // A round-trip test only earns trust if it fails when something is lost.
  const source = [
    "Title: A Script",
    "",
    ".INT. KITCHEN - DAY",
    "",
    "@EDWARD",
    "Hello.",
    "",
    "!He leaves.",
  ].join("\n");

  it("catches a dropped element", () => {
    const document = parse(source);
    const lossy = { ...document, elements: document.elements.slice(0, -1) };

    expect(firstByteDifference(utf8(source), utf8(serialise(lossy)))).not.toBeNull();
  });

  it("catches a dropped title-page field", () => {
    const document = parse(source);
    const lossy = { ...document, titlePage: [] };

    expect(firstByteDifference(utf8(source), utf8(serialise(lossy)))).not.toBeNull();
  });

  it("catches a lost forcing marker", () => {
    const document = parse(source);
    const unforced = {
      ...document,
      elements: document.elements.map((element) => ({ ...element, forced: false })),
    };

    expect(firstByteDifference(utf8(source), utf8(serialise(unforced)))).not.toBeNull();
  });

  it("catches lost indentation", () => {
    const indented = "@EDWARD\n    (quietly)\nI know.";
    const document = parse(indented);
    const flattened = {
      ...document,
      elements: document.elements.map((element) => ({ ...element, indent: "" })),
    };

    expect(firstByteDifference(utf8(indented), utf8(serialise(flattened)))).not.toBeNull();
  });

  it("passes when nothing is lost", () => {
    expect(firstByteDifference(utf8(source), utf8(serialise(parse(source))))).toBeNull();
  });
});
