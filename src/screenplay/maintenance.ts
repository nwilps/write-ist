/**
 * Capitals and `(CONT'D)` look after themselves (#44).
 *
 * Two things the writer would otherwise do by hand, both done as the document
 * changes so that the editing tests and the window run the same rules.
 *
 * ## Capitals (ADR-0020)
 *
 * A scene heading, a character cue and a transition are capitals. The capitals
 * are **in the text**, not a stylesheet's `text-transform`: what is saved is
 * what is shown, and the cue the serialiser writes is the cue the writer sees.
 * They are made when the writer *edits* — types, or tabs a line into one of the
 * three types — and never at import, so an imported cue written `@edward` is
 * left alone until somebody touches it. Nothing is lowercased on the way out of
 * a capitals type.
 *
 * ## `(CONT'D)` (ADR-0026)
 *
 * Written when the writer **moves from a cue to its dialogue**, not while the
 * cue is typed: a writer beginning a cue may be about to type `(V.O.)`. So a
 * cue is only maintained once it is committed — a dialogue or parenthetical
 * follows it — and never while the caret is still inside it. Leaving it (Enter,
 * Tab, a click elsewhere) is what commits. The rule is `continuations.ts`'s:
 * add only, after any extension already there, `(V.O.)` and `(O.S.)` untouched.
 *
 * ## Cost
 *
 * Only the elements an edit touched are looked at — the changed ranges, the
 * element before them, the next cue after them, and the one the caret left —
 * so a keystroke costs the length of a scene's walk at worst, never the
 * manuscript's (`docs/STANDARDS.md`, *Measure the measurer*).
 */
import { Plugin, type EditorState, type Transaction } from "prosemirror-state";
import type { Node as EditorNode } from "prosemirror-model";
import { appendContinuation, characterName, hasContinuation, SPEECH } from "./continuations.ts";
import type { ElementType } from "./document.ts";
import { screenplaySchema } from "./schema.ts";

/** The types the writer types in capitals. */
const CAPITALS: ReadonlySet<ElementType> = new Set(["scene-heading", "character", "transition"]);

export const maintainElements = new Plugin({
  appendTransaction: (transactions, oldState, state) => {
    const changed = transactions.some((transaction) => transaction.docChanged);
    const head = state.selection.$head;
    const left = leftElement(transactions, oldState, state);
    if (!changed && left === undefined) return null;

    const touched = new Set<number>();
    for (const transaction of transactions) {
      transaction.mapping.maps.forEach((map, at) => {
        map.forEach((_s, _e, from, to) => {
          const rest = transaction.mapping.slice(at + 1);
          addRange(touched, state.doc, rest.map(from, -1), rest.map(to, 1));
        });
      });
    }
    const tr = state.tr;

    for (const index of touched) capitalise(tr, state.doc, index);

    const candidates = new Set<number>();
    for (const index of touched) {
      candidates.add(index - 1);
      candidates.add(index);
      const next = nextCue(state.doc, index);
      if (next !== undefined) candidates.add(next);
    }
    if (left !== undefined) candidates.add(left);

    const caret = head.depth >= 1 ? head.index(0) : -1;
    for (const index of [...candidates].sort((a, b) => b - a)) {
      if (index === caret) continue;
      continueCue(tr, state.doc, index);
    }

    return tr.docChanged ? tr : null;
  },
});

/** The element the caret was in and has now left, as an index in the new document. */
function leftElement(
  transactions: readonly Transaction[],
  oldState: EditorState,
  state: EditorState,
): number | undefined {
  const old = oldState.selection.$head;
  if (old.depth < 1) return undefined;
  let position = old.pos;
  for (const transaction of transactions) position = transaction.mapping.map(position);
  position = Math.min(position, state.doc.content.size);
  const now = state.doc.resolve(position);
  if (now.depth < 1) return undefined;
  const index = now.index(0);
  const head = state.selection.$head;
  return head.depth >= 1 && head.index(0) === index ? undefined : index;
}

function addRange(into: Set<number>, doc: EditorNode, from: number, to: number): void {
  const size = doc.content.size;
  const first = doc.resolve(Math.min(from, size)).index(0);
  const last = doc.resolve(Math.min(Math.max(to, from), size)).index(0);
  for (let i = first; i <= last && i < doc.childCount; i++) into.add(i);
}

function offsetOf(doc: EditorNode, index: number): number {
  let at = 0;
  for (let i = 0; i < index; i++) at += doc.child(i).nodeSize;
  return at;
}

/**
 * Make an element's text capitals if it is one of the three types.
 *
 * One character at a time, and only those that change: a replacement maps a
 * comment end sitting on its edge to the same edge, but a wider one would
 * collapse an end sitting inside it.
 */
function capitalise(tr: Transaction, doc: EditorNode, index: number): void {
  const node = doc.maybeChild(index);
  if (node === null || node.type.name !== "element") return;
  if (!CAPITALS.has(node.attrs["type"] as ElementType)) return;
  if (node.textContent === node.textContent.toUpperCase()) return;

  const start = offsetOf(doc, index) + 1;
  const edits: { from: number; to: number; text: string; node: EditorNode }[] = [];
  node.forEach((child, offset) => {
    if (!child.isText) return;
    let at = 0;
    for (const char of child.text!) {
      const upper = char.toUpperCase();
      if (upper !== char) {
        edits.push({
          from: start + offset + at,
          to: start + offset + at + char.length,
          text: upper,
          node: child,
        });
      }
      at += char.length;
    }
  });
  for (const edit of edits.reverse()) {
    tr.replaceWith(
      tr.mapping.map(edit.from, -1),
      tr.mapping.map(edit.to, 1),
      screenplaySchema.text(edit.text, edit.node.marks),
    );
  }
}

/** The index of the first cue after `index` in its scene, if any. */
function nextCue(doc: EditorNode, index: number): number | undefined {
  for (let i = index + 1; i < doc.childCount; i++) {
    const type = typeOf(doc.child(i));
    if (type === "scene-heading") return undefined;
    if (type === "character") return i;
  }
  return undefined;
}

function typeOf(node: EditorNode): ElementType | undefined {
  return node.type.name === "element" ? (node.attrs["type"] as ElementType) : undefined;
}

/** Add `(CONT'D)` to the cue at `index` if it is committed and resumes a speech. */
function continueCue(tr: Transaction, doc: EditorNode, index: number): void {
  const cue = doc.maybeChild(index);
  if (cue === null || typeOf(cue) !== "character") return;
  const text = cue.textContent;
  if (hasContinuation(text) || characterName(text) === "") return;

  // Committed: the writer has moved on to what the character says.
  const following = index + 1 < doc.childCount ? typeOf(doc.child(index + 1)) : undefined;
  if (following !== "dialogue" && following !== "parenthetical") return;
  if (!resumes(doc, index, characterName(text))) return;

  // Deleting `(CONT'D)` a letter at a time leaves the space before it behind;
  // using it keeps the cue from gaining a second.
  if (/\s$/.test(text) && !text.includes("^")) {
    tr.insert(
      tr.mapping.map(offsetOf(doc, index) + 1 + text.length),
      screenplaySchema.text("(CONT'D)"),
    );
    return;
  }

  const next = appendContinuation(text);
  let prefix = 0;
  while (text[prefix] === next[prefix]) prefix++;
  const inserted = next.slice(prefix, prefix + next.length - text.length);
  tr.insert(tr.mapping.map(offsetOf(doc, index) + 1 + prefix), screenplaySchema.text(inserted));
}

/**
 * Whether the speaker named is resuming after an interruption: walking up from
 * the cue, the nearest cue in the scene is the same character and something
 * that is not speech lies between. Blank lines are not elements on disk
 * (ADR-0019) and are not looked at.
 */
function resumes(doc: EditorNode, index: number, name: string): boolean {
  let interrupted = false;
  for (let i = index - 1; i >= 0; i--) {
    const node = doc.child(i);
    const type = typeOf(node);
    if (type === undefined || type === "scene-heading") return false;
    if (node.content.size === 0) continue;
    if (type === "character") return interrupted && characterName(node.textContent) === name;
    if (!SPEECH.has(type)) interrupted = true;
  }
  return false;
}
