# Wrap divergence on the acceptance corpus: evidence

Evidence behind [ADR-0024](../adr/0024-the-engine-owns-the-count-the-webview-draws.md).
Measured 2026-09-14 against `nwilps/write-ist-ng@3812312`, `spike/public/script.fountain`.

## The question

ADR-0001 requires that page counts agree across Linux, Windows and macOS, which under Tauri
means three different text-layout engines. The strong answer is to break every line ourselves
and hand the webview pre-broken lines, so CSS has no decision to make. It is expensive: one DOM
element per rendered line (~22,000 for a 400-page manuscript), virtualised rendering, and
ProseMirror taught that several line elements are one paragraph — rebuilding caret and selection
behaviour across boundaries the browser otherwise handles free.

So: **how much divergence does that expense actually buy back?**

## Method

All 1,036 forced-action paragraphs (`!`-prefixed) were extracted from the corpus and wrapped
twice at 61 columns, greedily:

- **space-only** — break opportunities at spaces alone, the naive engine
- **browser-style** — break opportunities also after `-`, `/` and `…`, which is what the Unicode
  line-breaking rules (UAX #14) permit a browser to do

Then the resulting line counts were compared, per paragraph and in total.

## Result

| | |
|---|---|
| Action paragraphs | 1,036 |
| Paragraphs whose line count differs | **0** |
| Total rendered lines, space-only vs browser-style | **1,951 vs 1,951** |
| Page drift at 55 lines/page | **0.00** |

**[V]** 70 of the corpus's wrapping lines contain a hyphen, dash, slash or ellipsis — 8.3% of
wrapping action lines and 3.9% of wrapping dialogue lines — so the exposure is real. **[V]** But
breaking at one never changes how many lines the paragraph occupies: the greedy fit lands the
same way either way, because a hyphen break only helps when the token would not have fitted
regardless.

## What this does not cover

- **[I] Sub-pixel rounding is not simulated and is the real residual risk.** If the editor
  column is not an exact whole number of Courier Prime advance widths, three engines can round
  the fit differently and drop or gain a character at the boundary. Mitigation: set the column
  to an integer multiple of the advance width. This is the failure mode to watch, not hyphens.
- **[I] Font fallback.** A character absent from Courier Prime is drawn from a substitute face
  with a different advance width. The corpus contains one non-ASCII character (`é`, precomposed,
  line 3520), which Courier Prime covers.
- **[I] One corpus, one genre, one writer.** The result is strong for this manuscript and is not
  a general claim about English prose. If divergence ever measures non-zero elsewhere, the
  pre-broken-lines design in ADR-0024's *Considered options* is the answer that was set aside.
- **Dialogue was not simulated**, only counted for exposure. Its 35-column measure is narrower,
  where a single break decision is proportionally more significant.

## Reproducing it

Extract `!`-prefixed lines from the corpus; wrap each greedily at 61 columns under both break
rules; compare per-paragraph line counts and the total. It is about twenty lines of script and
was deliberately not kept as a checked-in tool, since `write-ist-ng` is no longer edited and the
gate that *does* belong in this repo is ADR-0020's round-trip test.
