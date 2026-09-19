/**
 * Comments: the writer's remark about a span of text, stored inline (ADR-0018).
 *
 *   screenplay   [[c:a1 remark]]span[[/c:a1]]
 *   prose        <!--c:a1 remark-->span<!--/c:a1-->
 *
 * The id comes straight after `c:`. The remark is everything after the first
 * space, up to the closing `]]` or `-->`, and may be empty.
 *
 * ## Held once, on the document
 *
 * A comment may start in one element and end in another, and it has one
 * remark — so unlike a mark it cannot be split per element (ADR-0027) without
 * repeating the remark or orphaning it. It is the first range in the model
 * not attached to one element: each end is an element and an offset into that
 * element's text, and the comment itself lives on the document.
 *
 * ## Out of the text before anything is classified
 *
 * Delimiters are cut out of the lines before the parser looks at them, so a
 * comment wrapped round a scene heading leaves a scene heading, not a note and
 * not action. It also means an element's text never contains a delimiter, so
 * nothing downstream — the word count, pagination, export — has to know that
 * comments exist.
 *
 * ## Matched by id, never by position
 *
 * Comments may nest and cross (ADR-0018). An opener is paired with the next
 * closer carrying the same id, anywhere later in the file — across lines,
 * across blank lines, because a comment covers whatever the writer selected.
 *
 * A delimiter that finds no partner stays in the text as the characters the
 * writer has, and is counted for the import report. The file always opens.
 */

/** One end of a comment: an element, and an offset into its text. */
export interface CommentEnd {
  /** Index into the document's `elements`. */
  readonly element: number;
  readonly offset: number;
}

export interface Comment {
  readonly id: string;
  /** The remark as the writer sees it — unescaped, possibly empty. */
  readonly remark: string;
  readonly start: CommentEnd;
  readonly end: CommentEnd;
}

/** How one surface spells a comment's two delimiters. */
export interface CommentSyntax {
  /** Global. Group 1 is the id, group 2 the remark as written, if any. */
  readonly open: RegExp;
  /** Global. Group 1 is the id. */
  readonly close: RegExp;
  readonly readRemark: (written: string) => string;
  readonly writeOpen: (id: string, remark: string) => string;
  readonly writeClose: (id: string) => string;
}

/**
 * Fountain: each delimiter is a complete note on its own, so every other tool
 * hides both and shows the span between them as ordinary text (ADR-0018).
 */
export const SCREENPLAY_COMMENTS: CommentSyntax = {
  open: /\[\[c:([^\s\]]+)(?: (.*?))?\]\]/g,
  close: /\[\[\/c:([^\s\]]+)\]\]/g,
  readRemark: (written) => written,
  writeOpen: (id, remark) => `[[c:${id}${remark === "" ? "" : ` ${remark}`}]]`,
  writeClose: (id) => `[[/c:${id}]]`,
};

/**
 * Markdown: an HTML comment, the one construct universally understood to be
 * in the file and absent from the output.
 *
 * **One escape, and only one** (ADR-0018). An HTML comment ends at the first
 * `-->`, so a writer's arrow — "cut this --> move to ch. 4" — is written
 * `--&gt;` inside a remark and read back as `-->`. A bare `--` is left alone:
 * no real parser ends a comment on it, and prose is full of them.
 */
export const PROSE_COMMENTS: CommentSyntax = {
  open: /<!--c:([^\s>]+?)(?: (.*?))?-->/g,
  close: /<!--\/c:([^\s>]+?)-->/g,
  readRemark: (written) => written.replaceAll("--&gt;", "-->"),
  writeOpen: (id, remark) =>
    `<!--c:${id}${remark === "" ? "" : ` ${remark.replaceAll("-->", "--&gt;")}`}-->`,
  writeClose: (id) => `<!--/c:${id}-->`,
};

/** Where a lifted delimiter was, in the line with the delimiters cut out. */
export interface Placement {
  readonly line: number;
  readonly column: number;
}

/** A comment whose delimiters have been lifted out, not yet located in an element. */
export interface LiftedComment {
  readonly id: string;
  readonly remark: string;
  readonly open: Placement;
  readonly close: Placement;
}

export interface Lifted {
  /** The lines with every matched delimiter cut out. Same count as the input. */
  readonly lines: readonly string[];
  readonly comments: readonly LiftedComment[];
  /** Delimiters left in the text as characters, for the import report. */
  readonly unmatched: number;
}

interface Found {
  readonly line: number;
  readonly start: number;
  readonly end: number;
  readonly kind: "open" | "close";
  readonly id: string;
  readonly remark: string;
}

/**
 * Cut every matched comment delimiter out of the lines from `from` onward.
 *
 * **A line holding nothing but delimiters keeps them.** Cutting them out would
 * leave an empty line, and an empty line is syntax — in Fountain it ends a
 * speech, in Markdown it ends a paragraph — so removing it would silently
 * re-read the lines around it. Write-ist never writes such a line, since each
 * end of a comment sits in an element. When one arrives from outside, its
 * delimiters stay as characters and count as unmatched: reported, kept, and
 * nothing re-read (ADR-0018, ADR-0008 rule 4).
 */
export function liftComments(
  lines: readonly string[],
  from: number,
  syntax: CommentSyntax,
): Lifted {
  const candidates: Found[] = [];
  let unmatched = 0;

  for (let line = from; line < lines.length; line++) {
    const onLine = delimitersIn(lines[line]!, line, syntax);
    if (onLine.length === 0) continue;

    const covered = onLine.reduce((sum, found) => sum + (found.end - found.start), 0);
    if (lines[line]!.trim().length === covered) {
      unmatched += onLine.length;
      continue;
    }
    candidates.push(...onLine);
  }

  // Matched by id, in file order. A closer takes the most recent unclosed
  // opener with its id, so a repeated id nests the way brackets do.
  const pending = new Map<string, Found[]>();
  const pairs: [Found, Found][] = [];
  for (const found of candidates) {
    const stack = pending.get(found.id) ?? [];
    if (found.kind === "open") {
      stack.push(found);
      pending.set(found.id, stack);
      continue;
    }
    const opener = stack.pop();
    if (opener === undefined) {
      unmatched++;
      continue;
    }
    pairs.push([opener, found]);
  }
  for (const stack of pending.values()) unmatched += stack.length;

  // Cut the matched delimiters out, and note where each one was in the line
  // that remains.
  const cut = new Map<number, Found[]>();
  for (const [open, close] of pairs) {
    for (const found of [open, close]) cut.set(found.line, [...(cut.get(found.line) ?? []), found]);
  }

  const column = new Map<Found, number>();
  const clean = [...lines];
  for (const [line, found] of cut) {
    found.sort((a, b) => a.start - b.start);
    let text = "";
    let at = 0;
    for (const delimiter of found) {
      text += lines[line]!.slice(at, delimiter.start);
      column.set(delimiter, text.length);
      at = delimiter.end;
    }
    clean[line] = text + lines[line]!.slice(at);
  }

  const place = (found: Found): Placement => ({ line: found.line, column: column.get(found)! });
  const comments = pairs
    .map(([open, close]) => ({
      id: open.id,
      remark: open.remark,
      open: place(open),
      close: place(close),
    }))
    .sort((a, b) => a.open.line - b.open.line || a.open.column - b.open.column);

  return { lines: clean, comments, unmatched };
}

/** Every delimiter on one line, in order. */
function delimitersIn(text: string, line: number, syntax: CommentSyntax): Found[] {
  const found: Found[] = [];
  for (const match of text.matchAll(syntax.open)) {
    found.push({
      line,
      start: match.index,
      end: match.index + match[0].length,
      kind: "open",
      id: match[1]!,
      remark: syntax.readRemark(match[2] ?? ""),
    });
  }
  for (const match of text.matchAll(syntax.close)) {
    found.push({
      line,
      start: match.index,
      end: match.index + match[0].length,
      kind: "close",
      id: match[1]!,
      remark: "",
    });
  }
  return found.sort((a, b) => a.start - b.start);
}

/**
 * Where one element came from: each source line it was read from, and how
 * many characters at the front of that line are syntax rather than text —
 * indentation, a forcing marker, a `> ` quote marker, a heading's hashes.
 *
 * The element's text *before its marks are lifted* is those lines with their
 * prefixes removed, joined by newlines, and cut short at the end where a
 * suffix such as a scene number was lifted off.
 */
export interface SourceLine {
  readonly line: number;
  readonly prefix: number;
}

/** What `locateComments` needs to know about one element. */
export interface ElementSource {
  readonly lines: readonly SourceLine[];
  /** The element's text before its marks were lifted. */
  readonly raw: string;
  /** Raw position → offset in the element's final text. */
  readonly offsets: readonly number[];
}

/**
 * Turn each lifted comment's two placements into an element and an offset.
 *
 * A placement inside an element's syntax — before its forcing marker, after
 * its scene number — is moved to the nearest edge of its text. That is where
 * ADR-0018 says the delimiter belongs, and where the serialiser will put it.
 */
export function locateComments(
  lifted: readonly LiftedComment[],
  cleanLines: readonly string[],
  sources: readonly ElementSource[],
): Comment[] {
  const byLine = new Map<number, { element: number; index: number }>();
  sources.forEach((source, element) => {
    source.lines.forEach((sourceLine, index) => byLine.set(sourceLine.line, { element, index }));
  });

  const locate = (placement: Placement): CommentEnd => {
    const at = byLine.get(placement.line) ?? nearestBefore(byLine, placement.line, sources);
    const source = sources[at.element]!;

    // Raw offset: the whole of every earlier line of the element, plus a
    // newline each, then this line's column less its prefix.
    let raw = 0;
    for (let index = 0; index < at.index; index++) {
      const earlier = source.lines[index]!;
      raw += cleanLines[earlier.line]!.length - earlier.prefix + 1;
    }
    const own = source.lines[at.index];
    if (own === undefined) {
      raw = source.raw.length;
    } else {
      const width = cleanLines[own.line]!.length - own.prefix;
      raw += Math.min(Math.max(placement.column - own.prefix, 0), width);
    }
    raw = Math.min(raw, source.raw.length);

    return { element: at.element, offset: source.offsets[raw]! };
  };

  return lifted.map((comment) => ({
    id: comment.id,
    remark: comment.remark,
    start: locate(comment.open),
    end: locate(comment.close),
  }));
}

/**
 * A line no element was read from. Only reachable for a line the parser
 * consumed as syntax — a setext heading's underline — and a delimiter there
 * belongs at the end of the element before it.
 */
function nearestBefore(
  byLine: ReadonlyMap<number, { element: number; index: number }>,
  line: number,
  sources: readonly ElementSource[],
): { element: number; index: number } {
  for (let before = line - 1; before >= 0; before--) {
    const at = byLine.get(before);
    if (at !== undefined) return { element: at.element, index: sources[at.element]!.lines.length };
  }
  return { element: 0, index: 0 };
}

/**
 * The delimiters each element must write, as text to insert at each offset.
 *
 * **Where two fall at the same offset they are ordered by id** (ADR-0018), so
 * re-saving is byte-identical whatever order they were read in; an opener
 * comes before its own closer, so an empty comment stays well formed.
 */
export function commentInserts(
  comments: readonly Comment[],
  syntax: CommentSyntax,
): Map<number, Map<number, string>> {
  const at = new Map<number, Map<number, { id: string; order: number; text: string }[]>>();
  const add = (end: CommentEnd, id: string, order: number, text: string): void => {
    const element = at.get(end.element) ?? new Map();
    at.set(end.element, element);
    element.set(end.offset, [...(element.get(end.offset) ?? []), { id, order, text }]);
  };

  for (const comment of comments) {
    add(comment.start, comment.id, 0, syntax.writeOpen(comment.id, comment.remark));
    add(comment.end, comment.id, 1, syntax.writeClose(comment.id));
  }

  const inserts = new Map<number, Map<number, string>>();
  for (const [element, offsets] of at) {
    const joined = new Map<number, string>();
    for (const [offset, delimiters] of offsets) {
      delimiters.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.order - b.order));
      joined.set(offset, delimiters.map((delimiter) => delimiter.text).join(""));
    }
    inserts.set(element, joined);
  }
  return inserts;
}
