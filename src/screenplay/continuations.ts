/**
 * Maintaining the `(CONT'D)` extension (ADR-0026).
 *
 * `(CONT'D)` is *derived*: it follows entirely from the element sequence, so a
 * file missing one is stale rather than making a point, and the application
 * maintains it. `(V.O.)` and `(O.S.)` are *authored* — only the writer knows
 * whether a line is voice-over — and are never added, removed or altered here.
 *
 * Add only. ADR-0020's enumerated list permits "missing `(CONT'D)` extensions
 * added" and says nothing about removing one, and an eighth entry on that list
 * is a decision someone makes on purpose. So an extension the rule would not
 * have written is left exactly where the writer put it.
 */
import type { Element, ScreenplayDocument } from "./document.ts";

/** Element types that belong to a speech rather than interrupting one. */
export const SPEECH: ReadonlySet<Element["type"]> = new Set([
  "character",
  "parenthetical",
  "dialogue",
]);

/** `(CONT'D)`, `(CONTD)`, `(cont'd)` — every spelling in the wild. */
const CONTINUATION = /\(\s*CONT'?D\s*\)/i;

/** The dual-dialogue marker, which must stay at the very end of the cue. */
const DUAL_MARKER = /(\s*\^)\s*$/;

export interface ContinuationResult {
  readonly document: ScreenplayDocument;
  /** How many extensions were added, for ADR-0020's import report. */
  readonly added: number;
}

/**
 * The character a cue names, with every extension and the dual marker set
 * aside. `EDWARD (V.O.) (CONT'D)` and `EDWARD` are the same speaker.
 */
export function characterName(cue: string): string {
  return cue
    .replace(/\([^)]*\)/g, "")
    .replace(/\^\s*$/, "")
    .trim();
}

/** Whether a cue already carries a continuation extension, in any spelling. */
export function hasContinuation(cue: string): boolean {
  return CONTINUATION.test(cue);
}

/**
 * Whether the cue at `index` is the same speaker resuming after a break, in
 * the same scene.
 *
 * A scene heading starts the speaker fresh. Anything that is not part of a
 * speech — action, most of all — is a break. Dialogue and a parenthetical are
 * not. A blank line is not an element on disk (ADR-0019) and is not looked at.
 * Import and typing both ask this; neither keeps a second copy of the walk.
 */
export function cueResumes(
  lines: readonly { readonly type: Element["type"]; readonly text: string }[],
  index: number,
): boolean {
  const cue = lines[index];
  if (cue === undefined || cue.type !== "character") return false;
  const name = characterName(cue.text);
  if (name === "") return false;

  let interrupted = false;
  for (let i = index - 1; i >= 0; i--) {
    const line = lines[i]!;
    // An empty scene heading is still a scene heading: it starts the speaker
    // fresh. Any other empty line is spacing and is stepped over.
    if (line.type === "scene-heading") return false;
    if (line.text === "") continue;
    if (line.type === "character") return interrupted && characterName(line.text) === name;
    if (!SPEECH.has(line.type)) interrupted = true;
  }
  return false;
}

/**
 * Add `(CONT'D)` to every cue where the same character resumes after an
 * interruption, within a scene.
 *
 * A scene heading starts the speaker fresh, which is the convention and what
 * keeps the rule computable from the element sequence alone.
 */
export function maintainContinuations(document: ScreenplayDocument): ContinuationResult {
  let added = 0;

  const elements = document.elements.map((element, index): Element => {
    if (!cueResumes(document.elements, index) || hasContinuation(element.text)) return element;
    added++;
    return { ...element, text: appendContinuation(element.text) };
  });

  return { document: { ...document, elements }, added };
}

/**
 * Append after any extension already present. The rule is not "add `(CONT'D)`
 * if the cue is bare": Big Fish contains 21 cues reading `EDWARD (V.O.)
 * (CONT'D)`, so a bare-only rule gets 21 cues wrong in the reference script.
 */
export function appendContinuation(cue: string): string {
  const dual = DUAL_MARKER.exec(cue);
  if (dual !== null) {
    return `${cue.slice(0, dual.index)} (CONT'D)${dual[1]!}`;
  }
  return `${cue} (CONT'D)`;
}
