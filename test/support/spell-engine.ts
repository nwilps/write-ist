/**
 * A stand-in for the Rust dictionary, for the tests that are about what the
 * editor does with a verdict and not about English (`src-tauri/src/spelling.rs`
 * tests that against the real dictionary).
 *
 * It keeps a log of every call, because "the engine was not asked" is half of
 * what step 10 promises: a recheck of one scene sends no word it has seen, and
 * a pass that is off sends nothing.
 */
import type { SpellEngine } from "../../src/screenplay/spelling.ts";

/** Edits between two words (insert, delete, substitute, swap neighbours): the fake's idea of "near". */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      rows[i]![j] = best;
    }
  }
  return rows[a.length]![b.length]!;
}

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
  const isAdded = (word: string): boolean => store.some((added) => added.toLowerCase() === word.toLowerCase());
  const knows = (word: string): boolean => dictionary.has(word.toLowerCase()) || isAdded(word);
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
    // Every call is logged in the store; whether it was new is the file's answer.
    addWord: (word) => {
      const added = !isAdded(word);
      store.push(word);
      return Promise.resolve(added);
    },
    // Only the writer's words are taken out, never the shipped ones.
    removeWord: (word) => {
      if (!isAdded(word)) return Promise.resolve(false);
      for (let at = store.length - 1; at >= 0; at--) {
        if (store[at]!.toLowerCase() === word.toLowerCase()) store.splice(at, 1);
      }
      return Promise.resolve(true);
    },
  };
}
