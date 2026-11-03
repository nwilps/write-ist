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
  const bare = heading.replace(SCENE_NUMBER, "").replace(ASIDE, " ").replace(PREFIX, "");
  const segments = bare
    .replace(/^[\s\-–—]+/, "")
    .split(SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");
  while (segments.length > 1 && isTimeOfDay(segments[segments.length - 1]!)) segments.pop();
  // A heading that is only a time of day (`INT. - DAY`) names no place.
  if (segments.length === 1 && isTimeOfDay(segments[0]!)) return undefined;
  const name = normaliseName(segments.join(" - "));
  return name === "" ? undefined : name;
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
  private threshold: number;
  private changes = 0;

  private entryCache: { version: number; lists: Record<NameKind, readonly NameEntry[]> } | undefined;
  private wordCache: { version: number; words: ReadonlySet<string> } | undefined;

  constructor(options: NameListOptions = {}) {
    this.threshold = options.confirmAfterUses ?? DEFAULT_PREFERENCES.confirmAfterUses;
    for (const kind of KINDS) {
      for (const name of options.explicit?.[kind] ?? []) {
        const key = normaliseName(name);
        if (key !== "") this.confirmedByHand[kind].add(key);
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
    return this.confirmedByHand[kind].has(key) || (this.counts[kind].get(key) ?? 0) >= this.threshold;
  }

  /** The writer says this name is right. */
  confirm(kind: NameKind, name: string): boolean {
    const key = normaliseName(name);
    if (key === "" || this.confirmedByHand[kind].has(key)) return false;
    this.confirmedByHand[kind].add(key);
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
        return { name, uses, explicit, confirmed: explicit || uses >= this.threshold };
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
