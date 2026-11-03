/**
 * Pairing: what a speech is, and what makes two of them a pair.
 *
 * In Fountain the second speech of a dual-dialogue pair carries a `^` after its
 * character cue. In the model that is the cue's `dual` attribute (ADR-0019,
 * ADR-0021): a fact about one element, not text, so the paper never shows it
 * and the file always keeps it. This module holds every rule for what a pair
 * is. It knows element types and two flags and nothing else — no editor, no
 * clipboard — so the pagination engine (`paginate.ts`, ADR-0033), the
 * serialiser, the import and the editing commands (`dual-dialogue.ts`) can all
 * ask it, and cannot disagree about which speeches are paired.
 *
 * ## What a pair is
 *
 * A **speech** is a character cue and the parenthetical and dialogue elements
 * that follow it directly. A **pair** is two speeches that touch — nothing
 * between the first's last element and the second's cue — where the second
 * cue carries the caret. Anything else between them (action, a transition, a
 * scene heading, centred text, a standing note, a boneyard delimiter) means
 * they are not a pair, and the caret stays in the file doing nothing.
 *
 * **Only two speeches are ever paired.** A speech belongs to at most one pair,
 * so a third speech with a caret after a pair is left alone.
 *
 * Speeches are named by their index in `speechesOf`, and elements by their
 * index in the run the caller passes: the manuscript's elements, the ones that
 * are in the file, so a blank line the writer is standing on does not sit
 * between two speeches.
 */
import type { ElementType } from "./document.ts";

/** What the rules need to know of an element. */
export interface SpeechItem {
  readonly type: ElementType;
  readonly dual?: boolean;
  readonly omitted?: boolean;
}

/** A speech: indices of its cue and of its last element, inclusive. */
export interface Speech {
  readonly cue: number;
  readonly end: number;
}

export interface DualPair {
  readonly left: Speech;
  readonly right: Speech;
}

/** The element types that belong to a speech rather than interrupting one. */
export const SPEECH: ReadonlySet<ElementType> = new Set(["character", "parenthetical", "dialogue"]);

/** May this type follow a cue or another of its kind, and still be in the speech? */
export const continuesSpeech = (type: ElementType): boolean =>
  type === "parenthetical" || type === "dialogue";

/** Every speech, in order. A dialogue with no cue above it is not one. */
export function speechesOf(items: readonly SpeechItem[]): Speech[] {
  const speeches: Speech[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i]!.type !== "character") continue;
    let end = i;
    while (end + 1 < items.length && continuesSpeech(items[end + 1]!.type)) end += 1;
    speeches.push({ cue: i, end });
    i = end;
  }
  return speeches;
}

/** The speech element `index` is in, as an index into `speechesOf`. */
export function speechAt(items: readonly SpeechItem[], index: number): number | undefined {
  const k = speechesOf(items).findIndex((s) => s.cue <= index && index <= s.end);
  return k === -1 ? undefined : k;
}

/** The pairs in a run of elements, in order. */
export function dualPairs(items: readonly SpeechItem[]): DualPair[] {
  return pairsAmong(items, speechesOf(items));
}

function pairsAmong(items: readonly SpeechItem[], speeches: readonly Speech[]): DualPair[] {
  const pairs: DualPair[] = [];
  let used = -1;
  for (let k = 1; k < speeches.length; k++) {
    const left = speeches[k - 1]!;
    const right = speeches[k]!;
    if (used === k - 1) continue;
    if (items[right.cue]!.dual !== true) continue;
    if (left.end + 1 !== right.cue) continue;
    if (items[left.cue]!.omitted === true || items[right.cue]!.omitted === true) continue;
    pairs.push({ left, right });
    used = k;
  }
  return pairs;
}

/** The pair that speech `k` is half of, if it is. */
export function pairOf(items: readonly SpeechItem[], k: number): DualPair | undefined {
  const speeches = speechesOf(items);
  const here = speeches[k];
  if (here === undefined) return undefined;
  return pairsAmong(items, speeches).find(
    (pair) => pair.left.cue === here.cue || pair.right.cue === here.cue,
  );
}

/**
 * Which speech's cue should carry the caret to pair speech `k` with a
 * neighbour, trying each of `directions` in turn (-1 is above, 1 below)? The
 * later of the two. Nobody, if `k` is already in a pair, or the neighbour
 * does not touch it, is in a pair itself, or either is omitted.
 */
export function caretToPair(
  items: readonly SpeechItem[],
  k: number,
  directions: readonly (-1 | 1)[],
): Speech | undefined {
  const speeches = speechesOf(items);
  const here = speeches[k];
  if (here === undefined) return undefined;
  const pairs = pairsAmong(items, speeches);
  const inPair = (speech: Speech): boolean =>
    pairs.some((pair) => pair.left.cue === speech.cue || pair.right.cue === speech.cue);
  if (inPair(here)) return undefined;

  for (const direction of directions) {
    const other = speeches[k + direction];
    if (other === undefined) continue;
    const touches = direction === -1 ? other.end + 1 === here.cue : here.end + 1 === other.cue;
    if (!touches || inPair(other)) continue;
    if (items[other.cue]!.omitted === true || items[here.cue]!.omitted === true) continue;
    return direction === -1 ? here : other;
  }
  return undefined;
}

/**
 * Is the edit at element `dirty` in, or next to, a speech that carries or
 * neighbours a caret? A cue with one, the speech above it, or the elements
 * either side of a deletion that brought two speeches together. The
 * incremental page count asks, because a pair is laid out as one band.
 */
export function nearDualDialogue(items: readonly SpeechItem[], dirty: number): boolean {
  for (const at of [dirty - 1, dirty, dirty + 1]) {
    if (at < 0 || at >= items.length) continue;
    let cue = at;
    while (cue > 0 && continuesSpeech(items[cue]!.type)) cue -= 1;
    if (items[cue]!.type === "character" && items[cue]!.dual === true) return true;
    let end = at;
    while (
      end + 1 < items.length &&
      SPEECH.has(items[end]!.type) &&
      continuesSpeech(items[end + 1]!.type)
    ) {
      end += 1;
    }
    const next = items[end + 1];
    if (next !== undefined && next.type === "character" && next.dual === true) return true;
  }
  return false;
}
