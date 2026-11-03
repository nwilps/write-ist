/**
 * A squished gap in the file: two lines with no blank line between them
 * (ADR-0038). The model flag is `squished` on the lower element; the file
 * has no syntax for it beyond the missing blank line.
 */
import { describe, expect, it } from "vitest";
import type { Element, ElementType, ScreenplayDocument } from "../../src/screenplay/document.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { withSpacing } from "../support/spacing.ts";

const el = (type: ElementType, text: string, extra: Partial<Element> = {}): Element => ({
  type,
  text,
  forced: false,
  ...extra,
});

const documentOf = (elements: Element[]): ScreenplayDocument => ({
  titlePage: [],
  elements,
  comments: [],
  endsWithNewline: false,
});

const squishedOf = (text: string): boolean[] => parse(text).elements.map((e) => e.squished === true);

describe("on open", () => {
  it("reads two action lines with no blank line between as a squished pair", () => {
    expect(squishedOf("One.\nTwo.")).toEqual([false, true]);
  });

  it("reads a blank line between two action lines as the default gap", () => {
    expect(squishedOf("One.\n\nTwo.")).toEqual([false, false]);
  });

  it("squishes every gap in a tight run of three", () => {
    expect(squishedOf("One.\nTwo.\nThree.")).toEqual([false, true, true]);
  });

  it("reads tight centered lines as squished, and a blank between them as a gap", () => {
    expect(squishedOf(">ONE<\n>TWO<")).toEqual([false, true]);
    expect(squishedOf(">ONE<\n\n>TWO<")).toEqual([false, false]);
  });

  it("squishes only the pairs the table allows", () => {
    const doc = parse("INT. ROOM - DAY\nShe waits.");
    expect(doc.elements.map((e) => e.type)).toEqual(["scene-heading", "action"]);
    expect(doc.elements.map((e) => e.squished === true)).toEqual([false, false]);
  });

  it("reads a pair as squished when the table is edited to allow it", () => {
    const row = { above: "scene-heading", below: "action", blank: 1, squishable: true } as const;
    withSpacing([row], () => expect(squishedOf("INT. ROOM - DAY\nShe waits.")).toEqual([false, true]));
  });
});

describe("on save", () => {
  it("writes no blank line inside a squished pair, and one between the rest", () => {
    const written = serialise(documentOf([el("action", "One."), el("action", "Two.", { squished: true }), el("action", "Three.")]));
    expect(written).toBe("One.\nTwo.\n\nThree.");
  });

  it("writes one blank line before a scene heading although the paper leaves two", () => {
    expect(serialise(documentOf([el("action", "One."), el("scene-heading", "INT. ROOM - DAY")]))).toBe(
      "One.\n\nINT. ROOM - DAY",
    );
  });

  it("writes one blank line however many the paper leaves", () => {
    const row = { above: "action", below: "action", blank: 3, squishable: true } as const;
    const written = withSpacing([row], () => serialise(documentOf([el("action", "One."), el("action", "Two.")])));
    expect(written).toBe("One.\n\nTwo.");
  });

  it("ignores a squished flag where the table does not allow it", () => {
    expect(serialise(documentOf([el("action", "One."), el("dialogue", "Hi.", { squished: true })]))).toBe(
      "One.\n\nHi.",
    );
  });

  it("writes a blank line between two centered lines unless they are squished", () => {
    expect(serialise(documentOf([el("centered", "ONE"), el("centered", "TWO")]))).toBe(">ONE<\n\n>TWO<");
    expect(serialise(documentOf([el("centered", "ONE"), el("centered", "TWO", { squished: true })]))).toBe(
      ">ONE<\n>TWO<",
    );
  });

  it("forces an all-capitals action line that heads a squished pair, so it is not read as a cue", () => {
    const doc = documentOf([el("action", "HE RUNS"), el("action", "And runs.", { squished: true })]);
    const written = serialise(doc);
    expect(written).toBe("!HE RUNS\nAnd runs.");
    const reread = parse(written);
    expect(reread.elements.map((e) => e.type)).toEqual(["action", "action"]);
    expect(reread.elements.map((e) => e.text)).toEqual(["HE RUNS", "And runs."]);
  });

  it("forces nothing it need not: a capitals line already inside a tight run is left alone", () => {
    const tight = "One.\nHE RUNS\nAnd runs.";
    expect(serialise(parse(tight))).toBe(tight);
  });

  it("leaves a capitals action line alone when no squished line follows", () => {
    expect(serialise(documentOf([el("action", "HE RUNS"), el("action", "And runs.")]))).toBe("HE RUNS\n\nAnd runs.");
  });
});

describe("the round trip", () => {
  it.each([
    "One.\nTwo.",
    "One.\n\nTwo.",
    "One.\nTwo.\nThree.\n\nFour.\nFive.",
    ">ONE<\n>TWO<\n\n>THREE<",
    ">ONE<\n\n>TWO<",
    "!HE RUNS\nAnd runs.",
    "INT. ROOM - DAY\n\nShe waits.\nAnd waits.\n\nBOB\nHi.\n\nCUT TO:",
  ])("reads and writes %j byte for byte", (text) => {
    expect(serialise(parse(text))).toBe(text);
  });

  it("is stable: what a squished pair writes reads back to the same model", () => {
    const written = serialise(documentOf([el("action", "One."), el("action", "Two.", { squished: true })]));
    expect(serialise(parse(written))).toBe(written);
    expect(parse(written).elements[1]!.squished).toBe(true);
  });
});
