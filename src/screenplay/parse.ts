/**
 * Reading Fountain into the flat element sequence of ADR-0019.
 *
 * Two rules govern everything here, both from ADR-0020:
 *
 *   The parser's guess may be wrong about the element.
 *   It may never be wrong about the bytes.
 *
 * Fountain has no unparseable text — action is the catch-all — so a misread
 * line is a one-second fix for the writer, while a silently re-spaced line is
 * invisible. Guessing is permitted; mutating is not.
 *
 * Input is expected to have been through `normaliseSource` already: LF line
 * endings, NFC, no trailing whitespace, no run of more than one blank line.
 */
import type {
  Element,
  MarkedValue,
  ScreenplayDocument,
  TitlePageField,
} from "./document.ts";
import { parseMarks } from "./marks.ts";

/** `Key: value` at the top of the file. Fountain's title page (ADR-0021). */
const TITLE_PAGE_KEY = /^([A-Za-z][A-Za-z0-9 _-]*):(.*)$/;

/** `>  CENTERED  <` — checked before a plain forced transition. */
const CENTERED = /^>(.*)<$/;

/** `===` or longer, alone on its line. */
const PAGE_BREAK = /^={3,}$/;

/** `#` through `######`, Fountain's sections. */
const SECTION = /^(#{1,6})(.*)$/;

/** A whole line wrapped in parentheses, inside a speech. */
const PARENTHETICAL = /^\(.*\)$/;

/** A note standing alone on its line. Inline notes stay in the text. */
const NOTE_LINE = /^\[\[.*\]\]$/;

/**
 * A scene number at the end of a heading, as ` #1#` (ADR-0021: parsed and
 * preserved, never authored).
 *
 * Exactly one space before the `#`. A heading spaced any other way keeps its
 * number inside the heading text instead — the parser is then wrong about the
 * element and still right about the bytes, which is the trade ADR-0020
 * explicitly permits. Canonicalising the spacing would be an eighth
 * normalisation, and that is a decision someone makes on purpose.
 */
const SCENE_NUMBER = /^(.+[^ ]) #([^#]+)#$/;

/** A cue marked for dual dialogue, as `BILL ^`. One space, as above. */
const DUAL_CUE = /^(.+[^ ]) \^$/;

/**
 * The boneyard delimiters, each alone on its line.
 *
 * A line that merely contains `/*` somewhere is ordinary text: the delimiter
 * form Fountain files actually use is a line of its own, and treating an
 * inline occurrence as a delimiter would split a paragraph in two.
 */
const BONEYARD_OPEN = "/*";
const BONEYARD_CLOSE = "*/";

/**
 * An unforced scene heading: Fountain's recognised opening words.
 *
 * The combined forms come first so the alternation does not settle for the
 * three-letter prefix and then fail on the slash. `EXT/INT.` is not in the
 * Fountain spec's list, which names INT, EXT, EST, INT./EXT and I/E — but Big
 * Fish uses it twice, and a heading the parser misses becomes an action line
 * that looks identical on disk. Nothing in the byte gate can see that.
 */
const SCENE_HEADING = /^(?:INT\.?\/EXT|EXT\.?\/INT|I\/E|INT|EXT|EST)[.\s]/i;

/** An unforced transition: all caps, ending in `TO:`. */
const TRANSITION = /^[A-Z][A-Z0-9 '\-]*TO:$/;

/**
 * The three transitions writers write unforced that do not end in `TO:`
 * (ADR-0021).
 *
 * Exactly three, matched whole. The trailing period is part of each one, and
 * the comparison is case-sensitive: this is an uppercase-gated rule, so
 * `fade out.` in a line of dialogue is dialogue. Anything else that reads like
 * a transition has to be forced with `>`, which is what Fountain requires and
 * what keeps `A RIVER.` and `THE BEAST.` action.
 */
const UNFORCED_TRANSITIONS: ReadonlySet<string> = new Set([
  "FADE OUT.",
  "FADE TO BLACK.",
  "CUT TO BLACK.",
]);

const LEADING_WHITESPACE = /^[ \t]*/;

export function parse(text: string): ScreenplayDocument {
  const endsWithNewline = text.endsWith("\n");
  const lines = text.split("\n");
  // `split` leaves an empty string after a final newline; it is not a line.
  if (endsWithNewline) lines.pop();

  const { fields, nextIndex } = parseTitlePage(lines);
  const elements = parseBody(lines, nextIndex);

  return { titlePage: fields, elements, endsWithNewline };
}

/**
 * The title page, if there is one. It is the one multi-line construct in the
 * format: a field's value may sit on the key line, on indented continuation
 * lines, or both, and the page ends at the first blank line.
 */
function parseTitlePage(lines: readonly string[]): {
  fields: TitlePageField[];
  nextIndex: number;
} {
  const first = lines[0];
  if (first === undefined || TITLE_PAGE_KEY.exec(first) === null) {
    return { fields: [], nextIndex: 0 };
  }

  const fields: TitlePageField[] = [];
  let current: { key: string; inline: MarkedValue; continuations: MarkedValue[] } | null = null;
  let index = 0;

  for (; index < lines.length; index++) {
    const line = lines[index]!;
    if (line === "") break;

    const indented = LEADING_WHITESPACE.exec(line)![0] !== "";
    const keyed = indented ? null : TITLE_PAGE_KEY.exec(line);

    if (keyed !== null) {
      if (current !== null) fields.push(current);
      current = { key: keyed[1]!, inline: parseMarks(keyed[2]!), continuations: [] };
    } else if (current !== null) {
      current.continuations.push(parseMarks(line));
    } else {
      break;
    }
  }
  if (current !== null) fields.push(current);

  while (index < lines.length && lines[index] === "") index++;
  return { fields, nextIndex: index };
}

function parseBody(lines: readonly string[], from: number): Element[] {
  const elements: Element[] = [];
  let inSpeech = false;
  let omitted = false;

  for (let index = from; index < lines.length; index++) {
    const line = lines[index]!;
    // A blank line is not an element. It ends a speech, and on the way out it
    // is recomputed from the types either side of it (ADR-0019).
    if (line === "") {
      inSpeech = false;
      continue;
    }

    const indent = LEADING_WHITESPACE.exec(line)![0];
    const content = line.slice(indent.length);

    // `/*` and `*/` are delimiters, an element each. What falls between them
    // is parsed as whatever it is and carries `omitted`, so the boneyard is a
    // range over the sequence rather than a container (ADR-0021).
    if (!omitted && content === BONEYARD_OPEN && closesLater(lines, index)) {
      elements.push({ type: "boneyard-start", text: content, indent, forced: false, omitted: true });
      omitted = true;
      inSpeech = false;
      continue;
    }
    if (omitted && content === BONEYARD_CLOSE) {
      elements.push({ type: "boneyard-end", text: content, indent, forced: false, omitted: true });
      omitted = false;
      inSpeech = false;
      continue;
    }

    const element = classify(content, indent, inSpeech, lines[index + 1] ?? "");
    elements.push(omitted ? { ...element, omitted: true } : element);

    inSpeech =
      element.type === "character" ||
      (inSpeech && (element.type === "dialogue" || element.type === "parenthetical"));
  }

  return elements;
}

/**
 * Whether some later line closes this boneyard.
 *
 * A delimiter needs no lookahead to parse, but an unclosed `/*` would mark the
 * rest of the script omitted — dropping it from the page count and the export.
 * The bytes survive either way; the classification would not, and that one is
 * too expensive to get wrong. An unclosed `/*` is therefore ordinary text.
 */
function closesLater(lines: readonly string[], from: number): boolean {
  for (let index = from + 1; index < lines.length; index++) {
    const line = lines[index]!;
    if (line.slice(LEADING_WHITESPACE.exec(line)![0].length) === BONEYARD_CLOSE) return true;
  }
  return false;
}

function classify(
  content: string,
  indent: string,
  inSpeech: boolean,
  nextLine: string,
): Element {
  // Inside a speech, Fountain runs to the next blank line. Only the choice
  // between a parenthetical and a line of dialogue is open.
  if (inSpeech) {
    if (PARENTHETICAL.test(content)) return make("parenthetical", content, indent, false);
    return make("dialogue", content, indent, false);
  }

  // Forcing markers. Every one already in the file is preserved as written
  // (ADR-0020), which is why `forced` is recorded rather than recomputed.
  if (content.startsWith("!")) return make("action", content.slice(1), indent, true);
  if (content.startsWith("@")) return characterCue(content.slice(1), indent, true);
  // A single leading dot forces a heading; `..` is an ellipsis, not a marker.
  if (content.startsWith(".") && !content.startsWith("..")) {
    return sceneHeading(content.slice(1), indent, true);
  }
  if (PAGE_BREAK.test(content)) return make("page-break", content, indent, false);
  if (content.startsWith("~")) return make("lyrics", content.slice(1), indent, true);

  const section = SECTION.exec(content);
  if (section !== null) {
    return { ...make("section", section[2]!, indent, true), depth: section[1]!.length };
  }
  if (content.startsWith("=")) return make("synopsis", content.slice(1), indent, true);

  const centered = CENTERED.exec(content);
  if (centered !== null) return make("centered", centered[1]!, indent, false);
  if (content.startsWith(">")) return make("transition", content.slice(1), indent, true);
  if (NOTE_LINE.test(content)) return make("note", content, indent, false);

  // Nothing was forced, so the parser has to guess. Action is the catch-all.
  if (SCENE_HEADING.test(content)) return sceneHeading(content, indent, false);
  if (TRANSITION.test(content) || UNFORCED_TRANSITIONS.has(content)) {
    return make("transition", content, indent, false);
  }
  if (looksLikeCharacter(content) && nextLine !== "") {
    return characterCue(content, indent, false);
  }
  return make("action", content, indent, false);
}

/**
 * A cue with no `@` in front of it: upper case, with any extensions and dual
 * marker set aside. Deliberately loose here — Big Fish is what decides this
 * rule, and it arrives in Phase E2.
 */
function looksLikeCharacter(content: string): boolean {
  const name = content
    .replace(/\([^)]*\)/g, "")
    .replace(/\^\s*$/, "")
    .trim();
  if (name === "") return false;
  if (!/[A-Z]/.test(name)) return false;
  return name === name.toUpperCase();
}

/** A scene heading, with its scene number lifted out of the text if it has one. */
function sceneHeading(text: string, indent: string, forced: boolean): Element {
  const numbered = SCENE_NUMBER.exec(text);
  if (numbered === null) return make("scene-heading", text, indent, forced);
  return {
    ...make("scene-heading", numbered[1]!, indent, forced),
    sceneNumber: numbered[2]!,
  };
}

/** A character cue, with the dual-dialogue marker lifted out of the text. */
function characterCue(text: string, indent: string, forced: boolean): Element {
  const dual = DUAL_CUE.exec(text);
  if (dual === null) return make("character", text, indent, forced);
  return { ...make("character", dual[1]!, indent, forced), dual: true };
}

/**
 * The four types whose text is syntax rather than prose, and so carries no
 * marks: a page break, a note kept whole as `[[…]]`, and the two boneyard
 * delimiters — which are themselves made of the asterisks a mark is spelled
 * with, and must never be read as one.
 */
const LITERAL: ReadonlySet<Element["type"]> = new Set([
  "page-break",
  "note",
  "boneyard-start",
  "boneyard-end",
]);

function make(
  type: Element["type"],
  text: string,
  indent: string,
  forced: boolean,
): Element {
  if (LITERAL.has(type)) return { type, text, indent, forced };
  return { type, ...parseMarks(text), indent, forced };
}
