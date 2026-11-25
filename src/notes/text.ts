/**
 * Notes' document: plain text, one line after another, and nothing else.
 *
 * Notes is a notepad (Noah: *"a simplified Windows Notepad"*). What the writer
 * types is what they see and what the file holds — no formatting, no elements,
 * no Markdown drawn as anything but the characters typed. So the model is the
 * smallest the editing engine accepts: a document of lines, each a run of
 * text with no marks, and the file is those lines joined with `\n`, exactly.
 *
 * `textOf(docOf(text)) === text` for every string — the round trip is the
 * point, and `test/notes/notes-text.test.ts` holds it.
 */
import { Fragment, Schema, Slice, type Node } from "prosemirror-model";

export const notesSchema = new Schema({
  nodes: {
    doc: { content: "line+" },
    line: {
      content: "text*",
      marks: "",
      // Spaces and tabs are the writer's and are kept as typed.
      whitespace: "pre",
      parseDOM: [{ tag: "div" }, { tag: "p" }],
      toDOM: () => ["div", { class: "notes__line" }, 0],
    },
    text: {},
  },
  marks: {},
});

const line = (text: string): Node => notesSchema.nodes["line"]!.create(null, text === "" ? null : notesSchema.text(text));

/** The document for a file's text. */
export function docOf(text: string): Node {
  return notesSchema.nodes["doc"]!.create(null, text.split("\n").map(line));
}

/** The file's text for a document: its lines joined with `\n`. */
export function textOf(doc: Node): string {
  const lines: string[] = [];
  doc.forEach((child) => void lines.push(child.textContent));
  return lines.join("\n");
}

/** Plain text as a piece of a document, to paste or drop: open at both ends, so one line goes in inline. */
export function sliceOf(text: string): Slice {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return new Slice(Fragment.from(lines.map(line)), 1, 1);
}

/** The text of a piece of a document, as it goes on the clipboard: lines joined with `\n`. */
export function textOfSlice(slice: Slice): string {
  return slice.content.textBetween(0, slice.content.size, "\n");
}

/**
 * The document position of a character offset in the text, clamped to the
 * document. Line `i` starts at offset `Σ(len + 1)` and at position
 * `Σ(len + 2) + 1`: each line's own opening and closing are a position each.
 */
export function positionOf(doc: Node, offset: number): number {
  let remaining = Math.max(0, offset);
  let position = 1;
  for (let index = 0; index < doc.childCount; index++) {
    const length = doc.child(index).content.size;
    if (remaining <= length || index === doc.childCount - 1) return position + Math.min(remaining, length);
    remaining -= length + 1;
    position += length + 2;
  }
  return position;
}

/** The character offset in the text of a document position. */
export function offsetOf(doc: Node, position: number): number {
  let offset = 0;
  let start = 1;
  for (let index = 0; index < doc.childCount; index++) {
    const length = doc.child(index).content.size;
    if (position <= start + length) return offset + Math.max(0, position - start);
    offset += length + 1;
    start += length + 2;
  }
  return offset - 1;
}

/** Words in the text: runs of anything but whitespace, the way the Editor counts them. */
export function wordsOf(text: string): number {
  return text.split(/\s+/).filter((word) => word !== "").length;
}
