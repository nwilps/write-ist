/**
 * The character list and the location list, derived from the manuscript
 * (slice 2, step 8; ADR-0022).
 *
 * The lists are counts of what the elements say, kept up to date by `apply`,
 * which is handed only the elements an edit removed and the ones it put in
 * their place. What the writer did by hand is the one thing stored, in the
 * bundle's names file (`src/project/names-file.ts`), not here.
 *
 * ## On the list
 *
 * A name is **on its list once it is used** — one cue, one heading — or once
 * the writer adds it by hand (Noah, 2026-11-22). There is no count to reach.
 * Autocomplete offers what is on the list. A name used and then no longer
 * used leaves its list; a name added by hand stays on it, used or not.
 *
 * ## Added and removed by hand (Edit ▸ Character List, Location List)
 *
 * **Add** puts a name on its list at once. **Remove** takes it off: it is
 * **deleted from the list**, not hidden, and the manuscript is not touched.
 *
 * A removed name **comes back only when it is typed again as a new use**.
 * The names already in the script never bring it back — not as the list is
 * worked out again, not when a dialog closes, not when the project reopens.
 * So a removed name keeps a **mark**: how many uses the script had of it when
 * it was removed, or when the project was opened, whichever is later. It
 * returns once the script has **more** uses than that, and the caret has left
 * the cue or heading that gave it the new one (`settle`). That way:
 *
 * - fixing a letter of a cue that was already there, undoing a cut, or pasting
 *   a scene back is not a new use, and brings nothing back;
 * - typing `ED` on the way to `EDWARD` does not bring back a removed `ED`.
 *
 * The mark is never lowered while the project is open (deleting a cue and
 * typing it again is not a new use), and is not stored: on opening, it is the
 * script's count then. Only the removed names are stored.
 *
 * A name is one record per kind, keyed by its capitals, so a later Replace
 * (one name for another, through the manuscript) has a single place to act.
 *
 * ## Spelling
 *
 * The lists have nothing to do with spellcheck or the dictionary
 * (`spelling.ts`): a name on a list is not a dictionary word.
 *
 * ## Who is speaking, and where
 *
 * The name of a cue is `characterName` (`continuations.ts`), called and not
 * copied: import, typing and this list are three callers of one rule. The
 * location of a heading is `locationName` below. Both are put in capitals and
 * single-spaced, so `Edward` and `EDWARD` are one entry.
 *
 * A use is one cue element or one heading. Cut material (the boneyard) is
 * skipped, and so is a cue or heading with nothing left after the rule.
 */
import { characterName } from "./continuations.ts";
import type { Element } from "./document.ts";

export type NameKind = "character" | "location";

/** The least of an element the lists need to see. */
export interface NameLine {
  readonly type: Element["type"];
  readonly text: string;
  readonly omitted?: boolean;
}

/** A name as the lists key it: capitals, single-spaced. */
export function normaliseName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toUpperCase();
}

/** `INT.`, `EXT.`, `EST.`, `INT./EXT.`, `EXT./INT.`, `INT/EXT.`, `EXT/INT.`, `I/E.` (ADR-0021). */
const PREFIX = /^(?:INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\s*\/\s*E|INT|EXT|EST)(?:\.|\s|$)\s*/i;

/** `#1#`, `#12A#` at the end of a heading. */
const SCENE_NUMBER = /\s*#[^#\s]+#\s*$/;

/** `[LATER]`, `[PRESENT]`, `[MID/LATE '70'S]`: a writer's aside about the scene, not the place. */
const ASIDE = /\s*\[[^\]]*\]/g;

/** A hyphen needs a space before it; an en or em dash does not (`ANTI-MATTER` is one word). */
const SEPARATOR = /\s+[-]+\s*|\s*[–—]+\s*/;

/** The words a time-of-day segment is made of. */
const TIME_WORDS: ReadonlySet<string> = new Set([
  "DAY", "DAYS", "NIGHT", "NIGHTS", "DAWN", "DUSK", "MORNING", "EVENING", "AFTERNOON", "NOON",
  "MIDNIGHT", "PRE-DAWN", "PREDAWN", "TO", "ANOTHER", "PRESENT", "SUNRISE", "SUNSET", "TWILIGHT", "DAYBREAK", "CONTINUOUS", "CONTINUING", "LATER",
  "EARLIER", "SAME", "TIME", "MOMENTS", "MOMENT", "MAGIC", "HOUR", "NEXT", "THAT", "THE",
  "FOLLOWING", "LATE", "EARLY", "AND", "ACTION", "DAYTIME", "NIGHTTIME", "LUNCHTIME",
]);

/** Whether a segment after a dash is a time of day: `DAY`, `NIGHT (1987)`, `LATER THAT NIGHT`. */
function isTimeOfDay(segment: string): boolean {
  const words = segment
    .replace(/\([^)]*\)/g, " ")
    .toUpperCase()
    .split(/[\s/,&.]+/)
    .filter((word) => word !== "");
  return words.length > 0 && words.every((word) => TIME_WORDS.has(word));
}

/**
 * The place a scene heading names, or undefined when nothing is left.
 *
 * The INT./EXT. prefix, a scene number, any `[bracketed aside]` and the
 * trailing time of day are set aside, so `INT. KITCHEN - DAY` and `EXT. KITCHEN - NIGHT (1987)` are both
 * `KITCHEN`. Only a *time of day* is dropped from the end, never any trailing
 * segment: `INT. HOUSE - KITCHEN - DAY` is `HOUSE - KITCHEN`.
 */
export function locationName(heading: string): string | undefined {
  const segments = locationSegments(heading);
  if (segments === undefined) return undefined;
  const name = normaliseName(segments.map((segment) => segment.text).join(" - "));
  return name === "" ? undefined : name;
}

/**
 * Where in a scene heading's text the place `locationName` reads sits, as
 * offsets into that text: `INT. KITCHEN - DAY` gives the span of `KITCHEN`.
 * Undefined when the heading names no place.
 */
export function locationRange(heading: string): { readonly from: number; readonly to: number } | undefined {
  const segments = locationSegments(heading);
  if (segments === undefined || segments.length === 0) return undefined;
  return { from: segments[0]!.from, to: segments[segments.length - 1]!.to };
}

/** Blank out what a pattern matches, so every offset still points into the heading. */
function blanked(text: string, pattern: RegExp): string {
  return text.replace(pattern, (found) => " ".repeat(found.length));
}

/**
 * The segments of a heading's place, each with where it sits in the heading:
 * one parse for both the name and its span.
 */
function locationSegments(heading: string): { readonly text: string; readonly from: number; readonly to: number }[] | undefined {
  const bare = blanked(blanked(blanked(heading, SCENE_NUMBER), ASIDE), PREFIX);
  const start = /^[\s\-–—]*/.exec(bare)![0].length;
  const segments: { text: string; from: number; to: number }[] = [];
  const separators = new RegExp(SEPARATOR.source, "g");
  let from = start;
  const take = (to: number): void => {
    const raw = bare.slice(from, to);
    const text = raw.trim();
    if (text === "") return;
    const lead = raw.length - raw.trimStart().length;
    segments.push({ text, from: from + lead, to: from + lead + text.length });
  };
  separators.lastIndex = start;
  for (let found = separators.exec(bare); found !== null; found = separators.exec(bare)) {
    take(found.index);
    from = found.index + found[0].length;
  }
  take(bare.length);
  while (segments.length > 1 && isTimeOfDay(segments[segments.length - 1]!.text)) segments.pop();
  // A heading that is only a time of day (`INT. - DAY`) names no place.
  if (segments.length === 1 && isTimeOfDay(segments[0]!.text)) return undefined;
  return segments;
}

/** What one element contributes to the lists, if anything. */
export function nameOf(line: NameLine): { readonly kind: NameKind; readonly name: string } | undefined {
  if (line.omitted === true) return undefined;
  if (line.type === "character") {
    const name = normaliseName(characterName(line.text));
    return name === "" ? undefined : { kind: "character", name };
  }
  if (line.type === "scene-heading") {
    const name = locationName(line.text);
    return name === undefined ? undefined : { kind: "location", name };
  }
  return undefined;
}

/** One name, as the census counts it. */
export interface NameEntry {
  /** In capitals, as it is offered and inserted. */
  readonly name: string;
  /** Cues or headings in the manuscript that give this name. */
  readonly uses: number;
  /** On its list: not removed by the writer. */
  readonly listed: boolean;
}

export interface NameListOptions {
  /** Names the writer added by hand, from the names file. */
  readonly added?: Readonly<Record<NameKind, Iterable<string>>>;
  /** Names the writer removed, from the names file. */
  readonly removed?: Readonly<Record<NameKind, Iterable<string>>>;
}

const KINDS: readonly NameKind[] = ["character", "location"];

export class NameLists {
  private readonly counts: Record<NameKind, Map<string, number>> = {
    character: new Map(),
    location: new Map(),
  };
  private readonly addedByHand: Record<NameKind, Set<string>> = {
    character: new Set(),
    location: new Set(),
  };
  /** Removed by hand: name → its mark, the uses it had when removed or when the project opened. */
  private readonly removedByHand: Record<NameKind, Map<string, number>> = {
    character: new Map(),
    location: new Map(),
  };
  private changes = 0;
  private removedChanges = 0;

  private listCache: { version: number; lists: Record<NameKind, readonly string[]> } | undefined;

  constructor(options: Pick<NameListOptions, "added"> = {}) {
    for (const kind of KINDS) {
      for (const name of options.added?.[kind] ?? []) {
        const key = normaliseName(name);
        if (key !== "") this.addedByHand[kind].add(key);
      }
    }
  }

  /**
   * The lists for a whole sequence, counted once. A removed name's mark is
   * its count here, so nothing already in the script brings it back; one the
   * script does not use is simply off the list, and needs no mark.
   */
  static of(lines: readonly NameLine[], options: NameListOptions = {}): NameLists {
    const lists = new NameLists(options);
    lists.apply([], lines);
    for (const kind of KINDS) {
      for (const name of options.removed?.[kind] ?? []) {
        const key = normaliseName(name);
        if (key === "" || lists.addedByHand[kind].has(key)) continue;
        const uses = lists.counts[kind].get(key) ?? 0;
        if (uses > 0) lists.removedByHand[kind].set(key, uses);
      }
    }
    lists.changes += 1;
    return lists;
  }

  /**
   * An edit replaced `removed` with `inserted`. Cost: the size of the edit.
   * Returns whether any count changed, so a caller can skip redrawing.
   * A removed name is not brought back here: that is `settle`'s.
   */
  apply(removed: readonly NameLine[], inserted: readonly NameLine[]): boolean {
    let changed = false;
    for (const line of removed) {
      const found = nameOf(line);
      if (found === undefined) continue;
      const counts = this.counts[found.kind];
      const left = (counts.get(found.name) ?? 0) - 1;
      if (left > 0) counts.set(found.name, left);
      else counts.delete(found.name);
      changed = true;
    }
    for (const line of inserted) {
      const found = nameOf(line);
      if (found === undefined) continue;
      const counts = this.counts[found.kind];
      counts.set(found.name, (counts.get(found.name) ?? 0) + 1);
      changed = true;
    }
    if (changed) this.changes += 1;
    return changed;
  }

  /**
   * Bring back every removed name the script now uses more than its mark —
   * a new use, typed — except the one the caret is still in (`typing`), which
   * may yet become another name. Answers whether any came back.
   */
  settle(typing?: { readonly kind: NameKind; readonly name: string }): boolean {
    let back = false;
    for (const kind of KINDS) {
      const removed = this.removedByHand[kind];
      if (removed.size === 0) continue;
      for (const [name, mark] of removed) {
        if ((this.counts[kind].get(name) ?? 0) <= mark) continue;
        if (typing !== undefined && typing.kind === kind && typing.name === name) continue;
        removed.delete(name);
        back = true;
      }
    }
    if (back) {
      this.changes += 1;
      this.removedChanges += 1;
    }
    return back;
  }

  /** Bumps whenever the names removed by hand change: what the names file holds changed. */
  get removedVersion(): number {
    return this.removedChanges;
  }

  /** Bumps whenever anything an answer depends on changes. */
  get version(): number {
    return this.changes;
  }

  /** The names on a list, by name: used or added by hand, and not removed. */
  list(kind: NameKind): readonly string[] {
    return this.cachedLists()[kind];
  }

  /**
   * Every name the manuscript uses or the writer added, by name, with its
   * uses and whether it is on the list — the census a test or a measure reads.
   */
  entries(kind: NameKind): readonly NameEntry[] {
    const names = new Set<string>([...this.counts[kind].keys(), ...this.addedByHand[kind]]);
    return [...names].sort(compareNames).map((name) => ({
      name,
      uses: this.counts[kind].get(name) ?? 0,
      listed: !this.removedByHand[kind].has(name),
    }));
  }

  /** How many times the manuscript uses a name. */
  uses(kind: NameKind, name: string): number {
    return this.counts[kind].get(normaliseName(name)) ?? 0;
  }

  isListed(kind: NameKind, name: string): boolean {
    const key = normaliseName(name);
    if (this.removedByHand[kind].has(key)) return false;
    return this.addedByHand[kind].has(key) || (this.counts[kind].get(key) ?? 0) > 0;
  }

  isRemoved(kind: NameKind, name: string): boolean {
    return this.removedByHand[kind].has(normaliseName(name));
  }

  /**
   * The writer adds a name to its list (Edit ▸ Character List, Location List):
   * on it at once, and no longer removed if it was. Answers whether anything
   * changed.
   */
  add(kind: NameKind, name: string): boolean {
    const key = normaliseName(name);
    if (key === "") return false;
    const unremoved = this.removedByHand[kind].delete(key);
    const added = !this.addedByHand[kind].has(key);
    this.addedByHand[kind].add(key);
    if (!unremoved && !added) return false;
    if (unremoved) this.removedChanges += 1;
    this.changes += 1;
    return true;
  }

  /**
   * The writer removes a name from its list: deleted from it, and marked at
   * the uses the script has now, so those uses do not put it back. A name the
   * script does not use needs no mark. Answers whether anything changed.
   */
  remove(kind: NameKind, name: string): boolean {
    const key = normaliseName(name);
    if (key === "") return false;
    const wasAdded = this.addedByHand[kind].delete(key);
    const uses = this.counts[kind].get(key) ?? 0;
    const marks = uses > 0 && !this.removedByHand[kind].has(key);
    if (marks) {
      this.removedByHand[kind].set(key, uses);
      this.removedChanges += 1;
    }
    if (!wasAdded && !marks) return false;
    this.changes += 1;
    return true;
  }

  /** The names the writer added by hand, for the names file. */
  added(kind: NameKind): readonly string[] {
    return [...this.addedByHand[kind]].sort(compareNames);
  }

  /** The names the writer removed and that have not come back, for the names file. */
  removed(kind: NameKind): readonly string[] {
    return [...this.removedByHand[kind].keys()].sort(compareNames);
  }

  /**
   * The names on a list a prefix begins, for autocomplete (step 9). Case is
   * the writer's to vary; what is returned is in capitals.
   */
  startingWith(kind: NameKind, prefix: string): readonly string[] {
    const start = normaliseName(prefix);
    return this.list(kind).filter((name) => name.startsWith(start));
  }

  private cachedLists(): Record<NameKind, readonly string[]> {
    if (this.listCache?.version === this.changes) return this.listCache.lists;
    const build = (kind: NameKind): string[] => {
      const names = new Set<string>([...this.counts[kind].keys(), ...this.addedByHand[kind]]);
      return [...names].filter((name) => !this.removedByHand[kind].has(name)).sort(compareNames);
    };
    const lists = { character: build("character"), location: build("location") };
    this.listCache = { version: this.changes, lists };
    return lists;
  }
}

function compareNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
