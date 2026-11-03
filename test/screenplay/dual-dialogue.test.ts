/**
 * Dual dialogue: the commands, the typed `^`, and the paper. (What a pair is: `pairing.test.ts`.)
 *
 * Every result is read two ways, as the repo asks: the bytes the file would
 * hold, and the census of what each element is — a pair that round-trips as
 * bytes while being a different pair is the defect worth catching.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TextSelection, type Command, type EditorState } from "prosemirror-state";
import { undo, redo } from "prosemirror-history";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import {
  canMakeDualDialogue,
  canMakeNormalDialogue,
  canSwapSpeakers,
  makeDualDialogue,
  makeNormalDialogue,
  swapSpeakers,
  typedCaret,
} from "../../src/screenplay/dual-dialogue.ts";
import { joinBackwards, splitElement } from "../../src/screenplay/element-keys.ts";
import { layout } from "../../src/screenplay/layout.ts";
import { paginate, repaginate } from "../../src/screenplay/paginate.ts";
import { DUAL_GEOMETRY, ELEMENT_GEOMETRY } from "../../src/screenplay/geometry.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import type { Element } from "../../src/screenplay/document.ts";
import { startOfElement } from "../support/editor-positions.ts";
import { dualDecorations } from "../../src/screenplay/dual-columns.ts";
import { manuscriptStarts, paperDecorations, sheetDecorations } from "../../src/screenplay/sheets.ts";
import { PAGE } from "../../src/screenplay/geometry.ts";

const opened = (text: string): EditorState => editorStateFor(parse(text));
const saved = (state: EditorState): string => serialise(manuscriptOf(state.doc));
const census = (text: string): string[] =>
  parse(text).elements.map((e) => `${e.type}${e.dual === true ? "^" : ""}:${e.text}`);

/** Run a command and return the state it leaves, or the same state if it refused. */
function run(state: EditorState, command: Command): EditorState {
  let next = state;
  command(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}
/** A document position inside manuscript element `n`. */
const at = (state: EditorState, n: number): number => startOfElement(state, n);

/** Manuscript indices in `TWO` and `PAIR`: the second speech's cue and its line. */
const R_CUE = 3;
const R_TEXT = 4;

const TWO = "INT. A - DAY\n\nSTEEL\nHi.\n\nBRICK\nYo.\n";
const PAIR = "INT. A - DAY\n\nSTEEL\nHi.\n\nBRICK ^\nYo.\n";

describe("makeDualDialogue", () => {
  it("puts the caret on the speech when the one above touches it", () => {
    const state = opened(TWO);
    expect(canMakeDualDialogue(state, at(state, R_CUE))).toBe(true);
    const next = run(state, makeDualDialogue(at(state, R_CUE)));
    expect(saved(next)).toBe(PAIR);
    expect(census(saved(next))).toEqual(census(PAIR));
  });

  it("works from any element of the speech", () => {
    const state = opened("INT. A - DAY\n\nSTEEL\nHi.\n\nBRICK\n(low)\nYo.\n");
    const next = run(state, makeDualDialogue(at(state, 5)));
    expect(saved(next)).toContain("BRICK ^\n(low)\nYo.");
  });

  it("falls to the speech below when nothing touches above", () => {
    const state = opened("STEEL\nHi.\n\nBRICK\nYo.\n");
    const next = run(state, makeDualDialogue(at(state, 0)));
    expect(saved(next)).toBe("STEEL\nHi.\n\nBRICK ^\nYo.\n");
  });

  it("prefers the speech above when both touch", () => {
    const state = opened("AL\nOne.\n\nBO\nTwo.\n\nCY\nThree.\n");
    const next = run(state, makeDualDialogue(at(state, 3)));
    expect(saved(next)).toBe("AL\nOne.\n\nBO ^\nTwo.\n\nCY\nThree.\n");
  });

  it("skips a neighbour already in a pair, and takes the other side", () => {
    const state = opened("AL\nOne.\n\nBO ^\nTwo.\n\nCY\nThree.\n");
    // C's neighbour above is B, in a pair; there is nothing below.
    expect(canMakeDualDialogue(state, at(state, 4))).toBe(false);
    expect(run(state, makeDualDialogue(at(state, 4)))).toBe(state);

    // The caret on CY already pairs it with BO; AL has only BO beside it.
    const behind = opened("AL\nOne.\n\nBO\nTwo.\n\nCY ^\nThree.\n");
    expect(canMakeDualDialogue(behind, at(behind, 0))).toBe(false);
    expect(canMakeDualDialogue(behind, at(behind, 2))).toBe(false);

    // BO in the middle with AL paired above it and C below free: falls to CY.
    const middle = opened("X\nOne.\n\nAL ^\nTwo.\n\nBO\nThree.\n\nCY\nFour.\n");
    const taken = run(middle, makeDualDialogue(at(middle, 4)));
    expect(saved(taken)).toBe("X\nOne.\n\nAL ^\nTwo.\n\nBO\nThree.\n\nCY ^\nFour.\n");
  });

  it("refuses a speech that is already in a pair", () => {
    const state = opened(PAIR);
    for (const element of [1, 2, 3, 4]) {
      expect(canMakeDualDialogue(state, at(state, element))).toBe(false);
    }
  });

  it.each([
    ["action", "Something happens."],
    ["a transition", "CUT TO:"],
    ["a scene heading", "INT. B - NIGHT"],
    ["centred text", ">THE END<"],
    ["a note", "[[remember this]]"],
    ["a boneyard", "/*\nhidden\n*/"],
  ])("is blocked by %s between the speeches", (_name, between) => {
    const state = opened(`STEEL\nHi.\n\n${between}\n\nBRICK\nYo.\n`);
    const brick = manuscriptOf(state.doc).elements.findIndex((e) => e.text === "BRICK");
    expect(canMakeDualDialogue(state, at(state, brick))).toBe(false);
    expect(run(state, makeDualDialogue(at(state, brick)))).toBe(state);
  });

  it("is not offered on action or dialogue with no cue", () => {
    const state = opened("Just action.\n\nSTEEL\nHi.\n\nBRICK\nYo.\n");
    expect(canMakeDualDialogue(state, at(state, 0))).toBe(false);
  });

  it("is one undo step", () => {
    const state = opened(TWO);
    const done = run(state, makeDualDialogue(at(state, R_CUE)));
    const back = run(done, undo);
    expect(saved(back)).toBe(TWO);
    expect(saved(run(back, redo))).toBe(PAIR);
  });
});

describe("makeNormalDialogue", () => {
  it("removes the caret from either half and stacks the speeches", () => {
    const state = opened(PAIR);
    expect(canMakeNormalDialogue(state, at(state, 1))).toBe(true);
    for (const element of [1, 2, 3, 4]) {
      const next = run(state, makeNormalDialogue(at(state, element)));
      expect(saved(next)).toBe(TWO);
      expect(census(saved(next))).toEqual(census(TWO));
    }
  });

  it("refuses what is not a pair", () => {
    const state = opened(TWO);
    expect(canMakeNormalDialogue(state, at(state, R_CUE))).toBe(false);
    expect(run(state, makeNormalDialogue(at(state, R_CUE)))).toBe(state);
  });

  it("is one undo step", () => {
    const state = opened(PAIR);
    const done = run(state, makeNormalDialogue(at(state, R_CUE)));
    expect(saved(run(done, undo))).toBe(PAIR);
  });
});

describe("swapSpeakers", () => {
  it("swaps the order in the script and moves the caret to the new second", () => {
    const state = opened("INT. A - DAY\n\nSTEEL\n(low)\nHi.\n\nBRICK ^\nYo.\n\nAction.\n");
    expect(canSwapSpeakers(state, at(state, 1))).toBe(true);
    const next = run(state, swapSpeakers(at(state, 5)));
    expect(saved(next)).toBe("INT. A - DAY\n\nBRICK\nYo.\n\nSTEEL ^\n(low)\nHi.\n\nAction.\n");
    expect(census(saved(next))).toEqual(census("INT. A - DAY\n\nBRICK\nYo.\n\nSTEEL ^\n(low)\nHi.\n\nAction.\n"));
  });

  it("twice is where it began", () => {
    const state = opened(PAIR);
    const once = run(state, swapSpeakers(at(state, 1)));
    const twice = run(once, swapSpeakers(at(once, 1)));
    expect(saved(twice)).toBe(PAIR);
  });

  it("keeps the marks on the words that moved", () => {
    const state = opened("STEEL\nHi *there*.\n\nBRICK ^\n**Yo**.\n");
    const next = run(state, swapSpeakers(at(state, 0)));
    expect(saved(next)).toBe("BRICK\n**Yo**.\n\nSTEEL ^\nHi *there*.\n");
  });

  it("carries a comment with the words it was left on", () => {
    const state = opened("STEEL\nHi [[c:k1 why]]there[[/c:k1]].\n\nBRICK ^\nYo.\n");
    const before = manuscriptOf(state.doc);
    expect(before.comments).toHaveLength(1);
    const next = run(state, swapSpeakers(at(state, 0)));
    const after = manuscriptOf(next.doc);
    expect(after.comments).toHaveLength(1);
    const [comment] = after.comments;
    expect(after.elements[comment!.start.element]!.text).toBe("Hi there.");
    expect(after.elements[comment!.end.element]!.text).toBe("Hi there.");
    expect(comment!.remark).toBe(before.comments[0]!.remark);
  });

  it("keeps the caret on the word it was on", () => {
    let state = opened(PAIR);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at(state, 2) + 1)));
    const next = run(state, swapSpeakers(at(state, 2)));
    const head = next.selection.$head;
    expect(head.parent.textContent).toBe("Hi.");
    expect(head.parentOffset).toBe(1);
  });

  it("refuses what is not a pair, and is one undo step", () => {
    const plain = opened(TWO);
    expect(canSwapSpeakers(plain, at(plain, 1))).toBe(false);
    expect(run(plain, swapSpeakers(at(plain, 1)))).toBe(plain);

    const state = opened(PAIR);
    const done = run(state, swapSpeakers(at(state, 1)));
    expect(saved(done)).not.toBe(PAIR);
    expect(saved(run(done, undo))).toBe(PAIR);
  });
});

describe("typing ^ at the end of a cue", () => {
  /** What the editor's text-input handler does, with no window. */
  function typeCaret(state: EditorState, element: number, offset: number): EditorState | undefined {
    const pos = at(state, element) + offset;
    const tr = typedCaret(state, pos, pos, "^");
    return tr === undefined ? undefined : state.apply(tr);
  }

  it("snaps the speech into a pair with the one above and hides the caret", () => {
    const state = opened(TWO);
    const next = typeCaret(state, R_CUE, 5)!;
    expect(saved(next)).toBe(PAIR);
    expect(next.doc.textContent).not.toContain("^");
    expect(manuscriptOf(next.doc).elements[R_CUE]!.text).toBe("BRICK");
  });

  it("takes the space the writer typed before it", () => {
    let state = opened(TWO);
    state = state.apply(state.tr.insertText(" ", at(state, R_CUE) + 5));
    const next = typeCaret(state, R_CUE, 6)!;
    expect(saved(next)).toBe(PAIR);
  });

  it("leaves the caret where the writer was typing", () => {
    const next = typeCaret(opened(TWO), R_CUE, 5)!;
    expect(next.selection.empty).toBe(true);
    expect(next.selection.from).toBe(at(next, R_CUE) + 5);
  });

  it("is one undo step, and undo takes the pair away", () => {
    const state = opened(TWO);
    const next = typeCaret(state, R_CUE, 5)!;
    expect(saved(run(next, undo))).toBe(TWO);
  });

  it("is an ordinary character when the pair is not valid", () => {
    const state = opened("STEEL\nHi.\n\nCUT TO:\n\nBRICK\nYo.\n");
    expect(typeCaret(state, 3, 5)).toBeUndefined();
    const first = opened("BRICK\nYo.\n");
    expect(typeCaret(first, 0, 5)).toBeUndefined();
  });

  it("is an ordinary character anywhere but the end of a cue", () => {
    const state = opened(TWO);
    expect(typeCaret(state, R_CUE, 2)).toBeUndefined();
    expect(typeCaret(state, R_TEXT, 3)).toBeUndefined();
    const pos = at(state, R_CUE);
    expect(typedCaret(state, pos, pos + 2, "^")).toBeUndefined();
    expect(typedCaret(state, pos + 5, pos + 5, "x")).toBeUndefined();
  });

  it("does not write a second caret over one it already has", () => {
    const state = opened(PAIR);
    const pos = at(state, R_CUE) + 5;
    const tr = typedCaret(state, pos, pos, "^");
    expect(tr?.docChanged).toBe(false);
  });
});

describe("editing inside a pair never drops the caret", () => {
  const CUE = R_CUE;
  function place(state: EditorState, element: number, offset: number): EditorState {
    return state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, at(state, element) + offset)),
    );
  }

  it("typing in the right cue and in its dialogue", () => {
    let state = opened(PAIR);
    state = state.apply(state.tr.insertText("S", at(state, CUE) + 5));
    state = state.apply(state.tr.insertText(" yes", at(state, CUE + 1) + 3));
    expect(saved(state)).toBe("INT. A - DAY\n\nSTEEL\nHi.\n\nBRICKS ^\nYo. yes\n");
  });

  it("typing in the left column leaves the right as it was", () => {
    let state = opened(PAIR);
    state = state.apply(state.tr.insertText(" there", at(state, 2) + 3));
    expect(saved(state)).toBe("INT. A - DAY\n\nSTEEL\nHi. there\n\nBRICK ^\nYo.\n");
  });

  it("Enter in and at the ends of the right cue", () => {
    for (const offset of [0, 2, 5]) {
      const state = run(place(opened(PAIR), CUE, offset), splitElement);
      const text = saved(state);
      expect(text, `Enter at ${offset}`).toContain("^");
      expect(text.match(/\^/g)).toHaveLength(1);
    }
    const end = run(place(opened(PAIR), CUE, 5), splitElement);
    expect(saved(end)).toBe(PAIR);
  });

  it("Backspace at the start of the right cue spells the caret into the text", () => {
    const state = run(place(opened(PAIR), CUE, 0), joinBackwards);
    expect(saved(state)).toContain("Hi.BRICK ^\n");
  });

  it("deleting a selection that ends inside the right cue keeps the caret", () => {
    let state = opened(PAIR);
    const from = at(state, 2) + 1;
    const to = at(state, CUE) + 2;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)).deleteSelection());
    expect(saved(state)).toBe("INT. A - DAY\n\nSTEEL\nHICK ^\nYo.\n");
  });

  it("deleting a selection typed over keeps it too", () => {
    let state = opened(PAIR);
    const from = at(state, 2) + 1;
    const to = at(state, CUE) + 2;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
    state = state.apply(state.tr.insertText("x"));
    expect(saved(state)).toBe("INT. A - DAY\n\nSTEEL\nHxICK ^\nYo.\n");
  });

  it("and is one undo step, redone without writing it twice", () => {
    let state = opened(PAIR);
    const from = at(state, 2) + 1;
    const to = at(state, CUE) + 2;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)).deleteSelection());
    const merged = saved(state);
    expect(saved(run(state, undo))).toBe(PAIR);
    expect(saved(run(run(state, undo), redo))).toBe(merged);
  });

  it("deleting the whole cue's text takes its caret with it", () => {
    let state = opened(PAIR);
    const from = at(state, 2) + 1;
    const to = at(state, CUE) + 5;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)).deleteSelection());
    expect(saved(state)).not.toContain("^");
  });

  it("also holds for a scene number on a heading deleted into", () => {
    let state = opened("Action.\n\nINT. A - DAY #1#\n");
    const from = at(state, 0) + 3;
    const to = at(state, 1) + 4;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)).deleteSelection());
    expect(saved(state)).toBe("Act A - DAY #1#\n");
  });
});

describe("the page counts a pair as one band", () => {
  const wide = (n: number): string =>
    Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
  const el = (type: Element["type"], text: string, extra: Partial<Element> = {}): Element => ({
    type,
    text,
    forced: false,
    ...extra,
  });
  const screenplay = (elements: Element[]) => ({
    titlePage: [],
    elements,
    comments: [],
    endsWithNewline: true,
  });

  it("wraps each column at its own narrow measure", () => {
    const text = wide(20);
    const l = layout(
      screenplay([
        el("scene-heading", "INT. A - DAY"),
        el("character", "STEEL"),
        el("dialogue", text),
        el("character", "BRICK", { dual: true }),
        el("dialogue", text),
      ]),
    );
    const lines = l.pages.flatMap((p) => [...p.lines]);
    const left = lines.filter((line) => line.column === "left" && line.elementIndex === 2);
    const right = lines.filter((line) => line.column === "right" && line.elementIndex === 4);
    expect(left.length).toBeGreaterThan(Math.ceil(text.length / ELEMENT_GEOMETRY.dialogue.width));
    for (const line of [...left, ...right]) {
      expect(line.text.length).toBeLessThanOrEqual(DUAL_GEOMETRY.speech.dialogue.width + 1);
    }
    expect(left.map((line) => line.text)).toEqual(right.map((line) => line.text));
    // The columns start on the same row.
    const cues = lines.filter((line) => line.elementIndex === 1 || line.elementIndex === 3);
    expect(cues.map((line) => line.row)).toEqual([cues[0]!.row, cues[0]!.row]);
  });

  it("is as tall as the taller column, and the next element clears both", () => {
    const l = layout(
      screenplay([
        el("character", "STEEL"),
        el("dialogue", wide(30)),
        el("character", "BRICK", { dual: true }),
        el("dialogue", "Yo."),
        el("action", "After."),
      ]),
    );
    const lines = l.pages.flatMap((p) => [...p.lines]);
    const tallest = Math.max(...lines.filter((x) => x.column === "left").map((x) => x.row));
    const after = lines.find((x) => x.elementIndex === 4)!;
    expect(after.row).toBe(tallest + 2);
  });

  it("agrees with the count: an unpaired caret is stacked, a pair is shorter", () => {
    const base = [
      el("character", "STEEL"),
      el("dialogue", wide(24)),
      el("character", "BRICK"),
      el("dialogue", wide(24)),
    ];
    const stacked = paginate(screenplay(base)).chunks.reduce((n, c) => n + c.lines, 0);
    const paired = paginate(
      screenplay(base.map((e, i) => (i === 2 ? { ...e, dual: true } : e))),
    ).chunks.reduce((n, c) => n + c.lines, 0);
    expect(paired).toBeLessThan(stacked);
    // A caret with something between the speeches pairs nothing.
    const blocked = paginate(
      screenplay([base[0]!, base[1]!, el("action", "Between."), { ...base[2]!, dual: true }, base[3]!]),
    );
    expect(blocked.chunks.some((c) => c.band !== undefined)).toBe(false);
  });

  it("moves the whole band to the next page rather than splitting it", () => {
    const filler = Array.from({ length: 12 }, (_, i) => el("action", `Beat ${i}. ${wide(40)}`));
    for (let count = 8; count <= 12; count++) {
      const l = layout(
        screenplay([
          el("scene-heading", "INT. A - DAY"),
          ...filler.slice(0, count),
          el("character", "STEEL"),
          el("dialogue", wide(24)),
          el("character", "BRICK", { dual: true }),
          el("dialogue", wide(24)),
        ]),
      );
      const bandPages = l.pages.filter((p) => p.lines.some((line) => line.column !== "full"));
      expect(bandPages).toHaveLength(1);
      expect(l.pages.flatMap((p) => [...p.lines]).some((x) => x.kind === "more" || x.kind === "contd")).toBe(
        l.splits.length > 0 && l.pages.some((p) => p.lines.some((x) => x.kind === "more")),
      );
      const page = bandPages[0]!;
      const bandElements = new Set(
        page.lines.filter((x) => x.column !== "full").map((x) => x.elementIndex),
      );
      expect(bandElements.size).toBe(4);
    }
  });

  it("is incremental: an edit sequence around pairs equals a full layout", () => {
    let seed = 99;
    const next = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let trial = 0; trial < 10; trial++) {
      let d = screenplay([el("scene-heading", "INT. A - DAY")]);
      let l = layout(d);
      for (let step = 0; step < 100; step++) {
        const elements = [...d.elements];
        const index = next(elements.length);
        const roll = next(10);
        if (roll < 3) {
          elements.splice(index + 1, 0, el("action", `Beat ${step}. ${wide(1 + next(40))}`));
        } else if (roll < 6) {
          elements.splice(
            index + 1,
            0,
            el("character", `NAME${next(5)}`, next(2) === 0 ? { dual: true } : {}),
            el("dialogue", wide(1 + next(30))),
          );
        } else if (roll < 7 && elements.length > 2) {
          elements.splice(index, 1);
        } else if (roll < 8) {
          const target = elements[index]!;
          if (target.type === "character") {
            elements[index] = target.dual === true ? { ...target, dual: undefined } : { ...target, dual: true };
            if (elements[index]!.dual === undefined) delete (elements[index] as { dual?: boolean }).dual;
          }
        } else {
          const target = elements[index]!;
          if (target.type === "dialogue") elements[index] = { ...target, text: `${target.text} ${wide(next(20))}` };
        }
        d = { ...d, elements };
        l = layout(d, l, Math.min(index, elements.length - 1));
        const full = layout(d);
        expect(l.totalPages, `trial ${trial} step ${step}`).toBe(full.totalPages);
        expect(l.pagination.pageOfElement).toEqual(full.pagination.pageOfElement);
        expect(l.pagination.fill).toEqual(full.pagination.fill);
        expect(l.pagination.chunks.map((c) => c.band?.members.length)).toEqual(
          full.pagination.chunks.map((c) => c.band?.members.length),
        );
      }
    }
    void repaginate;
  });
});

describe("round trip", () => {
  it("keeps every pair byte for byte through the editor", () => {
    const text =
      "INT. A - DAY\n\nSTEEL\n(low)\nHi.\n\nBRICK (O.S.) ^\nYo.\n\n@mcCLOUD\nHello.\n\nDOC ^\nHm.\n\nBILL ^\nThird.\n";
    expect(saved(opened(text))).toBe(text);
    expect(census(saved(opened(text)))).toEqual(census(text));
  });
});

describe("the geometry of the columns", () => {
  // Measured from Fountain's PDF of Brick & Steel (fountain.io, Brick-&-Steel.pdf,
  // `pdftotext -bbox`): 7pt a character (Courier 12pt with Tc = -0.018), left
  // margin 108pt. Left dialogue at x = 108, right dialogue at x = 333, STEEL
  // centred at 211.5, BRICK at 436.5.
  it("is the geometry measured from the reference PDF", () => {
    const pt = 7;
    const margin = 108;
    expect(DUAL_GEOMETRY.columnStart.left).toBe((108 - margin) / pt);
    expect(DUAL_GEOMETRY.columnStart.right).toBeCloseTo((333 - margin) / pt, 10);
    expect(DUAL_GEOMETRY.columnWidth).toBeCloseTo((2 * (211.5 - 108)) / pt, 10);
    expect(DUAL_GEOMETRY.columnStart.right + DUAL_GEOMETRY.columnWidth).toBeCloseTo(
      PAGE.rightMarginCharacters,
      10,
    );
    // Each name is centred on its column's middle.
    expect(margin + (DUAL_GEOMETRY.columnStart.left + DUAL_GEOMETRY.columnWidth / 2) * pt).toBeCloseTo(211.5, 8);
    expect(margin + (DUAL_GEOMETRY.columnStart.right + DUAL_GEOMETRY.columnWidth / 2) * pt).toBeCloseTo(436.5, 8);
    // Right dialogue ends (452pt in the PDF; 452.2 by advances) under the S of
    // SMASH CUT TO: (420-455pt, and its next glyph begins at 461.9).
    const end = margin + (DUAL_GEOMETRY.columnStart.right + "Screw retirement.".length) * pt;
    expect(end).toBeGreaterThan(420);
    expect(end).toBeLessThan(461.9);
  });

  it("fits two columns and a gutter inside the measure", () => {
    const { columnWidth, columnStart, speech } = DUAL_GEOMETRY;
    expect(columnStart.left + columnWidth).toBeLessThan(columnStart.right);
    expect(columnStart.right + columnWidth).toBeLessThanOrEqual(PAGE.rightMarginCharacters + 1e-9);
    for (const { indent, width } of Object.values(speech)) {
      expect(Number.isInteger(indent) && Number.isInteger(width)).toBe(true);
      expect(indent + width).toBeLessThanOrEqual(columnWidth);
    }
  });
});

describe("the paper draws the pair from marks, never from the document", () => {
  const source = "INT. A - DAY\n\nSTEEL\n(low)\nHi there, friend.\n\nBRICK ^\nYo.\n\nAfter.\n";
  const state = opened(source);
  const laid = layout(parse(source));
  const decorations = dualDecorations(state.doc, laid, manuscriptStarts(state.doc));
  const attrs = (index: number) => {
    const pos = manuscriptStarts(state.doc)[index]!;
    // `type.attrs` is ProseMirror's own record of what the decoration sets.
    const found = decorations.find((d) => d.from === pos) as unknown as
      | { type: { attrs: Record<string, unknown> } }
      | undefined;
    return found?.type.attrs ?? {};
  };

  it("marks every block of the pair with its column and nothing else", () => {
    expect(decorations).toHaveLength(5);
    expect([1, 2, 3].map((i) => attrs(i)["data-dual-column"])).toEqual(["left", "left", "left"]);
    expect([4, 5].map((i) => attrs(i)["data-dual-column"])).toEqual(["right", "right"]);
    expect(attrs(0)["data-dual-column"]).toBeUndefined();
    expect(attrs(6)["data-dual-column"]).toBeUndefined();
  });

  it("hands the stylesheet the rows it needs to line the columns up", () => {
    // Left: cue 1 + (low) 1 + "Hi there, friend." 1 = 3 rows; right: 2.
    expect(attrs(1)["style"]).not.toContain("--dual-left-rows");
    expect(attrs(4)["style"]).toContain("--dual-left-rows: 3");
    expect(attrs(5)["style"]).toContain("--dual-extra: 1");
    expect(String(attrs(1)["class"])).toContain("dual-first");
  });

  it("hands the stylesheet both name lengths, so it can centre the rule between them", () => {
    expect(attrs(1)["style"]).toContain("--dual-name-left: calc(5 * var(--ch))");
    expect(attrs(1)["style"]).toContain("--dual-name-right: calc(5 * var(--ch))");
  });

  it("never reaches the file, and never shows the caret", () => {
    expect(saved(state)).toBe(source);
    expect(state.doc.textContent).not.toContain("^");
    expect(sheetDecorations(state.doc, laid, () => document.createElement("div")).find()).toHaveLength(0);
    expect(paperDecorations(state.doc, laid, () => document.createElement("div")).find()).toHaveLength(5);
  });

  it("draws nothing for a caret that pairs nothing", () => {
    const lone = opened("INT. A - DAY\n\nSTEEL\nHi.\n\nCUT TO:\n\nBRICK ^\nYo.\n");
    const parsed = parse("INT. A - DAY\n\nSTEEL\nHi.\n\nCUT TO:\n\nBRICK ^\nYo.\n");
    expect(dualDecorations(lone.doc, layout(parsed), manuscriptStarts(lone.doc))).toHaveLength(0);
  });

  it("stacks while a blank line sits inside the pair", () => {
    // Enter at the end of the left speech starts an empty line between the two.
    let edited = state;
    const end = at(edited, 3) + "Hi there, friend.".length;
    edited = run(
      edited.apply(edited.tr.setSelection(TextSelection.create(edited.doc, end))),
      splitElement,
    );
    expect(saved(edited)).toBe(source);
    const found = dualDecorations(edited.doc, layout(manuscriptOf(edited.doc)), manuscriptStarts(edited.doc));
    expect(found).toHaveLength(0);
  });
});

describe("the link between the pair is a rule along the cue row", () => {
  const css = readFileSync("app/src/style/editor.css", "utf8");
  const rule = css.slice(css.indexOf(".manuscript > .dual-first::after"));

  it("is horizontal, kept off both names by a spacing token, and in tokens' colour", () => {
    expect(rule).toContain("border-bottom: var(--rule-thin) solid var(--colour-faint)");
    expect(rule).not.toContain("border-left");
    expect(rule).toContain("var(--space-tight)");
    expect(rule).toContain("var(--dual-name-left)");
    expect(rule).toContain("var(--dual-name-right)");
  });

  it("is not printed", () => {
    expect(rule).toMatch(/@media print\s*{\s*\.manuscript > \.dual-first::after\s*{\s*display: none/);
  });
});
