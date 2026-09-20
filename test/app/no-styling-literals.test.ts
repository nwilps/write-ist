/**
 * ADR-0030, made checkable.
 *
 * > **No component holds a styling literal** — not a hex colour, not a pixel
 * > size, not a font name. This is checkable, and cheap to check.
 *
 * So here is the check. Every colour, typeface, size, weight, spacing and
 * radius is a named value in `app/src/style/tokens.css`, and everything else
 * in the application refers to it by name. A theme is then a set of values
 * rather than a code path, and the writer's opinions — which he has said he
 * will have, in quantity, the moment he can see it — cost one edit each.
 *
 * The rule is enforced from the first screen deliberately. Thirteen tickets'
 * worth of components each with its own literals is a hunt every time an
 * opinion arrives, and a guarantee that the fifth screen drifts from the
 * first four.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = join(root, "app");

/** The one place a styling value may be written down. */
const TOKENS = join(APP, "src", "style", "tokens.css");

/**
 * The second, and the reason it is not a third.
 *
 * `geometry.css` is **generated** from `src/screenplay/geometry.ts` — the one
 * table the industry layout and the page count both read (#40) — and
 * `test/app/manuscript-geometry.test.ts` fails if it is not exactly what that
 * table renders. So its literals are not a component's opinion escaping into
 * the stylesheet; they are the table, in the only language the page speaks, and
 * the check that keeps them honest is stricter than this one.
 */
const GENERATED = join(APP, "src", "style", "geometry.css");

/**
 * What a styling literal looks like.
 *
 * Deliberately not a ban on every number: a percentage, a `fr`, a unitless
 * ratio and `0` are layout, and none of them is a value a theme would ever
 * want to change. What is banned is the six ADR-0030 enumerates.
 */
const LITERALS: readonly (readonly [string, RegExp])[] = [
  ["a hex colour", /#[0-9a-fA-F]{3,8}\b/],
  ["a colour function", /\b(?:rgba?|hsla?)\s*\(/],
  // A length with a unit. `var(--space-snug)` has no number in it at all.
  ["a size in absolute units", /(?<![\w-])\d*\.?\d+(?:px|pt|rem|em|ch|vh|vw|cm|mm|in|q)\b/i],
  // The whitespace lives inside the lookahead on purpose: put it in front and
  // the match can start at the space instead, and the lookahead then looks at
  // the wrong place and passes. `inherit` is allowed — it inherits the token
  // `body` was given.
  ["a font name", /font-family\s*:(?!\s*(?:var\(|inherit\b))/],
  ["a numeric font weight", /font-weight\s*:(?!\s*(?:var\(|inherit\b))/],
  ["an inline style", /\bstyle\s*=\s*["']/],
  ["a style set from code", /\.style\.[A-Za-z]/],
];

/** Every file the writer's look is drawn by, other than the tokens themselves. */
function componentFiles(): readonly string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) {
        // The bundled typefaces, not components.
        if (name !== "public" && name !== "node_modules") walk(path);
        continue;
      }
      if (!/\.(css|ts|html)$/.test(name)) continue;
      if (path === TOKENS || path === GENERATED) continue;
      found.push(path);
    }
  };
  walk(APP);
  return found.sort();
}

/** A line each rule must object to, so the rule cannot quietly stop working. */
const OFFENDING: Readonly<Record<string, readonly string[]>> = {
  "a hex colour": ["  color: #ebdbb2;", '  const accent = "#fabd2f";'],
  "a colour function": ["  background: rgba(0, 0, 0, 0.5);"],
  "a size in absolute units": ["  padding: 16px 24px;", "  font-size: 1.5rem;"],
  "a font name": ['  font-family: "JetBrainsMono Nerd Font", monospace;'],
  "a numeric font weight": ["  font-weight: 700;"],
  "an inline style": ['  <p style="color: red">'],
  "a style set from code": ["  panel.style.background = accent;"],
};

describe("the look is data (ADR-0030)", () => {
  // `docs/STANDARDS.md`: a measurement that excludes its own cost is a
  // reassurance, and so is a check that cannot fail. Each rule is shown a line
  // it must object to before it is trusted with the application's.
  for (const [what, pattern] of LITERALS) {
    it(`would catch ${what}`, () => {
      for (const line of OFFENDING[what] ?? []) expect(pattern.test(line), line).toBe(true);
      expect(OFFENDING[what]?.length ?? 0).toBeGreaterThan(0);
    });
  }

  it("has components to check", () => {
    // A check that silently found nothing to check would pass forever.
    const files = componentFiles();
    expect(files.length).toBeGreaterThan(3);
    expect(files.some((path) => path.endsWith(".css"))).toBe(true);
    expect(files.some((path) => path.endsWith(".ts"))).toBe(true);
  });

  for (const [what, pattern] of LITERALS) {
    it(`finds no component holding ${what}`, () => {
      const offences: string[] = [];

      for (const path of componentFiles()) {
        readFileSync(path, "utf8")
          .split("\n")
          .forEach((line, index) => {
            // A comment may quote a value while explaining why it is not one.
            const code = line.replace(/\/\*.*?\*\//g, "").replace(/^\s*(\/\/|\*|\/\*).*$/, "");
            if (pattern.test(code)) {
              offences.push(`${relative(root, path)}:${index + 1}  ${line.trim()}`);
            }
          });
      }

      expect(offences, `Use a named value from ${relative(root, TOKENS)} instead`).toEqual([]);
    });
  }

  it("keeps the two typefaces apart: the interface is not Courier Prime", () => {
    // ADR-0030's deliberate departure from the spike, which sets Courier Prime
    // on `body` and lets everything inherit it. Courier Prime is the
    // manuscript's face; it is not the furniture.
    const tokens = readFileSync(TOKENS, "utf8");
    const interfaceFace = /--face-interface:\s*([^;]+);/.exec(tokens)?.[1] ?? "";
    const manuscriptFace = /--face-manuscript:\s*([^;]+);/.exec(tokens)?.[1] ?? "";

    expect(interfaceFace).toContain("JetBrainsMono Nerd Font");
    expect(interfaceFace).not.toContain("Courier");
    expect(manuscriptFace).toContain("Courier Prime");

    // And the generated file is exempt for a reason, not by oversight: it has
    // to still be there, and still be generated.
    expect(readFileSync(GENERATED, "utf8")).toContain("GENERATED FROM");
  });

  it("bundles the interface typeface rather than resolving it from the system", () => {
    // The writer's own machine has JetBrainsMono Nerd Font and does not have
    // Courier Prime, which is the argument for bundling both (ADR-0030).
    const tokens = readFileSync(TOKENS, "utf8");
    expect(tokens).toContain("@font-face");

    const bundled = readdirSync(join(APP, "public", "fonts")).filter((name) =>
      name.endsWith(".ttf"),
    );
    // Both faces, four weights each. Courier Prime's four are ADR-0001's, and
    // `test/app/manuscript-geometry.test.ts` is where they are checked against
    // the layout they define.
    expect(bundled.sort()).toEqual([
      "CourierPrime-Bold.ttf",
      "CourierPrime-BoldItalic.ttf",
      "CourierPrime-Italic.ttf",
      "CourierPrime-Regular.ttf",
      "JetBrainsMonoNerdFont-Bold.ttf",
      "JetBrainsMonoNerdFont-BoldItalic.ttf",
      "JetBrainsMonoNerdFont-Italic.ttf",
      "JetBrainsMonoNerdFont-Regular.ttf",
    ]);
  });
});
