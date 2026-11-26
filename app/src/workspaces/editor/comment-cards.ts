/**
 * The comment cards (ADR-0018; the desk design, §5, as Noah decided it on
 * 2026-11-25): a card in a side column for each comment, a tint over the
 * words it is about, and a line from one to the other.
 *
 * The comments themselves — what each covers, its remark, which is lit, the
 * draft — are the screenplay surface's (`src/screenplay/comment-editing.ts`),
 * and the tint is that plugin's too. This draws the rest and is the Editor's,
 * not the shell's (ADR-0005).
 *
 * ## Where the cards are
 *
 * In a layer over the desk, so they **scroll with the script** and are level
 * with their words, in the two columns the side panels stand in; which column,
 * and how they stack, is `comment-layout.ts`. The panels stay put as the paper
 * scrolls, and are drawn over the layer: a card scrolled up to them **slides
 * under** them and drops to 15% while it is there, the panels of a column
 * counted as one solid block. Nothing is blurred.
 *
 * ## Writing in one
 *
 * Click a card and type: the remark is the card's text. A new comment opens
 * its card ready to type in. **Esc** or **Enter** leaves the card for the
 * paper — Esc never goes Home from a card — and so does clicking away. Words
 * typed are put in the remark when the writer leaves the card, or pauses as
 * long as ends an undo step on the paper (`PAUSE_MS`), each time one undo step.
 * A new comment left with nothing in it quietly goes. A remark is at most
 * `REMARK_MAX` characters: typing stops there and a paste goes in as far as
 * there is room, with nothing said about it.
 *
 * **Resolve** deletes the comment and keeps its words (`resolveComment`), and
 * puts the writer back on the paper, where Ctrl+Z brings it back.
 *
 * **On a locked draft** the cards are read and never written in: no caret in
 * them and no Resolve, since a locked draft never changes (ADR-0002).
 */
import { Check, createElement, type IconNode } from "lucide";
import { TextSelection, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  activateComment,
  activeComment,
  DRAFT_ID,
  finishDraft,
  resolveComment,
  setRemark,
  shownComments,
  startComment,
  type ShownComment,
} from "../../../../src/screenplay/comment-editing.ts";
import { cappedRemark, REMARK_MAX } from "../../../../src/comments.ts";
import { PAUSE_MS } from "../../../../src/screenplay/undo-grouping.ts";
import { element } from "../../screens/element.ts";
import {
  connectorRoute,
  preferredSide,
  stackCards,
  underPanels,
  type CardPlace,
  type CardWant,
  type Point,
  type Side,
} from "./comment-layout.ts";

const SVG = "http://www.w3.org/2000/svg";

export interface CommentCards {
  /** The layer the cards are drawn in: put in the desk, after the paper and before the right column. */
  readonly layer: HTMLElement;
  /** Draw for this paper: written in, or only read (a locked draft). A new paper starts with no cards. */
  readonly attach: (view: EditorView, readOnly?: boolean) => void;
  /** The state changed: draw again, in the next frame, if anything a card shows did. */
  readonly update: (state: EditorState) => void;
  /**
   * Add Comment: a card over the selection, or the caret's line, ready to type
   * in. `false` where there is nothing to cover, or a card has the keys.
   */
  readonly add: () => boolean;
  /** Draw now: the paper changed size or zoom. */
  readonly redraw: () => void;
  /** The paper scrolled: which cards are under the panels. */
  readonly slide: () => void;
  /** Whether a card has the keys. */
  readonly editing: () => boolean;
  /** Put any words typed in a card into its remark now: before a save on leaving. */
  readonly flush: () => void;
  readonly dispose: () => void;
}

interface Card {
  /** The comment's id; `DRAFT_ID` until a new one is made. */
  id: string;
  readonly root: HTMLElement;
  readonly text: HTMLElement;
  readonly line: SVGSVGElement;
  readonly path: SVGPathElement;
  readonly dot: HTMLElement;
  /** The remark as last drawn or written, to tell whether the writer changed it. */
  written: string;
  side: Side;
  top: number;
  height: number;
  width: number;
  /** An unlit card whose remark runs past four lines. */
  long: boolean;
}

export function commentCards(parts: {
  /** The paper (`.page`). */
  readonly page: HTMLElement;
  /** The side columns, whose panels the cards slide under. */
  readonly columns: { readonly left: HTMLElement; readonly right: HTMLElement };
}): CommentCards {
  const layer = element("div", { className: "comments" });
  layer.setAttribute("aria-label", "Comments");
  layer.setAttribute("role", "region");
  const cards = new Map<string, Card>();
  let view: EditorView | undefined;
  let frame: number | undefined;
  let drawnDoc: unknown;
  let drawnKey = "";
  let pause: ReturnType<typeof setTimeout> | undefined;
  let readOnly = false;

  const typed = (card: Card): string => card.text.textContent ?? "";

  /** Put the card's words into its remark, if they changed: one undo step. */
  const write = (card: Card): void => {
    clearTimeout(pause);
    pause = undefined;
    if (view === undefined || card.id === DRAFT_ID) return;
    const words = typed(card);
    if (words === card.written) return;
    const tr = setRemark(view.state, card.id, words);
    card.written = words;
    if (tr !== null) view.dispatch(tr);
  };

  /** The writer left a card: its words kept, or a new empty one let go. */
  const finish = (card: Card): void => {
    if (view === undefined) return;
    if (card.id !== DRAFT_ID) {
      write(card);
      return;
    }
    const tr = finishDraft(view.state, typed(card));
    if (tr === null) return;
    view.dispatch(tr);
    // Made: the card is the new comment's now, and stays where it is.
    const made = activeComment(view.state);
    if (made !== undefined && made !== DRAFT_ID && cards.get(DRAFT_ID) === card) {
      cards.delete(DRAFT_ID);
      card.id = made;
      card.written = typed(card);
      cards.set(made, card);
    }
  };

  /**
   * Back to the paper, the caret at the end of the comment's words: typing
   * carries on where the writer was looking, and an Undo straight after puts
   * things back there rather than wherever the caret was before the card.
   */
  const toPaper = (card: Card): void => {
    if (view === undefined) return;
    const shown = shownComments(view.state).find((comment) => comment.id === card.id);
    if (shown !== undefined) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, shown.end)));
    view.focus();
  };

  const make = (comment: ShownComment): Card => {
    const text = element("div", { className: "comment-card__text" });
    // Plain text only: a remark is a line of words in the file (ADR-0018).
    // A locked draft's is read only, so it takes no caret at all.
    if (!readOnly) text.setAttribute("contenteditable", "plaintext-only");
    text.setAttribute("role", readOnly ? "note" : "textbox");
    text.setAttribute("aria-label", "Comment");
    text.spellcheck = false;
    const resolve = element("button", { type: "button", className: "comment-card__resolve" }, [
      icon(Check),
      element("span", { textContent: "Resolve" }),
    ]);
    const root = element("div", { className: "comment-card" }, [
      text,
      ...(readOnly ? [] : [element("div", { className: "comment-card__foot" }, [resolve])]),
    ]);
    const path = document.createElementNS(SVG, "path");
    const line = document.createElementNS(SVG, "svg");
    line.classList.add("comment-line");
    line.setAttribute("aria-hidden", "true");
    line.append(path);
    const dot = element("div", { className: "comment-dot" });
    const card: Card = { id: comment.id, root, text, line, path, dot, written: comment.remark, side: "right", top: 0, height: 0, width: 0, long: false };
    text.textContent = comment.remark;

    // Lit by clicking it anywhere; a click off the words still lands in them.
    root.addEventListener("mousedown", (event) => {
      if (view !== undefined && activeComment(view.state) !== card.id) view.dispatch(activateComment(view.state, card.id));
      if (resolve.contains(event.target as Node)) {
        // The words stay where they were until the button has been pressed.
        event.preventDefault();
        return;
      }
      if (event.target !== text && !readOnly) {
        event.preventDefault();
        caretAtEnd(text);
      }
    });
    text.addEventListener("focus", () => {
      if (view !== undefined && activeComment(view.state) !== card.id) view.dispatch(activateComment(view.state, card.id));
      // Written in: out from under the panels (`draw`).
      schedule();
    });
    text.addEventListener("beforeinput", (event) => {
      // At most REMARK_MAX, quietly: typing stops, and a paste goes in as far
      // as there is room. A remark already longer, from a file, can be cut
      // down but not added to.
      if (event.isComposing || !event.inputType.startsWith("insert")) return;
      const adding = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
      const room = REMARK_MAX - (typed(card).length - selectedLength(text));
      if (adding.length <= room) return;
      event.preventDefault();
      const fits = room > 0 ? cappedRemark(adding, room) : "";
      if (fits !== "") insertAtCaret(text, fits);
    });
    text.addEventListener("input", (event) => {
      // Whatever got past the above — a word chosen from an input method —
      // is cut to fit here; the model caps it again when it is written.
      if ((event as InputEvent).inputType?.startsWith("insert") && typed(card).length > REMARK_MAX) {
        text.textContent = cappedRemark(typed(card));
        caretAtEnd(text);
      }
      // A remark is one line: a line break pasted in is a space by the time it is kept.
      clearTimeout(pause);
      if (card.id !== DRAFT_ID) pause = setTimeout(() => write(card), PAUSE_MS);
      schedule();
    });
    text.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Escape" || (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey)) {
        // Back to the paper; never Home from here, and never a new line in a remark.
        event.preventDefault();
        event.stopPropagation();
        toPaper(card);
      }
    });
    text.addEventListener("blur", () => {
      finish(card);
      // Left: back level with its words, under the panels if that is where they are.
      schedule();
    });
    resolve.addEventListener("click", () => {
      if (view === undefined) return;
      // The latest words first, so Ctrl+Z brings back the remark as it was last read.
      if (card.id !== DRAFT_ID) write(card);
      // The caret goes to the words first, a step of its own, so that Ctrl+Z
      // brings the comment back with the paper staying where it is.
      toPaper(card);
      const tr = resolveComment(view.state, card.id);
      if (tr !== null) view.dispatch(tr);
    });
    return card;
  };

  /** The cards as the state says, drawn in place. Reads first, then writes, so the window lays out once. */
  const draw = (): void => {
    frame = undefined;
    if (view === undefined) return;
    const state = view.state;
    const shown = shownComments(state);
    drawnDoc = state.doc;
    drawnKey = keyOf(shown);

    // The cards there should be, each with its words.
    const wanted = new Set(shown.map((comment) => comment.id));
    for (const [id, card] of cards) {
      if (wanted.has(id)) continue;
      card.root.remove();
      card.line.remove();
      card.dot.remove();
      cards.delete(id);
    }
    for (const comment of shown) {
      let card = cards.get(comment.id);
      if (card === undefined) {
        card = make(comment);
        cards.set(comment.id, card);
        layer.append(card.line, card.root, card.dot);
      }
      // Never under the writer's caret: a card being typed in has the latest words.
      if (document.activeElement !== card.text && comment.remark !== card.written) {
        card.text.textContent = comment.remark;
        card.written = comment.remark;
      }
      card.root.classList.toggle("comment-card--active", comment.active);
      card.line.classList.toggle("comment-line--active", comment.active);
      card.dot.classList.toggle("comment-dot--active", comment.active);
    }
    if (shown.length === 0) return;
    // In the order their words come, which is the order Tab and a screen
    // reader take them in: one brought back by Undo goes back in its place.
    // Not while a card has the keys, since moving it would take them away.
    const order = shown.map((comment) => cards.get(comment.id)!);
    const drawnOrder = [...layer.querySelectorAll(".comment-card")];
    if (!editing() && order.some((card, index) => drawnOrder[index] !== card.root)) {
      for (const card of order) layer.append(card.line, card.root, card.dot);
    }

    // --- Read.
    const box = layer.getBoundingClientRect();
    const paper = parts.page.getBoundingClientRect();
    const columns = { left: parts.columns.left.getBoundingClientRect(), right: parts.columns.right.getBoundingClientRect() };
    const sample = cards.get(shown[0]!.id)!;
    const leading = Number.parseFloat(getComputedStyle(sample.text).lineHeight);
    const dotDown = sample.text.offsetTop + (Number.isFinite(leading) ? leading : sample.text.offsetHeight) / 2;
    const gap = Number.parseFloat(getComputedStyle(layer).getPropertyValue("--space-comment-stack")) || 0;
    const paperCentre = (paper.left + paper.right) / 2;
    const blocks = { left: blockOf(parts.columns.left), right: blockOf(parts.columns.right) };
    /**
     * The card being written in is never under the panels, where it could not
     * be read: no higher than just below them, its connector bending to it as
     * a stacked card's does. Left, it goes back level with its words.
     */
    const below = (side: Side): number => {
      const block = blocks[side];
      return block === undefined ? -Infinity : block.bottom - box.top + gap;
    };

    const words = shown.map((comment) => wordsOf(view!, comment));
    const wants: CardWant[] = shown.map((comment, index) => {
      const at = words[index]!;
      const card = cards.get(comment.id)!;
      // An unlit card stops at four lines (`comments.css`): longer, and it fades out.
      card.long = !comment.active && card.text.scrollHeight > card.text.clientHeight + 1;
      card.height = card.root.offsetHeight;
      card.width = card.root.offsetWidth;
      const left = at.first.bottom - box.top - dotDown;
      const right = at.last.bottom - box.top - dotDown;
      const writing = comment.draft || document.activeElement === card.text;
      return {
        id: comment.id,
        want: writing ? { left: Math.max(left, below("left")), right: Math.max(right, below("right")) } : { left, right },
        height: card.height,
        prefer: preferredSide({ ...at, centre: (at.first.left + at.last.right) / 2, paperCentre }),
      };
    });

    // --- Write.
    stackCards(wants, gap).forEach((place: CardPlace, index) => {
      const card = cards.get(place.id)!;
      const at = words[index]!;
      card.side = place.side;
      card.top = place.top;
      const right = place.side === "right";
      const x = right ? columns.right.left - box.left : columns.left.right - box.left - card.width;
      card.root.classList.toggle("comment-card--long", card.long);
      card.root.classList.toggle("comment-card--left", !right);
      card.root.style.setProperty("--comment-x", String(x));
      card.root.style.setProperty("--comment-y", String(place.top));

      // From the foot of the words' line, out to the strip of desk beside the
      // paper, and in to the card's dot (`connectorRoute`).
      const from: Point = right
        ? { x: at.last.right - box.left, y: at.last.bottom - box.top }
        : { x: at.first.left - box.left, y: at.first.bottom - box.top };
      const to: Point = { x: right ? x : x + card.width, y: place.top + dotDown };
      const bendX = right
        ? (paper.right + columns.right.left) / 2 - box.left
        : (columns.left.right + paper.left) / 2 - box.left;
      drawLine(card, connectorRoute(from, to, bendX));
      card.dot.style.setProperty("--comment-x", String(to.x));
      card.dot.style.setProperty("--comment-y", String(to.y));
    });
    slide();
  };

  /** Fade the cards that are under their column's panels, and only those. */
  const slide = (): void => {
    if (cards.size === 0) return;
    const box = layer.getBoundingClientRect();
    const blocks = { left: blockOf(parts.columns.left), right: blockOf(parts.columns.right) };
    for (const card of cards.values()) {
      const top = box.top + card.top;
      card.root.classList.toggle("comment-card--under", underPanels({ top, bottom: top + card.height }, blocks[card.side]));
    }
  };

  const schedule = (): void => {
    if (frame !== undefined) return;
    const window = layer.ownerDocument.defaultView;
    if (window === null || typeof window.requestAnimationFrame !== "function") {
      draw();
      return;
    }
    frame = window.requestAnimationFrame(draw);
  };

  const editing = (): boolean => {
    const focused = document.activeElement;
    return focused !== null && [...cards.values()].some((card) => card.text === focused);
  };

  return {
    layer,
    attach: (editor, locked = false) => {
      if (view !== editor) {
        // Another paper: the last one's cards go with it.
        clearTimeout(pause);
        for (const card of cards.values()) {
          card.root.remove();
          card.line.remove();
          card.dot.remove();
        }
        cards.clear();
        drawnDoc = undefined;
        drawnKey = "";
      }
      view = editor;
      readOnly = locked;
      schedule();
    },
    update: (state) => {
      if (state.doc === drawnDoc && keyOf(shownComments(state)) === drawnKey) return;
      // Nothing to draw and nothing drawn: typing in a script with no comments costs this test.
      if (cards.size === 0 && shownComments(state).length === 0) {
        drawnDoc = state.doc;
        return;
      }
      schedule();
    },
    add: () => {
      if (view === undefined || readOnly || editing()) return false;
      const tr = startComment(view.state);
      if (tr === null) return false;
      view.dispatch(tr);
      draw();
      cards.get(DRAFT_ID)?.text.focus();
      return true;
    },
    redraw: () => {
      if (frame !== undefined) layer.ownerDocument.defaultView?.cancelAnimationFrame(frame);
      draw();
    },
    slide,
    editing,
    flush: () => {
      for (const card of cards.values()) if (document.activeElement === card.text) finish(card);
    },
    dispose: () => {
      clearTimeout(pause);
      if (frame !== undefined) layer.ownerDocument.defaultView?.cancelAnimationFrame(frame);
      frame = undefined;
      view = undefined;
      layer.remove();
    },
  };
}

/** What draws a set of comments differently: which, where, what they say, which is lit. */
function keyOf(shown: readonly ShownComment[]): string {
  return shown.map((c) => `${c.id}\u0000${c.start}\u0000${c.end}\u0000${c.active ? 1 : 0}\u0000${c.remark}`).join("\u0001");
}

type Rect = { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };

/**
 * Where a comment's words are on the window: their first line's start and
 * their last line's end, and whether anything is written before them on the
 * one or after them on the other.
 */
function wordsOf(view: EditorView, comment: ShownComment): { first: Rect; last: Rect; startsLine: boolean; endsLine: boolean } {
  const first = view.coordsAtPos(comment.start, 1);
  const last = view.coordsAtPos(comment.end, -1);
  const doc = view.state.doc;
  const $start = doc.resolve(comment.start);
  const $end = doc.resolve(comment.end);
  const before = $start.parentOffset === 0 ? "\n" : doc.textBetween(comment.start - 1, comment.start);
  const after = $end.parentOffset === $end.parent.content.size ? "\n" : doc.textBetween(comment.end, comment.end + 1);
  // A line the window wrapped: the next character is drawn a line lower.
  const startsLine = before === "\n" || view.coordsAtPos(comment.start, -1).top < first.top - 1;
  const endsLine = after === "\n" || view.coordsAtPos(comment.end, 1).top > last.top + 1;
  return { first, last, startsLine, endsLine };
}

/** The panels of a column, top of the first to foot of the last: one solid block. */
function blockOf(column: HTMLElement): { top: number; bottom: number } | undefined {
  const panels = column.querySelectorAll<HTMLElement>(":scope > .panel");
  if (panels.length === 0) return undefined;
  return { top: panels[0]!.getBoundingClientRect().top, bottom: panels[panels.length - 1]!.getBoundingClientRect().bottom };
}

/** The connector, as a path in a box of its own just big enough to hold it. */
function drawLine(card: Card, corners: readonly Point[]): void {
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const left = Math.floor(Math.min(...xs)) - 1;
  const top = Math.floor(Math.min(...ys)) - 1;
  const width = Math.ceil(Math.max(...xs)) - left + 2;
  const height = Math.ceil(Math.max(...ys)) - top + 2;
  card.line.setAttribute("width", String(width));
  card.line.setAttribute("height", String(height));
  card.line.setAttribute("viewBox", `0 0 ${width} ${height}`);
  card.line.style.setProperty("--comment-x", String(left));
  card.line.style.setProperty("--comment-y", String(top));
  // On the half pixel, so a one-pixel line covers one row of pixels, not two.
  card.path.setAttribute(
    "d",
    corners.map((point, index) => `${index === 0 ? "M" : "L"}${Math.round(point.x - left) + 0.5} ${Math.round(point.y - top) - 0.5}`).join(" "),
  );
}

function icon(node: IconNode): SVGElement {
  const drawn = createElement(node, { class: "comment-card__icon" });
  drawn.setAttribute("aria-hidden", "true");
  return drawn;
}

/** Focus a card's words with the caret after the last of them. */
/** How many of the card's characters the selection in it covers. */
function selectedLength(text: HTMLElement): number {
  const selection = text.ownerDocument.getSelection();
  if (selection === null || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  return text.contains(range.commonAncestorContainer) ? range.toString().length : 0;
}

/** Put words in where the caret is, over any selection, as typing would, and say so as typing does. */
function insertAtCaret(text: HTMLElement, words: string): void {
  const selection = text.ownerDocument.getSelection();
  if (selection === null || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!text.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  const node = text.ownerDocument.createTextNode(words);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  text.normalize();
  text.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: words }));
}

function caretAtEnd(text: HTMLElement): void {
  text.focus();
  const selection = text.ownerDocument.getSelection();
  if (selection === null) return;
  const range = text.ownerDocument.createRange();
  range.selectNodeContents(text);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
