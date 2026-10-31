# A page breaks the way Final Draft breaks it

**Write-ist breaks pages by Final Draft's default rules: a speech that crosses a break is closed with
`(MORE)` and reopened with `CHARACTER (CONT'D)`, dialogue and action split between sentences, and no
break strands a cue, a heading or a parenthetical.** Screen, status bar and PDF read one rule
(`src/screenplay/paginate.ts`), as ADR-0024 requires.

**Status: decided by Noah, 2026-10-31.** Q-A of [the Slice 2 spec](../specs/slice-2.md) asked for
"match Final Draft and the industry standard as closely as possible"; Noah then settled the page-break
rules below, from the *Big Fish* comparison, with Final Draft's behaviour as the default. Two cases
the comparison turned up are not decided and are listed under *Open questions*.

**Amended 2026-10-31**, by a second pass over the same PDF, under Noah's standing rule that where Final
Draft's behaviour is known Write-ist matches it. It added the wrap changes of
[ADR-0024](0024-the-engine-owns-the-count-the-webview-draws.md) (hyphen breaks; a double space is
measured as two, not one), rule 7 (`CHARACTER (CONT'D)` in the top margin) and rule 8 (a parenthetical
after dialogue, and action before a transition), and answered open questions 2 and 3.

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
| 6 | **`(MORE)` and `CHARACTER (CONT'D)` stay.** A speech that crosses a break is closed with `(MORE)` and reopened with `CHARACTER (CONT'D)`, also when the break falls between two elements of one speech. **A scene heading, a character cue or a parenthetical is never left alone at the foot of a page**: each keeps with what follows (with the exception in rule 8). |
| 7 | **`CHARACTER (CONT'D)` sits in the top margin**, one row above row 0, and costs the page no line: the speech's text starts at row 0 like any other page's. In the PDF the cue is at y = 60pt, between the page number (y = 35) and the first line of text (y = 72), on all 8 pages that open on a continued speech. (Before this rule the cue took row 0 and pushed the page's text down one row, which moved the break on 72 of 119 pages.) `(MORE)` is the mirror: row 54, below the text. |
| 8 | **Two keep-with exceptions, each from the PDF.** (a) A parenthetical that comes *after dialogue* does not keep with the next element and may end the page, with `(MORE)` after it (page 30: `leave with you.` / `(closer)` / `(MORE)`); a parenthetical straight after the cue still keeps with its dialogue (pages 43, 56, 70, 78). (b) An action keeps with a transition that follows it, so a transition does not open a page (pages 113–114: `TIRES SMOKE as the car peals out.` goes over to the next page with `BACK TO:`). A transition itself may end a page (pages 94, 111, 116). |

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
  no expected page count was edited. *Big Fish*: 10 splits (7 of dialogue, 3 of action) and 8 `(MORE)`;
  *Augmented*: 11 splits (9 dialogue, 2 action) and 11 `(MORE)`; *Brick & Steel*: none. **The `(MORE)` falls on
  pages 24, 30, 49, 52, 80, 97, 98 and 107, which are the eight pages Final Draft's PDF has them on**, and a
  test holds the list. (Before the second pass: 10 splits and 7 `(MORE)` on pages 24, 31, 36, 49, 72, 96,
  111; the splits and `(MORE)` counts in the tests moved because the wrap and the top margin moved
  where pages break, not because an expected number was edited to fit.)
- **The page-top blank is gone.** The earlier engine let a pushed group carry its blank row to the top of
  the next page (on 108 of 120 pages of *Big Fish*); Final Draft starts text at row 0 on all but one.
- **The comparison with Final Draft's PDF.** Page starts that differ from the PDF's, over the 119 pages after
  the first (word-level alignment of the two page streams): **20 with the engine before this ADR's
  first decision, 100 at that decision, 13 now.** Line by line, the PDF's 4,531 lines are reproduced 4,518 times (4,424 at the
  first decision). Aligned line by line, the pages that start on a different line from the PDF's are 5
  of 119 (99 at the first decision): page 3 (the shot line) and pages 73 to 76 (the song). Of the mid-line sentence splits the PDF
  shows (pages 25, 50, 53, 72 and 81), those at 25, 50, 53 and 81 are now reproduced to the line; 72 falls
  in the song. The top margin (rule 7) is the
  largest single step: it takes 71 differing starts to 6.
- **The rules sit in one place.** `splitPoint` and `fitsStart` in `paginate.ts` decide in the same code
  the count and the layout read; there is no second engine. A chunk now records the offsets of its text
  rather than a line index, because the rest of a split element wraps afresh.

## Open questions

Not decided; the code does not change for them. Each is a place where the PDF and the layout still differ
and the PDF does not by itself say what rule Final Draft follows.

1. **A shot line at the foot of a page** (*Big Fish* page 2). `ON WILL AND SANDRA` is read by the Fountain
   parser as action, so nothing keeps it with the cue after it; Final Draft pushes it to page 3, and it is
   the one remaining difference outside the song. It is not a general rule that action keeps with a cue:
   34 other pages of the layout end on an action line ahead of a cue, and Final Draft breaks at the same place on every one. So it is the
   *shot* that keeps, which makes this a question for the parser (is an all-capitals line with no full stop
   between blank lines a shot?) and not for the page rules. The same ambiguity hides in `ON HIS SHOES`
   (page 26), which Final Draft sets three blank rows below the paragraph above, where its other
   all-capitals action lines (`TWO OVERSIZED HANDS`, `KARL THE GIANT`, `ON STAGE` and 18 others sampled) take one.
2. **Extra blank rows the Fountain does not carry.** Four places where the PDF has one or two more blank rows
   than the layout: before `ON HIS SHOES` (page 26), before `INT. GUEST ROOM` (page 78), before `EXT. A COUNTRY
   ROAD` (page 84), and between `CUT TO BLACK.` and `THE END` (page 120). They look like blank paragraphs or
   space-before set by hand in the `.fdx`, which a `.fountain` file cannot record. Nothing to match them to.
3. **The song on pages 72 to 76 (the one remaining place the page streams part).** Final Draft sets the
   italic lyrics (`Sometimes it's so bad, she wants to explode.`) at 38 columns' width for 44 characters,
   i.e. in a smaller or narrower face, and breaks each lyric line where the writer did. The layout wraps
   them at the dialogue measure and takes two lines for four of them, so pages 73 to 76 start 2 to 3 rows
   off and then come back. Whether italic text is set smaller in Final Draft, or this is a lyrics style,
   is not shown by one song.
4. Whether a broken speech's `(MORE)` also appears when the first part is dialogue and the next
   element is a **transition** or another cue, and Final Draft's treatment of a split inside a
   dual-dialogue band. Neither occurs on the fixtures.

**Answered in the second pass.** *A parenthetical at a speech's break* (page 30) is rule 8(a).
*Wrapping, not breaking* (hyphens and double spaces) is ADR-0024's amendment: the hyphen is Final Draft's
and is matched; the double space is not "one", it is two, and is left as it was.
