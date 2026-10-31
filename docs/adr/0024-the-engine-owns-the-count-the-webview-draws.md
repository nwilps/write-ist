# The engine owns the count; the webview draws

Write-ist's own pagination engine computes the page count from the model, against the bundled
Courier Prime's metrics, for both the screen and the PDF. **The page count never comes from the
DOM.** Within that, the webview lays out and wraps text normally, so caret movement, selection
and text rendering behave the way they do in every editor a writer already uses.

The editing engine is **ProseMirror**; the parser, serialiser and pagination engine are
**TypeScript**.

## Amended 2026-10-31: the engine wraps the way Final Draft wraps

The first version of this decision had the engine wrap greedily at spaces only, because the
measurement below showed hyphen breaks changing nothing on the acceptance corpus. Comparing the
layout with Final Draft's own PDF of *Big Fish* (fountain.io's `Big-Fish.pdf`, 120 numbered pages;
not committed) showed that the measurement does not carry to other scripts, and Noah's standing rule
is to match Final Draft wherever its behaviour is known. Two changes to the wrap were proposed; the PDF
supports the first and contradicts the second:

1. **A line may end after a hyphen** (`hundred-` / `dollar`, `half-` / `empty`): a hyphen that follows
   a letter or digit and precedes a letter is a break. **A piece that ends in a hyphen may hang one
   column past the measure** — the PDF has three 62-character action lines, each ending in `-`
   (`daughter-`, `half-`, `father--`), and no 62-character line that ends in anything else.
2. **Two spaces after a full stop still count as two, not one.** One was the proposal, and it is not
   what the PDF shows. The amendment was first written to count a double space as one, because ADR-0033
   recorded that Final Draft wrapped "as if the two spaces were one". The PDF says otherwise. Final
   Draft draws the two spaces: of 1,114 sentence ends where the fountain has two spaces, 1,108 are drawn
   two character widths apart (the other six are probably the search matching the wrong instance of a
   repeated phrase; none is a pattern). And where the count decides a break it wraps them as two:
   Big Fish's opening speech breaks `caught.  It's not that they're faster` / `or stronger`, which
   is 37 columns, plus ` or` makes 40 against a measure of 39. Counted as one, `or` would fit and
   the line would not be Final Draft's. Over the whole script the PDF's lines are reproduced 4,518
   of 4,531 times with the two spaces counted as two and 4,039 times counted as one, so the engine
   keeps measuring them in full and a test holds it to the PDF's own lines.

Lines of the PDF reproduced exactly, over the whole script: **4,424 of 4,531 before; 4,476 with the
hyphen changes; 4,518 with the page rules ADR-0033 adds in the same pass.**

**The residual risk grows by one case.** The webview breaks after a hyphen as the engine now does, but
it will not let a hyphen hang past the measure, so a line the engine puts on the PDF's 62nd column the
webview wraps one word early. Three lines in *Big Fish*. The engine owns the count, so the page
number and the PDF are right; the screen can differ by a line there, as the *Consequences* below
already allow.

## What this narrows in ADR-0001

ADR-0001's requirement is that *one* engine owns the count, shared by screen and export,
"because a second engine for export would let the on-screen page count and the exported page
count disagree, which makes the count a lie." That requirement is met in full and is not
touched here.

Its final bullet reads as though letting the webview *draw* is itself the danger. The danger is
narrower than that: it is **asking the webview where text wraps** — `measureText`,
`getClientRects`, reading page breaks out of a `contenteditable` — and then treating the answer
as the count. A webview that draws glyphs while our engine holds the number is harmless, which
is what ADR-0001 means by "get that seam right and the system webview is harmless."

## The measurement that settled it

The alternative was to break every line ourselves and hand the view pre-broken lines, so CSS
had no decision to make. It is the stronger guarantee and it is expensive: one DOM element per
*rendered* line (roughly 22,000 for a 400-page manuscript), virtualised rendering, and
ProseMirror taught that several line elements are one paragraph — with caret and selection
behaviour rebuilt across boundaries the browser would otherwise handle free. That last part is
v1's failure mode wearing better clothes.

So the question became how much divergence it actually buys back, measured on the acceptance
corpus rather than argued. All 1,036 action paragraphs were wrapped twice at 61 columns: once
breaking only at spaces, once also breaking after hyphens, slashes and ellipses as the Unicode
line-breaking rules let a browser do.

| | |
|---|---|
| Paragraphs whose line count differs | **0** |
| Total rendered lines, space-only vs browser-style | **1,951 vs 1,951** |
| Page drift across the feature | **0.00** |

70 wrapping lines contain a hyphen or dash, and breaking at one never changes how many lines
the paragraph occupies — the greedy fit lands the same way either way. The expensive guarantee
was buying a difference that does not appear in real screenplay prose.

**The residual risk is sub-pixel, and is not covered by that measurement.** If the editor column
is not an exact whole number of character advances, three engines can round differently. The
mitigation is to set the column to an integer multiple of Courier Prime's advance width, which
costs one CSS rule.

## Considered options

- **Own the line breaking and render pre-broken lines.** The structural guarantee, rejected on
  the measurement above and on the caret cost. Recorded because it is the right answer if the
  measured divergence ever turns out to be non-zero on some other manuscript, and because the
  data here is one corpus.
- **Own the whole view**, rendering to canvas or a custom layout. Total control, enormous cost,
  and it is v1's mistake at a higher altitude.
- **Rust for the parser, serialiser and pagination engine.** A clean seam — model in, line and
  page breaks out — and plausibly faster. Rejected for v2 on measured evidence: the spike
  parses the full 170 KB corpus in ~19 ms and serialises in ~10 ms, which has room to spare,
  and moving pagination across an IPC boundary puts a crossing on the keystroke path, where
  ADR-0001's "no perceptible input lag" lives. **The door stays open deliberately:** the
  pagination engine sits behind an interface narrow enough that moving it to Rust later changes
  no caller.

## Consequences

- **Pagination decorates the view; it never edits the document.** `(MORE)` and `CONT'D` exist
  only because of where a page break fell, so they are computed at render and at export and are
  never written into the manuscript. The alternative — real elements in the Fountain file —
  means adding a line on page 12 rewrites page 40, and a document that rewrites itself when a
  page break moves can never be byte-stable (ADR-0020). **The exported PDF therefore contains
  text that appears nowhere in the `.fountain` file.** Correct, and recorded because someone
  will one day diff the two and think something is broken.
  - **This covers the *paginated* pair only.** A second, unrelated `CONT'D` marks the same
    character resuming after intervening action. That one is derived from the element sequence
    rather than from layout, so it is stable, and Write-ist *does* write it into the
    manuscript — see [ADR-0026](0026-contd-is-authored-not-paginated.md). Conflating the two is
    easy and the consequences run in opposite directions.
- **The editor is not a pixel-perfect preview of the PDF.** A page-break marker may sit a line
  away from where the PDF puts it. Measured at zero occurrences on the acceptance corpus.
- **ProseMirror is chosen for the reason v1 failed.** v1's root cause was *"every screenplay
  line was its own `contenteditable`, with hand-rolled DOM sync and caret restoration"*, and
  everything that hurt traced back to it — no multi-line selection, jank on Enter, arrow keys
  skipping lines, fragile undo, spellcheck abandoned. That list is the problem ProseMirror
  exists to solve, and the spike ran on it with a writer's judgement behind the result.
- **ProseMirror's mark-set semantics are adopted deliberately, not inherited.** ADR-0019 decides
  marks are a set on its own reasoning; the library agreeing is convenient rather than causal.
- **A 400-page manuscript still requires virtualised rendering and incremental pagination.**
  Letting CSS wrap removes the per-line DOM element, not the size of the document.
- **User-chosen editor fonts stay a prose affordance**, as ADR-0001 already requires: on the
  screenplay surface a font that changes the page count is a bug.
