/**
 * Spelling, without the editor (slice 2, step 10; ADR-0032).
 *
 * What a word is, which words the screenplay's own vocabulary makes right, and
 * what a verdict from the dictionary means. Nothing here touches ProseMirror
 * or the DOM, and **nothing here looks a word up**: that is the engine's, on
 * the other side of the `SpellEngine` port, in Rust.
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
 * 1. The screenplay's own terms are known: `INT`, `EXT`, `CONT'D`, `POV`…
 *    Single letters are never checked (`V.O.` is `V` and `O`).
 * 2. Otherwise the dictionary decides, once per distinct word: a verdict is
 *    cached, so a recheck of one scene asks the engine about no word it has
 *    already seen.
 *
 * **The character and location lists play no part** (Noah, 2026-11-22). A
 * name on a list is not a dictionary word, and a misspelt cue or heading is
 * underlined like any other misspelling. Only the writer's dictionary (Add to
 * Dictionary, Settings ▸ Dictionary) makes a name right.
 */
import type { Element } from "./document.ts";

/** The dictionary, as the application sees it. */
export interface SpellEngine {
  /** Those of `words` the dictionary does not know. Order and duplicates are not significant. */
  misspelled(words: readonly string[]): Promise<readonly string[]>;
  /** What `word` might have been, best first. */
  suggest(word: string): Promise<readonly string[]>;
  /**
   * Make `word` right from now on, and remember it between sessions. Answers
   * whether it was new to the writer's own words (false when already there).
   */
  addWord(word: string): Promise<boolean>;
  /**
   * Forget a word the writer added (an undone Add to Dictionary), between
   * sessions too. The shipped dictionary is never changed. Answers whether
   * the word was among the writer's own words.
   */
  removeWord(word: string): Promise<boolean>;
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

/** What is wrong with a word. */
export type Verdict = { readonly kind: "misspelled" };

const MISSPELLED: Verdict = { kind: "misspelled" };

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

  constructor(readonly engine: SpellEngine) {}

  /** Words the engine has been sent, in total — what a recheck must not grow. */
  get wordsLookedUp(): number {
    return this.lookups;
  }

  /** Bumps when a word is added or removed, which changes what earlier verdicts mean. */
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
  judge(word: string): Verdict | undefined {
    if (this.isTerm(word)) return undefined;
    return this.verdicts.get(forEngine(word)) === true ? MISSPELLED : undefined;
  }

  /** The dictionary's suggestions for `word`, in the case it was typed in. */
  async suggestions(word: string): Promise<string[]> {
    const found = await this.engine.suggest(forEngine(word));
    return [...new Set(found.map((suggestion) => matchCase(suggestion, word)))];
  }

  /** Make `word` right, and forget every verdict that was about it in any case. Answers whether it was new. */
  async add(word: string): Promise<boolean> {
    const added = await this.engine.addWord(forEngine(word));
    this.forget(word);
    return added;
  }

  /** Take back a word `add` added, and forget every verdict that was about it. */
  async remove(word: string): Promise<boolean> {
    const removed = await this.engine.removeWord(forEngine(word));
    this.forget(word);
    return removed;
  }

  private forget(word: string): void {
    this.changes += 1;
    const lower = forEngine(word).toLowerCase();
    for (const kept of [...this.verdicts.keys()]) {
      if (kept.toLowerCase() === lower) this.verdicts.delete(kept);
    }
  }

  private isTerm(word: string): boolean {
    return SCREENPLAY_TERMS.has(forEngine(word).toUpperCase());
  }
}
