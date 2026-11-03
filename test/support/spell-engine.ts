/**
 * A stand-in for the Rust dictionary, for the tests that are about what the
 * editor does with a verdict and not about English (`src-tauri/src/spelling.rs`
 * tests that against the real dictionary).
 *
 * It keeps a log of every call, because "the engine was not asked" is half of
 * what step 10 promises: a recheck of one scene sends no word it has seen, and
 * a pass that is off sends nothing.
 */
import { editDistance, type SpellEngine } from "../../src/screenplay/spelling.ts";

/** Ordinary words the fake dictionary knows (lowercase). */
export const ENGLISH = [
  "a", "an", "and", "the", "to", "of", "in", "is", "it", "he", "she", "they", "at", "on", "with",
  "int", "ext", "day", "night", "room", "hospital", "kitchen", "hall", "walks", "into", "looks",
  "around", "slowly", "says", "said", "hello", "goodbye", "door", "light", "follows", "her",
  "far", "wall", "crosses", "was", "were", "this", "that", "there", "nothing", "here", "what",
  "seems", "quietly", "one", "two", "three", "four", "five", "six", "seven", "pause", "later",
  "opens", "closes", "again", "then", "back", "front", "bennett's", "dog", "barks", "loudly",
];

export interface FakeEngine extends SpellEngine {
  /** Every call to `misspelled`, in order, with the words it was sent. */
  readonly asked: string[][];
  /** The words added, as the file would hold them. */
  readonly added: string[];
  /** Total words sent. */
  sent(): number;
}

/** `store` is the custom dictionary's file: hand the same one to a second engine to "restart". */
export function fakeEngine(known: readonly string[] = ENGLISH, store: string[] = []): FakeEngine {
  const asked: string[][] = [];
  const dictionary = new Set(known.map((word) => word.toLowerCase()));
  const knows = (word: string): boolean => {
    const lower = word.toLowerCase();
    if (dictionary.has(lower)) return true;
    return store.some((added) => added.toLowerCase() === lower);
  };
  return {
    asked,
    added: store,
    sent: () => asked.reduce((total, words) => total + words.length, 0),
    misspelled: (words) => {
      asked.push([...words]);
      return Promise.resolve(words.filter((word) => !knows(word)));
    },
    suggest: (word) =>
      Promise.resolve(
        [...dictionary]
          .filter((candidate) => editDistance(word.toLowerCase(), candidate, 2) <= 2)
          .sort((a, b) => editDistance(word.toLowerCase(), a, 2) - editDistance(word.toLowerCase(), b, 2)),
      ),
    addWord: (word) => {
      store.push(word);
      return Promise.resolve();
    },
  };
}
