/**
 * The names file: the characters and locations the writer confirmed by hand
 * (slice 2, step 8, Q1; ADR-0025).
 *
 * Everything else about the name lists is derived from the manuscript and
 * stored nowhere. This is the one fact no manuscript can say — *"this name is
 * right, whatever the count"* — so it is saved beside it, as plain text:
 *
 *   characters
 *     EDWARD
 *     SANDRA
 *   locations
 *     KITCHEN
 *
 * A kind on a line of its own, then one indented name per line. Kept trivial
 * so the format can change cheaply (the writer accepts it may be revisited).
 * Reading ignores blank lines and kinds it does not know.
 *
 * ADR-0008 rule 3 holds here as everywhere: an absent file is a first run and
 * reads as nothing confirmed; one that exists and cannot be read **rejects**,
 * so the caller can refuse to write over it.
 */
import { NAMES_FILE } from "./bundle.ts";
import type { Project } from "./bundle.ts";
import { join, type Filesystem } from "./filesystem.ts";
import { normaliseName, type NameKind } from "../screenplay/names.ts";

export type Confirmations = Readonly<Record<NameKind, readonly string[]>>;

const HEADINGS: Readonly<Record<NameKind, string>> = {
  character: "characters",
  location: "locations",
};

export const NO_CONFIRMATIONS: Confirmations = { character: [], location: [] };

/** The file's text for a set of confirmations. */
export function serialiseConfirmations(confirmations: Confirmations): string {
  const sections = (["character", "location"] as const)
    .map((kind) => {
      const names = [...new Set(confirmations[kind].map(normaliseName).filter((name) => name !== ""))].sort();
      return names.length === 0 ? "" : `${HEADINGS[kind]}\n${names.map((name) => `  ${name}\n`).join("")}`;
    })
    .filter((section) => section !== "");
  return sections.join("");
}

/** The confirmations a file's text holds. */
export function parseConfirmations(text: string): Confirmations {
  const found: Record<NameKind, string[]> = { character: [], location: [] };
  let kind: NameKind | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    if (!/^\s/.test(line)) {
      const heading = line.trim().toLowerCase();
      kind = heading === HEADINGS.character ? "character" : heading === HEADINGS.location ? "location" : undefined;
      continue;
    }
    const name = normaliseName(line);
    if (kind !== undefined && name !== "") found[kind].push(name);
  }
  return found;
}

/** What the bundle's names file holds; nothing confirmed when there is no file. */
export async function readConfirmations(
  filesystem: Filesystem,
  project: Project,
): Promise<Confirmations> {
  const path = join(project.path, NAMES_FILE);
  if (!(await filesystem.exists(path))) return NO_CONFIRMATIONS;
  const bytes = await filesystem.readFile(path);
  return parseConfirmations(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

/** Write the confirmations, whole or not at all (temp, flush, rename). */
export async function writeConfirmations(
  filesystem: Filesystem,
  project: Project,
  confirmations: Confirmations,
): Promise<void> {
  const bytes = new TextEncoder().encode(serialiseConfirmations(confirmations));
  await filesystem.writeFile(join(project.path, NAMES_FILE), bytes);
}
