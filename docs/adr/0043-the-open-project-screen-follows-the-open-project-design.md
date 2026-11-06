# The Open Project screen follows the Open Project design

**The Open Project screen is drawn as Noah's Open Project design (approved 2026-11-06,
`OPEN-PROJECT-HANDOFF.md`) draws it: the header in characters, a rule above and below the list, one
project row lit, and Home [Esc], Import [I] and New Project [N] along the foot. New Project opens
the existing dialog over this screen; search has no control and opens on Alt+Enter.** What the list is (a
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
- **The header is drawn at the design's 9px** (Noah, after testing it, 2026-11-06: 7px, then 8px,
  then back to 9px the same day): about 491px wide, centred, shrinking on a window too narrow for
  it. The art and the rules are unchanged.
- **The rules are at most 70 dashes — 630px at 15px, not the design's 51 (459px)** — Noah, after
  testing it, 2026-11-06. They lose whole dashes on a narrow window: the box is a whole number of
  columns (`round(down, 100%, 1ch)`) and the rest is cut off, never squeezed.
- **Import is in the foot, between Home and New Project: Import [I]** (Noah, after testing it,
  2026-11-06). The design's foot has none, but this screen is the only way a screenplay comes in.
  It is drawn as the other two are and keeps its letter, `i`; while an import runs it is disabled.
- **The list is the real one.** Name right-aligned, format beside it in the faint colour, as the
  design's columns; the design's names are dummy data and appear nowhere. One row is lit — the
  first, until the pointer, Tab or the arrows move it — with the home menu's highlight (`navigable`),
  so there is never a second. A click opens a project; Enter opens the lit one.
- **The list shows at most eight rows, and only the list scrolls** (Noah, after testing it,
  2026-11-06). Its window is eight rows and the seven gaps between them — 248px, no ninth row
  begun — and the header, the rules and the foot stay outside it. Eight projects or fewer fit, so
  there is no scrollbar. A window too short for eight shows as many whole rows as fit, one at the
  least (`rowsThatFit`, refitted on resize). The wheel and trackpad scroll it natively; Up and Down,
  wrapping included, bring the lit row just into view (`scrollIntoView`, nearest). The right-click
  menu opens at the pointer and is bound to its row, so scrolling changes neither. The scrollbar is
  the webview's own: nothing else in the application styles one.
- **New Project is the home screen's dialog, unchanged, over this screen.** Cancel leaves the writer
  here; Confirm makes the project and opens it. The dialog is put on the body rather than the screen,
  so the listing arriving underneath cannot take it down.
- **Search is the desk's dialog** (the desk design, §2.5): the same markup and classes, centred on
  the screen, its results projects (name, the match marked, the format where the page would be).
  Up, Down, Enter and Escape as there. Nothing on the screen opens it or mentions it; **Alt+Enter**
  does, the Editor's chord for its own search.

- **A project row has a right-click menu: Rename Project and Delete Project** — recorded in
  [ADR-0044](0044-deleting-a-project-moves-it-to-deleted-projects.md), with what deleting does.

## What it does not decide

- **The search's place.** Centred for now; the handoff says Noah may move it.
