/**
 * Spelling, without the editor (slice 2, step 10; ADR-0032).
 *
 * What a word is, which words the screenplay's own vocabulary makes right, and
 * what a verdict from the dictionary means once the script's confirmed names
 * are taken into account. Nothing here touches ProseMirror or the DOM, and
 * **nothing here looks a word up**: that is the engine's, on the other side of
 * the `SpellEngine` port, in Rust.
 *
 * ## The port
 *
 * `SpellEngine` is the whole of what the application asks of a dictionary:
 * *which of these words do you not know*, *what might this have been*, and
 * *remember this one*. The Rust crate (`spellbook`) sits behind it today and
 * native Hunspell could sit behind it tomorrow; the dictionaries, the notices
 * and everything in this file stay as they are.
 *
 * ## What a verdict is
 *
 * 1. A word inside a **confirmed** name or location is known (`knownWords()`),
 *    and so is its possessive. A confirmed `EDWARD` makes `Edward's` right.
 * 2. The screenplay's own terms are known: `INT`, `EXT`, `CONT'D`, `POV`…
 *    Single letters are never checked (`V.O.` is `V` and `O`).
 * 3. Otherwise the dictionary decides, once per distinct word: a verdict is
 *    cached, so a recheck of one scene asks the engine about no word it has
 *    already seen.
 * 4. A word the dictionary does not know — or a capitalised word that is an
 *    **unconfirmed** character name (used once or twice) — within a small edit
 *    distance of a confirmed word is a **near-match**: *"Did you mean
 *    MICHAEL?"* (Q-T).
 *    Everything else the dictionary does not know is a plain misspelling.
 */
import type { Element } from "./document.ts";
import { wordsOf, type NameLists } from "./names.ts";

/** The dictionary, as the application sees it. */
export interface SpellEngine {
  /** Those of `words` the dictionary does not know. Order and duplicates are not significant. */
  misspelled(words: readonly string[]): Promise<readonly string[]>;
  /** What `word` might have been, best first. */
  suggest(word: string): Promise<readonly string[]>;
  /** Make `word` right from now on, and remember it between sessions. */
  addWord(word: string): Promise<void>;
}

/** The tunable values, named (`preferences.ts` carries the defaults). */
export interface SpellingOptions {
  /** Damerau–Levenshtein distance within which a word is a near-match of a confirmed one. */
  readonly nearDistance: number;
  /** Shortest word a near-match is offered for. */
  readonly nearMinLength: number;
}

/** A word in a line of text. */
export interface Token {
  readonly word: string;
  /** Offset of the first character within the text. */
  readonly start: number;
  /** Offset after the last character. */
  readonly end: number;
}

/** A letter or digit, then more of them, with apostrophes inside: `don't`, `BENNETT'S`. */
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;

/** `[[a note]]`, and the comment delimiters that survive in a line: not prose. */
const INLINE_NOTE = /\[\[[^\]]*\]\]/g;

/**
 * The words of a line that are worth checking.
 *
 * Hyphens, slashes and dots split words (`ANTI-MATTER`, `INT./EXT.`). A token
 * with a digit in it (`1987`, `4TH`) is not a word, and a single letter is
 * never wrong. Inline notes are blanked, not removed, so offsets stay true.
 */
export function tokensOf(text: string): Token[] {
  const tokens: Token[] = [];
  const clean = text.includes("[[") ? text.replace(INLINE_NOTE, (note) => " ".repeat(note.length)) : text;
  for (const match of clean.matchAll(WORD)) {
    const word = match[0];
    if (/\p{N}/u.test(word)) continue;
    if (word.length < 2) continue;
    tokens.push({ word, start: match.index, end: match.index + word.length });
  }
  return tokens;
}

/** What the engine is sent: the typographic apostrophe is the plain one. */
export function forEngine(word: string): string {
  return word.replace(/’/g, "'");
}

/**
 * The screenplay's own vocabulary, in capitals: abbreviations no dictionary
 * for English prose carries and no writer should be told off for.
 */
export const SCREENPLAY_TERMS: ReadonlySet<string> = new Set([
  "INT", "EXT", "EST", "CONT'D", "CONTD", "CONT", "POV", "SFX", "VFX", "FX", "MOS", "OTS", "ECU",
  "CU", "XCU", "WS", "MS", "OS", "OC", "VO", "FG", "BG", "SUPER", "DISSOLVE", "INSERT", "ANGLE", "INTERCUT",
]);

/** The elements whose text is not on the paper as prose, so is not checked. */
const UNCHECKED: ReadonlySet<Element["type"]> = new Set([
  "note", "boneyard-start", "boneyard-end", "page-break", "section", "synopsis",
]);

/** Whether an element's words are checked: everything the writer sees, nothing cut or noted. */
export function isChecked(type: Element["type"], omitted: boolean): boolean {
  return !omitted && !UNCHECKED.has(type);
}

/** What a verdict needs to know about the script. */
export interface SpellContext {
  /** Words inside confirmed names and locations, in capitals. */
  readonly known: ReadonlySet<string>;
  /** Words of character names used too few times to be confirmed, in capitals. */
  readonly unconfirmed: ReadonlySet<string>;
}

export const NO_CONTEXT: SpellContext = { known: new Set(), unconfirmed: new Set() };

/** The context a set of lists makes. */
export function contextOf(names: NameLists): SpellContext {
  const known = names.knownWords();
  // Characters only: a place's words are ordinary words (`HILL`, `RING`), and a
  // word the dictionary knows is not second-guessed because a heading used it.
  const unconfirmed = new Set<string>();
  for (const entry of names.unconfirmed("character")) {
    for (const word of wordsOf(entry.name)) if (!known.has(word)) unconfirmed.add(word);
  }
  return { known, unconfirmed };
}

/** Whether two contexts mean the same, so what was judged under one stands under the other. */
export function sameContext(a: SpellContext, b: SpellContext): boolean {
  return sameSet(a.known, b.known) && sameSet(a.unconfirmed, b.unconfirmed);
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

/** What is wrong with a word. */
export type Verdict =
  | { readonly kind: "misspelled" }
  | { readonly kind: "near"; readonly suggestion: string };

/**
 * Damerau–Levenshtein distance (optimal string alignment): insertion, deletion,
 * substitution, and the swap of two neighbours, each one edit. Stops early and
 * answers `limit + 1` once the words are further apart than `limit`.
 */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows.push(new Array<number>(b.length + 1).fill(0));
    rows[i]![0] = i;
  }
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = best;
    }
  }
  return rows[a.length]![b.length]!;
}

/** `suggestion` in the case `original` was typed in: ALL CAPS, Title, or as it comes. */
export function matchCase(suggestion: string, original: string): string {
  if (original.length > 1 && original === original.toUpperCase() && original !== original.toLowerCase()) {
    return suggestion.toUpperCase();
  }
  if (original === original.toLowerCase()) return suggestion.toLowerCase();
  const first = original[0]!;
  if (first === first.toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
    return suggestion.charAt(0).toUpperCase() + suggestion.slice(1).toLowerCase();
  }
  return suggestion;
}

/**
 * The dictionary's verdicts, remembered, and what they mean for a script.
 *
 * `prepare` is the only thing that reaches the engine and the only thing that
 * is asynchronous; `judge` is a lookup in what `prepare` kept.
 */
export class Spelling {
  private readonly verdicts = new Map<string, boolean>();
  private lookups = 0;
  private changes = 0;
  private asks = 0;

  constructor(
    readonly engine: SpellEngine,
    readonly options: SpellingOptions,
  ) {}

  /** Words the engine has been sent, in total — what a recheck must not grow. */
  get wordsLookedUp(): number {
    return this.lookups;
  }

  /** Bumps when a word is added, which changes what earlier verdicts mean. */
  get epoch(): number {
    return this.changes;
  }

  /** Calls made to the engine. */
  get callsToEngine(): number {
    return this.asks;
  }

  /** Words with a verdict kept. */
  get cached(): number {
    return this.verdicts.size;
  }

  /** Whether `judge` can answer for this word without the engine. */
  has(word: string): boolean {
    return this.verdicts.has(forEngine(word)) || this.isTerm(word);
  }

  /** The words of `words` that need the engine: not kept, not a term. Distinct. */
  missing(words: Iterable<string>): string[] {
    const need = new Set<string>();
    for (const word of words) {
      const sent = forEngine(word);
      if (!this.verdicts.has(sent) && !this.isTerm(word)) need.add(sent);
    }
    return [...need];
  }

  /** Ask the engine about every word in `words` it has not answered, and keep what it says. */
  async prepare(words: Iterable<string>): Promise<void> {
    const need = this.missing(words);
    if (need.length === 0) return;
    this.asks += 1;
    this.lookups += need.length;
    const wrong = new Set(await this.engine.misspelled(need));
    for (const word of need) this.verdicts.set(word, wrong.has(word));
  }

  /** Put the verdicts of a pass in without the engine. For measuring only. */
  remember(word: string, wrong: boolean): void {
    this.verdicts.set(forEngine(word), wrong);
  }

  /**
   * What is wrong with `word`, or undefined when nothing is. A word `prepare`
   * has not seen is not judged wrong.
   */
  judge(word: string, context: SpellContext): Verdict | undefined {
    const upper = word.toUpperCase();
    if (context.known.has(upper) || this.isTerm(word)) return undefined;
    if (isPossessiveOf(upper, context.known)) return undefined;

    const wrong = this.verdicts.get(forEngine(word)) === true;
    // A stray name (`Anne` against a confirmed `ANN`) is written with a capital;
    // an ordinary lowercase word that happens to match one is not it.
    const strayName = context.unconfirmed.has(upper) && word !== word.toLowerCase();
    if (wrong || strayName) {
      const near = this.nearest(upper, context.known);
      if (near !== undefined) return { kind: "near", suggestion: matchCase(near, word) };
    }
    return wrong ? { kind: "misspelled" } : undefined;
  }

  /** The dictionary's suggestions for `word`, in the case it was typed in. */
  async suggestions(word: string): Promise<string[]> {
    const found = await this.engine.suggest(forEngine(word));
    return [...new Set(found.map((suggestion) => matchCase(suggestion, word)))];
  }

  /** Make `word` right, and forget every verdict that was about it in any case. */
  async add(word: string): Promise<void> {
    await this.engine.addWord(forEngine(word));
    this.changes += 1;
    const lower = forEngine(word).toLowerCase();
    for (const kept of [...this.verdicts.keys()]) {
      if (kept.toLowerCase() === lower) this.verdicts.delete(kept);
    }
  }

  private isTerm(word: string): boolean {
    return SCREENPLAY_TERMS.has(forEngine(word).toUpperCase());
  }

  /**
   * The nearest confirmed word within the distance. The minimum length is the
   * typo's: `ANNE` is a near-match of a confirmed `ANN` (the spec's own
   * example), while `MIK` is too short to be called a typo of anything.
   */
  private nearest(upper: string, known: ReadonlySet<string>): string | undefined {
    const { nearDistance, nearMinLength } = this.options;
    if (upper.length < nearMinLength) return undefined;
    let best: string | undefined;
    let bestDistance = nearDistance + 1;
    for (const candidate of known) {
      if (candidate === upper) continue;
      const distance = editDistance(upper, candidate, nearDistance);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }
}

/** `EDWARD'S` where `EDWARD` is known. */
function isPossessiveOf(upper: string, known: ReadonlySet<string>): boolean {
  const base = upper.replace(/['’]S$/, "");
  return base !== upper && known.has(base);
}
