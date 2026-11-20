/**
 * The drop shadows that lift the paper, the side panels and the pills off the
 * desk and the background moving behind it, read back from the stylesheets.
 *
 * What the writer sees is a shadow that is whole: not cut off by a box that
 * clips, rounded or square with the corner settings, falling into the gap
 * between two sheets without filling it, and fading out with the paper at the
 * window's edges when the paper itself fades.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
const sheet = (name: string): string =>
  readFileSync(join(style, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = sheet("tokens.css");

/** The declarations of every rule with exactly this selector, joined. */
function rule(file: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = [...sheet(file).matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "gm"))];
  if (found.length === 0) throw new Error(`no rule for ${selector}`);
  return found.map((match) => match[1]).join("\n");
}

/** A token's value, whitespace folded. */
function token(name: string): string {
  const found = new RegExp(`${name}:\\s*([^;]+);`).exec(tokens);
  if (found === null) throw new Error(`no ${name}`);
  return found[1]!.replace(/\s+/g, " ").trim();
}

describe("the shadow tokens", () => {
  it("are made of the desk's own colour taken towards black", () => {
    expect(token("--colour-shadow")).toBe("color-mix(in srgb, var(--colour-base) 30%, black)");
  });

  it.each(["--shadow-float", "--shadow-paper"])(
    "%s is two quiet layers, falling downward, from the shadow colour",
    (name) => {
      const layers = token(name).split(/,\s*(?=0 )/);
      expect(layers).toHaveLength(2);
      for (const layer of layers) {
        // No sideways offset, a downward one, a blur, and no spread or inset.
        expect(layer).toMatch(/^0 \d+px \d+px color-mix\(in srgb, var\(--colour-shadow\) \d+%, transparent\)$/);
      }
    },
  );

  it("gives the paper a little more lift than what floats beside it", () => {
    // The soft, outer layer's blur: the second layer's.
    const blur = (name: string): number =>
      Number([...token(name).matchAll(/(?:^|, )0 \d+px (\d+)px /g)][1]![1]);
    expect(blur("--shadow-paper")).toBeGreaterThan(blur("--shadow-float"));
  });
});

describe("nothing clips a shadow", () => {
  it.each([
    ["editor.css", ".page"],
    ["editor.css", ".workspace"],
    ["editor.css", ".pills"],
    ["panels.css", ".desk"],
    ["panels.css", ".desk__column"],
    ["panels.css", ".panel"],
  ])("%s leaves %s's overflow visible", (file, selector) => {
    expect(rule(file, selector)).not.toMatch(/overflow|clip-path|contain:/);
  });

  it("keeps the workspace's padding beside the paper, so its shadow has room", () => {
    expect(rule("editor.css", ".workspace")).toContain("padding: 0 var(--space-roomy)");
  });
});

describe("the corners", () => {
  it("round the paper's shadow with the paper, and the floating ones with the interface", () => {
    expect(rule("editor.css", ".page")).toContain("border-radius: var(--radius-paper)");
    expect(rule("panels.css", ".panel")).toContain("border-radius: var(--radius-float)");
    expect(rule("editor.css", ".pill")).toContain("border-radius: var(--radius-float)");
  });

  it("go square with the settings, and the shadow with them", () => {
    expect(rule("tokens.css", ':root[data-interface-corners="sharp"]')).toContain("--radius-float: 0px");
    expect(rule("tokens.css", ':root[data-paper-corners="sharp"]')).toContain("--radius-paper: 0px");
  });
});

describe("between two sheets", () => {
  it("the foot of the sheet above shades the top of the gap, over the desk's colour", () => {
    const desk = rule("sheets.css", ".sheet-break__desk");
    expect(desk).toContain("background: var(--colour-base)");
    expect(desk).toContain("background-image: var(--shade-paper-seam)");
    expect(desk.indexOf("background:")).toBeLessThan(desk.indexOf("background-image:"));
  });

  it("fades out before the next sheet, so the gap stays desk", () => {
    expect(token("--shade-paper-seam")).toMatch(/^linear-gradient\( to bottom, .+, transparent \d+% \)$/);
  });
});

describe("at the window's top and bottom edges", () => {
  it("fades the paper's shadow out with the paper while the background is off", () => {
    expect(rule("editor.css", ':root:not([data-background-animation="on"]) .paper-fade')).toContain(
      "calc(var(--page-width) * var(--paper-zoom) + 2 * var(--size-paper-shadow-reach))",
    );
  });

  it("reaches no further than the gap to the panels, so it never paints over them", () => {
    expect(token("--size-paper-shadow-reach")).toBe("var(--space-panel-gap)");
  });

  it("keeps to the paper's own width while the background is on", () => {
    expect(rule("editor.css", ".paper-fade")).toContain(
      "width: min(calc(var(--page-width) * var(--paper-zoom)), 100%)",
    );
    expect(rule("editor.css", ':root[data-background-animation="on"] .paper-fade')).not.toContain("width");
  });
});
