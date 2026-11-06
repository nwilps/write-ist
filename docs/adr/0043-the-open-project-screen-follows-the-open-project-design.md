# The Open Project screen follows the Open Project design

**The Open Project screen is drawn as Noah's Open Project design (approved 2026-11-06,
`OPEN-PROJECT-HANDOFF.md`) draws it: the header in characters, a rule above and below the list, one
project row lit, and Home [Esc] and New Project [N] along the foot. New Project opens the existing
dialog over this screen; search has no control and opens on Alt+Enter.** What the list is (a
listing of the default location, ADR-0015, ADR-0016) and what choosing a project does do not change.

**Status: built, 2026-11-06.**

## What it decides

- **The typeface is the one already bundled**, as in ADR-0042: the handoff's "JetBrains Mono is not
  in the repo yet" is out of date. Nothing was added.
- **The header is the design's file, byte for byte.** `app/src/screens/open-project-header.ts`
  holds `open-project.txt` exactly, including the seven newlines it ends with, and a test holds it
  to `test/fixtures/open-project-header.txt`. The screen draws the seventeen lines without those
  trailing newlines: drawn, they would be empty space under the art that the design's 154px-tall
  header does not have. The art uses U+FF3C (fullwidth `＼`) ten times in the N, a glyph the bundled
  face does not have; it is kept as drawn and falls back to a system face.
- **The rules are at most 51 dashes, and lose whole dashes on a narrow window** — the box is a
  whole number of columns (`round(down, 100%, 1ch)`) and the rest is cut off, never squeezed.
- **The list is the real one.** Name right-aligned, format beside it in the faint colour, as the
  design's columns; the design's names are dummy data and appear nowhere. One row is lit — the
  first, until the pointer, Tab or the arrows move it — with the home menu's highlight (`navigable`),
  so there is never a second. A click opens a project; Enter opens the lit one.
- **New Project is the home screen's dialog, unchanged, over this screen.** Cancel leaves the writer
  here; Confirm makes the project and opens it. The dialog is put on the body rather than the screen,
  so the listing arriving underneath cannot take it down.
- **Search is the desk's dialog** (the desk design, §2.5): the same markup and classes, centred on
  the screen, its results projects (name, the match marked, the format where the page would be).
  Up, Down, Enter and Escape as there. Nothing on the screen opens it or mentions it; **Alt+Enter**
  does, the Editor's chord for its own search.

## What it does not decide

- **Where Import goes.** The design's foot has no Import, and this screen is the only way a
  screenplay comes in. **Until Noah decides**, Import keeps its letter, `i`, drawn nowhere; the
  empty list says how to use it. `open-project.ts` carries a TODO.
- **The search's place.** Centred for now; the handoff says Noah may move it.
