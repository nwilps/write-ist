/**
 * The names file: what the writer did to the character and location lists by
 * hand (slice 2, step 8, Q1; ADR-0025).
 *
 * Everything else about the name lists is derived from the manuscript and
 * stored nowhere (`src/screenplay/names.ts`). What no manuscript can say is
 * *"this name belongs on the list"* (Add, for a name the script does not use
 * yet) and *"this one does not"* (Remove, for one it does), so those are saved
 * beside it, as plain text:
 *
 *   characters
 *     EDWARD
 *     SANDRA
 *   locations
 *     KITCHEN
 *   removed characters
 *     EDWRAD
 *
 * A kind on a line of its own, then one indented name per line. Kept trivial
 * so the format can change cheaply (the writer accepts it may be revisited).
 * Reading ignores blank lines and kinds it does not know. A removed name's
 * mark is not stored: it is the script's count when the project opens.
 *
 * ## Older files
 *
 * Before 2026-11-22 a removed name was **hidden**, under `hidden characters`
 * and `hidden locations`, each with a count after a tab. Those sections are
 * read as removed — the name stays off its list until it is typed again —
 * and their counts are ignored. The next write puts them under `removed …`.
 *
 * ADR-0008 rule 3 holds here as everywhere: an absent file is a first run and
 * reads as nothing done by hand; one that exists and cannot be read
 * **rejects**, so the caller can refuse to write over it.
 */
import { NAMES_FILE } from "./bundle.ts";
import type { Project } from "./bundle.ts";
import { join, type Filesystem } from "./filesystem.ts";
import { normaliseName, type NameKind } from "../screenplay/names.ts";

/** The names the writer added to each list by hand, and those they removed. */
export interface ListsByHand extends Readonly<Record<NameKind, readonly string[]>> {
  /** The names removed from each list by hand. Absent: none. */
  readonly removed?: Readonly<Record<NameKind, readonly string[]>>;
}

const KINDS: readonly NameKind[] = ["character", "location"];

const HEADINGS: Readonly<Record<NameKind, string>> = {
  character: "characters",
  location: "locations",
};

const REMOVED_HEADINGS: Readonly<Record<NameKind, string>> = {
  character: "removed characters",
  location: "removed locations",
};

/** What an older Write-ist wrote for a removed name: read as removed, never written. */
const HIDDEN_HEADINGS: Readonly<Record<NameKind, string>> = {
  character: "hidden characters",
  location: "hidden locations",
};

export const NOTHING_BY_HAND: ListsByHand = { character: [], location: [] };

/** One section's text: its heading, then its names, each once, in order; nothing when there are none. */
function section(heading: string, names: readonly string[]): string {
  const kept = [...new Set(names.map(normaliseName).filter((name) => name !== ""))].sort();
  return kept.length === 0 ? "" : `${heading}\n${kept.map((name) => `  ${name}\n`).join("")}`;
}

/** The file's text for what the writer did by hand. */
export function serialiseNamesFile(byHand: ListsByHand): string {
  return [
    ...KINDS.map((kind) => section(HEADINGS[kind], byHand[kind])),
    ...KINDS.map((kind) => section(REMOVED_HEADINGS[kind], byHand.removed?.[kind] ?? [])),
  ].join("");
}

/** What a file's text holds. */
export function parseNamesFile(text: string): ListsByHand {
  const added: Record<NameKind, string[]> = { character: [], location: [] };
  const removed: Record<NameKind, string[]> = { character: [], location: [] };
  let into: string[] | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    if (!/^\s/.test(line)) {
      const heading = line.trim().toLowerCase();
      const kind = KINDS.find((one) => heading === HEADINGS[one]);
      const gone = KINDS.find((one) => heading === REMOVED_HEADINGS[one] || heading === HIDDEN_HEADINGS[one]);
      into = kind !== undefined ? added[kind] : gone !== undefined ? removed[gone] : undefined;
      continue;
    }
    if (into === undefined) continue;
    // An older file's hidden name carries a count after a tab: the name is what is before it.
    const name = normaliseName(line.trim().split("\t")[0]!);
    if (name !== "" && !into.includes(name)) into.push(name);
  }
  return removed.character.length === 0 && removed.location.length === 0 ? added : { ...added, removed };
}

/** What the bundle's names file holds; nothing done by hand when there is no file. */
export async function readNamesFile(filesystem: Filesystem, project: Project): Promise<ListsByHand> {
  const path = join(project.path, NAMES_FILE);
  if (!(await filesystem.exists(path))) return NOTHING_BY_HAND;
  const bytes = await filesystem.readFile(path);
  return parseNamesFile(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

/** Write it, whole or not at all (temp, flush, rename). */
export async function writeNamesFile(filesystem: Filesystem, project: Project, byHand: ListsByHand): Promise<void> {
  const bytes = new TextEncoder().encode(serialiseNamesFile(byHand));
  await filesystem.writeFile(join(project.path, NAMES_FILE), bytes);
}
