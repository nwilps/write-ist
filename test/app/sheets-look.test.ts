/**
 * The seams between sheets, read back from the stylesheet (the desk design,
 * §2.7; ADR-0033).
 *
 * What the writer sees is geometry: a sheet is 11in tall and holds 55 rows, a
 * strip of desk lies between two sheets, and nothing is a number written in
 * the rule. So this checks the sums that make the seam land the next sheet's
 * first row exactly where the page count says it is.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PAGE } from "../../src/screenplay/geometry.ts";

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
const read = (name: string): string => readFileSync(join(style, name), "utf8");
const sheets = read("sheets.css").replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = read("tokens.css");
const geometry = read("geometry.css");

const px = (source: string, name: string): number => {
  const found = new RegExp(`${name}:\\s*([\\d.]+)px`).exec(source);
  if (found === null) throw new Error(`no ${name}`);
  return Number(found[1]);
};

/** The declarations of the rule with exactly this selector. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, "\\$&");
  const found = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m").exec(sheets);
  if (found === null) throw new Error(`no rule for ${selector}`);
  return found[1]!;
}

describe("a sheet and the seam below it", () => {
  const size = px(geometry, "--manuscript-size");
  const row = size * 1; // --manuscript-leading: 1

  it("is 11in: the top margin, 55 rows and the bottom margin", () => {
    const sheet =
      px(geometry, "--page-inset-top") +
      PAGE.linesPerPage * row +
      px(geometry, "--page-inset-bottom");
    expect(sheet).toBe(px(geometry, "--page-height"));
    expect(sheet).toBe(PAGE.heightInches * 96);
  });

  it("draws the foot as one row per newline, then the bottom margin", () => {
    const foot = rule(".sheet-break__foot");
    expect(foot).toContain("white-space: pre");
    expect(foot).toContain("padding-bottom: var(--page-inset-bottom)");
  });

  it("shows 28px of desk between sheets, in the desk's own colour", () => {
    expect(px(tokens, "--sheet-gap")).toBe(28);
    const desk = rule(".sheet-break__desk");
    expect(desk).toContain("height: var(--sheet-gap)");
    expect(desk).toContain("background: var(--colour-base)");
  });

  it("puts the page number 48px down, ending at 7.5in", () => {
    expect(px(tokens, "--page-number-top")).toBe(48);
    expect(px(geometry, "--page-width") - px(tokens, "--page-number-right")).toBe(7.5 * 96);
    const head = rule(".sheet-break__head");
    expect(head).toContain("height: var(--page-inset-top)");
    expect(head).toContain("padding-top: var(--page-number-top)");
    expect(head).toContain("padding-right: var(--page-number-right)");
    expect(head).toContain("text-align: right");
  });

  it("keeps a reopened cue inside the top margin, so the sheet still holds 55 rows", () => {
    expect(rule(".sheet-break__head--cued")).toContain(
      "height: calc(var(--page-inset-top) - var(--manuscript-blank))",
    );
  });

  it("paints (MORE) and the extension faint, and the cue's name as a cue", () => {
    expect(rule(".sheet-break__more,\n.sheet-break__contd")).toContain(
      "color: var(--colour-faint)",
    );
    expect(rule(".sheet-break__cue")).toContain("color: var(--colour-info)");
  });

  it("has no blank row above a sheet's first line", () => {
    expect(rule(".manuscript > .sheet-break + [data-element]")).toContain("margin-top: 0");
    expect(rule(".manuscript > .sheet-break")).toContain("margin-top: 0");
  });

  it("starts at the sheet's left edge from inside an element that splits", () => {
    for (const type of ["action", "dialogue", "centered"]) {
      expect(rule(`.manuscript > [data-element="${type}"] > .sheet-break`)).toContain(
        `margin-left: calc(-1 * (var(--page-inset-left) + var(--indent-${type})))`,
      );
    }
  });
});
