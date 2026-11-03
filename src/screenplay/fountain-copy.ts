/**
 * The finished-product copy: the script as a `.fountain` file with the
 * writer's private remarks and cut material left out (slice 2, step 7; Q-K).
 *
 * This is **not a save.** Saving keeps comments and the boneyard because the
 * writer's words are theirs (ADR-0020). A copy to hand to someone else leaves
 * them out, the same exclusions the PDF makes (ADR-0018, ADR-0021). A faithful
 * copy is simply `manuscript.fountain` in the bundle.
 *
 * It is the existing serialiser over a *reduced model*, and nothing else, so
 * everything the round-trip gate proves about the serialiser is true here too:
 *
 *   - **A comment is its remark and its two delimiters.** The words it points
 *     at are the writer's script and stay. Comments are held on the document
 *     rather than in the elements (ADR-0018), so dropping them is dropping the
 *     list; no element text carries a trace of one.
 *   - **The boneyard is its delimiters and every element between.** Blank
 *     lines are never stored (ADR-0019), so the spacing round the hole is the
 *     ordinary rule for the two elements now side by side — no stray blank, no
 *     doubled one.
 *   - **A speech cut to nothing takes its cue with it.** A cue left with no
 *     dialogue is not a speech, and Fountain would read it as action.
 *
 * `(MORE)` and the page-break `(CONT'D)` are not here because they were never
 * in the model (ADR-0024); the authored `(CONT'D)` extension is, and stays
 * (ADR-0026). The title page is kept.
 */
import type { Element, ScreenplayDocument } from "./document.ts";
import { exportScreenplay } from "./import.ts";


/** The model with every comment and every boneyard block taken out. */
export function withoutCommentsAndBoneyard(document: ScreenplayDocument): ScreenplayDocument {
  // Original index of each survivor, to tell which speeches were touched.
  const kept: { element: Element; at: number }[] = [];
  document.elements.forEach((element, at) => {
    if (element.omitted !== true) kept.push({ element, at });
  });

  const elements: Element[] = [];
  for (let index = 0; index < kept.length; ) {
    const entry = kept[index]!;
    if (entry.element.type !== "character") {
      elements.push(entry.element);
      index++;
      continue;
    }
    // The cue and what follows it in the speech.
    let end = index + 1;
    while (end < kept.length && isSpeechBody(kept[end]!.element)) end++;
    const speech = kept.slice(index, end);
    // Touched: something was cut from between the cue and whatever follows.
    const next = kept[end]?.at ?? document.elements.length;
    const touched = next - entry.at > speech.length;
    const spoken = speech.some((part) => part.element.type === "dialogue");
    if (!touched || spoken) elements.push(...speech.map((part) => part.element));
    index = end;
  }

  return { ...document, elements, comments: [] };
}

function isSpeechBody(element: Element): boolean {
  return element.type === "dialogue" || element.type === "parenthetical";
}

/** The bytes of the copy: UTF-8, exactly as the serialiser writes them. */
export function fountainCopyOf(document: ScreenplayDocument): Uint8Array {
  return exportScreenplay(withoutCommentsAndBoneyard(document));
}
