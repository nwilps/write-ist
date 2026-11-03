/**
 * Autocomplete for character names and scene headings (slice 2, step 9).
 *
 * While the caret is at the end of a cue or a heading, the lists of step 8
 * offer to finish what is being typed. The offer is **drawn, never written**:
 * it is a widget decoration at the caret (ghost text for the first choice, a
 * short list when there are several), so it is not in the document, not in the
 * file, and not an undo step until the writer accepts it. Accepting is one
 * transaction, and so one undo step.
 *
 * ## What is offered
 *
 * - **A cue:** the confirmed characters the typed letters begin. An entry used
 *   once or twice is in the list but unconfirmed and is never offered, so one
 *   typo cannot seed more typos (`names.ts`, glossary *Confirmed name*).
 * - **A heading, a piece at a time** (ADR-0021's prefixes): `INT.`/`EXT.` at the
 *   start; a confirmed location after the prefix; a time of day after ` - `.
 *   Accepting a piece inserts it and the separator that follows, so the caret
 *   lands where the next piece begins and the three accepted pieces spell
 *   `INT. KITCHEN - DAY`.
 *
 * Times of day are a vocabulary, not a name (Q-N): a built-in list, offered
 * whether or not the script has used them.
 *
 * ## What is never offered
 *
 * Nothing is offered until a letter of the piece has been typed, so Enter and
 * Tab on an empty line, or on a heading that has just been given its prefix,
 * keep doing what they always did. Nothing is offered unless the caret is at
 * the end of the element and nothing is selected. A piece already typed in
 * full has nothing left to offer.
 *
 * ## Keys
 *
 * With an offer showing: **Tab** or **Enter** accept; **Escape** closes it
 * (until the caret leaves the line); **Up** and **Down** move through a list of
 * more than one. Any other key is the writer's typing and the offer simply
 * follows it. After a cue is accepted, the key goes on to do what it always
 * does and starts the dialogue, inside the same undo step, so `(CONT'D)`
 * follows by ADR-0026's rule and not before. Tab only takes the name: Tab's
 * old meaning is to change the line's own type, which would turn the name just
 * accepted into dialogue.
 *
 * ## Cost
 *
 * The offer reads one element's text and the already-derived lists
 * (`NameLists.confirmedStartingWith`, built from a cache the edit already
 * kept up to date). It is worked out at most once per state and list version.
 */
import { Plugin, PluginKey, TextSelection, EditorState } from "prosemirror-state";
import type { Command, Transaction, EditorState as State } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { Decoration, DecorationSet } from "prosemirror-view";
import { splitElement, structural } from "./element-keys.ts";
import type { NameLists } from "./names.ts";
import { screenplaySchema } from "./schema.ts";

/** What a piece of the offer completes. */
export type Piece = "cue" | "prefix" | "location" | "time";

/** `INT.` and its kin, as offered (ADR-0021's canonical spellings). */
const PREFIXES: readonly string[] = ["INT.", "EXT.", "INT./EXT.", "EXT./INT.", "I/E.", "EST."];

/** The vocabulary of a time of day, offered whether or not the script has used it (Q-N). */
export const TIMES_OF_DAY: readonly string[] = [
  "DAY", "NIGHT", "DAWN", "DUSK", "MORNING", "EVENING", "CONTINUOUS", "LATER", "MOMENTS LATER", "SAME",
];

/** A heading's prefix, finished: the forms ADR-0021 reads, then a dot and/or space. */
const DONE_PREFIX = /^(?:INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\s*\/\s*E|INT|EXT|EST)(?:\.\s*|\s+)/i;

/** The most choices drawn at once. */
export const MOST_OFFERED = 6;

/** What is on offer for the line the caret ends. */
export interface Offer {
  readonly piece: Piece;
  /** The text offered a replacement, from here (inside the element) to the caret. */
  readonly from: number;
  readonly to: number;
  /** What the writer has typed of this piece. */
  readonly typed: string;
  /** What would replace it, in capitals, with any separator that follows. */
  readonly choices: readonly string[];
}

/**
 * What finishes `text`, a line of this type typed to its end, if anything.
 * Pure: the editor's own state is not involved, so it is tested as strings.
 */
export function completions(
  type: string,
  text: string,
  names: NameLists,
): { piece: Piece; start: number; choices: readonly string[] } | undefined {
  if (text.trim() === "") return undefined;
  if (type === "character") {
    const typed = text.toUpperCase();
    const choices = names
      .confirmedStartingWith("character", text)
      .filter((name) => name.startsWith(typed) && name !== typed);
    return choices.length === 0 ? undefined : { piece: "cue", start: 0, choices: cap(choices) };
  }
  if (type !== "scene-heading") return undefined;

  const typed = text.toUpperCase();
  const prefixes = PREFIXES.filter((prefix) => prefix.startsWith(typed) && prefix !== typed);
  if (prefixes.length > 0) {
    return { piece: "prefix", start: 0, choices: prefixes.map((prefix) => `${prefix} `) };
  }

  const done = DONE_PREFIX.exec(text);
  if (done === null) return undefined;
  const rest = text.slice(done[0].length);
  if (rest === "") return undefined;
  const wanted = rest.toUpperCase();

  const places = names
    .confirmedStartingWith("location", rest)
    .filter((name) => name.startsWith(wanted) && name !== wanted);
  if (places.length > 0) {
    return {
      piece: "location",
      start: done[0].length,
      choices: cap(places).map((name) => `${name} - `),
    };
  }

  const dash = rest.lastIndexOf(" - ");
  if (dash === -1) return undefined;
  const time = rest.slice(dash + 3).toUpperCase();
  if (time === "") return undefined;
  const times = TIMES_OF_DAY.filter((word) => word.startsWith(time) && word !== time);
  return times.length === 0
    ? undefined
    : { piece: "time", start: done[0].length + dash + 3, choices: times };
}

function cap(choices: readonly string[]): readonly string[] {
  return choices.length > MOST_OFFERED ? choices.slice(0, MOST_OFFERED) : choices;
}

/** The offer for the caret in `state`, ignoring whether the writer closed it. */
export function offerAt(state: State, names: NameLists): Offer | undefined {
  const selection = state.selection;
  if (!selection.empty) return undefined;
  const $head = selection.$head;
  const parent = $head.parent;
  if (parent.type.name !== "element" || parent.attrs["omitted"] === true) return undefined;
  if ($head.parentOffset !== parent.content.size) return undefined;

  const text = parent.textContent;
  const found = completions(parent.attrs["type"] as string, text, names);
  if (found === undefined) return undefined;
  return {
    piece: found.piece,
    from: $head.start() + found.start,
    to: $head.pos,
    typed: text.slice(found.start),
    choices: found.choices,
  };
}

/** What a view needs to draw an offer. */
export interface Drawing {
  /** The rest of the choice the writer is on, to ghost after the caret. */
  readonly ghost: string;
  readonly choices: readonly string[];
  readonly selected: number;
}

export interface AutocompleteOptions {
  /** The lists, read when needed: they are replaced when the manuscript is reloaded. */
  readonly names: () => NameLists;
  /** Draws the offer (the DOM is the app's; this module has none). */
  readonly draw: (drawing: Drawing) => HTMLElement;
}

interface Held {
  /** Which choice Enter and Tab would take. */
  readonly selected: number;
  /** The element (its start) the writer closed the offer in, until the caret leaves it. */
  readonly closedIn: number | null;
}

const key = new PluginKey<Held>("write-ist:autocomplete");

interface Move {
  readonly do: "close" | "move";
  /** For a close: the line it was closed on. For a move: the choice to be on. */
  readonly at: number;
}

/** Where the line the caret is in starts, or `null` outside any line (Select All). */
function lineStart(state: State): number | null {
  const $head = state.selection.$head;
  return $head.depth === 0 ? null : $head.before();
}

/** Whether the writer closed the offer on the line the caret is in. */
function closed(state: State, held: Held): boolean {
  return held.closedIn !== null && held.closedIn === lineStart(state);
}

/** The offer as the writer sees it: derived, and not closed. */
export function visibleOffer(state: State, names: NameLists): (Offer & { selected: number }) | undefined {
  const held = key.getState(state);
  if (held === undefined || closed(state, held)) return undefined;
  const offer = offerAt(state, names);
  return offer === undefined
    ? undefined
    : { ...offer, selected: Math.min(held.selected, offer.choices.length - 1) };
}

/** Whether a key is pressed bare, as typing is. */
function bare(event: KeyboardEvent): boolean {
  return !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
}

/** Take the choice: one transaction, so one undo step. */
export function accept(
  state: State,
  offer: Offer & { selected: number },
  then?: Command,
): Transaction {
  const choice = offer.choices[offer.selected]!;
  const tr = state.tr.insertText(choice, offer.from, offer.to);
  tr.setSelection(TextSelection.create(tr.doc, offer.from + choice.length));

  if (then !== undefined) {
    // The command is run on the document as it now stands, and what it does is
    // folded into this same transaction. A state with no plugins: the commands
    // read only the document and the selection.
    const after = EditorState.create({ doc: tr.doc, selection: tr.selection, schema: screenplaySchema });
    let followed: Transaction | undefined;
    then(after, (next) => {
      followed = next;
    });
    if (followed !== undefined) {
      for (const step of followed.steps) tr.step(step);
      tr.setSelection(TextSelection.create(tr.doc, followed.selection.head));
    }
  }
  return structural(tr.scrollIntoView());
}

/**
 * The plugin. **It must come before the plugin that binds Enter and Tab** so
 * that, with an offer showing, those keys are the offer's; with none showing
 * this plugin passes every key on.
 */
export function autocomplete(options: AutocompleteOptions): Plugin<Held> {
  // Worked out once per state and per version of the lists, however many times
  // the view and the keys ask.
  let memo: { state: State; names: NameLists; version: number; offer: ReturnType<typeof visibleOffer> } | undefined;
  const current = (state: State): ReturnType<typeof visibleOffer> => {
    const names = options.names();
    if (memo?.state === state && memo.names === names && memo.version === names.version) {
      return memo.offer;
    }
    const offer = visibleOffer(state, names);
    memo = { state, names, version: names.version, offer };
    return offer;
  };

  return new Plugin<Held>({
    key,
    state: {
      init: () => ({ selected: 0, closedIn: null }),
      apply: (tr, held, _old, state) => {
        const meta = tr.getMeta(key) as Move | undefined;
        if (meta?.do === "close") return { selected: 0, closedIn: meta.at };
        if (meta?.do === "move") return { ...held, selected: meta.at };
        // Anything else the writer did starts the choosing over; a close
        // holds until the caret is on another line.
        const mapped = held.closedIn === null ? null : tr.mapping.map(held.closedIn, -1);
        const closedIn = mapped !== null && mapped === lineStart(state) ? mapped : null;
        return tr.docChanged || tr.selectionSet ? { selected: 0, closedIn } : held;
      },
    },
    props: {
      handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
        const offer = current(view.state);
        if (offer === undefined) return false;

        if (event.key === "Escape" && bare(event)) {
          const at = lineStart(view.state);
          if (at === null) return false;
          view.dispatch(view.state.tr.setMeta(key, { do: "close", at } satisfies Move));
          return true;
        }
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && bare(event)) {
          const count = offer.choices.length;
          if (count < 2) return false;
          const by = event.key === "ArrowDown" ? 1 : count - 1;
          const at = (offer.selected + by) % count;
          view.dispatch(view.state.tr.setMeta(key, { do: "move", at } satisfies Move));
          return true;
        }
        if ((event.key === "Tab" || event.key === "Enter") && bare(event)) {
          // Enter on a cue goes on to its dialogue, as the key always did. Tab
          // only takes the name: its old meaning turns the line itself into
          // dialogue, which would be the name changing type under the writer.
          // A heading stays where it is, with the caret where the next piece
          // begins.
          const then = offer.piece === "cue" && event.key === "Enter" ? splitElement : undefined;
          view.dispatch(accept(view.state, offer, then));
          return true;
        }
        return false;
      },
      decorations: (state) => {
        const offer = current(state);
        if (offer === undefined) return null;
        const choice = offer.choices[offer.selected]!;
        const drawing: Drawing = {
          ghost: choice.slice(offer.typed.length),
          choices: offer.choices,
          selected: offer.selected,
        };
        return DecorationSet.create(state.doc, [
          Decoration.widget(offer.to, () => options.draw(drawing), {
            side: 1,
            // Redrawn when what it shows changes, and only then.
            key: `autocomplete:${offer.selected}:${offer.typed}:${offer.choices.join("|")}`,
            ignoreSelection: true,
            stopEvent: () => true,
          }),
        ]);
      },
    },
  });
}
