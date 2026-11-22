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
 * The names the writer **removed** from a list (`NameLists.remove`) follow,
 * each with the uses it had then — the mark it returns from — after a tab:
 *
 *   hidden characters
 *     EDWRAD	2
 *
 * An older Write-ist reads past them, as a kind it does not know.
 *
 * ADR-0008 rule 3 holds here as everywhere: an absent file is a first run and
 * reads as nothing confirmed; one that exists and cannot be read **rejects**,
 * so the caller can refuse to write over it.
 */
import { NAMES_FILE } from "./bundle.ts";
import type { Project } from "./bundle.ts";
import { join, type Filesystem } from "./filesystem.ts";
import { normaliseName, type HiddenName, type NameKind } from "../screenplay/names.ts";

export interface Confirmations extends Readonly<Record<NameKind, readonly string[]>> {
  /** The names removed from each list by hand, and their marks. Absent: none. */
  readonly hidden?: Readonly<Record<NameKind, readonly HiddenName[]>>;
}

const HEADINGS: Readonly<Record<NameKind, string>> = {
  character: "characters",
  location: "locations",
};

const HIDDEN_HEADINGS: Readonly<Record<NameKind, string>> = {
  character: "hidden characters",
  location: "hidden locations",
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
  const hidden = (["character", "location"] as const)
    .map((kind) => {
      const byName = new Map<string, number>();
      for (const { name, since } of confirmations.hidden?.[kind] ?? []) {
        const key = normaliseName(name);
        if (key !== "" && Number.isInteger(since) && since >= 0) byName.set(key, since);
      }
      const names = [...byName].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return names.length === 0 ? "" : `${HIDDEN_HEADINGS[kind]}\n${names.map(([name, since]) => `  ${name}\t${since}\n`).join("")}`;
    })
    .filter((section) => section !== "");
  return [...sections, ...hidden].join("");
}

/** The confirmations a file's text holds. */
export function parseConfirmations(text: string): Confirmations {
  const found: Record<NameKind, string[]> = { character: [], location: [] };
  const hidden: Record<NameKind, HiddenName[]> = { character: [], location: [] };
  let kind: NameKind | undefined;
  let hiding = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    if (!/^\s/.test(line)) {
      const heading = line.trim().toLowerCase();
      hiding = heading === HIDDEN_HEADINGS.character || heading === HIDDEN_HEADINGS.location;
      kind =
        heading === HEADINGS.character || heading === HIDDEN_HEADINGS.character
          ? "character"
          : heading === HEADINGS.location || heading === HIDDEN_HEADINGS.location
            ? "location"
            : undefined;
      continue;
    }
    if (kind === undefined) continue;
    if (hiding) {
      // A name, a tab, its mark. A mark that is not a count is no mark: none.
      const [raw = "", mark = ""] = line.split("\t");
      const name = normaliseName(raw);
      const since = /^\d+$/.test(mark.trim()) ? Number(mark.trim()) : 0;
      if (name !== "") hidden[kind].push({ name, since });
      continue;
    }
    const name = normaliseName(line);
    if (name !== "") found[kind].push(name);
  }
  return hidden.character.length === 0 && hidden.location.length === 0 ? found : { ...found, hidden };
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
