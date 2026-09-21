/**
 * The keystroke budget, on the full acceptance corpus (#41).
 *
 * > **The keystroke budget:** the work behind one keystroke on the full
 * > acceptance corpus stays under **16 ms**, measured including the
 * > measurement's own cost.
 *
 * Sixteen milliseconds is one frame. The budget is on the *work behind a
 * keystroke*, which is everything the editor does between the key going down
 * and the state being ready to draw: the transaction applied, the comments
 * mapped, the manuscript marked unsaved, and the autosave pause restarted.
 *
 * ## Measuring the measurer (`docs/STANDARDS.md`)
 *
 * > A performance readout that excludes its own cost is not a measurement, it
 * > is a reassurance.
 *
 * The rule was written from the spike's HUD, which timed the editing engine
 * and not the ~3.6 ms of word counting it did just outside the window it
 * measured. So the figure asserted here is **the whole loop divided by the
 * number of keystrokes** — the two `performance.now()` calls per keystroke are
 * inside it, and so is every line of bookkeeping between them. The per-
 * keystroke samples are reported beside it and are not what the budget is
 * checked against, precisely because they are the number that can lie.
 *
 * ## What is deliberately outside the budget
 *
 * Turning the editor's document back into the model and serialising it is
 * **not** on this path, and that is a decision rather than an omission: it
 * happens once per save, a couple of seconds after the writer stops typing
 * (ADR-0028), not once per keystroke. Its cost is measured and printed here
 * too, so the thing being kept off the keystroke path is a number somebody can
 * see rather than a claim.
 */
import { describe, expect, it } from "vitest";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { exportScreenplay, importScreenplay } from "../../src/screenplay/import.ts";
import { autosave } from "../../src/project/autosave.ts";
import type { ScreenplayDocument } from "../../src/screenplay/document.ts";
import { describeCorpus, readCorpusBytes } from "../support/corpus.ts";
import { readFixtureBytes } from "../support/files.ts";

/** One frame. */
const BUDGET = 16;

/** Enough keystrokes to be a sentence rather than a sample. */
const KEYSTROKES = 500;

/** Long enough for the engine to be warm, short enough to stay a test. */
const WARMUP = 50;

/**
 * Type five hundred characters into the middle of a manuscript, and answer
 * what one of them cost.
 */
function budget(document: ScreenplayDocument, bytes: number): number {
  let state = editorStateFor(document);

  // The rest of what a keystroke costs the application: the manuscript is
  // marked unsaved and the autosave pause is restarted. Both are inside the
  // measured region, because both happen before the frame is drawn.
  let unsaved = false;
  const saving = autosave({
    save: () => Promise.resolve(),
    trouble: () => {},
    // The clock is a stub: arming a real timer 500 times would measure
    // `setTimeout`, and what is being measured is Write-ist's own work.
    clock: { wait: () => 0, cancel: () => {} },
  });

  // Where the caret is: the middle of the manuscript, so the mapping has the
  // whole of it on both sides.
  const caret = Math.floor(state.doc.content.size / 2);

  const keystroke = (): void => {
    state = state.apply(state.tr.insertText("a", caret));
    unsaved = true;
    saving.typed();
  };

  for (let index = 0; index < WARMUP; index++) keystroke();

  const samples: number[] = [];
  const from = performance.now();
  for (let index = 0; index < KEYSTROKES; index++) {
    const before = performance.now();
    keystroke();
    samples.push(performance.now() - before);
  }
  const measured = (performance.now() - from) / KEYSTROKES;

  // Once per save, not once per keystroke — printed so that what is being
  // kept off this path is a number rather than an assurance.
  const beforeSave = performance.now();
  const saved = exportScreenplay(manuscriptOf(state.doc));
  const save = performance.now() - beforeSave;

  const sorted = [...samples].sort((a, b) => a - b);
  console.log(
    [
      `${document.elements.length} elements, ${document.comments.length} comments, ${bytes} bytes`,
      `keystroke, including the measurement: ${measured.toFixed(4)} ms (budget ${BUDGET} ms)`,
      `keystroke samples: median ${sorted[Math.floor(sorted.length / 2)]!.toFixed(4)} ms, ` +
        `worst ${sorted[sorted.length - 1]!.toFixed(4)} ms`,
      `off the keystroke path — model out and serialised, once per save: ` +
        `${save.toFixed(1)} ms for ${saved.length} bytes`,
    ].join("\n  "),
  );

  // The bookkeeping inside the measured region really ran; a budget met by
  // measuring nothing is the failure this whole file is written against.
  expect(unsaved).toBe(true);
  return measured;
}

describeCorpus("the keystroke budget", () => {
  it(`stays under ${BUDGET} ms a keystroke on the acceptance corpus`, () => {
    const bytes = readCorpusBytes();
    expect(budget(importScreenplay(bytes).document, bytes.length)).toBeLessThan(BUDGET);
  });
});

/**
 * **The acceptance corpus holds no comments**, so the budget above does not
 * measure the one thing on the keystroke path that Write-ist has to move
 * itself (`src/screenplay/editing.ts`). `Big-Fish-augmented.fountain` is the
 * manuscript that does — five of them, over 2,796 elements — so the budget is
 * taken on it too, and the two figures together say that neither the
 * manuscript's length nor its comments put a keystroke near a frame.
 */
describe("the keystroke budget, on a manuscript with comments", () => {
  it(`stays under ${BUDGET} ms a keystroke`, () => {
    const bytes = readFixtureBytes("Big-Fish-augmented.fountain");
    const document = importScreenplay(bytes).document;
    expect(document.comments).toHaveLength(5);
    expect(budget(document, bytes.length)).toBeLessThan(BUDGET);
  });
});
