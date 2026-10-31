# Spellcheck is the system's, and skips names and headings

**Write-ist uses the spellcheck built into the system's webview — the same squiggles the writer
already knows — and switches it off on character cues and scene headings.** "Add to dictionary"
is the system's too, and works across every project. There is no per-script dictionary in v2.

> **Superseded 2026-10-31 by [ADR-0032](0032-spellcheck-is-ours-on-demand-and-offline.md)**, which Noah
> approved with the Slice 2 spec. Kept as written, for the reasoning. The "Right-click stays the
> system's" and "To verify" sections no longer apply, and
> [ADR-0034](0034-write-ist-draws-its-own-context-menus.md) reverses the first.

Decided 2026-09-19, closing [#12](https://github.com/nwilps/write-ist/issues/12).

## The forcing reason

v1 abandoned spellcheck as too slow, and `docs/PLANNING.md` traces it to the same root as the rest
of v1's editor problems. The question #12 raised was how spellcheck could tell text from syntax,
with comment delimiters, marks and forcing markers all in the file.

**That question is already answered by design.** The editor never shows syntax
([ADR-0018](0018-comments-are-the-text.md)), so the delimiters are not on the page at all, and a
spellchecker reading the page reads only the writer's words. Nothing needs building to separate
them, which makes the system's spellcheck the cheap and correct choice: it is free, it is familiar,
and the reason it would have failed in v1 no longer exists.

## What is checked

**Everything the writer sees, except character cues and scene headings.**

- **Character cues are names, not words**, and a spellchecker flags every one on every page. That
  is the screenwriter's real complaint about spellcheck, and switching it off on the one element
  that is only ever a name removes it.
- **Scene headings are mostly place names** — `BENNETT'S HOSPITAL ROOM` — and would be flagged the
  same way.
- **What skipping costs is catching a typo**, `EDWRAD` for `EDWARD`. Autocomplete covers that: the
  writer types `EDW` and picks the name rather than typing it in full, and a typo that does get
  through turns up in the autocomplete list as a new, odd-looking character, which is its own
  warning. Scene headings the same.
- **Cut material** is collapsed by default ([ADR-0021](0021-the-screenplay-surface-implements-all-of-fountain.md)).
  Expanded, it is checked like everything else. No special rule.

Names that appear inside action lines are still checked; the writer adds each to the dictionary
once.

## Autocomplete, which this depends on

**Character names and scene headings autocomplete, and the lists are worked out from the script
itself.** Every cue and every heading is already an element in the document, and pulling a clean
name out of `EDWARD (V.O.) (CONT'D)` is code that already exists for `(CONT'D)` maintenance. So
there is no word bank to store, no sidecar file, and nothing to fall out of step — the same
derive-don't-store line [ADR-0022](0022-scene-metadata-is-derived-or-inline.md) takes for scene
metadata.

Recorded here because it is what makes skipping spellcheck on those elements safe. The feature
itself is an editor ticket.

## Right-click stays the system's

**Comments are created with a keybinding and a menu item, not a right-click.** The spelling
suggestions and "Add to dictionary" live in the right-click menu the system provides. A page that
takes over right-click to offer "Add comment" most likely replaces that menu, and the spelling
options go with it. Keeping both on one right-click is possible, but only with separate host-level
work for each of the three webviews ([ADR-0001](0001-desktop-platforms-and-pagination-font.md)).

This amends ADR-0018, which allowed *"a keybinding or a right-click"*. Since it said "or", nothing
is reversed.

The reasoning about how the three webviews treat a replaced context menu is inferred [I], not
tested; choosing not to replace it avoids the problem either way.

## To verify when the editor exists

- **It works on all three webviews** — WebKitGTK, WebView2 and WKWebView — with suggestions and
  "Add to dictionary" present.
- **On Linux it needs a dictionary package installed** (Hunspell or similar, via the host's
  spellcheck library). The writer's own machine is Linux, so this is checked there first.
- **It holds at full length.** Speed at a full-length script is what killed spellcheck in v1, and
  `docs/STANDARDS.md`'s *"measure the measurer"* applies to any readout of it.

## Considered options

- **Writing our own spellchecker.** Rejected: a large piece of work for something the system does
  already, and the thing that killed v1's attempt.
- **A dictionary per script**, so an invented word is accepted in one script and not in the others.
  The real want, and rejected on cost: the system spellcheck has no way to take a list of words
  from the page, so it means writing our own spellchecker after all. In practice a script has
  perhaps fifteen invented names, added once each. The autocomplete list is, in effect, the
  per-script name list — it just cannot feed the system's spellchecker.
- **Checking scene headings.** Rejected: place names would be flagged on every page, and
  autocomplete covers typos there.
- **Right-click for comments.** Rejected above.

## Consequences

- **ADR-0009's dictionaries are the platform's, not ours.** It said *"spellcheck dictionaries ship
  with the application, not inside each project"*; the second half stands, but nothing ships with
  the application, because the dictionaries belong to the system. Amended there.
- **A word added to the dictionary is known everywhere** — in every project and, on a Mac, in the
  writer's other applications. An invented name from one script is then accepted in another. For
  one writer that is a fair trade.
