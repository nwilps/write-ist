/**
 * ADR-0005, made checkable.
 *
 * > **The testable form of that rule: the shell source must not contain the
 * > string `"screenplay"` anywhere.** A declared seam is not a seam. v1's own
 * > architecture document already said modes must never be hard-coded into the
 * > shell, and v1 still produced a 3,535-line `Draft.tsx`. Stating the rule is
 * > what failed last time, so the rule needs a form a test can fail on.
 *
 * So here is the check. **The shell is `app/src/shell/`** — `GLOSSARY.md`: *the
 * application frame that hosts the workspaces and the workspace bar without
 * knowing what any workspace is.* The menu screens and the launcher are not the
 * shell; they are what the writer sees before a project is open, and slice 1's
 * import is a screenplay import by name because there is one surface to import
 * into. Scoping the check to the frame is the scope the term has, and it is the
 * scope where the failure it guards against actually happened.
 *
 * Three rules, because the string is the cheap half. The shell must also not
 * know the surface's **vocabulary** — no element type by name, and no reach into
 * the surface's code — or it knows one surface and the registry is decoration.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ELEMENT_TYPES } from "../../src/screenplay/schema.ts";
import { WORKSPACES } from "../../app/src/workspaces/registry.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHELL = join(root, "app", "src", "shell");

function shellFiles(): readonly string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (/\.(ts|css|html)$/.test(name)) found.push(path);
    }
  };
  walk(SHELL);
  return found.sort();
}

/** The code, with the comments taken out: a rule may be quoted while explained. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * The three rules, as predicates over one file's code.
 *
 * Pulled out so each can be shown a file it must object to before it is trusted
 * with the shell's — `docs/STANDARDS.md`: a check that cannot fail is a
 * reassurance, not a check.
 */
const RULES: readonly (readonly [string, (code: string) => boolean])[] = [
  ["the string \"screenplay\"", (code) => /screenplay/i.test(code)],
  ["an element type by name", (code) => ELEMENT_TYPES.some((type) => code.includes(type))],
  [
    "a reach into a surface's code",
    (code) =>
      [...code.matchAll(/from\s+"([^"]+)"/g)].some((match) =>
        /\/(screenplay|prose)\//.test(match[1]!),
      ),
  ],
];

/** A line each rule must object to. */
const OFFENDING: Readonly<Record<string, string>> = {
  'the string "screenplay"': 'if (project.marker.format === "screenplay") return;',
  "an element type by name": 'const indent = type === "scene-heading" ? 0 : 1;',
  "a reach into a surface's code":
    'import { parse } from "../../../src/screenplay/parse.ts";',
};

describe("the shell knows nothing about what it hosts (ADR-0005)", () => {
  for (const [what, breaks] of RULES) {
    it(`would catch ${what}`, () => {
      const offending = OFFENDING[what]!;
      expect(breaks(offending), offending).toBe(true);
    });
  }

  it("has a shell to check", () => {
    // A check that silently found nothing to check would pass forever.
    const files = shellFiles();
    expect(files.length).toBeGreaterThan(1);
    expect(files.map((path) => relative(root, path))).toContain("app/src/shell/shell.ts");
  });

  // The shell imports the project vocabulary — a project has a path and a
  // marker (ADR-0015) — and the screens it draws its own chrome from. It must
  // not name a surface, name an element, or import a parser, a serialiser or a
  // schema: the moment it can, hosting becomes knowing.
  for (const [what, breaks] of RULES) {
    it(`holds no file carrying ${what}`, () => {
      const offences = shellFiles()
        .filter((path) => breaks(codeOf(path)))
        .map((path) => relative(root, path));

      expect(offences, "a workspace is a manifest; the shell hosts it").toEqual([]);
    });
  }
});

describe("a workspace is a manifest, not surgery in the shell (ADR-0005)", () => {
  it("declares the Editor, then the temporary Notes and Plan placeholders", () => {
    // Notes and Plan are visual placeholders (workspaces/placeholders.ts); the
    // real ones, and Log, are later slices, each a manifest of its own.
    expect(WORKSPACES.map((workspace) => workspace.id)).toEqual(["editor", "notes", "plan"]);
    expect(WORKSPACES[0]?.name).toBe("Editor");
  });

  it("gives every workspace everything the bar will need of it", () => {
    // Declared now rather than added later, because adding a field to a manifest
    // means touching every manifest there is.
    for (const workspace of WORKSPACES) {
      expect(workspace.id).toBeTruthy();
      expect(workspace.name).toBeTruthy();
      expect(workspace.key).toBeTruthy();
      expect(typeof workspace.mount).toBe("function");
    }
  });
});
