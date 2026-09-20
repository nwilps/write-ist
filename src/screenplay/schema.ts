/**
 * The screenplay surface, declared to ProseMirror (ADR-0024).
 *
 * ADR-0019 fixes what the document is — **a flat sequence of typed elements,
 * marks as a set, nothing nesting** — and this file says the same thing in
 * ProseMirror's vocabulary so that the editing engine can hold it without
 * being asked to hold anything else. The schema is therefore deliberately
 * shallow: `doc` holds title-page lines and then elements, and no element
 * holds another.
 *
 * ## Why the vocabulary is here and not in the shell
 *
 * ADR-0005: a surface is an engine, and **the element vocabulary belongs to the
 * surface, never the format and never the shell.** The fourteen element types
 * below are ADR-0021's whole list; nothing outside this surface needs to know
 * one of them by name.
 *
 * ## Nothing here touches the DOM
 *
 * `toDOM` returns a *specification* — an array of tag name, attributes and a
 * content hole — which is data, not a node. `prosemirror-view` turns it into
 * the page and `prosemirror-model`'s `DOMSerializer` turns it into markup a
 * test can read, and neither needs this file to know a `document` exists. That
 * is what keeps seam 2 — "editing, with no window" — reachable.
 *
 * ## What the page carries, and why
 *
 * **Every element writes its type into the page as `data-element`** (ADR-0029):
 * spellcheck is the system's and has to be switched off on character cues and
 * scene headings, so the type has to be readable off the rendered element
 * rather than inferred from how it looks. The same attribute is what the
 * stylesheet selects on, so the look and the spellcheck hook cannot drift.
 *
 * **The text in the page is the writer's text and nothing else.** Forcing
 * markers, mark delimiters, comment delimiters, a scene number's hashes and a
 * dual-dialogue caret are all out of `text` by the time the parser is done
 * (ADR-0018, ADR-0027), and they stay out: they are attributes here, and the
 * serialiser puts them back. So the page holds real, selectable, readable text
 * and never a character of syntax.
 */
import { Schema, type MarkSpec, type NodeSpec } from "prosemirror-model";
import type { ElementType } from "./document.ts";

/**
 * ADR-0021's element vocabulary, in the order the ADR names it. Exported
 * because a page that displays *every* one of them is an acceptance criterion,
 * and a test that enumerated them itself could quietly fall behind this list.
 */
export const ELEMENT_TYPES: readonly ElementType[] = [
  "scene-heading",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "centered",
  "lyrics",
  "section",
  "synopsis",
  "page-break",
  "note",
  "boneyard-start",
  "boneyard-end",
];

/** The attribute every rendered element carries its type in (ADR-0029). */
export const ELEMENT_TYPE_ATTRIBUTE = "data-element";

/**
 * One line of the manuscript.
 *
 * A textblock, because one element is one line (ADR-0019) and ProseMirror's
 * caret, selection and wrapping behaviour over a textblock is exactly the
 * behaviour a writer already knows — which is the whole reason ADR-0024 chose
 * a library rather than rebuilding it.
 *
 * Everything the element is other than its text is an attribute. None of it is
 * presentation: each one is something the serialiser has to put back, and a
 * model that dropped `dual` or `omitted` would round-trip the bytes while
 * being wrong about the screenplay — the defect ADR-0021 records twice.
 */
const element: NodeSpec = {
  content: "text*",
  attrs: {
    /** One of `ELEMENT_TYPES`. No default: an untyped element is a bug. */
    type: {},
    /** Leading whitespace exactly as the writer wrote it (issue #15). */
    indent: { default: "" },
    /** The source carried a forcing marker (`.`, `!`, `@`, `>`). */
    forced: { default: false },
    /** A section's `#` count. */
    depth: { default: null },
    /** A scene heading's number, without its `#` delimiters. */
    sceneNumber: { default: null },
    /** A cue marked for dual dialogue with a trailing `^`. */
    dual: { default: false },
    /** The element lies between a boneyard's delimiters (ADR-0021). */
    omitted: { default: false },
  },
  // `pre-wrap` in the stylesheet, not here: whether the writer's leading
  // whitespace is drawn is a styling question and ADR-0030 keeps those in one
  // place.
  toDOM: (node) => [
    "div",
    {
      [ELEMENT_TYPE_ATTRIBUTE]: String(node.attrs["type"]),
      // Present only when true, so `[data-omitted]` is a selector and the
      // attribute means what it says on every element that has it.
      ...(node.attrs["omitted"] === true ? { "data-omitted": "true" } : {}),
      ...(node.attrs["dual"] === true ? { "data-dual": "true" } : {}),
    },
    0,
  ],
};

/**
 * One line of the title page.
 *
 * The title page is the one thing in the format that is not a text element
 * (ADR-0019, ADR-0021): it is `Key: value` pairs, some of which carry indented
 * continuation lines. So a field is **a run of these lines** — one carrying the
 * key, then its continuations carrying none — which is the same
 * compute-the-range-from-the-sequence shape a scene has, and it keeps the top
 * of the document as flat as the rest of it.
 *
 * Editing it through a form comes later; this ticket displays it.
 */
const titleLine: NodeSpec = {
  content: "text*",
  attrs: {
    /** The key as written, without its colon, or null on a continuation. */
    key: { default: null },
  },
  toDOM: (node) => {
    const key = node.attrs["key"];
    return ["div", { "data-title-line": typeof key === "string" ? key : "" }, 0];
  },
};

/**
 * The document.
 *
 * Two things live on it rather than on any element, and both are on it because
 * they belong to the file as a whole:
 *
 *   - **The comments** (ADR-0018). A comment may open in one element and close
 *     in another and has exactly one remark, so it cannot be split per element
 *     the way a mark is without repeating the remark or orphaning it — and
 *     orphaning it is the v1 failure that ADR exists to end. It is held once,
 *     here, and **it is not in the rendered text at all**, which is how it is
 *     both invisible and impossible to lose.
 *   - **Whether the file ended with a newline.** Carried, not normalised: four
 *     of the five manuscripts end without one and adding it is not on
 *     ADR-0020's list.
 */
const doc: NodeSpec = {
  content: "title_line* element*",
  attrs: {
    /** `Comment[]` from `src/comments.ts`, held once each (ADR-0018). */
    comments: { default: [] },
    endsWithNewline: { default: false },
  },
};

/**
 * A mark, in ProseMirror's own set semantics.
 *
 * ADR-0024 is explicit that this agreement is convenient rather than causal:
 * ADR-0019 decided marks are a **set** on its own reasoning — a mark set cannot
 * round-trip a mark tree — and the library happening to agree is why there is
 * nothing to reconcile here.
 *
 * `spelling` rides along because `MarkRange` carries it. Fountain gives each of
 * its three marks exactly one spelling, so on this surface it is always absent
 * — but a mark whose spelling was silently dropped would move bytes, and
 * carrying a field that is always null costs nothing next to that.
 *
 * The tags are the semantic ones. A screen reader is told "emphasis" because
 * the page says `em`, not because anything announced it, and the writer sees
 * italics because that is what `em` looks like. **No delimiter is drawn**,
 * which is ADR-0018's rule that the writer never sees syntax.
 */
function markOf(tag: string): MarkSpec {
  return {
    attrs: { spelling: { default: null } },
    // Deliberately no `parseDOM`. Paste from outside Write-ist is plain text
    // read as Fountain and paste from inside carries the model (#37), so
    // nothing ever asks this schema to read marks back out of HTML. A rule
    // here would be a second, quieter way into the model.
    toDOM: () => [tag, 0],
  };
}

/**
 * The screenplay surface's schema.
 *
 * One schema for the surface, not one per format: ADR-0005 puts the element
 * vocabulary on the surface, so Feature and TV run on this same schema and a
 * format contributes defaults rather than node types.
 */
export const screenplaySchema = new Schema({
  nodes: { doc, title_line: titleLine, element, text: {} },
  // **Declared in `EMISSION_ORDER`, outermost first** (`src/marks.ts`).
  // ProseMirror nests marks in the order a schema declares them, and the file
  // nests them underline-outermost because that is what the corpus writes —
  // `_**THE END**_` (ADR-0019, ADR-0020). Nothing forces the two to agree: the
  // page would look identical either way, since the set is what carries the
  // meaning and the nesting is only a spelling. They are kept in step so that
  // the markup in the page reads as the line in the file, and so nobody has to
  // work out whether a difference between them mattered.
  marks: {
    underline: markOf("u"),
    bold: markOf("strong"),
    italic: markOf("em"),
  },
});
