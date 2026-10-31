# A page breaks the way Final Draft breaks it

**Write-ist breaks pages by Final Draft's default rules: a speech that crosses a break is closed with
`(MORE)` and reopened with `CHARACTER (CONT'D)`, dialogue and action split between sentences, and no
break strands a cue, a heading or a parenthetical.** Screen, status bar and PDF read one rule
(`src/screenplay/paginate.ts`), as ADR-0024 requires.

**Status: decided by Noah as Q-A of [the Slice 2 spec](../specs/slice-2.md) — "match Final Draft and the
industry standard as closely as possible" — 2026-10-31. The rules below are the implementation of that
decision; their provenance is stated rule by rule, and some of it needs Noah's check. Rule 7 was decided by Noah on 2026-10-31.**

## The forcing reason

Until #87 the engine split an element only when it was longer than a page. Every other element that did
not fit moved whole to the next page, so *Big Fish* had no `(MORE)` at all and left white space at
the foot of pages where Final Draft splits a speech. The spec's default for Q-A was to copy what Final
Draft's *Big Fish* PDF does; that PDF is not on the machine that wrote this, so the rules could not be
read off it.

## Sources, and what is not verified

**Web access was refused in the session that wrote this, so nothing here was checked against Final
Draft's manual, a help page, or the Final Draft PDF. Every rule is from memory** of Final Draft's default
behaviour (Format ▸ Elements ▸ Paragraph "Keep with next", Page Layout ▸ Pagination "Dialogue breaks")
and of the screenplay convention (Hollywood format as taught by, for instance, *The Screenwriter's
Bible* and *Screenplay* by Syd Field), and none of it was measured. Noah, please check the items
marked **[check]** against a Final Draft install or its PDF of *Big Fish*. The evidence in the
repository is that the page *counts* stay at Final Draft's published 120 and 4 under these rules
(below) — which is consistent with them, not proof of them.

## What is decided

| # | Rule | Source |
|---|---|---|
| 1 | A **scene heading**, a **character cue** and a **parenthetical** keep with what follows: a break never falls after one. The heading needs room for the next element to begin; a cue needs its parenthetical and the first lines of its dialogue; a parenthetical needs the first lines of its dialogue. | Final Draft's default "Keep with next" on those three elements — memory **[check]**. Existed before for headings and cues; parenthetical and the chain (cue → parenthetical → dialogue) are new. |
| 2 | **Dialogue splits across a break.** The page it leaves ends with `(MORE)` on the line after the last line; the next page opens with `CHARACTER (CONT'D)` on its first line. | Final Draft's Dialogue Breaks defaults ("(MORE)" at the bottom, "(CONT'D)" at the top) — memory **[check]**. Already specified in the spec; the engine now does it for any speech. |
| 3 | The same closing and reopening applies when the break falls **between two elements of one speech** (dialogue → parenthetical → dialogue). | Memory **[check]**: that Final Draft does this, not merely at a split line. |
| 4 | **Action splits, and is not marked.** No `(MORE)`, no `CONT'D`. | Screenplay convention; memory **[check]**. Replaces #87's reserved-but-undrawn `(MORE)` line for action (finding 2). |
| 5 | A split leaves **at least two lines before and two lines after** the break, so no widow or orphan line. A speech or action that cannot be split that way moves whole. | The "no lone line" rule #87 already carried, made two-and-two. Two lines is Final Draft's default widow/orphan control as I remember it **[check]**. |
| 6 | **Dialogue and action split at the end of a sentence** when one falls on a line end within the room: the largest such split that fits. A sentence end is `.`, `?` or `!` (with closing quotes and brackets) at the end of a wrapped line, other than a title abbreviation (`Mr.`, `Dr.`, `St.` …). | Noah's decision ("split action at sentence boundaries"). Applying it to dialogue as well, and the abbreviation list, are mine **[check]**. |
| 7 | **No sentence end fits** (a long sentence, or none within the room left): the split falls at the last line break that keeps two and two. The whole element never moves to the next page when such a split exists; it moves whole only when no two-and-two split does (rule 5: under four lines, or under two lines of room). | **Decided by Noah, 2026-10-31.** Not verified against Final Draft. |
| 8 | `(MORE)` needs a line: a speech element that has more speech after it and would end exactly on the last line of the page does not; it gives up a line (splitting, or moving on). | Follows from rule 2. |
| 9 | A **dual-dialogue band** is never split and keeps no one with what follows it. A band taller than a page overflows. | #87's finding 4, unchanged; the keep-with-next that used to reach past a band is removed. |
| 10 | A cue that already ends in `(CONT'D)` is not doubled; `(V.O.)` is kept: `EDWARD (V.O.) (CONT'D)`. | ADR-0026. |
| 11 | `(MORE)` and the page-break `CONT'D` are lines of the layout and the PDF, never of the manuscript or the `.fountain`. | ADR-0024, ADR-0026. |

Centered text splits at a line, two and two, without the sentence preference or any marking.

## Consequences

- **Page counts.** *Big Fish* stays at **120**, *Brick & Steel* at **4**, *Big Fish (augmented)* at
  **120**; the committed expectations hold unchanged, and no number was edited. What changed is the
  layout. *Big Fish*: 9 splits (5 of dialogue, 4 of action) and 7 `(MORE)` lines — the 5 dialogue
  splits plus 2 breaks between elements of one speech. *Augmented*: 10 splits (7 dialogue, 3 action),
  9 `(MORE)`. *Brick & Steel*: none. Before: 0 on all three. That the counts did not move is a
  measurement, not a design aim; the one-page tolerance on *Big Fish* is unused. The acceptance corpus is
  absent on the machine that wrote this, so its count is unmeasured here.
- **The page-top blank that travels with a pushed group** (`paginate.ts`) is kept for ordinary
  elements; a speech's continuation takes none, because `CONT'D` is directly above it.
- **The rules sit in one place.** `fitsStart` / `splitHead` decide in the same code the count and the
  layout read; there is no second engine.
- **Open:** whether a broken speech's `(MORE)` also appears when the first part is a dialogue and the
  next element is a **transition** or another cue, and Final Draft's treatment of a split inside a
  dual-dialogue band. Neither occurs on the fixtures.
