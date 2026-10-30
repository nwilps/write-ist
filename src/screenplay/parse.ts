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
import {
  TITLE_PAGE_CONTINUATION_INDENT,
  type Element,
  type MarkedValue,
  type ScreenplayDocument,
  type TitlePageField,
} from "./document.ts";
import { liftComments, locateComments, SCREENPLAY_COMMENTS } from "../comments.ts";
import { parseMarks, parseMarksAcross } from "./marks.ts";

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

/** How much of a source line is indentation, which is read past and not kept. */
const sourceIndent = (line: string): number => LEADING_WHITESPACE.exec(line)![0].length;

interface Parsed {
  document: ScreenplayDocument;
  /**
   * Lines whose leading whitespace was dropped (ADR-0020's tenth entry): an
   * element's indentation, or a title-page continuation's indentation where it
   * was not the one Write-ist writes.
   */
  leadingWhitespaceLines: number;
  markDelimitedLines: number;
  /** Comment delimiters left in the text as characters (ADR-0018). */
  unmatchedCommentDelimiters: number;
}

function parseInternal(text: string): Parsed {
  const endsWithNewline = text.endsWith("\n");
  const lines = text.split("\n");
  // `split` leaves an empty string after a final newline; it is not a line.
  if (endsWithNewline) lines.pop();

  const { fields, nextIndex, reindented } = parseTitlePage(lines);

  // Comment delimiters come out of the body before any of it is classified,
  // so `[[c:a1 weak]]INT. KITCHEN - DAY[[/c:a1]]` is a scene heading rather
  // than a note, and a commented cue is still a cue (ADR-0018).
  const lifted = liftComments(lines, nextIndex, SCREENPLAY_COMMENTS);
  const body = parseBody(lifted.lines, nextIndex);
  const resolved = resolveMarks(body.elements, body.startsRun);

  const comments = locateComments(
    lifted.comments,
    lifted.lines,
    body.elements.map((element, index) => ({
      lines: [
        { line: body.sourceLines[index]!, prefix: sourceIndent(lifted.lines[body.sourceLines[index]!]!) + prefixLength(element) },
      ],
      // The text as classified, before its marks were lifted.
      raw: element.text,
      offsets: resolved.offsets[index]!,
    })),
  );

  return {
    document: { titlePage: fields, elements: resolved.elements, comments, endsWithNewline },
    leadingWhitespaceLines: reindented + body.indentedLines,
    markDelimitedLines: resolved.delimitedLines,
    unmatchedCommentDelimiters: lifted.unmatched,
  };
}

/**
 * How many characters at the front of an element's line are its syntax — the
 * forcing marker, a section's hashes, the `>` of a centered line — rather than
 * its text. The exact inverse of what the serialiser puts back in front.
 */
function prefixLength(element: Element): number {
  switch (element.type) {
    case "scene-heading":
    case "action":
    case "character":
    case "transition":
      return element.forced ? 1 : 0;
    case "centered":
    case "lyrics":
    case "synopsis":
      return 1;
    case "section":
      return element.depth ?? 1;
    case "dialogue":
    case "parenthetical":
    case "page-break":
    case "note":
    case "boneyard-start":
    case "boneyard-end":
      return 0;
  }
}

/**
 * Read a screenplay, reporting the one thing parsing itself normalises.
 *
 * ADR-0020's eighth entry — a mark spanning several elements gains its own
 * delimiter pair on each of them — is applied here rather than in
 * `normaliseSource`, because it is a property of the element sequence and not
 * of the text. `markDelimitedLines` is how many lines it changes — every
 * element a spanning mark reached — and not how many marks did the reaching.
 * ADR-0020: the report counts occurrences changed, never findings.
 */
export function parseReporting(text: string): Parsed {
  return parseInternal(text);
}

/** Read a screenplay. */
export function parse(text: string): ScreenplayDocument {
  return parseInternal(text).document;
}

/**
 * The title page, if there is one. It is the one multi-line construct in the
 * format: a field's value may sit on the key line, on indented continuation
 * lines, or both, and the page ends at the first blank line.
 */
function parseTitlePage(lines: readonly string[]): {
  fields: TitlePageField[];
  nextIndex: number;
  /** Continuation lines not indented the way Write-ist writes them. */
  reindented: number;
} {
  const first = lines[0];
  if (first === undefined || TITLE_PAGE_KEY.exec(first) === null) {
    return { fields: [], nextIndex: 0, reindented: 0 };
  }

  const fields: TitlePageField[] = [];
  let current: { key: string; inline: MarkedValue; continuations: MarkedValue[] } | null = null;
  let index = 0;
  let reindented = 0;

  for (; index < lines.length; index++) {
    const line = lines[index]!;
    if (line === "") break;

    const indented = LEADING_WHITESPACE.exec(line)![0] !== "";
    const keyed = indented ? null : TITLE_PAGE_KEY.exec(line);

    if (keyed !== null) {
      if (current !== null) fields.push(current);
      current = { key: keyed[1]!, inline: parseMarks(keyed[2]!), continuations: [] };
    } else if (current !== null) {
      const indent = LEADING_WHITESPACE.exec(line)![0];
      if (indent !== TITLE_PAGE_CONTINUATION_INDENT) reindented++;
      current.continuations.push(parseMarks(line.slice(indent.length)));
    } else {
      break;
    }
  }
  if (current !== null) fields.push(current);

  while (index < lines.length && lines[index] === "") index++;
  return { fields, nextIndex: index, reindented };
}

/**
 * The body, plus where each run of elements begins.
 *
 * A **run** is a stretch of elements with no blank line between them in the
 * source — a speech, or a tight run of action. It is the distance a mark's
 * lookahead may travel (ADR-0027), and it has to be recorded here because
 * blank lines are not elements (ADR-0019) and are gone by the time the
 * sequence is resolved.
 */
function parseBody(
  lines: readonly string[],
  from: number,
): { elements: Element[]; startsRun: boolean[]; sourceLines: number[]; indentedLines: number } {
  const elements: Element[] = [];
  const startsRun: boolean[] = [];
  // The line each element was read from, which is where its comments were.
  const sourceLines: number[] = [];
  let indentedLines = 0;
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
    if (indent !== "") indentedLines++;

    // `/*` and `*/` are delimiters, an element each. What falls between them
    // is parsed as whatever it is and carries `omitted`, so the boneyard is a
    // range over the sequence rather than a container (ADR-0021).
    const above = index === 0 || lines[index - 1] === "";

    if (!omitted && content === BONEYARD_OPEN && closesLater(lines, index)) {
      elements.push({ type: "boneyard-start", text: content, forced: false, omitted: true });
      startsRun.push(above);
      sourceLines.push(index);
      omitted = true;
      inSpeech = false;
      continue;
    }
    if (omitted && content === BONEYARD_CLOSE) {
      elements.push({ type: "boneyard-end", text: content, forced: false, omitted: true });
      startsRun.push(above);
      sourceLines.push(index);
      omitted = false;
      inSpeech = false;
      continue;
    }

    const element = classify(content, inSpeech, {
      // Fountain wants a cue to have a blank line above it and a non-blank one
      // below. Both are read off the source rather than off parser state: a
      // boneyard delimiter and a tight run of action both leave `inSpeech`
      // false, so parser state cannot tell "after a blank" from "after
      // anything that is not a speech".
      above,
      below: lines[index + 1] ?? "",
    });
    elements.push(omitted ? { ...element, omitted: true } : element);
    startsRun.push(above);
    sourceLines.push(index);

    inSpeech =
      element.type === "character" ||
      (inSpeech && (element.type === "dialogue" || element.type === "parenthetical"));
  }

  return { elements, startsRun, sourceLines, indentedLines };
}

/**
 * Resolve every element's marks, over runs no blank line separates.
 *
 * This is the second pass, and it is second on purpose: **element syntax is
 * resolved before marks** (ADR-0027). Forcing markers, scene numbers and the
 * dual-dialogue caret are already off the text, and both boneyard delimiters
 * are already delimiters rather than asterisks — which is the mistake the ADR
 * names, because a scan that paired asterisks first would read a boneyard's
 * opening and closing delimiters as one long italic span.
 *
 * A run ends at a blank line, and also at any element that holds no prose. A
 * mark cannot be stored on a page break or a boneyard delimiter, so it cannot
 * reach through one either.
 */
function resolveMarks(
  elements: readonly Element[],
  startsRun: readonly boolean[],
): { elements: Element[]; delimitedLines: number; offsets: (readonly number[])[] } {
  const resolved: Element[] = [];
  // Per element, where each position of its classified text ended up once
  // the mark delimiters were lifted. Comments need it to find their character.
  const offsets: (readonly number[])[] = [];
  let delimitedLines = 0;
  let at = 0;

  while (at < elements.length) {
    if (LITERAL.has(elements[at]!.type)) {
      const text = elements[at]!.text;
      resolved.push(elements[at]!);
      offsets.push(Array.from({ length: text.length + 1 }, (_, i) => i));
      at++;
      continue;
    }

    let end = at + 1;
    while (
      end < elements.length &&
      !startsRun[end]! &&
      !LITERAL.has(elements[end]!.type)
    ) {
      end++;
    }

    const run = elements.slice(at, end);
    const marks = parseMarksAcross(run.map((element) => element.text));
    delimitedLines += marks.delimitedLines;
    run.forEach((element, index) => resolved.push({ ...element, ...marks.marked[index]! }));
    offsets.push(...marks.offsets);
    at = end;
  }

  return { elements: resolved, delimitedLines, offsets };
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

/** The blank lines around a line, which is what tells a cue from action. */
interface Surroundings {
  /** The line above is blank, or this is the first line of the body. */
  readonly above: boolean;
  /** The line below, verbatim. A cue must be followed by something. */
  readonly below: string;
}

function classify(
  content: string,
  inSpeech: boolean,
  surroundings: Surroundings,
): Element {
  // Inside a speech, Fountain runs to the next blank line. Only the choice
  // between a parenthetical and a line of dialogue is open.
  if (inSpeech) {
    if (PARENTHETICAL.test(content)) return make("parenthetical", content, false);
    return make("dialogue", content, false);
  }

  // Forcing markers. Every one already in the file is preserved as written
  // (ADR-0020), which is why `forced` is recorded rather than recomputed.
  if (content.startsWith("!")) return make("action", content.slice(1), true);
  if (content.startsWith("@")) return characterCue(content.slice(1), true);
  // A single leading dot forces a heading; `..` is an ellipsis, not a marker.
  if (content.startsWith(".") && !content.startsWith("..")) {
    return sceneHeading(content.slice(1), true);
  }
  if (PAGE_BREAK.test(content)) return make("page-break", content, false);
  if (content.startsWith("~")) return make("lyrics", content.slice(1), true);

  const section = SECTION.exec(content);
  if (section !== null) {
    return { ...make("section", section[2]!, true), depth: section[1]!.length };
  }
  if (content.startsWith("=")) return make("synopsis", content.slice(1), true);

  const centered = CENTERED.exec(content);
  if (centered !== null) return make("centered", centered[1]!, false);
  if (content.startsWith(">")) return make("transition", content.slice(1), true);
  if (NOTE_LINE.test(content)) return make("note", content, false);

  // Nothing was forced, so the parser has to guess. Action is the catch-all.
  if (SCENE_HEADING.test(content)) return sceneHeading(content, false);
  if (TRANSITION.test(content) || UNFORCED_TRANSITIONS.has(content)) {
    return make("transition", content, false);
  }
  // **Both** blank-line conditions, not just the one below (issue #23).
  //
  // Fountain's cue is an upper-case line with a blank above it and text below.
  // Checking only below turns an upper-case line inside a tight run of action
  // into a cue, and the action line under it into dialogue — and because a cue
  // names a speaker, `(CONT'D)` maintenance then writes visible words into a
  // line of action. That is ADR-0020's one normalisation that changes the
  // writer's words, fired on an element that does not exist.
  //
  // This says nothing about `@CROSSWALK`: a forced cue is handled above, and
  // the writer who typed the `@` has already answered the question.
  if (surroundings.above && looksLikeCharacter(content) && surroundings.below !== "") {
    return characterCue(content, false);
  }
  return make("action", content, false);
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
function sceneHeading(text: string, forced: boolean): Element {
  const numbered = SCENE_NUMBER.exec(text);
  if (numbered === null) return make("scene-heading", text, forced);
  return {
    ...make("scene-heading", numbered[1]!, forced),
    sceneNumber: numbered[2]!,
  };
}

/** A character cue, with the dual-dialogue marker lifted out of the text. */
function characterCue(text: string, forced: boolean): Element {
  const dual = DUAL_CUE.exec(text);
  if (dual === null) return make("character", text, forced);
  return { ...make("character", dual[1]!, forced), dual: true };
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
  forced: boolean,
): Element {
  // The text as written, delimiters and all. `resolveMarks` lifts them out
  // once every element is classified, because a mark may close in a later
  // element and nothing here can see one (ADR-0027).
  return { type, text, forced };
}
