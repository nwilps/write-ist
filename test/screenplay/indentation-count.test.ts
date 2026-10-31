/**
 * The test helper that counts indented lines must agree with the importer on
 * every fixture. Brick & Steel is the case that split them: twelve indented
 * lines, five of them title-page continuations that keep their one tab, so
 * the importer reports seven.
 */
import { describe, expect, it } from "vitest";
import { importScreenplay } from "../../src/screenplay/import.ts";
import { normaliseSource } from "../../src/normalise.ts";
import { readFixtureBytes, readFixtureText } from "../support/files.ts";
import { withoutIndentation } from "../support/indentation.ts";

const FIXTURES = ["Brick-&-Steel.fountain", "Big-Fish.fountain", "Big-Fish-augmented.fountain"];

describe("the indentation helper agrees with the importer", () => {
  it.each(FIXTURES)("%s", (fixture) => {
    const { report } = importScreenplay(readFixtureBytes(fixture));
    const reported =
      report.applied.find((change) => change.kind === "leading-whitespace-dropped")?.count ?? 0;

    expect(withoutIndentation(normaliseSource(readFixtureText(fixture)).text).lines).toBe(reported);
  });

  it("counts seven on Brick & Steel, not the twelve indented lines", () => {
    const text = normaliseSource(readFixtureText(FIXTURES[0]!)).text;
    const indented = text.split("\n").filter((line) => /^[ \t]+\S/.test(line));

    expect(indented).toHaveLength(12);
    expect(withoutIndentation(text).lines).toBe(7);
  });
});
