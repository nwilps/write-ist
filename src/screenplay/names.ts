/**
 * The character list and the location list, derived from the manuscript
 * (slice 2, step 8; ADR-0022).
 *
 * Nothing is stored for the derivation: the lists are counts of what the
 * elements say, kept up to date by `apply`, which is handed only the elements
 * an edit removed and the ones it put in their place. The one thing that *is*
 * stored is which entries the writer confirmed by hand, and that lives in the
 * bundle's names file (`src/project/names-file.ts`), not here.
 *
 * ## Confirmed
 *
 * An entry is **confirmed** when it is used `confirmAfterUses` or more times,
 * or the writer confirmed it. Fewer uses leave it in the list, unconfirmed:
 * autocomplete (step 9) never offers it and spellcheck (step 10) never treats
 * it as a known word, so one typo cannot seed more typos. Confirmation by use
 * is live — delete cues and the name drops back — but an explicit confirmation
 * stays until the writer takes it away. Changing the threshold changes which
 * entries are confirmed and touches nothing in the manuscript.
 *
 * ## Added and removed by hand (Edit ▸ Character List, Location List)
 *
 * The writer can **add** a name, which confirms it by hand (and so it is
 * offered at once), and **remove** one, which **hides** it: no longer
 * confirmed, so autocomplete stops offering it and the lists' dialogs stop
 * showing it. The manuscript is not touched. A hidden name **quietly returns**
 * once the paper uses it `RETURN_AFTER_USES` more times than when it was hidden
 * — a name the writer keeps typing is a name after all — and its hiding is
 * forgotten. Fewer uses since (cues deleted) lower the mark it counts from.
 * Hidden names are stored with the confirmations, in the names file.
 *
 * A name is one record per kind, keyed by its capitals, so a later Replace
 * (one name for another, through the manuscript) has a single place to act.
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
import { DEFAULT_PREFERENCES } from "../preferences.ts";
import { characterName } from "./continuations.ts";
import type { Element } from "./document.ts";

export type NameKind = "character" | "location";

/** The least of an element the lists need to see. */
export interface NameLine {
  readonly type: Element["type"];
  readonly text: string;
  readonly omitted?: boolean;
}

/** One entry of a list. */
export interface NameEntry {
  /** In capitals, as it is offered and inserted. */
  readonly name: string;
  /** Cues or headings in the manuscript that give this name. */
  readonly uses: number;
  /** Used enough times, or confirmed by the writer. */
  readonly confirmed: boolean;
  /** The writer confirmed it by hand (it stays confirmed whatever the count). */
  readonly explicit: boolean;
  /** Present when the writer removed it from its list: not confirmed, however often it is used. */
  readonly hidden?: true;
}

/** A name the writer removed, and how many uses it had then (the mark it returns from). */
export interface HiddenName {
  readonly name: string;
  readonly since: number;
}

/** Uses beyond the mark at which a hidden name returns to its list. */
export const RETURN_AFTER_USES = 3;

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

/** The words inside a name, in capitals — the unit spellcheck knows. */
export function wordsOf(name: string): string[] {
  return name.split(/[^\p{L}\p{N}'’]+/u).filter((word) => word !== "");
}

export interface NameListOptions {
  /** Uses that confirm an entry. Defaults to the preference. */
  readonly confirmAfterUses?: number;
  /** Names the writer confirmed by hand, from the names file. */
  readonly explicit?: Readonly<Record<NameKind, Iterable<string>>>;
  /** Names the writer removed, from the names file. */
  readonly hidden?: Readonly<Record<NameKind, Iterable<HiddenName>>>;
}

const KINDS: readonly NameKind[] = ["character", "location"];

export class NameLists {
  private readonly counts: Record<NameKind, Map<string, number>> = {
    character: new Map(),
    location: new Map(),
  };
  private readonly confirmedByHand: Record<NameKind, Set<string>> = {
    character: new Set(),
    location: new Set(),
  };
  /** Removed by hand: name → uses when it was removed (lowered as uses fall). */
  private readonly hiddenByHand: Record<NameKind, Map<string, number>> = {
    character: new Map(),
    location: new Map(),
  };
  private threshold: number;
  private changes = 0;
  private hiddenChanges = 0;

  private entryCache: { version: number; lists: Record<NameKind, readonly NameEntry[]> } | undefined;
  private wordCache: { version: number; words: ReadonlySet<string> } | undefined;

  constructor(options: NameListOptions = {}) {
    this.threshold = options.confirmAfterUses ?? DEFAULT_PREFERENCES.confirmAfterUses;
    for (const kind of KINDS) {
      for (const name of options.explicit?.[kind] ?? []) {
        const key = normaliseName(name);
        if (key !== "") this.confirmedByHand[kind].add(key);
      }
      for (const { name, since } of options.hidden?.[kind] ?? []) {
        const key = normaliseName(name);
        if (key !== "" && Number.isInteger(since) && since >= 0) this.hiddenByHand[kind].set(key, since);
      }
    }
  }

  /** The lists for a whole sequence, counted once. */
  static of(lines: readonly NameLine[], options: NameListOptions = {}): NameLists {
    const lists = new NameLists(options);
    lists.apply([], lines);
    return lists;
  }

  /**
   * An edit replaced `removed` with `inserted`. Cost: the size of the edit.
   * Returns whether any count changed, so a caller can skip redrawing.
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
      // Fewer uses than when it was hidden: the next three count from here.
      const hidden = this.hiddenByHand[found.kind];
      const since = hidden.get(found.name);
      if (since !== undefined && Math.max(left, 0) < since) {
        hidden.set(found.name, Math.max(left, 0));
        this.hiddenChanges += 1;
      }
    }
    for (const line of inserted) {
      const found = nameOf(line);
      if (found === undefined) continue;
      const counts = this.counts[found.kind];
      const uses = (counts.get(found.name) ?? 0) + 1;
      counts.set(found.name, uses);
      changed = true;
      // Used enough since it was hidden: it is a name after all, and comes back.
      const hidden = this.hiddenByHand[found.kind];
      const since = hidden.get(found.name);
      if (since !== undefined && uses >= since + RETURN_AFTER_USES) {
        hidden.delete(found.name);
        this.hiddenChanges += 1;
      }
    }
    if (changed) this.changes += 1;
    return changed;
  }

  /** Bumps whenever a hidden name returns or its mark moves: what the names file holds changed. */
  get hiddenVersion(): number {
    return this.hiddenChanges;
  }

  /** Bumps whenever anything an answer depends on changes. */
  get version(): number {
    return this.changes;
  }

  get confirmAfterUses(): number {
    return this.threshold;
  }

  /** Change the threshold. The manuscript is not involved. */
  setConfirmAfterUses(uses: number): void {
    if (uses === this.threshold) return;
    this.threshold = uses;
    this.changes += 1;
  }

  /** Every entry of a list, by name; confirmed or not. */
  entries(kind: NameKind): readonly NameEntry[] {
    return this.cachedEntries()[kind];
  }

  /** The confirmed names of a list, by name. */
  confirmed(kind: NameKind): readonly string[] {
    return this.entries(kind)
      .filter((entry) => entry.confirmed)
      .map((entry) => entry.name);
  }

  /** The entries used fewer times than it takes, and not confirmed by hand. */
  unconfirmed(kind: NameKind): readonly NameEntry[] {
    return this.entries(kind).filter((entry) => !entry.confirmed);
  }

  /** How many times the manuscript uses a name. */
  uses(kind: NameKind, name: string): number {
    return this.counts[kind].get(normaliseName(name)) ?? 0;
  }

  isConfirmed(kind: NameKind, name: string): boolean {
    const key = normaliseName(name);
    if (this.hiddenByHand[kind].has(key)) return false;
    return this.confirmedByHand[kind].has(key) || (this.counts[kind].get(key) ?? 0) >= this.threshold;
  }

  isHidden(kind: NameKind, name: string): boolean {
    return this.hiddenByHand[kind].has(normaliseName(name));
  }

  /**
   * The writer adds a name to its list (Edit ▸ Character List, Location List):
   * confirmed by hand, and no longer hidden if it was. Answers whether
   * anything changed.
   */
  add(kind: NameKind, name: string): boolean {
    const key = normaliseName(name);
    if (key === "") return false;
    const unhidden = this.hiddenByHand[kind].delete(key);
    const confirmed = !this.confirmedByHand[kind].has(key);
    this.confirmedByHand[kind].add(key);
    if (!unhidden && !confirmed) return false;
    if (unhidden) this.hiddenChanges += 1;
    this.changes += 1;
    return true;
  }

  /**
   * The writer removes a name from its list: no longer confirmed by hand, and
   * hidden while the paper still uses it, so that use alone does not offer it
   * again. A name the paper does not use is simply gone. Answers whether
   * anything changed.
   */
  remove(kind: NameKind, name: string): boolean {
    const key = normaliseName(name);
    if (key === "") return false;
    const unconfirmed = this.confirmedByHand[kind].delete(key);
    const uses = this.counts[kind].get(key) ?? 0;
    const hides = uses > 0 && this.hiddenByHand[kind].get(key) !== uses;
    if (hides) {
      this.hiddenByHand[kind].set(key, uses);
      this.hiddenChanges += 1;
    }
    if (!unconfirmed && !hides) return false;
    this.changes += 1;
    return true;
  }

  /** The names the writer removed and their marks, for the names file. */
  hidden(kind: NameKind): readonly HiddenName[] {
    return [...this.hiddenByHand[kind]]
      .sort(([a], [b]) => compareNames(a, b))
      .map(([name, since]) => ({ name, since }));
  }

  /** The writer says this name is right. */
  confirm(kind: NameKind, name: string): boolean {
    const key = normaliseName(name);
    if (key === "" || this.confirmedByHand[kind].has(key)) return false;
    this.confirmedByHand[kind].add(key);
    this.changes += 1;
    return true;
  }

  /**
   * Take back a confirmation by hand (an undone Add to Dictionary). Uses are
   * not touched, so a name used often enough stays confirmed. Answers whether
   * there was one to take back.
   */
  unconfirm(kind: NameKind, name: string): boolean {
    if (!this.confirmedByHand[kind].delete(normaliseName(name))) return false;
    this.changes += 1;
    return true;
  }

  /** The names the writer confirmed by hand, for the names file. */
  explicit(kind: NameKind): readonly string[] {
    return [...this.confirmedByHand[kind]].sort(compareNames);
  }

  /**
   * The confirmed names a prefix begins, for autocomplete (step 9). Case is
   * the writer's to vary; what is returned is in capitals.
   */
  confirmedStartingWith(kind: NameKind, prefix: string): readonly string[] {
    const start = normaliseName(prefix);
    return this.confirmed(kind).filter((name) => name.startsWith(start));
  }

  /**
   * The words inside confirmed names and locations, in capitals — what
   * spellcheck (step 10) does not underline. `BENNETT'S HOSPITAL ROOM`
   * gives `BENNETT'S`, `HOSPITAL` and `ROOM`.
   */
  knownWords(): ReadonlySet<string> {
    if (this.wordCache?.version === this.changes) return this.wordCache.words;
    const words = new Set<string>();
    for (const kind of KINDS) {
      for (const name of this.confirmed(kind)) {
        for (const word of wordsOf(name)) words.add(word);
      }
    }
    this.wordCache = { version: this.changes, words };
    return words;
  }

  private cachedEntries(): Record<NameKind, readonly NameEntry[]> {
    if (this.entryCache?.version === this.changes) return this.entryCache.lists;
    const build = (kind: NameKind): NameEntry[] => {
      const names = new Set<string>([...this.counts[kind].keys(), ...this.confirmedByHand[kind]]);
      return [...names].sort(compareNames).map((name) => {
        const uses = this.counts[kind].get(name) ?? 0;
        const explicit = this.confirmedByHand[kind].has(name);
        const hidden = this.hiddenByHand[kind].has(name);
        const confirmed = !hidden && (explicit || uses >= this.threshold);
        return hidden ? { name, uses, explicit, confirmed, hidden: true as const } : { name, uses, explicit, confirmed };
      });
    };
    const lists = { character: build("character"), location: build("location") };
    this.entryCache = { version: this.changes, lists };
    return lists;
  }
}

function compareNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
