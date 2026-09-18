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
const SPEECH: ReadonlySet<Element["type"]> = new Set([
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
 * Add `(CONT'D)` to every cue where the same character resumes after an
 * interruption, within a scene.
 *
 * A scene heading starts the speaker fresh, which is the convention and what
 * keeps the rule computable from the element sequence alone.
 */
export function maintainContinuations(document: ScreenplayDocument): ContinuationResult {
  let lastSpeaker: string | null = null;
  let interrupted = false;
  let added = 0;

  const elements = document.elements.map((element): Element => {
    if (element.type === "scene-heading") {
      lastSpeaker = null;
      interrupted = false;
      return element;
    }

    if (element.type !== "character") {
      // Anything that is not part of a speech breaks the speaker's run.
      if (!SPEECH.has(element.type)) interrupted = true;
      return element;
    }

    const speaker = characterName(element.text);
    const resuming = lastSpeaker === speaker && interrupted;
    lastSpeaker = speaker;
    interrupted = false;

    if (!resuming || hasContinuation(element.text)) return element;

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
function appendContinuation(cue: string): string {
  const dual = DUAL_MARKER.exec(cue);
  if (dual !== null) {
    return `${cue.slice(0, dual.index)} (CONT'D)${dual[1]!}`;
  }
  return `${cue} (CONT'D)`;
}
