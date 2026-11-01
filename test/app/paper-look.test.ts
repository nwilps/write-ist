/**
 * The paper's look, read back from the stylesheet (the desk design, §2.1, §2.6).
 *
 * What the writer sees is colour, so this checks what each element is painted
 * in and that the paper has no frame — not that some rule exists.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
const editor = readFileSync(join(style, "editor.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = readFileSync(join(style, "tokens.css"), "utf8");

/** The declarations of every rule with exactly this selector, joined. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = [...editor.matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "gm"))];
  if (found.length === 0) throw new Error(`no rule for ${selector}`);
  return found.map((match) => match[1]).join("\n");
}

const element = (type: string): string => rule(`.manuscript > [data-element="${type}"]`);

describe("the paper", () => {
  it("is the paper's own colour, with no frame, rounded only at the corner", () => {
    const paper = rule(".page");
    expect(paper).toContain("background: var(--colour-page)");
    expect(paper).toContain("border-radius: var(--radius-paper)");
    expect(paper).not.toMatch(/outline|border(?!-radius)|box-shadow/);
  });

  it("runs the full height of the window, with nothing reserved above it", () => {
    expect(rule(".workspace")).toContain("padding: 0 var(--space-roomy)");
  });
});

describe("what each element is painted in", () => {
  it.each([
    ["scene-heading", "--colour-accent"],
    ["character", "--colour-info"],
    ["transition", "--colour-alarm"],
    ["parenthetical", "--colour-text"],
  ])("%s is %s", (type, colour) => {
    expect(element(type)).toMatch(new RegExp(`color: var\\(${colour}\\)`));
  });

  it("leaves action and dialogue in the text colour they inherit", () => {
    expect(element("action")).not.toContain("color:");
    expect(element("dialogue")).not.toContain("color:");
  });

  it("only names colours the tokens define", () => {
    for (const [, name] of editor.matchAll(/var\((--colour-[a-z-]+)\)/g)) {
      expect(tokens, name).toContain(`${name}:`);
    }
  });
});
