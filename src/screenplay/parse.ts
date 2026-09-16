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
import type { Element, ScreenplayDocument, TitlePageField } from "./document.ts";

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
  let current: { key: string; inline: string; continuations: string[] } | null = null;
  let index = 0;

  for (; index < lines.length; index++) {
    const line = lines[index]!;
    if (line === "") break;

    const indented = LEADING_WHITESPACE.exec(line)![0] !== "";
    const keyed = indented ? null : TITLE_PAGE_KEY.exec(line);

    if (keyed !== null) {
      if (current !== null) fields.push(current);
      current = { key: keyed[1]!, inline: keyed[2]!, continuations: [] };
    } else if (current !== null) {
      current.continuations.push(line);
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
    const element = classify(content, indent, inSpeech, lines[index + 1] ?? "");
    elements.push(element);

    inSpeech =
      element.type === "character" ||
      (inSpeech && (element.type === "dialogue" || element.type === "parenthetical"));
  }

  return elements;
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
  if (content.startsWith("@")) return make("character", content.slice(1), indent, true);
  // A single leading dot forces a heading; `..` is an ellipsis, not a marker.
  if (content.startsWith(".") && !content.startsWith("..")) {
    return make("scene-heading", content.slice(1), indent, true);
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
  if (SCENE_HEADING.test(content)) return make("scene-heading", content, indent, false);
  if (TRANSITION.test(content)) return make("transition", content, indent, false);
  if (looksLikeCharacter(content) && nextLine !== "") {
    return make("character", content, indent, false);
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

function make(
  type: Element["type"],
  text: string,
  indent: string,
  forced: boolean,
): Element {
  return { type, text, indent, forced };
}
