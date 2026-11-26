/**
 * Spellcheck for plain text (ADR-0032 — Write-ist's own, on demand, offline,
 * from the dictionary inside the application): Notes', and any workspace's
 * through the toolbox (`toolbox.spelling`, ADR-0045). Here rather than in
 * `src/notes/` so the toolbox can offer it without knowing Notes.
 *
 * The Editor's pass (`src/screenplay/spelling.ts`) knows a screenplay: which
 * elements are prose, that a cue is a name, that `INT` is a word. None of that
 * is true of a notepad, and reaching into it would tie Notes to the screenplay
 * surface. So this is the small plain-text half of the same idea — the same
 * dictionary (the engine port), the same rule for what a word is, the same
 * wavy line — and nothing about names or elements. It is independent of the
 * character and location lists, as the Editor's spellcheck is since #163.
 *
 * **Off until asked**, as in the Editor. On, it checks every word once and
 * remembers the verdict, so an edit sends the engine only words it has not
 * seen; off, it sends nothing.
 */

/**
 * The dictionary, as a plain-text workspace asks it. The Editor's port
 * (`SpellEngine`) has this shape and more, so the application hands every
 * workspace the same engine, and one word added is added everywhere.
 */
export interface PlainSpellEngine {
  misspelled(words: readonly string[]): Promise<readonly string[]>;
  suggest(word: string): Promise<readonly string[]>;
  addWord(word: string): Promise<boolean>;
}

/** A word in the text, by character offset. */
export interface WordAt {
  readonly word: string;
  readonly start: number;
  readonly end: number;
}

/**
 * A letter or digit, then more of them, with apostrophes inside: `don't`.
 * The Editor's rule, word for word, so the two never disagree about what a
 * word is.
 */
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;

/** The words of a text worth checking: no single letters, nothing with a digit in it. */
export function wordsToCheck(text: string): WordAt[] {
  const found: WordAt[] = [];
  for (const match of text.matchAll(WORD)) {
    const word = match[0];
    if (word.length < 2 || /\p{N}/u.test(word)) continue;
    found.push({ word, start: match.index, end: match.index + word.length });
  }
  return found;
}

/** What the engine is sent: the typographic apostrophe is the plain one. */
const forEngine = (word: string): string => word.replace(/’/g, "'");

export interface PlainSpelling {
  readonly isOn: () => boolean;
  /** Turn the pass on or off. On checks the text now. */
  readonly setOn: (on: boolean, text: string) => Promise<void>;
  /** The text changed: check any word not yet seen. */
  readonly edited: (text: string) => Promise<void>;
  /** The words the dictionary does not know, where they are in `text`. Nothing while off. */
  readonly misspelt: (text: string) => WordAt[];
  readonly suggestions: (word: string) => Promise<readonly string[]>;
  /** Make a word right from now on, here and everywhere the dictionary is used. */
  readonly addToDictionary: (word: string) => Promise<void>;
}

/**
 * A spelling pass over plain text. `changed` is told when a verdict arrives,
 * so whatever draws the lines can draw them again.
 */
export function plainSpelling(engine: PlainSpellEngine, changed: () => void): PlainSpelling {
  let on = false;
  /** Every verdict so far: `true` is a word the dictionary knows. */
  const known = new Map<string, boolean>();
  // One question at a time, so verdicts arrive in the order they were asked.
  let asking: Promise<void> = Promise.resolve();

  const check = (text: string): Promise<void> => {
    const ask = async (): Promise<void> => {
      if (!on) return;
      const unseen = [...new Set(wordsToCheck(text).map((found) => forEngine(found.word)))].filter((word) => !known.has(word));
      if (unseen.length === 0) return;
      const wrong = new Set(await engine.misspelled(unseen));
      for (const word of unseen) known.set(word, !wrong.has(word));
      changed();
    };
    asking = asking.then(ask, ask);
    return asking;
  };

  return {
    isOn: () => on,
    setOn: (wanted, text) => {
      on = wanted;
      changed();
      return wanted ? check(text) : Promise.resolve();
    },
    edited: (text) => (on ? check(text) : Promise.resolve()),
    misspelt: (text) => (on ? wordsToCheck(text).filter((found) => known.get(forEngine(found.word)) === false) : []),
    suggestions: (word) => engine.suggest(forEngine(word)),
    addToDictionary: async (word) => {
      await engine.addWord(forEngine(word));
      known.set(forEngine(word), true);
      changed();
    },
  };
}
