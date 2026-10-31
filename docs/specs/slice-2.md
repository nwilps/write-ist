# Slice 2 — finish the core: write a whole screenplay and send out a PDF

**Status: draft for Noah's review; first decisions recorded 2026-10-31** (Q1, Q-K, the title page and the
Penpot sequencing — marked *Resolved* where they appear). No issues or tickets exist yet. `/to-tickets` charts them after
this spec is approved, and the questions in each step and in the list at the end are for Noah to
answer first. Slice 1 was [#37](https://github.com/nwilps/write-ist/issues/37).

## Goal

A writer sits down, writes a whole screenplay in Write-ist, checks the spelling, and sends out a
shareable PDF. **Everything works fully offline, by default, with no network needed** — including the
spellcheck dictionaries, which ship inside the application. This is ADR-0003 restated as an
acceptance test rather than a value (see *The offline rule* below).

**The bar is still v1's:** v1, jank and all, produced a finished screenplay. Slice 2 is done when the
same can be said of v2 with nothing left to fetch, convert or work around (`docs/PLANNING.md`).

## What already exists

Slice 2 builds on Slice 1 and must not re-specify it. Read from the code on `origin/main`, 2026-10-31:

- **A pagination engine** — `src/screenplay/paginate.ts`, incremental (`repaginate`, #49) — and the
  **geometry table** — `src/screenplay/geometry.ts`, measured from Final Draft's PDF of *Big Fish*
  (#40): US Letter 8.5 × 11in, 1.5in left margin, 1in top, 55 lines of 12pt Courier Prime per page,
  every element's indent and measure. The engine already charges a line for `(MORE)` and for the
  `CONT'D` cue when a speech splits across a page.
- **But the engine returns counts, not a layout.** It reports `totalPages` and the page of each
  element (`pageOfElement`). It does not return *where inside an element* a break falls, nor the
  wrapped lines. The paper draws no breaks; the PDF cannot be made from a count. **Step 1 is therefore
  mostly "make the existing rule produce a layout", not "write a rule".**
- **A live `Page N of M`** in the status bar, driven by that engine (#48, #49).
- **A title page rendered at the top of the Editor** and matched to Final Draft's page 1 (#62), and
  the model holds it as `titlePage` key-value fields (`document.ts`; ADR-0021). **Step 4 changes this:
  the title page leaves the paper.**
- **The `(CONT'D)` rule** — `characterName` and `cueResumes` in `src/screenplay/continuations.ts`,
  called by import and by typing (the architecture review of 2026-10-29, section 2).
- **Save, with temp-flush-rename** (`commit_write` in `src-tauri/src/lib.rs`), a Tauri dialog plugin,
  and no network capability of any kind.

Not built and needed here: **ranges** (scenes from the flat sequence — `SETUP-CHECKLIST.md` Phase 5,
"Not done"), and the **single "where is this in the manuscript" module** the architecture review
recommended (section 1), which spellcheck and autocomplete both need to know the element under the
caret.

## Out of scope

Stated plainly so no ticket drifts into them:

1. **Final Draft (`.fdx`) export.**
2. **Adding words to the character or location lists from the right-click menu.** Right-click offers
   spelling suggestions and "add to dictionary" only.
3. **Managing those lists** — no screen to rename, merge, delete or reorder names or locations.
4. **Deliberately similar names** (Ann/Anne) beyond a simple "not a typo" mark, if one is needed. Step
   10 argues the explicit-confirm gesture of step 8 *is* that mark, so none is built separately.
5. **Everything around the core:** planning, notes, comments (the existing ones keep working and are
   never printed), drafts and locking, the workspace bar, the other workspaces, scene numbering,
   revision colours, A4 and other paper sizes, a per-script dictionary, and any network feature.

## Words

This spec uses `GLOSSARY.md`. Two reminders that matter here:

- **The paper** is the visual sheet in the Editor. **A page** is the counted unit the engine
  computes, for the screen and the PDF alike. This spec never calls the paper "the page".
- **Element** is one line of the flat sequence; a four-line **speech** is four elements. "Confirmed",
  "known word" and "near-match" are new in this slice and defined where they first appear (step 8);
  `/to-tickets` should add **Confirmed name** and **Known word** to the glossary with step 8.

## The offline rule

Hard rule, from Noah: **no step needs the network, ever.** Concretely:

- Spellcheck dictionaries, Courier Prime, any PDF library and any other asset ship in the application
  bundle. Nothing is fetched at first run, at export, or on choosing a language.
- The webview's own spellcheck is **not used** — it is switched off (`spellcheck="false"` on the
  editing surface), and the system's dictionaries are never consulted.
- **Checked, not asserted:** step 11 runs the whole pass with the network unavailable (on Linux,
  `unshare -rn`), and a test fails if application code contains a network request or the Tauri
  capabilities grant an HTTP scope. This is the same shape as the existing test that fails on a
  styling literal in a component.

## Decisions that contradict the record

This slice reverses or extends four standing decisions. They are surfaced here rather than
silently overridden, as `docs/agents/domain.md` asks.

| Existing decision | What Slice 2 does |
|---|---|
| **ADR-0029** — spellcheck is the system's, skips names and headings, no per-script dictionary | **Superseded.** Noah's step 10 is a spellchecker of our own, on demand, that *does* check headings and names (ordinary words inside them) and knows the script's confirmed names. The ADR's own "considered options" rejected writing one as "the thing that killed v1's attempt"; the answer here is that it is off the typing path and off by default. **[ADR-0032](../adr/0032-spellcheck-is-ours-on-demand-and-offline.md) is proposed with this spec**, and 0029 is marked superseded. |
| **ADR-0009 (amended by 0029)** — "nothing ships for spellcheck" | Reversed with 0029: dictionaries ship with the application again, as ADR-0009 originally said. Noted in ADR-0032; ADR-0009's amendment line is updated. |
| **ADR-0022 / ADR-0029** — the name and location lists are derived, "no word bank to store, no sidecar file" | Mostly kept: the lists are derived. **But "explicitly confirmed" is stored state**, which nothing derives. **Resolved (Q1):** it is saved in a plain text file inside the project bundle; Noah accepts it may be revisited. ADR-0022's "no sidecar file" and ADR-0025's file list are amended with step 8. |
| **ADR-0024 / ADR-0026** — `(MORE)` and the page-break `CONT'D` are never written to the manuscript | **Kept, not contradicted.** Step 1 and 2 draw them; step 5 prints them; the manuscript and the exported `.fountain` never contain them. ADR-0024 already warns that the PDF holds text the `.fountain` does not. |

Also touched, by decision of the brief and consistent with the record: **ADR-0021** said the title
page "stays where Fountain puts it" — it still does in the *file*; what changes is that the Editor no
longer shows it (step 4). And **ADR-0029's right-click paragraph** is why Question 6 exists.

---

## Step 1 — The page rule

**Behavior.** One shared pagination rule for standard screenplay pages, used by the paper, the status
bar and the PDF. It owns: sheet size and margins, lines per page, how an element wraps, where a break
may and may not fall, and how a speech that crosses a break is closed and reopened.

It is the existing engine (`paginate.ts`) given a second output. Today it answers *how many pages* and
*which page is this element on*. It must also answer, for every page: **the ordered list of lines on
it** — for each line, its element, its text, the marks over it, its row on the sheet — and for any
element that splits, **the character offset where the split falls**. The paper draws breaks from this
and the PDF prints from it.

Rules the layout must carry (several already live in `paginate.ts`; the ticket audits each against
the code rather than assuming):

- A break never falls between a **scene heading** and the line after it, nor between a **character
  cue** and its first line of dialogue (keep-with-next).
- A dialogue (or action) element that splits leaves **no single line alone** at the foot or the head.
- A speech split across a break gets **`(MORE)`** as the last line of the first page and
  **`CHARACTER (CONT'D)`** as the first line of the next — drawn, never written (ADR-0024). If the cue
  already ends in `(CONT'D)` it is **not doubled** (ADR-0026's last consequence; *Big Fish* has 102 such
  cues). A cue carrying `(V.O.)` keeps it: `EDWARD (V.O.) (CONT'D)`.
- Elements with a forced page break (`===`), dual dialogue, boneyard, marginalia (sections,
  synopses, notes, lyrics) and comments follow the rules the engine already has (the file header says
  which take no space).
- The title page is **never** in the pagination (see step 4).

**Acceptance criteria.**

- A function `layout(document) → pages of lines` exists beside `paginate`, and **`totalPages` from the
  layout equals `paginate().totalPages` and `repaginate` after any edit sequence** (the existing
  "incremental equals full" property test is extended to the layout).
- **Measured against Final Draft's PDF of *Big Fish*** (the source of the geometry table, #40): the
  ticket reports, as numbers in the pull request, the page total and the share of pages whose first
  and last lines match Final Draft's. It states the mismatch and the reason for each class of
  mismatch; it does **not** adjust a break to hit the number (`AGENTS.md`: never edit an expected
  value to match the code).
- Page counts on the acceptance corpus are reported and are **unchanged from `main`** unless the
  ticket names which rule changed them, and why.
- `(MORE)` / `(CONT'D)` cases each have a test: a split with a bare cue, with `(V.O.)`, with an
  existing `(CONT'D)` (not doubled), a split in a dual-dialogue pair, and a split that would leave one
  line (moved whole).
- Keystroke budget: the layout is **incremental** and the cost of one keystroke stays inside the
  existing measured budget (16 ms; Slice 1 measured 0.07 ms), *measured including the measurement's
  own cost* (`docs/STANDARDS.md`, "Measure the measurer").
- No DOM, no `measureText`, no `getClientRects` anywhere in the engine (ADR-0024).

**Dependencies.** None; it is first. Reads ADR-0001, 0024, 0026, `geometry.ts`.

**Questions for Noah.**

- **Q-A. Which of Final Draft's behaviours at a break do you want, where industry practice varies?**
  The engine already has opinions (keep a cue with its dialogue, no lone line). Whether a *parenthetical*
  may end a page, and whether action may split mid-paragraph, differ across tools. Default: copy what
  Final Draft's *Big Fish* PDF does, since the geometry is already measured from it.
- **Q-B. Sheet size.** The brief says "standard screenplay pages", which is US Letter. A4 is out of
  scope here; say so if you want it in.

## Step 2 — The paper

**Behavior.** The Editor shows a real screenplay sheet: the right proportions (8.5 × 11), size,
colour and margins, with the **breaks between pages drawn**. The writer types on the paper; the breaks
sit where the layout (step 1) puts them.

How it is drawn is the one genuinely uncertain part of Slice 2:

- The webview still wraps text (ADR-0024). The layout says where a break falls; the view draws a
  break **at that place** as a ProseMirror decoration, never as a change to the document.
- A break between two elements is easy. A break **inside** a wrapped paragraph — a long action
  paragraph that runs across the foot of a sheet — means drawing a gap between two lines of one element.
  A block-level widget placed at the split offset is the likely technique, and it has caret and
  selection edge cases. **The first ticket for this step is a throwaway prototype** (the `/prototype`
  skill) that answers whether it works on WebKitGTK; the fallback is to draw breaks only between
  elements and mark an in-element split with a small rule and accept the one-line drift ADR-0024
  already records ("a page-break marker may sit a line away").
- `(MORE)` and `CHARACTER (CONT'D)` are drawn as decorations at the break. They are not text in the
  document, so **copy, cut, and Select All never include them** and they never reach the file.
- Paper colour, ground colour and break treatment are **named values** in `app/src/style/tokens.css`
  (ADR-0030). No literal in a component; the existing guard test applies.
- The measure stays an integer number of Courier Prime advances (ADR-0024's mitigation) so three
  webviews wrap alike; this slice must not break it.

**Acceptance criteria.**

- The paper is 8.5 × 11 in proportion at every window width (scales, never reflows) and the text sits
  in the geometry table's margins. A test reads the generated geometry CSS (the existing "stale
  stylesheet" guard) and the new paper tokens.
- On *Big Fish* and one other screenplay, **the number of breaks drawn equals `totalPages - 1`**, and
  the first element after each drawn break is the one the layout says begins that page.
- Typing across a break keeps the caret where it was; Backspace at the first line after a break and
  Delete at the last line before one behave as in a plain paragraph. (This is the test that decides
  whether the in-element technique ships.)
- The document model is **byte-identical** after typing across breaks: the round-trip gate (`npm
  test`) still passes, and a test asserts no decoration text reaches `toEditorDocument`/the serialiser.
- Typing does not slow: re-measured keystroke time with breaks drawn, reported in the PR.
- The title page is **not** on the paper (step 4).

**Dependencies.** Step 1 (the layout) for the rule. **Drawing the paper and its page breaks waits for
Noah's Penpot design** (see Q-C, resolved). Nothing in step 1 waits.

**Questions for Noah.**

- **Q-C. The Penpot design. Resolved (Noah, 2026-10-31): the design is a hard blocker for drawing.**
  Step 1 (the page rule — the layout of lines and split points) can start now, and so can the
  title page fields (step 4), Fountain export (step 7) and the name lists (step 8). **Step 2 — drawing
  the paper and its page breaks — waits for Noah's Penpot design**, which will include **one close-up of
  a page break**: the gap or line between sheets, its edges or shadow, where the page number sits, and
  how `(MORE)` and `CONT'D` look. The in-element-break prototype is a drawing question and so waits
  too; the paper's colour and break tokens (ADR-0030) are taken from the design, not chosen here.
- **Q-D. Paper colour.** A white sheet on the dark ground, or the dark theme's own colour? "Real
  screenplay sheet" and "right colour" suggest white or off-white paper. Default: off-white paper on
  the existing dark ground, as the spike did.

## Step 3 — Page numbers on the paper

**Behavior.** The status bar's `Page X of Y` uses the step 1 layout, where X is the page the caret is
on. Page numbers are also **printed on the paper**, so a break shows the next number.

**Acceptance criteria.**

- `Y` equals the number of breaks plus one; `X` is the page of the element under the caret using the
  single "where is this" module (architecture review, section 1), not a private sum in the window
  (Slice 1's page count had exactly that private sum, and the review ranks fixing it first). A
  blank line is not counted as an element.
- With the caret on a drawn `(MORE)` or `CONT'D`, `X` is the page it sits on.
- Moving the caret, typing, and undo update `X` and `Y` together. Status text and the page numbers drawn
  on the paper are produced by one function; a test asserts they agree for every page of *Big Fish*.
- Page 1 begins at the first body element; with a forced leading `===` (as in *Big Fish*'s epigraph)
  the front matter is unnumbered, as the engine does today.

**Dependencies.** Step 1, and the shared position module. Shares a ticket's worth of work with step 2
and may be one ticket.

**Questions for Noah.**

- **Q-E. Where does the number print?** Industry practice: top right as `2.` with **none on page 1**.
  Final Draft does this. Default: same, and a setting is not built.

## Step 4 — Title page fields

**Behavior.** An **Edit Title Page** dialog with one field per title-page key — Title, Credit,
Author(s), Source, Contact, Copyright, Draft date, Notes — saved as Fountain title-page `Key: value`
lines. It follows write-ist-v1's edit-title-page dialog. **The title page never appears on the paper:
the paper starts at page 1, and the title page does not count toward the page count.**
*(Resolved, Noah 2026-10-31: the title page moves off the paper — confirmed.)*

- Opened from a menu item and a keybinding (Escape cancels; one button saves). Saving writes through
  the existing model and the existing save routine; autosave sees it as any other edit.
- Multi-line values (a list of authors, a contact block) are multi-line fields. Fountain's rule — a
  continuation line is indented by exactly one tab (ADR-0020, the title page "exception that proves
  the rule") — is handled by the existing serialiser; the dialog never writes indentation itself.
- **Keys the dialog has no field for are kept.** A title page with `Revision:` or `Tagline:` loses
  nothing: those lines are listed under "Other" and survive a save unchanged (ADR-0020: the writer's
  words are theirs).
- Marks inside a value (the corpus' *Brick & Steel* writes its title `_**BRICK & STEEL**_`) are
  shown **as they are written** in the field and survive unchanged. See Q-F.
- A title page with no fields set writes **no** title-page lines. Opening the dialog and pressing
  Save without changing anything writes **nothing** (no write, not an equal write), as opening and
  closing without typing already does (#41).
- Today's title page rendering on the paper (#62) **is removed from the Editor**. Its measurements are
  not lost: step 5 and 6 render the title page from the same Final Draft placements
  (`TITLE_PAGE_GEOMETRY`).

**Acceptance criteria.**

- Round-trip: for each of the five manuscripts, open dialog → Save unchanged → **byte-identical** file.
  Edit each field in turn → serialised file differs from the source only in that field's lines
  (a diff test, not a byte-count).
- The paper's first element is the first body element: on a script with a title page, `totalPages` is
  unchanged from before the change and no title-page text is in the Editor's DOM.
- Unknown keys, repeated keys, and a continuation-heavy contact block survive.
- Draft date accepts free text (a date picker would invent a format Fountain does not have).
- Undo after Save restores the previous title page in one step.

**Dependencies.** None on 1–3; independent, and **can start now** — it needs no Penpot design (the dialog
is not the paper). Reads ADR-0020, 0021 and `TitlePageField` in `document.ts`.

**Questions for Noah.**

- **Q-F. Marks in fields.** The default above shows `_**BRICK & STEEL**_` literally in the field. The
  alternative is bold/italic buttons in the field. That is more work for something printed centred
  once; default: literal text.
- **Q-G. I have not seen v1's dialog.** It is not in this repository, and the glossary says to reference
  v1 for the "shape and flow of the screens around the editor". If its fields or layout differ from
  the list above, tell the ticket's author which wins. Please also say whether "Author(s)" is one
  multi-line field (my default) or an Author field plus an "add author" button.

## Step 5 — PDF export

**Behavior.** **Export PDF** writes a PDF to a place the writer chooses: the **title page first**, then
the script **exactly as it looks on the paper** — the same breaks, the same lines, `(MORE)` and
`CONT'D` as drawn, the page numbers of step 3 — built from the **step 1 layout**, not from a print of
the webview. ADR-0001 forbids the webview deciding a line break, so "print the window" is not an
option, and the PDF would otherwise be a second engine.

- **Fonts.** Courier Prime, regular/bold/italic/bold-italic, **embedded** (subset) — the bundled files
  already in the app, OFL with no reserved font name (ADR-0001), so embedding is permitted; the ticket
  confirms the licence text travels with the app.
- **Marks.** Bold, italic and underline print as such; small caps, if the model has them, as the model
  says.
- **What is left out:** comments, notes, boneyard, synopses, sections and the title page's markup — the
  same exclusions as pagination (ADR-0018, ADR-0021). **The PDF contains text the `.fountain` does
  not** — `(MORE)` and the break `CONT'D` — which ADR-0024 predicted and a reader should not mistake
  for a bug.
- **The file is outside the bundle**, written wherever the writer chooses, and no copy is kept
  (ADR-0009: export can produce binary files; "no copy of any export is kept"). Writing uses the same
  temp-flush-rename as save, so a failed export never leaves half a PDF under the chosen name.
- **Library.** A small, permissively licensed PDF writer in TypeScript running in the webview, behind
  an interface that takes the layout and returns bytes — so it can move to Rust, as ADR-0024 leaves the
  door open. *I have not evaluated candidates; the ticket's first task is to compare two, and record
  licence, bundle size, and subset-embedding support.* No library may fetch anything at run time.

**Acceptance criteria.**

- The PDF's page count equals `Y` in the status bar **plus one** for the title page, on every
  manuscript of the corpus, and on a script with no title page equals `Y`.
- Text extracted from the PDF, with the title page removed and `(MORE)`/`CONT'D` lines removed,
  **equals the manuscript's printable text** (an automated check, not by eye). The element census of
  the layout is asserted against the PDF's line count.
- Positions: every text run's left edge matches the geometry table's indent for its element type,
  and baselines fall on the 12pt grid — the same measurement method #40 used, reversed. Reported as
  numbers in the PR.
- Courier Prime is embedded and subset; the file opens and shows the right face with no Courier Prime
  installed (checked on the writer's machine, which does not have it).
- Export of the 172 KB corpus manuscript takes a measured time, reported; it runs on a worker or in
  chunks so the window does not freeze (the exact limit is Q-H).
- The writer chooses the location through a save dialog; cancelling writes nothing; an unwritable
  destination shows a failure (ADR-0031: failures are the one thing reported).

**Dependencies.** Steps 1, 3, 4; step 4's title page layout is written once and shared with step 6.

**Questions for Noah.**

- **Q-H. Is a pause during export acceptable?** v1's complaint was typing slowness, not export. Default:
  export may take a second or two behind a "Exporting…" state; typing is unaffected because export reads
  a snapshot of the model.
- **Q-I. The default file name and folder.** Default: the project's name, in the folder last used for
  export, `.pdf`. Say so if you want something else.
- **Q-J. Draft marking.** Studio PDFs usually carry "Draft date" or a header on every page. Default: the
  title page only; no per-page header.

## Step 6 — Title page preview

**Behavior.** **View Title Page** (menu) and a **View** button inside the Edit Title Page dialog show a
read-only preview of the title page. It is **rendered by the same code as the PDF's first page**, never
a second drawing of it: one title-page layout produces a list of positioned text runs, the PDF writer
prints them and the preview draws them.

- From the menu, the preview shows what is saved. From the dialog, it shows **what is typed in the
  dialog now**, saved or not (the point of the button).
- Read-only, closed with Escape. It is a preview of the PDF's first page, not an editor.
- It is drawn at the page size, Final Draft's placement (#62), in Courier Prime.

**Acceptance criteria.**

- The preview and the PDF's page 1 are generated from the **same function call**: a test renders a
  title page both ways and asserts the list of runs (text, position, face) is identical.
- Preview of the dialog's unsaved values does not change the model or mark the document modified.
- Every placement #62 recorded (Title/Credit/Author/Source centred, Notes right-aligned, Copyright and
  Contact at 1.0in, unplaced keys on top of page 1) is asserted in the shared layout.
- An empty title page previews as an empty sheet with a message saying there is nothing to show — not a
  broken drawing.

**Dependencies.** Step 4 (fields). The shared layout module is delivered with step 5 or first in this
step; the dependency order is then 4 → title-page layout → {5, 6}, which `/to-tickets` should cut as its
own ticket so neither blocks the other.

**Questions for Noah.** None beyond Q-G.

## Step 7 — Fountain export

**Behavior.** **Save a Copy as Fountain…** writes the script as a `.fountain` file anywhere the writer
chooses. It is the existing serialiser, a save dialog, and the same temp-flush-rename write — **but
a finished-product export, not a save: comments and the boneyard are stripped, the same as the PDF
(step 5).** This deliberately differs from how Write-ist saves, which keeps both (ADR-0020: the
writer's words are theirs). The file is **outside the bundle**; the project is not re-pointed to it and
the copy is not tracked.

**Acceptance criteria.**

- For every corpus manuscript the exported bytes equal what autosave would write for the same model
  **with every comment and every boneyard block removed** — and nothing else removed or changed (a diff
  test against the manuscript, whose only differences are those spans; the round-trip gate at the
  export boundary). Where nothing is stripped, the bytes equal the manuscript.
- **No comment text and no boneyard text appears in the export**, on a fixture with a comment inside
  dialogue, a comment on a mark boundary, and a boneyard spanning several elements. Stripping leaves no
  stray blank line, doubled space or orphaned markup, and a speech whose lines were all boneyard leaves
  no bare cue. (The census asserts what the export *means*, not only that it parses.)
- Export does not change the model, the manuscript on disk, or the undo history.
- The title page is included; `(MORE)`/page-break `CONT'D` are not (ADR-0024).
- Export on an unsaved, edited project exports the **current state**, not the last saved one, without
  triggering a save as a side effect.
- Cancelling writes nothing. The Tauri capability for writing to an arbitrary folder is granted for
  the save-dialog result only, not a blanket scope. A failure is reported; success is silent
  (ADR-0031).

**Dependencies.** None, and **can start now** — it needs no Penpot design. Cheapest step; a good first
ticket for a quick, visible win.

**Questions for Noah.**

- **Q-K. Do comments and the boneyard travel in the copy? Resolved (Noah, 2026-10-31): no.** The
  Fountain export strips comments **and** the boneyard, exactly as the PDF does. It is a finished-product
  export and deliberately differs from the save format. This agrees with the glossary ("stripped before
  … export"). A faithful copy is simply `manuscript.fountain` in the bundle.

## Step 8 — Character and scene-location lists, derived

**Behavior.** From the element sequence, two lists are derived: **characters** from character cues and
**locations** from scene headings. Nothing is stored for the derivation (ADR-0022): the lists are
recomputed incrementally, never by rescanning the whole manuscript on a keystroke.

- **Who is speaking** comes from the shared rule — the cue reduced to a name, `EDWARD (V.O.)
  (CONT'D)` → `EDWARD`, with `characterName` in `continuations.ts` — **called, not copied**. This is the
  "deferred character-list fix" of the architecture review's section 4. The name list is a *third*
  caller of the same rule beside import and typing, and a test asserts all three get the same name for
  every cue in the corpus.
- **Locations** come from scene headings: the heading with its INT./EXT. prefix (any of ADR-0021's six
  forms), its trailing time-of-day (`- DAY`, `- NIGHT (1987)`, `- CONTINUOUS`) and any scene number
  (`#1#`) set aside. `INT. KITCHEN - DAY` and `EXT. KITCHEN - NIGHT` are both **KITCHEN**.
  *The ticket writes the rule and pins it with the corpus census; two scripts disagree on punctuation,
  so the census is part of the acceptance, not an afterthought* (ADR-0021's "what the gate cannot see").
- **Confirmed.** An entry (a name or a location) is **confirmed** when it has been used **N or more
  times** or has been **explicitly confirmed** by the writer. **N defaults to 3 and is tunable** (a named
  value in preferences, not a literal in code). Names used once or twice stay **unconfirmed**: they are
  in the list, marked as such, and are neither offered by autocomplete (step 9) nor treated as known
  words by spellcheck (step 10).
  - "Used" means one cue element, or one heading, in the manuscript; boneyard material (omitted) is
    skipped unless Q-L says otherwise. An auto-added `(CONT'D)` cue counts as a use like any other.
  - Auto-confirmation is **live**: if a name falls under N because the writer deleted cues, it stops
    being confirmed — unless explicitly confirmed, which stays.
- **Explicit confirmation** is the writer saying "this name or location is right" without waiting for N
  uses. The only gesture in scope: with the caret in a cue or a heading, a menu item/keybinding
  **Confirm this name** / **Confirm this location**. (Managing lists is out of scope; this is the
  minimum that makes "explicitly confirmed" possible at all.)

**Acceptance criteria.**

- A **census** of names and locations on the corpus is pinned: number of distinct names, the number
  confirmed at N = 3, and the number used once or twice, for each of the five manuscripts. The numbers
  are in the PR, measured. Two defects in Slice 1 passed the byte gate while being wrong (a cue read as
  action); this step asserts what the lists *mean*, not that nothing crashed.
- `EDWARD (V.O.) (CONT'D)` is counted as one use of EDWARD, as is `EDWARD`. A dual-dialogue cue's `^` is
  not part of the name.
- A misspelling used once (`EDWRAD`) is in the list, **unconfirmed**, and is not offered anywhere.
- Changing N from 3 to 2 or to 5 changes the confirmed set without touching the manuscript; a test pins
  the change on a small fixture.
- Derivation is incremental; one keystroke's cost is reported, including the measurement, against the
  16 ms budget.
- Nothing is written to the manuscript. Explicit confirmations are written to the names file inside
  the bundle (Q1, resolved).

**Dependencies.** Can start now (no Penpot design needed). The single "where is this" module (architecture review, section 1) and **ranges**
(scene boundaries, needed by step 10's per-scene checking too — so ranges are built here, once). Reads
ADR-0019, 0020, 0021, 0022.

**Questions for Noah.**

- **Q1. Where does "explicitly confirmed" live? Resolved (Noah, 2026-10-31): a simple text file inside
  the project bundle.** Confirmed character and location names are saved there — plain text, project-level,
  never frozen at lock (like the other sidecar files, ADR-0025), so a project that moves or is backed up
  takes its confirmations along. **Noah accepts that this may be revisited later**; the file's format is
  therefore kept trivial (one name per line under a kind) so it can change cheaply. It contradicts "no
  sidecar file" in ADR-0022/0029, so the ticket amends ADR-0022 and ADR-0025's file list, and the
  file is read and written with the existing temp-flush-rename routine. Options rejected: app data
  outside the bundle keyed by project id (confirmations lost when the project is copied), and inline in
  the manuscript (ADR-0022's "machine noise … for no reader").
- **Q-L. Does a name in the boneyard count?** Default: no — cut material is absent from everything
  computed off the manuscript (glossary, *Boneyard*).
- **Q-M. Co-speakers and oddities.** `MARY & JOHN`, `BOY #2`, `EDWARD'S VOICE`. Default: each cue's name is
  exactly what remains after `characterName`; no splitting of `&`. Does that match how you write?

## Step 9 — Autocomplete for character names and scene headings

**Behavior.** While typing a cue or a heading, a suggestion list appears, drawn from the lists of step
8. **Only confirmed entries are offered.**

- **Character cue:** typing `EDW` offers `EDWARD`. Enter/Tab accepts and the existing Enter/Tab
  behaviour (#43) carries on to dialogue; `(CONT'D)` still follows the existing rule (ADR-0026: added
  when the writer moves on, not while the cue is under their hands).
- **Scene heading, piece by piece:**
  1. **INT. / EXT.** (and the combined forms of ADR-0021) — offered at the start of a heading;
  2. **a known location** — a confirmed location from step 8, offered after the prefix;
  3. **time of day** — `DAY`, `NIGHT` and the others, offered after the ` - ` separator.
  Accepting a piece inserts it and the separators, and the caret lands where the next piece begins.
- Escape closes the list. Typing something that matches nothing offered is never blocked; the
  suggestion list simply goes away. An unconfirmed entry is **never** offered, so one typo does not seed
  more typos.
- Suggestions are drawn in the view, not written into the document, and are not undoable steps until
  accepted. Accepting is **one** undo step.

**Acceptance criteria.**

- On a fixture with one name used 5 times and one used twice, `EDW`/the twice-used name's prefix offers
  only the first.
- A heading is completed in three accepted pieces and the resulting element equals the typed form
  (`INT. KITCHEN - DAY`), asserted over the element type and the model, not only the bytes.
- Offering is case-insensitive in what is typed and uppercase in what is inserted (capitals are the
  writer's text and are not styled by CSS: Slice 1's "no `text-transform`" rule stands).
- Per-keystroke cost with the list open is reported with the measurer's cost included; the suggestion
  list is computed from the already-derived lists, not by rescanning.
- Keyboard-only operation: open, move, accept, dismiss.

**Dependencies.** Step 8; Slice 1's Enter/Tab (#43) and `(CONT'D)` maintenance (#44).

**Questions for Noah.**

- **Q-N. Time-of-day list.** Fixed built-in list (`DAY`, `NIGHT`, `DAWN`, `DUSK`, `MORNING`, `EVENING`,
  `CONTINUOUS`, `LATER`, `MOMENTS LATER`, `SAME`) plus any confirmed time seen in the script? Or only
  those seen? Default: built-in list plus confirmed ones from the script. "Only confirmed entries are
  offered" applies to names and locations; times are a vocabulary, not a name.
- **Q-O. Prefix list.** Offer all six forms of ADR-0021 plus `EST.`? Default: `INT.`, `EXT.`,
  `INT./EXT.`, and `I/E.`, the rest typed.

## Step 10 — On-demand spellcheck

**Behavior.** Spellcheck is modelled on NEO (Hugh Howey's MIT-licensed app, v1.6.1), as described in the
brief. **It is off while writing.** A hotkey — **Ctrl/Cmd+;** — toggles a pass. While on, misspelt words
are underlined **on screen only**; the underline is never written to the file, never in the clipboard,
never in the PDF. It is a view decoration, like a drawn page break.

- **Engine.** A Rust spellchecker on the Tauri side, called over IPC. **The preferred engine is
  `spellbook`** (MPL-2.0, Hunspell-compatible, used by Helix); the alternatives are `zspell`,
  `hunspell-sys` and `nspell`. **The webview's built-in spellcheck is not used.** The ticket's first task
  is an evaluation, with numbers: licence of the engine and of each dependency, binary size, time to
  load a dictionary, time to check and to suggest, and Hunspell compatibility on the dictionary files
  we ship. **I could not reach the network while writing this spec, so none of the licence or
  capability claims about these crates, nor NEO, were checked by me; they are the brief's.** The
  evaluation is a gate (it blocks the other tickets of this step), and its output goes in the PR.
- **Dictionaries ship inside the app** (SCOWL-derived Hunspell dictionaries; `en-US`, and `en-GB` — see
  Q-P). **Their licence notices are kept**, shipped with the app and reproduced in an About/licences
  file; a test fails if a shipped dictionary has no notice beside it. Nothing is downloaded.
- **Checking.** Per scene (the range of step 8): the pass checks the scene the caret is in first, then
  the others in turn, off the keystroke path. After the writer pauses, **only the changed scene is
  rechecked** (the pause is a named value, default 1 s). **Checked words are cached**: a word and the
  dictionary/language version → a verdict, so a pass on a screenplay with 25,000 distinct words does
  25,000 lookups at most, and a recheck of one scene does none for words already seen.
- **What is checked.** Everything the writer sees — action, dialogue, parentheticals, transitions,
  centered text, **and the ordinary words inside character cues and scene headings**. (Reverses ADR-0029,
  which skipped cues and headings.)
- **Known words.** The **confirmed** characters and locations of step 8 count as known words, as
  does the writer's custom dictionary. So `EDWARD` is not underlined, and neither is `BENNETT'S`
  in a heading when `BENNETT'S HOSPITAL ROOM` is a confirmed location. A word that is *inside* a name
  or a heading and is an ordinary word — a misspelt `KITCHNE` — is still checked.
- **Near-match to a confirmed name or location.** A word that is **not confirmed** and is within a
  small edit distance of one that is — `MICHEAL` once vs `MICHAEL` 80 times, `KITCHNE` vs `KITCHEN` — is
  flagged with a different message: **"Did you mean MICHAEL?"** and a **one-click fix** that replaces
  the word. The distance is Damerau–Levenshtein ≤ 1 (a transposition is one edit) by default, a named
  value; the confirmed entry must be at least as long as the typo is to avoid flagging short words.
  Ann/Anne: `ANNE` (used twice) would be flagged against `ANN` (used 80 times); the writer's reply is
  step 8's **Confirm this name** on `ANNE`, which makes it confirmed and ends the flag. That *is* the
  "not a typo" mark, so none is built separately (out of scope item 4).
- **Right-click** on an underlined word offers **spelling suggestions** (including the "Did you mean"
  fix) and **Add to dictionary**. Nothing else is added in this slice (out of scope item 2).
- **The custom dictionary and the chosen language persist**, outside every bundle, in the app's
  preferences (ADR-0016: the layer above a bundle holds no work; a word list is not the writer's work,
  and losing it costs re-adding words). A plain text file, one word per line, so it is readable
  without the app (ADR-0003). Whether it is per project instead is Q-Q.
- **Typing must never slow down.** v1's always-on spellcheck did, and that is why it was removed. The
  budget: one keystroke with a pass active stays inside the **same 16 ms** and the Slice 1 figure (0.07
  ms) is **re-measured, including the measurement's own cost**. All checking runs in Rust, in
  batches, across a boundary the keystroke never waits on; the view redraws underlines for a scene in
  one transaction.

**Acceptance criteria.**

- **Off by default**, and a project opened with no keypress has no pass running and no underline in the
  view. Ctrl/Cmd+; on → underlines; again → none; the state is not saved in the file.
- **No change to the manuscript.** Run a pass over each corpus manuscript, save: the file is
  byte-identical, and the model is equal. Copy a selection containing underlined words: the clipboard
  carries no marker.
- **Census of the pass** on the corpus, measured and in the PR: words checked, distinct words, words
  flagged, flagged in action vs dialogue vs cues vs headings, flagged as near-matches. A defect that
  flags every name in the script would otherwise look like success.
- A fixture script asserts all of: a confirmed name is not flagged; the same name used once is flagged;
  `KITCHNE` in a heading is flagged and offers `KITCHEN` as "Did you mean"; `MICHEAL` offers `MICHAEL`
  with the one-click fix replacing the word in one undo step; an invented word added with **Add to
  dictionary** is no longer flagged, in this project and after restart.
- **Rechecking:** after an edit in scene 3, only scene 3 is checked (a spy on the engine proves other
  scenes were not sent); cached words cause zero lookups.
- **Speed**, reported in the PR: time for the first full pass on the 172 KB manuscript; time for a one-scene
  recheck; keystroke time with a pass active, with the measurement's own cost included.
- **Offline**: the app is run with the network disabled and a pass works; there is no request for a
  dictionary, ever.
- **Licences**: the PR lists the licence of the engine, of each transitive dependency, of each
  dictionary, with the SCOWL notice text reproduced as the dictionaries require.
- Works on the writer's machine (Linux, WebKitGTK, no system dictionary package installed — which was
  ADR-0029's open worry and is now moot because the dictionaries are ours).

**Dependencies.** Step 8 (lists, ranges, confirm), the position module, and ADR-0032. Not step 9.

**Questions for Noah.**

- **Q-P. Which languages ship in v1 of this?** Each Hunspell dictionary is roughly 0.5–3 MB (an estimate
  from my knowledge, to be measured by the ticket). Default: `en-US` and `en-GB`; more are adding a
  file and a row of data, not code.
- **Q-Q. Is the custom dictionary one per writer or one per project?** One per writer is simplest and
  matches the old (ADR-0029) behaviour; the cost is that an invented word accepted in one script is
  accepted in all (the same fair trade ADR-0029 made). Default: **one per writer**.
- **Q-R. After toggling on, does the pass stay on** until toggled off — recheck as you edit — or end the
  next time you type? The brief says "off while writing, hotkey toggles a pass" and "recheck after a
  short pause". Default: **stays on until you toggle it off**, underlines for a scene updating after the
  pause; closing and reopening the project starts off.
- **Q-S. Right-click.** A spelling menu we draw ourselves replaces the system's menu on every webview
  (WebKitGTK, WebView2, WKWebView). ADR-0029 avoided replacing it for that reason ("inferred [I], not
  tested"). Slice 2 is Linux first (as Slice 1). Default: **draw our own, Linux first, and treat the
  other two webviews as a follow-up check**. Comments still use a keybinding and a menu item (ADR-0018 as
  amended), not right-click.
- **Q-T. Near-match distance and the "confirmed" side.** Edit distance 1 and a minimum length (e.g. 4)
  are my defaults. A longer distance for long names (`BENNETT'S HOSPITAL ROOM`) catches more and
  flags more. Say if you want it looser.
- **Q-U. Uppercase text.** Cues and headings are all capitals. Spellbook/Hunspell treat all-caps words
  specially (case handling). The ticket tests the dictionary on all-caps words explicitly — a regression
  there flags every heading — and reports the count.
- **Q-V. What about names used once or twice that are *new characters*?** `ZORBLAX`, a brand-new
  character used twice, is unconfirmed, so it is underlined as a misspelling until it is used a third
  time or the writer confirms it (or adds it to the dictionary, which works from the right-click). That
  is the cost of "names used once or twice stay unconfirmed". Is that the intended behaviour?

## Step 11 — A full pass from start to finish

**Behavior.** The acceptance test of the slice: **new script, write, spellcheck, export PDF and
Fountain**, as one pass a person and a script can both run.

**Acceptance criteria.**

- An **automated end-to-end test** drives the whole pass headlessly through the real layers (not mocks of
  them): creates a project; types a 6-scene fixture screenplay with three named characters and two
  locations; edits the title page; confirms the lists derive at N = 3 and that autocomplete offers
  exactly the confirmed ones; runs a spellcheck pass on seeded misspellings, including one
  `MICHEAL`/`KITCHNE` near-match, and applies the one-click fix; exports the PDF and the `.fountain`.
  It then asserts: the `.fountain` equals the manuscript; the PDF's page count is `Y + 1`; its text
  equals the printable text; no `(MORE)`/`CONT'D` text is in the `.fountain`; no underline text is in
  either file.
- The same test runs **with the network unavailable** (`unshare -rn` on Linux), and a static check
  fails on a network request anywhere in `app/` or `src/`.
- A **manual walkthrough**, written as a checklist in the PR, which Noah runs on the real window on the
  writer's machine: write a scene, a full-length page count of the corpus, one deliberate typo, the
  two near-matches, the PDF opened in a viewer with the Courier Prime font absent, and the Fountain
  copy opened in another tool.
- The PR carries the numbers every acceptance criterion above names: page counts, byte counts, census
  of names and locations, the spellcheck census, timings.
- `SETUP-CHECKLIST.md` Phase 5 is updated with "Done: …" for each step, in the shape of the
  existing entries, and `AGENTS.md`'s status line says Slice 2.

**Dependencies.** All of 1–10.

**Questions for Noah.** None; this step is the check on the others.

---

## Order and tickets

Penpot sequencing (Noah, 2026-10-31). **Can start now:** step 1 (the page rule — layout of lines and
split points), step 4 (title page fields), step 7 (Fountain export) and step 8 (the name lists, with the
position module and ranges). **Waits for Noah's Penpot design** (with its close-up of a page break):
**step 2 — drawing the paper and its page breaks** — and with it the drawn part of step 3 (page numbers
on the paper), the in-element-break prototype, and the paper tokens. Step 5 (PDF) needs the layout and
title-page layout, not the drawn paper, but takes its break and page-number look from the same design.
`⏸` marks what waits.

```
1 page rule ──┬─▶ ⏸ 2 paper ──┬─▶ ⏸ 3 page numbers ──┐
              │             └────────────────────┤
              └─────────────────────────────────▶ 5 PDF ◀── title-page layout ◀── 4 title fields
                                                    │                │
                                                    │                └─▶ 6 preview
7 Fountain export (independent)                     │
                                                    │
position module ─▶ ranges ─▶ 8 lists ─▶ 9 autocomplete
                                  └───▶ 10 spellcheck (engine evaluation is its gate)
                                                    ▼
                                           11 full pass
```

Suggested slices for `/to-tickets` (thin, end to end, each demoable):

1. Layout output from the engine (step 1) — can start now. Demo: `layout` on *Big Fish*, numbers in the PR.
2. Fountain export (step 7) — independent, demoable straight away.
3. Edit Title Page and removing the title page from the paper (step 4).
4. Title-page layout shared module + View Title Page (step 6).
5. ⏸ **Waits for the Penpot design.** Paper, breaks and page numbers (steps 2 and 3), preceded by the
   prototype ticket for in-element breaks. Page numbers' *status-bar* half (step 3) needs only step 1
   and may be cut out and start now.
6. PDF export (step 5).
7. Position module, ranges, lists with the census and Confirm (step 8).
8. Autocomplete (step 9).
9. Spellcheck engine evaluation (a gate, no UI), then spellcheck pass, then near-match and right-click.
10. The full pass (step 11).

## Testing decisions

These govern how the tickets are checked (`AGENTS.md`: "the spec's *Testing Decisions* govern").

- **Test what a result means, not that bytes survived.** Every step that derives anything — the
  layout, the lists, the pass — pins a **census** next to the round-trip gate, for the reason
  ADR-0021 records twice.
- **`npm test` stays the acceptance test** for anything touching `src/`. The corpus tests read
  `$WRITE_IST_CORPUS` and skip without it; their numbers go in the PR.
- **Never edit an expected value to match what the code produced.** If the layout disagrees with Final
  Draft's PDF, say which number and why.
- **No network anywhere**, checked statically and dynamically (*The offline rule*).
- **Deep modules at seams the tests call:** the layout, the derived lists, the checker (a port, with a
  real adapter in Rust and a stand-in in tests, as the filesystem has) and the title-page layout. The
  window does no sums.
- **The keystroke budget is re-measured after each step that touches the typing path** (1, 2, 3, 8, 9,
  10), including the measurement's own cost (`docs/STANDARDS.md`).
- **CSS fails silently:** every new stylesheet rule that matters gets a test that reads the generated
  CSS with the browser's parser, as #39 did for spacing.

## Questions for Noah — all in one place

Plain-English, in the order the work needs them. Defaults are what the tickets will do if you say
nothing.

1. ~~**Q1 — where "explicitly confirmed" is stored.**~~ **Resolved:** a simple text file inside the
   project bundle; may be revisited later.
2. **Q-S — right-click.** We draw our own menu. OK on Linux first and check the other two webviews
   later?
3. ~~**Q-C — Penpot design.**~~ **Resolved:** step 1, title page fields, Fountain export and the name
   lists start now; drawing the paper and its page breaks (step 2) waits for Noah's Penpot design,
   including one close-up of a page break.
4. **Q-D — paper colour.** Off-white paper on the dark ground?
5. **Q-E — page number.** Top right as `2.`, none on page 1, like Final Draft?
6. ~~**Q-K — comments and cut material in the `.fountain` copy.**~~ **Resolved:** stripped, as in the
   PDF; a finished-product export that deliberately differs from how Write-ist saves.
   Also resolved: **the title page moves off the paper** (step 4).
7. **Q-R — does the spellcheck pass stay on** until you toggle it off?
8. **Q-V — a new character used once or twice** is underlined until used a third time or confirmed.
   Intended?
9. **Q-Q — custom dictionary:** one for the writer, or one per project?
10. **Q-P — languages:** `en-US` and `en-GB`, or others?
11. **Q-G, Q-F — title page dialog.** I could not see v1's dialog; tell me what differs from the field
    list. Marks shown as typed?
12. **Q-A, Q-B, Q-H, Q-I, Q-J, Q-L, Q-M, Q-N, Q-O, Q-T, Q-U** — smaller; the defaults above stand.
13. **ADR-0032.** Do you accept superseding ADR-0029? It is the one decision in this slice that
    reverses a written one.

Not checked by me, and so to be verified before any ticket relies on it: the licence and
capabilities of `spellbook`, `zspell`, `hunspell-sys`, `nspell`; the licences of the SCOWL-derived
dictionaries; NEO v1.6.1's behaviour; v1's edit-title-page dialog; and the PDF library choice. I had
no network access when writing, and the repository does not hold them.
