/**
 * Spellcheck on the paper (slice 2, step 10; ADR-0032).
 *
 * **Off while writing.** A hotkey (Ctrl/Cmd+;, `app/src/screens/shortcuts.ts`)
 * or the View menu toggles a pass; while it is on, misspelt words are
 * underlined and **nothing is ever changed in the text**. The underline is an
 * inline decoration, like a drawn page break: it is not in the document, so it
 * is not in the file, the clipboard or the PDF. The state is not saved, and a
 * project opens with it off.
 *
 * ## Off the keystroke path
 *
 * A keystroke does exactly one thing here: the underlines already drawn are
 * *mapped* through the edit (`DecorationSet.map`, the cost of the underlines,
 * not of the manuscript) and a timer is restarted. The engine is not asked.
 * After the writer pauses (`spellcheckPauseMs`) one pass runs, and it is
 * incremental at two levels:
 *
 * - **A verdict per distinct word**, kept by `Spelling`, so words the engine
 *   has answered once are never sent again.
 * - **The issues of an element**, kept against the element's own node. ProseMirror
 *   shares every node an edit did not touch, so after an edit in one scene the
 *   other scenes' elements are found by identity and nothing about them is
 *   re-read. The scene the caret is in is checked first on the first pass, then
 *   the others in turn, each batch drawn in one transaction.
 *
 * The issues are kept against the dictionary they were judged by
 * (`Spelling.epoch`): a word added or taken out makes every kept answer stale,
 * which costs one pass of lookups in the verdict cache and no lookups in the
 * engine. The character and location lists are not consulted (`spelling.ts`).
 *
 * ## What the writer can do about an underline
 *
 * The paper's right-click menu (ADR-0039) offers them: `suggestionsAt` (the
 * dictionary's), `replaceWord` (one undo
 * step) and `addToDictionary` (one undo step too: `removeFromDictionary`
 * takes it back).
 */
import { closeHistory } from "prosemirror-history";
import type { Node as EditorNode } from "prosemirror-model";
import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import type { ElementType } from "./document.ts";
import { manuscriptElements } from "./numbering.ts";
import { beginsScene } from "./ranges.ts";
import { isChecked, Spelling, tokensOf, type SpellEngine, type Verdict } from "./spelling.ts";

export interface SpellcheckOptions {
  readonly engine: SpellEngine;
  /** Pause after typing before a recheck, in milliseconds. */
  readonly pause: number;
}

/** One underlined word. */
export interface SpellIssue {
  readonly word: string;
  /** Document positions of the word. */
  readonly from: number;
  readonly to: number;
  readonly verdict: Verdict;
}

/** One thing a menu would offer for a word: the dictionary's. */
export interface Suggestion {
  readonly text: string;
}

/** An issue inside its element: offsets into the element's text. */
interface ElementIssue {
  readonly word: string;
  readonly start: number;
  readonly end: number;
  readonly verdict: Verdict;
}

interface Kept {
  /** `Spelling.epoch` when judged: a word added since makes the answer stale. */
  readonly epoch: number;
  readonly issues: readonly ElementIssue[];
}

interface SpellState {
  readonly on: boolean;
  readonly decorations: DecorationSet;
}

type Meta = { readonly on: boolean } | { readonly decorations: DecorationSet };

/** Distinct new words sent to the engine in one call, at most (scenes are never split). */
const BATCH_WORDS = 600;

const key = new PluginKey<SpellState>("write-ist:spellcheck");

const OFF: SpellState = { on: false, decorations: DecorationSet.empty };

/** The class a misspelt word is drawn with. */
export const SPELL_CLASS = "spell-error";

export class Spellcheck {
  readonly spelling: Spelling;
  readonly plugin: Plugin<SpellState>;

  private readonly kept = new WeakMap<EditorNode, Kept>();
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> = Promise.resolve();
  private view: EditorView | undefined;

  constructor(private readonly options: SpellcheckOptions) {
    this.spelling = new Spelling(options.engine);
    this.plugin = new Plugin<SpellState>({
      key,
      state: {
        init: () => OFF,
        apply: (transaction, held) => {
          const meta = transaction.getMeta(key) as Meta | undefined;
          if (meta !== undefined && "on" in meta) return meta.on ? { on: true, decorations: held.decorations } : OFF;
          if (!held.on) return held;
          if (meta !== undefined) return { on: true, decorations: meta.decorations };
          if (!transaction.docChanged) return held;
          // The cost of a keystroke: the underlines already drawn, moved.
          return { on: true, decorations: held.decorations.map(transaction.mapping, transaction.doc) };
        },
      },
      props: {
        decorations: (state) => {
          const held = key.getState(state);
          return held?.on === true ? held.decorations : null;
        },
      },
      view: (view) => {
        this.view = view;
        return {
          update: (updated, before) => {
            if (!this.isOn(updated.state) || before.doc === updated.state.doc) return;
            this.schedule(updated, this.options.pause);
          },
          destroy: () => {
            this.cancel();
            this.view = undefined;
          },
        };
      },
    });
  }

  /** Whether a pass is on in this state. */
  isOn(state: EditorState): boolean {
    return key.getState(state)?.on === true;
  }

  /** Turn the pass on or off. Answers whether it is on now. */
  toggle(view: EditorView): boolean {
    const on = !this.isOn(view.state);
    this.setOn(view, on);
    return on;
  }

  setOn(view: EditorView, on: boolean): void {
    if (on === this.isOn(view.state)) return;
    this.cancel();
    view.dispatch(view.state.tr.setMeta(key, { on } satisfies Meta).setMeta("addToHistory", false));
    if (on) this.schedule(view, 0);
  }

  /** Check again soon: the dictionary changed, not the document. */
  refresh(view: EditorView): void {
    if (this.isOn(view.state)) this.schedule(view, 0);
  }

  /** Run any pass that is waiting, now, and answer when it has been drawn. */
  async flush(view: EditorView): Promise<void> {
    if (!this.isOn(view.state)) return;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.start(view);
    }
    await this.running;
  }

  /** The underline under `position`, if there is one. */
  issueAt(state: EditorState, position: number): SpellIssue | undefined {
    const held = key.getState(state);
    if (held?.on !== true) return undefined;
    const found = held.decorations.find(position, position).find(
      (decoration) => decoration.from <= position && position <= decoration.to,
    );
    const issue = found?.spec?.["issue"] as SpellIssue | undefined;
    return issue === undefined ? undefined : { ...issue, from: found!.from, to: found!.to };
  }

  /** Every underline, in order. */
  issues(state: EditorState): SpellIssue[] {
    const held = key.getState(state);
    if (held?.on !== true) return [];
    return held.decorations
      .find()
      .map((decoration) => ({ ...(decoration.spec["issue"] as SpellIssue), from: decoration.from, to: decoration.to }));
  }

  /** What to offer for an underline: the dictionary's suggestions, best first. */
  async suggestionsAt(state: EditorState, position: number): Promise<Suggestion[]> {
    const issue = this.issueAt(state, position);
    if (issue === undefined) return [];
    return (await this.spelling.suggestions(issue.word)).map((text) => ({ text }));
  }

  /** Replace the word under an underline, in one undo step. */
  replaceWord(view: EditorView, issue: SpellIssue, text: string): void {
    const doc = view.state.doc;
    if (doc.textBetween(issue.from, issue.to) !== issue.word) return;
    const marks = doc.resolve(issue.from).marksAcross(doc.resolve(issue.to)) ?? [];
    const replacement = view.state.schema.text(text, marks);
    view.dispatch(closeHistory(view.state.tr.replaceWith(issue.from, issue.to, replacement)));
  }

  /** Make a word right from now on, between sessions, and redraw. Answers whether it was new to the dictionary. */
  async addToDictionary(view: EditorView, word: string): Promise<boolean> {
    const added = await this.spelling.add(word);
    this.refresh(view);
    return added;
  }

  /** Take back a word `addToDictionary` added, and redraw, so its underline returns. */
  async removeFromDictionary(view: EditorView, word: string): Promise<void> {
    await this.spelling.remove(word);
    this.refresh(view);
  }

  /**
   * The pass's numbers over a whole document: words checked, distinct words,
   * and flagged, by element type. Reads the same verdicts the underlines do,
   * so a defect that flags every word shows here as well as on the paper.
   */
  async census(doc: EditorNode): Promise<SpellCensus> {
    const all: { word: string; type: ElementType }[] = [];
    doc.forEach((node) => {
      if (node.type.name !== "element") return;
      const type = node.attrs["type"] as ElementType;
      if (!isChecked(type, node.attrs["omitted"] === true)) return;
      for (const token of tokensOf(node.textContent)) all.push({ word: token.word, type });
    });
    await this.spelling.prepare(all.map((entry) => entry.word));

    const flaggedByType: Partial<Record<ElementType, number>> = {};
    const distinct = new Set<string>();
    const flaggedWords = new Set<string>();
    let flagged = 0;
    for (const { word, type } of all) {
      distinct.add(word);
      if (this.spelling.judge(word) === undefined) continue;
      flagged += 1;
      flaggedWords.add(word);
      flaggedByType[type] = (flaggedByType[type] ?? 0) + 1;
    }
    return { checked: all.length, distinct: distinct.size, flagged, flaggedDistinct: flaggedWords.size, flaggedByType };
  }

  /* ------------------------------------------------------------- the pass */

  private schedule(view: EditorView, pause: number): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.start(view);
    }, pause);
  }

  private cancel(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.generation += 1;
  }

  private start(view: EditorView): void {
    const generation = ++this.generation;
    this.running = this.pass(view, generation).catch(() => {
      // The engine could not answer (ADR-0008 rule 4 is about the writer's
      // work, and none is at risk): underlines already drawn stay, and the
      // next pause tries again.
    });
  }

  private async pass(view: EditorView, generation: number): Promise<void> {
    if (!this.isOn(view.state)) return;
    const doc = view.state.doc;
    const batches = batchesOf(scenesOf(doc, view.state.selection.head), (node) => this.needs(node), BATCH_WORDS);

    for (const [index, batch] of batches.entries()) {
      if (batch.words.length === 0) continue;
      await this.spelling.prepare(batch.words);
      // Typed, toggled off or asked again meanwhile: the newer pass starts
      // from the verdicts this one kept.
      if (generation !== this.generation || view.state.doc !== doc) return;
      // Draw what is judged so far, so the caret's scene shows before the rest
      // of the script has been asked about. The last batch is drawn below.
      if (index < batches.length - 1) this.publish(view, doc);
    }
    this.publish(view, doc);
  }

  /** The words of an element not yet judged by this dictionary, or none when it is. */
  private needs(node: EditorNode): string[] {
    const held = this.kept.get(node);
    if (held?.epoch === this.spelling.epoch) return [];
    if (!isChecked(node.attrs["type"] as ElementType, node.attrs["omitted"] === true)) return [];
    return tokensOf(node.textContent).map((token) => token.word).filter((word) => !this.spelling.has(word));
  }

  /** The element's issues, judged now if they are not kept. Undefined while a word has no verdict. */
  private issuesOf(node: EditorNode): readonly ElementIssue[] | undefined {
    const held = this.kept.get(node);
    if (held?.epoch === this.spelling.epoch) return held.issues;
    const type = node.attrs["type"] as ElementType;
    let issues: ElementIssue[] = [];
    if (isChecked(type, node.attrs["omitted"] === true)) {
      const tokens = tokensOf(node.textContent);
      if (tokens.some((token) => !this.spelling.has(token.word))) return undefined;
      for (const token of tokens) {
        const verdict = this.spelling.judge(token.word);
        if (verdict !== undefined) issues.push({ word: token.word, start: token.start, end: token.end, verdict });
      }
    } else {
      issues = [];
    }
    this.kept.set(node, { epoch: this.spelling.epoch, issues });
    return issues;
  }

  /** Draw everything judged so far, in one transaction. */
  private publish(view: EditorView, doc: EditorNode): void {
    if (view.state.doc !== doc || !this.isOn(view.state)) return;
    const drawn: Decoration[] = [];
    for (const { node, pos: offset } of manuscriptElements(doc)) {
      const issues = this.issuesOf(node);
      if (issues === undefined) continue;
      for (const issue of issues) {
        const from = offset + 1 + issue.start;
        const placed: SpellIssue = { word: issue.word, from, to: offset + 1 + issue.end, verdict: issue.verdict };
        drawn.push(
          Decoration.inline(
            placed.from,
            placed.to,
            { class: SPELL_CLASS },
            { issue: placed },
          ),
        );
      }
    }
    view.dispatch(
      view.state.tr
        .setMeta(key, { decorations: DecorationSet.create(doc, drawn) } satisfies Meta)
        .setMeta("addToHistory", false),
    );
  }
}

/** The numbers of a pass over a document. */
export interface SpellCensus {
  /** Words looked at, with repeats. */
  readonly checked: number;
  readonly distinct: number;
  /** Words flagged, with repeats. */
  readonly flagged: number;
  readonly flaggedDistinct: number;
  readonly flaggedByType: Readonly<Partial<Record<ElementType, number>>>;
}

/** A scene as the elements of the document it covers. */
interface Scene {
  readonly nodes: readonly EditorNode[];
}

/** The document's scenes in order, with the one holding `caret` first. */
function scenesOf(doc: EditorNode, caret: number): Scene[] {
  const scenes: EditorNode[][] = [];
  let current: EditorNode[] = [];
  let caretScene = 0;
  doc.forEach((node, offset) => {
    if (node.type.name !== "element") return;
    const begins = beginsScene({
      type: node.attrs["type"] as ElementType,
      omitted: node.attrs["omitted"] === true,
    });
    if (begins && current.length > 0) {
      scenes.push(current);
      current = [];
    }
    current.push(node);
    if (offset <= caret) caretScene = scenes.length;
  });
  if (current.length > 0) scenes.push(current);
  const ordered = scenes.map((nodes) => ({ nodes }));
  const first = ordered.splice(caretScene, 1);
  return [...first, ...ordered];
}

/**
 * Scenes grouped into batches of at most `most` new words: the caret's scene
 * alone first, so it is drawn before anything else is asked of the engine.
 */
function batchesOf(
  scenes: readonly Scene[],
  needs: (node: EditorNode) => string[],
  most: number,
): { words: string[] }[] {
  const batches: { words: string[] }[] = [];
  let open: Set<string> | undefined;
  scenes.forEach((scene, index) => {
    const words = new Set<string>();
    for (const node of scene.nodes) for (const word of needs(node)) words.add(word);
    if (index === 0) {
      batches.push({ words: [...words] });
      return;
    }
    if (open !== undefined && open.size + words.size > most) {
      batches.push({ words: [...open] });
      open = undefined;
    }
    open ??= new Set();
    for (const word of words) open.add(word);
  });
  if (open !== undefined) batches.push({ words: [...open] });
  return batches;
}
