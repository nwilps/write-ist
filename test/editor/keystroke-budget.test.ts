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
 * mapped, the manuscript marked unsaved, the autosave pause restarted, and
 * the page count re-packed from the affected page (#49).
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
 * **Turning the editor's document back into the model and serialising it** is
 * not on this path, and that is a decision rather than an omission: it happens
 * once per save, a couple of seconds after the writer stops typing (ADR-0028),
 * not once per keystroke. Its cost is measured and printed here too, so the
 * thing being kept off the keystroke path is a number somebody can see rather
 * than a claim.
 *
 * **Drawing the result** is not measured either, and cannot be from here:
 * there is no window, which is what makes this seam reachable at all.
 * ADR-0024 divides it exactly there — *the engine owns the count, the webview
 * draws* — so what this number claims is Write-ist's own work behind a
 * keystroke, and the redraw is `prosemirror-view`'s and WebKit's. That half is
 * #37's fourth seam: the writer, writing in it.
 *
 * Everything else the application does per keystroke *is* in here, and by
 * being the real thing rather than a stand-in for it: the manuscript is marked
 * unsaved through a real `editingSession`, and the pause is restarted through
 * a real `autosave`.
 */
import { describe, expect, it } from "vitest";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { exportScreenplay, importScreenplay } from "../../src/screenplay/import.ts";
import { autosave } from "../../src/project/autosave.ts";
import { editingSession } from "../../src/project/save.ts";
import type { Filesystem } from "../../src/project/filesystem.ts";
import { FORMAT_VERSION } from "../../src/project/marker.ts";
import type { ScreenplayDocument } from "../../src/screenplay/document.ts";
import { layout, type Layout } from "../../src/screenplay/layout.ts";
import { paginate, repaginate } from "../../src/screenplay/paginate.ts";
import { sheetDecorations } from "../../src/screenplay/sheets.ts";
import { describeCorpus, readCorpusBytes } from "../support/corpus.ts";
import { readFixtureBytes } from "../support/files.ts";
import { unwatched } from "../support/unwatched.ts";

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
  // measured region, because both happen before the frame is drawn, and both
  // are the real call rather than a stand-in for it.
  //
  // Nothing reaches the disk — no save is asked for — so the port below the
  // session refuses everything, which is the loudest way of saying so.
  const refuse = () => Promise.reject(new Error("the budget asks nothing of the disk"));
  const nothing: Filesystem = {
    readDirectory: refuse,
    readFile: refuse,
    writeFile: refuse,
    createDirectory: refuse,
    exists: refuse,
    appendFile: refuse,
  };
  const session = editingSession(
    nothing,
    {
      project: {
        path: "/nowhere",
        marker: {
          name: "The budget",
          formatVersion: FORMAT_VERSION,
          projectId: "00000000-0000-4000-8000-000000000000",
          format: "Feature",
        },
      },
      document,
      manuscript: new Uint8Array(),
    },
    () => manuscriptOf(state.doc),
    unwatched,
  );
  const saving = autosave({
    save: session.save,
    trouble: () => {},
    // The clock is a stub: arming a real timer 500 times would measure
    // `setTimeout`, and what is being measured is Write-ist's own work.
    clock: { wait: () => 0, cancel: () => {} },
  });

  // Where the caret is: the middle of the manuscript, so the mapping has the
  // whole of it on both sides.
  const caret = Math.floor(state.doc.content.size / 2);

  // #49 — page count keeps up as you type. Open takes a full pack; each
  // keystroke re-packs from the middle of the manuscript onward.
  let laid: Layout = layout(document);
  // The seams between sheets (ADR-0033) are rebuilt on every edit, and are part
  // of what a keystroke costs. The DOM is drawn by the view, outside the budget
  // (ADR-0024), so the seam's drawing is stubbed here.
  let seams = sheetDecorations(state.doc, laid, () => ({}) as HTMLElement);
  // The caret sits in the middle of the ProseMirror doc; map that roughly
  // onto a mid-manuscript element so the resume is not always page 1.
  const dirtyElement = Math.floor(document.elements.length / 2);

  const keystroke = (): void => {
    state = state.apply(state.tr.insertText("a", caret));
    session.changed();
    saving.typed();
    laid = layout(manuscriptOf(state.doc), laid, dirtyElement);
    seams = sheetDecorations(state.doc, laid, () => ({}) as HTMLElement);
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
  expect(session.unsaved()).toBe(true);
  expect(laid.totalPages).toBeGreaterThan(0);
  // Every sheet after the first has its seam, so the seams were really built.
  expect(seams.find().length).toBe(laid.totalPages - 1);
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

/**
 * **A synthetic script the size of the corpus**, so the budget is checked on a
 * machine that does not have the corpus. About 170 KB and 120 pages: scene
 * headings, action that wraps, and speeches with cues, parentheticals and
 * dialogue long enough to split over a page break (#87). The keystroke lands in
 * the middle, so the re-pack must resume there and not from page 1 — the layout
 * once re-wrapped every element before the edit on each keystroke, and a
 * 20 ms keystroke on the corpus is how that was found.
 */
function syntheticScript(): string {
  const sentence = "She crosses the room slowly, and the light follows her to the far wall. ";
  const speech = "I told you before and I will tell you again, nothing here is what it seems. ";
  const scenes: string[] = [];
  let bytes = 0;
  for (let scene = 0; bytes < 170_000; scene++) {
    const text = [
      `INT. ROOM ${scene} - DAY`,
      "",
      sentence.repeat(1 + (scene % 4)).trim(),
      "",
      `SPEAKER ${scene % 7}`,
      "(quietly)",
      speech.repeat(2 + (scene % 5)).trim(),
      "",
      `LISTENER ${scene % 5}`,
      speech.repeat(1 + (scene % 3)).trim(),
      "",
      sentence.repeat(2).trim(),
      "",
    ].join("\n");
    scenes.push(text);
    bytes += text.length + 1;
  }
  return scenes.join("\n") + "\n";
}

describe("the keystroke budget, on a synthetic script the size of the corpus", () => {
  const bytes = new TextEncoder().encode(syntheticScript());
  const document = importScreenplay(bytes).document;

  it("is the size the corpus is", () => {
    const pages = paginate(document).totalPages;
    expect(bytes.length).toBeGreaterThan(165_000);
    expect(pages).toBeGreaterThan(100);
    expect(pages).toBeLessThan(160);
  });

  it("re-packs from the edited page, and agrees with a full pack", () => {
    const full = paginate(document);
    const dirty = Math.floor(document.elements.length / 2);
    const resumed = repaginate(document, full, dirty);
    expect(resumed.resumedFromPage).toBeGreaterThan(1);
    expect(resumed.totalPages).toBe(full.totalPages);
    expect(resumed.pageOfElement).toEqual(full.pageOfElement);
    expect(resumed.fill).toEqual(full.fill);
    expect(resumed.chunks).toEqual(full.chunks);
  });

  it(`stays under ${BUDGET} ms a keystroke`, () => {
    expect(budget(document, bytes.length)).toBeLessThan(BUDGET);
  });
});
