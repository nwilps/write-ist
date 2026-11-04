/**
 * What the counts pill says (the desk design, §2.3): `Pages: ~3 / 112 | Words: 18,402`.
 *
 * The page is the one `layout()` placed the caret on, and the tilde is honest —
 * the count is Write-ist's own, measured against Final Draft's, and ADR-0024
 * allows it a line of drift. The words are the ledger's (`wordCount`, ADR-0017),
 * read here from the editing engine's document so a keystroke does not rebuild
 * the whole manuscript to count it.
 */
import type { Node as EditorNode } from "prosemirror-model";

const WITH_COMMAS = new Intl.NumberFormat("en-US");

export function countsText(page: number, totalPages: number, words: number): string {
  const here = totalPages <= 0 ? 0 : page;
  return `Pages: ~${WITH_COMMAS.format(here)} / ${WITH_COMMAS.format(totalPages)} | Words: ${WITH_COMMAS.format(words)}`;
}

/**
 * Words in the editor's document, by the ledger's rule: each element's text
 * split on whitespace, skipping cut material (`omitted`) and blank elements.
 * The title page's lines are in the document but are not elements, and the
 * ledger does not count them (ADR-0018) — so neither does this, which is also
 * what keeps editing the title page from being "words written" (ADR-0040).
 */
export function wordsIn(doc: EditorNode): number {
  let total = 0;
  doc.forEach((node) => {
    if (node.type.name === "title_line") return;
    if (node.attrs["omitted"] === true) return;
    const text = node.textContent.trim();
    if (text === "") return;
    total += text.split(/\s+/).length;
  });
  return total;
}
