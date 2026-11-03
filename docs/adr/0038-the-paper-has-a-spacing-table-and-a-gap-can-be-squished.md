# The paper has a spacing table, and a gap can be squished

**How far apart two elements sit on the paper and in the PDF is one table, keyed by the pair of element
types either side of the gap: how many blank lines, and whether the writer may squish it. A squished gap
is a setting on the lower element — Backspace makes it, Enter takes it back — and in the Fountain file it
is nothing more than two lines with no blank line between them. The file's own blank-line rule
(ADR-0019) is not touched for ordinary content.**

**Status: decided by Noah, 2026-11-03.** Noah could not be asked live; the calls the brief left open were
made by the implementer and are listed under *Calls made without Noah*, for him to overturn.

## The forcing reason

The pagination engine borrowed the serialiser's blank-line table (`needsBlankLine`, ADR-0019) for the
spacing of the paper, and that table answers a different question — *does the file have a blank line
here* — with a yes or a no. Final Draft's template has two blank lines before a scene heading, and a
writer who wants two action lines tight against each other has no way to say so, short of a blank line
that is not a line. One answer cannot be both the file's syntax and the paper's spacing, and an unbounded
count of blank lines cannot be a boolean.

## What is decided

1. **The spacing table** is `SPACING` in `src/screenplay/geometry.ts`, beside the horizontal geometry
   table. A row is `{ above, below, blank, squishable }`; `"any"` matches every type; the first matching
   row wins. `blank` is any whole number from 0 up — pagination, the paper and the PDF read the number
   and nothing in them assumes 0 or 1. Changing a spacing, or allowing a new squishable pair, is a
   one-line edit; `npm run geometry` regenerates the paper's stylesheet and a test fails if it is stale.
2. **The paper and the PDF read it, and only it.** `paginate` takes the gap from the table; `layout` and
   the PDF place rows from the pagination, so they cannot differ. The paper's margins are generated into
   `geometry.css`, one rule for each of the 196 ordered pairs of types, and `test/app/manuscript-spacing.test.ts`
   reads every one back against the table. The hand-written mirror of `needsBlankLine` in `editor.css` is
   gone: the paper is not the file.
3. **The defaults are Final Draft's template.** Two blank lines before a scene heading (and before a shot,
   when there is one; there is no shot element yet), one before action, a character and a transition,
   none inside a speech (cue, parenthetical, dialogue), none in a lyric run, none against a boneyard
   delimiter, and one for everything else, which is what each of them was.
4. **Squishable pairs are action → action and centered → centered.** Nothing else.
5. **A squished gap is `squished: true` on the lower element** (`Element.squished`, the editor's `squished`
   attribute, `data-squished` on the paper). It means *the gap above me is nothing*, and it is read only
   where the table says the pair is squishable, so editing the table cannot strand a stale flag.
6. **Backspace squishes, Enter restores.** Backspace with the caret at the very start of the lower element
   of a squishable pair, and its gap not already squished, squishes the gap and moves no text; anywhere
   else Backspace is what it was, so a second Backspace joins the lines. Enter with the caret at the very
   end of the upper element of a squished pair puts the gap back to the table's default, makes no element
   and leaves the caret where it was; with the gap not squished, Enter is what it was. Each is one undo step.
7. **In the file, a squished gap is the absence of a blank line.** On open, two lines of a squishable pair
   with no blank between them are a squished pair, and a blank line is the default gap. On save, a
   squishable pair writes a blank line unless it is squished. **However many blank lines the paper leaves
   — two before a scene heading, three if the table says so — the file writes one.** Spacing is
   presentation; the file keeps Fountain's meaning.
8. **An all-capitals action line that heads a squished pair is written with `!`.** Fountain reads an
   upper-case line with a blank above and text directly below as a cue; the serialiser forces it only where
   that would happen, so a capitals line already inside a tight run is left as it was.

## Consequences

- **Scene headings are two lines down where they were one.** *Big Fish* goes from 120 pages to **123**,
  *Big Fish (augmented)* from 120 to 123, *Brick & Steel* stays at 4. The pages `(MORE)` falls on move from
  24, 30, 49, 52, 80, 97, 98, 107 to 20, 31, 52, 64, 82, 95, 106, 118. Final Draft's own PDF of *Big Fish*
  has **one** blank line before a scene heading (it is a Fountain import, not a Final Draft script), so the
  comparison with that PDF (ADR-0033) is still made, at the PDF's spacing: a test puts one row in front of
  the table for the length of the call and still lands on 120 pages and the same eight `(MORE)` pages. This
  is the visible, intended change, and the one most worth Noah's eye.
- **ADR-0020's seventh entry is retired for these two pairs.** A tight run of action no longer gains a blank
  line between each, and a blank line between two centered lines is no longer removed. *Brick & Steel*
  imports to **2,885** bytes, not 2,886 (its two added blanks and one lost blank are gone), and the import
  report no longer has a blank-lines entry for it or for *Big Fish (augmented)*. The entry still stands
  for every other pair — a scene heading with action directly under it still gains its blank line — and
  the report still counts those. Where a pair is centered → centered and was written without a blank line,
  nothing changes; where it was written with one, the blank line now survives.
- **Backspace costs a second press.** Splitting an action line with Enter and pressing Backspace to join
  it back now squishes the gap first and joins on the second press.
- A change to Final Draft's template, or Noah's taste, is a change to a row of the table.

## Calls made without Noah

1. **Centered → centered has a default gap of one blank line**, where the paper drew none. A squishable
   pair with a default of none would have nothing to squish. Title cards written tight are read as
   squished and look and save exactly as before; two typed cards now sit a line apart until squished.
2. **Backspace in an empty element deletes it, as before**, rather than squishing the gap above it: there
   is no text to protect, and Enter-then-Backspace must still undo itself.
3. **The flag lives on the lower element**, and a type change (Tab, Ctrl+1…7) clears it, as it clears a
   forcing marker; a split gives the new second half the table's default gap.
4. **The squish is ignored, not cleared, when the table stops allowing it.**
5. **The corpus was not run:** it is the writer's, read from `$WRITE_IST_CORPUS`, and not present where
   this was built. Its page count will move with the scene headings; its bytes should not.

## Alternatives considered

- **A real empty element as the gap.** Rejected by the brief: the gap is a spacing setting, as in Final
  Draft, not a line the writer can select, and an empty element is already left out of the file.
- **A flag on the pair rather than on the lower element.** There is no pair object in a flat sequence
  (ADR-0019); the lower element is where `omitted`, `forced` and the other per-line facts already live.
- **A marker in the file for a squished gap.** The absence of a blank line is already Fountain's own way
  to say it, and a marker would be syntax the writer never typed (ADR-0020).
