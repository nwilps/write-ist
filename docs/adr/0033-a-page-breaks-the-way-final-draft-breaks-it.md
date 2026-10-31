# A page breaks the way Final Draft breaks it

**Write-ist breaks pages by Final Draft's default rules: a speech that crosses a break is closed with
`(MORE)` and reopened with `CHARACTER (CONT'D)`, dialogue and action split between sentences, and no
break strands a cue, a heading or a parenthetical.** Screen, status bar and PDF read one rule
(`src/screenplay/paginate.ts`), as ADR-0024 requires.

**Status: decided by Noah, 2026-10-31.** Q-A of [the Slice 2 spec](../specs/slice-2.md) asked for
"match Final Draft and the industry standard as closely as possible"; Noah then settled the page-break
rules below, from the *Big Fish* comparison, with Final Draft's behaviour as the default. Two cases
the comparison turned up are not decided and are listed under *Open questions*.

## The forcing reason

Until #87 the engine split an element only when it was longer than a page. Every other element that did
not fit moved whole to the next page, so *Big Fish* had no `(MORE)` at all and left white space at
the foot of pages where Final Draft splits a speech. The spec's default for Q-A was to copy what Final
Draft does. A first version of the rules was written from memory; Noah's review compared them with Final
Draft's own PDF of *Big Fish* and decided the rules below.

## Sources

- **Final Draft's PDF of *Big Fish*** (fountain.io's `Big-Fish.pdf`; its metadata says Final Draft, Mac OS X
  10.7.2, February 2012). Compared page by page with the layout: 120 numbered pages behind a title page and
  an unnumbered epigraph page, text at row 0 of every page, `(MORE)` on 8 pages (24, 30, 49, 52, 80, 97,
  98, 107), sentence splits at pages 25, 50, 53, 72 and 81, and a 4-line action moved whole at page 13.
  The PDF is not committed.
- **Final Draft's format guide**, and its knowledge-base articles on **Mores and Continueds**, on
  **sentence breaks**, and on **Page Layout**. These are named by Noah as the sources of the rules. The
  session that wrote this had no web access, so the articles were not read here; the rules rest on the
  PDF comparison and on Noah's decision, and the articles are cited as the published statement of them.
- The **two-and-two minimum is Write-ist's own.** Final Draft publishes no such rule; *Big Fish* never
  breaks it.

## What is decided

| # | Rule |
|---|---|
| 1 | **Dialogue and action split only at the end of a sentence** (`.`, `?` or `!`, with closing quotes and brackets; not a title abbreviation such as `Mr.`, `Dr.`, `St.`). A sentence end in the **middle of a line** counts: the first part ends there and the rest is **re-wrapped as a fresh paragraph** at the top of the next page (Final Draft, *Big Fish* pages 25, 50, 53, 72, 81). |
| 2 | **Two lines before and two after** the break at least (Write-ist's own rule). Of the sentence ends that leave that, the **last** is taken. |
| 3 | **No such sentence end** (an element with sentences, but none that leaves two and two in the room): the **whole element moves** to the next page (*Big Fish* page 13). |
| 4 | **Only when the element cannot move whole**, because it is one sentence too tall for any page (more than 54 lines of text, with no sentence end in it that leaves two and two): split at the **last line break** that leaves two and two. This revises the earlier rule 7, which split at a line break whenever no sentence end fitted. |
| 5 | **Text starts at row 0 of every page.** There is no blank row at the top, including when a keep-with-next group is pushed to the next page. |
| 6 | **`(MORE)` and `CHARACTER (CONT'D)` stay.** A speech that crosses a break is closed with `(MORE)` and reopened with `CHARACTER (CONT'D)`, also when the break falls between two elements of one speech. **A scene heading, a character cue or a parenthetical is never left alone at the foot of a page**: each keeps with what follows. |

Carried over unchanged:

- Action splits and is not marked: no `(MORE)`, no `CONT'D`.
- A **dual-dialogue band** is never split and keeps no one with what follows it. A band taller than a page
  overflows.
- A cue that already ends in `(CONT'D)` is not doubled; `(V.O.)` is kept: `EDWARD (V.O.) (CONT'D)`
  (ADR-0026).
- `(MORE)` and the page-break `CONT'D` are lines of the layout and the PDF, never of the manuscript or
  the `.fountain` (ADR-0024, ADR-0026).
- Centered text has no sentences: it splits at a line, two and two.

## Consequences

- **Text area.** A page holds 54 lines of text, rows 0–53; the sheet's 55th row (54) is `(MORE)`'s alone,
  so `(MORE)` costs a speech nothing. This is read off the PDF, not decided: with text at row 0, no
  page of *Big Fish* has a line of text on row 54 except a `(MORE)` (pages 97 and 98), and with 55 lines
  of text the count falls to 118 pages. `PAGE.linesPerPage` stays 55, the sheet.
- **Page counts.** *Big Fish* stays at **120**, *Brick & Steel* at **4**, *Big Fish (augmented)* at **120**;
  no expected number was edited. *Big Fish*: 10 splits (6 of dialogue, 4 of action) and 7 `(MORE)`;
  *Augmented*: 9 splits (6 dialogue, 3 action) and 10 `(MORE)`; *Brick & Steel*: none. Final Draft's own
  PDF has `(MORE)` on 8 pages.
- **The page-top blank is gone.** The earlier engine let a pushed group carry its blank row to the top of
  the next page (on 108 of 120 pages of *Big Fish*); Final Draft starts text at row 0 on all but one.
- **The comparison with Final Draft's PDF.** Page starts that differ from the PDF's: **20 of 119 before,
  100 after** (word-level alignment of the two page streams). The number went up because the old
  engine's top blank happened to cancel two *wrap* differences that are not page-break rules, and
  with it gone the pages drift apart from page 23 and do not come back. See *Open questions*. Of the
  mid-line sentence splits the PDF shows, page 25 ("…ambition." / "So I spent…") is reproduced; at
  pages 50, 53, 72 and 81 the drift has already moved the break, so they are not a test of the rule.
- **The rules sit in one place.** `splitPoint` and `fitsStart` in `paginate.ts` decide in the same code
  the count and the layout read; there is no second engine. A chunk now records the offsets of its text
  rather than a line index, because the rest of a split element wraps afresh.

## Open questions

Not decided; the code does not change for them.

1. **A shot line at the foot of a page** (*Big Fish* page 2). `ON WILL AND SANDRA` is read by the Fountain
   parser as action, so nothing keeps it with the cue after it; Final Draft pushes it to page 3. Whether
   the parser should read it as a shot, or action should keep with a following cue, is open.
2. **A parenthetical at a speech's break** (page 30). Both break at "leave with you.", but Final Draft keeps
   the `(closer)` parenthetical on the page before and ours pushes it to the next.
3. **Wrapping, not breaking.** Final Draft breaks a line after a hyphen (`half-` / `empty`) and wraps as if
   the two spaces after a full stop in the fixture were one. ADR-0024 measured zero drift for
   space-only wrapping on the acceptance corpus; *Big Fish* shows it does not hold there. This, not
   a break rule, is what the 100 mismatches mostly are (with the hyphen and double-space differences
   patched in a scratch copy, the same comparison gives about 67). Needs its own decision.
4. Whether a broken speech's `(MORE)` also appears when the first part is dialogue and the next
   element is a **transition** or another cue, and Final Draft's treatment of a split inside a
   dual-dialogue band. Neither occurs on the fixtures.
