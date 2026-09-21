# Write-ist v2 — setup & planning checklist

Working order agreed 2026-09-10. Temporary: it was to be deleted once implementation started, and
implementation has started — but Phase 5 is now the only record of what is built and what is not,
so it stays until `/to-tickets` puts that in the tracker, and goes then.

Rule for the whole list: **timebox the setup.** v1 got built while procrastinating on the
screenplay it was for. If workflow adoption stops producing Write-ist artifacts and starts
producing workflow tuning, it has become the new v1.

---

## Phase 0 — Setup

- [x] Install Matt Pocock's skills (25 skills, user scope, `mattpocock-skills@mattpocock` v1.2.3)
- [x] Create fresh `write-ist` git repo, local
- [x] This checklist
- [x] `gh auth login` (as `nwilps`)
- [x] Create the GitHub repo and push `main` — <https://github.com/nwilps/write-ist> (private)
- [x] Restart Claude Code so the plugin skills load
- [x] Run `/setup-matt-pocock-skills` in this repo — tracker = **GitHub Issues** (native dependency
      edges are UI-visible; a dependency graph is a picture of "the whole"). Docs stay in-repo:
      `CONTEXT.md` + `docs/adr/` at root, single-context.

## Phase 1 — See the whole

- [x] **Write `CONTEXT.md`** — the shared glossary. *First pass: 25 terms.* *This is the "I can't see the whole" deliverable.*
      Source it from `docs/PLANNING.md` plus the catalog's 101 load-bearing notes.
      Terms already in play: surface, format, manifest, sidecar, bundle, anchor,
      manuscript, element, workspace, round-trip, project.
- [x] **Convert locked decisions into ADRs** — one record each, with its forcing reason:
    - [x] Fountain is the source of truth — ADR-0004
    - [x] Surfaces vs formats — ADR-0005
    - [x] Formats set defaults, never restrictions — ADR-0006
    - [x] Poetry is a prose format, not a surface — *folded into ADR-0005.* It is a
          consequence of surfaces-vs-formats plus a one-line mechanism, not a separate
          hard-to-reverse decision.
    - [x] Recipes and chord layers cut — ADR-0007
    - [x] Home and Open Project are separate screens — *deliberately not an ADR.* Easy to
          reverse, unsurprising, no real trade-off; it fails all three tests. It stays a
          product decision in the catalog.
    - [x] Two ADRs the checklist didn't anticipate: **ADR-0003** (local-first and readable
          without the app — the values constraint that forces Fountain) and **ADR-0008**
          (sidecar integrity, the six rules the v1 bug forces).
    - [x] **Which desktop platforms are supported** — new; the catalog says answer it
          *before* the editor question. Should take five minutes.

## Phase 2 — Evidence

- [x] **Review the prototypes together** (Plan, Log) — deliberately *after* Phase 1, so
      they're read against a written standard instead of becoming a gravity well.
      Withheld on purpose so the plan wouldn't be reverse-justified from existing code;
      that risk drops once the decisions are written down and dated.
      → `docs/reviews/2026-09-11-prototype-review.md`, against `nwilps/write-ist-ng@3812312`.
      Two Phase 4 questions come back answered (in-band scene ids; buffer-first vs
      model-first), and §5 of the review lists four holes it opened in the ADRs.

## Phase 3 — The blocker

- [x] **`/grill-with-docs` on the document model** — typed elements over Fountain and
      Pandoc Markdown. **Done 2026-09-14.**

      **Landed:** ADR-0019 (model-first, flat typed elements, marks as a set) · ADR-0020
      (what Write-ist may change in a writer's file — the round-trip contract) · ADR-0021
      (the screenplay surface implements all of Fountain) · ADR-0022 (scene metadata is
      derived or inline; v2 writes no scene ids) · ADR-0023 (the prose surface's vocabulary
      and syntax) · ADR-0024 (the engine owns the count; the webview draws) · ADR-0025 (what
      a bundle holds on disk). Amended in place: ADR-0001, ADR-0004, ADR-0008. Evidence in
      `docs/research/scene-metadata-in-other-tools.md` and `docs/research/wrap-divergence.md`.

      **The buffer-first vs model-first question is closed** — model-first, ADR-0019, decided
      with the spike's GO verdict, ADR-0001's reflow trap and ADR-0018's never-show-syntax
      requirement all in hand, as this list intended.

      `CONTEXT.md` gained **Mark**, **Synopsis**, **Tag**, **Boneyard**, **Passthrough** and
      **Element identity**, sharpened **Round-trip**, **Anchor**, **Element** and **Page**,
      and **renamed the draft `Line` to `Chain`** — pagination needs the word "line" for a
      line of text, and one word could not carry both.

      Issue #9 closed as no longer applicable (no scene ids means no ids-present corpus to
      pin). Issue #10 opened: the prose surface has no corpus, no fixture and no round-trip
      gate — the largest untested claim in the design.

## Phase 4 — Chart the rest

- [x] **`/wayfinder`** over the remaining open questions — charted 2026-09-12 as
      [**What v2 writes to disk on day one**](https://github.com/nwilps/write-ist/issues/1),
      destination *"Phase 3 can start without stopping to decide something."*
      **Closed 2026-09-14**, seven tickets for seven decisions: what freezes at a lock
      (ADR-0014), project identity (ADR-0015), the layer above a bundle (ADR-0016), the ledger
      (ADR-0017), comments (ADR-0018), the default bundle location, and the research that
      unblocked two of them. `CONTEXT.md` gained **Comment**, **Project id**, **Registry** and
      **Ledger**. What is left on the map is fog that Phase 3 *produces* rather than needs:
      the sidecar's file formats, and retention for locked drafts.

      **The map is the only home for open questions.** This list does not restate them —
      that is how `PLANNING.md` became a second store. Two of the originally listed items were
      answered by the Phase 2 fold and are closed here; live pagination and three others are
      recorded on the map as out of scope, each with its reason.
    - [x] The sidecar anchoring scheme (ids in Fountain `[[ ]]` notes?) — **answered.**
          ADR-0008 rule 1 now records the mechanism as confirmed rather than likely.
    - [x] Whether log tasks/notes link to scenes — **answered: they don't,** and neither does
          Plan. ADR-0013.
- [x] **`/prototype` the buffer-first vs model-first spike.** Run, in `write-ist-ng`, against
      the acceptance test this list named: **lossless Fountain round-trip of the 170 KB
      manuscript.** A model-first prototype met it. Evidence in
      `docs/research/editor-shape-spike.md`; the *decision* waits for Phase 3, which decides
      with it in hand.

## Phase 5 — Build

### Done: the document model's read and write layer

Built against `~/round-trip-test-guide.md`, Phases A–F, and merged 2026-09-18. **One layer:
bytes on disk ↔ a flat sequence of typed elements**, both surfaces, in `src/`.

- The whole of Fountain's element vocabulary (ADR-0021), the boneyard as a range, the title page
  as fields, `(CONT'D)` maintained (ADR-0026).
- The prose vocabulary of ADR-0023, paragraphs holding their own line wraps.
- Marks as a set, read across elements and stored inside one (ADR-0027).
- The nine enumerated normalisations of ADR-0020, applied at import and reported, each counted
  per occurrence changed (#27).
- Comments (ADR-0018): held once on the document, with an id, a remark and two ends, and removed
  from element text so nothing reading text sees them.
- A file in any encoding opens with every character kept, and nothing refuses to open (#33).
- The gate: bytes at both ends, real files compared on disk. Five manuscripts, 346 tests.
  The acceptance corpus is read from `$WRITE_IST_CORPUS` and its tests skip when it is absent;
  it is not in the repo and must not enter it.

Two defects the byte gate could not see were found by measuring the element census
independently and are fixed: a cue recognised without its blank line (#23), and marks that
stopped at the element boundary (#26).

### Not done, and belonging to the editor rather than to this layer

- [ ] **Ranges** — scenes and chapters computed from the flat sequence (ADR-0019). No code yet.
- [x] **Element identity** — the in-memory handle the editor redraws against (ADR-0019). It is a
      ProseMirror node: a persistent value, created on load, dead when the project closes, never
      written to a file (#39). Comment ends were still element *indices*, which nothing moved
      while nothing edited; **#41 moves them**, holding each end as a document position for as
      long as the project is open and rebuilding the indices after every change. The check in
      `fromEditorDocument` stays, as the guard it always was.

### Decided before `/to-tickets`, 2026-09-19

The four steps agreed as the way into Phase 5 are done: the code merged and the status corrected
(#29, #30); the import report fixed (#27); comments modelled (#35); and autosave and spellcheck
decided — **ADR-0028** and **ADR-0029**, closing #11 and #12.

### Done: the application launches, and a screenplay can be brought into it (#38, #55)

A Tauri shell over the system webview, Linux/WebKitGTK (ADR-0001, ADR-0024), opening on the home
screen, with **Open Project** its own screen — the shape Phase 1 recorded above, restored by #55
after #38 built the single screen an earlier draft of #37 described. `src/project/` holds the
layer above the document model: the bundle on disk (ADR-0025), the `project.md` marker with its
format version and minted project id (ADR-0004, ADR-0015), **import** into the default location
(ADR-0016, ADR-0028), and the import report in the writer's words (ADR-0020).

- Everything is above a four-method `Filesystem` port, so the disk tests use real files in a
  temporary folder and the application uses Tauri's plugin. No logic lives in the window.
- The look is data (ADR-0030): one set of values in `app/src/style/tokens.css`, JetBrainsMono
  Nerd Font bundled, and a test that fails on a styling literal in any component.
- Shape and flow of both screens follow v1's `HomeScreen` and `OpenProjectScreen`: a centred
  composition, a column of gestures each with its letter, Escape to leave. v1's editor is not a
  reference for anything.
- 443 tests with the acceptance corpus present, 9 of them new in #55 — the letter beside each
  gesture, which is the part of a screen decidable without a window.

### Done: the screenplay is displayed, in an Editor the shell hosts (#39)

Opening a project from the list shows its manuscript. The **Editor** is a workspace declared
through a manifest and hosted by the **shell**, which knows nothing about what it hosts
(ADR-0005) — a rule with a test that fails on it, over `app/src/shell/`: no `"screenplay"`, no
element type by name, no import from a surface. It is the only workspace; the workspace bar is
not built.

- The editing engine is **ProseMirror** (ADR-0024), its document mapped from the existing model
  and back to it (`src/screenplay/schema.ts`, `src/screenplay/editor.ts`). Nothing in `src/`
  touches a DOM: the schema's `toDOM` returns specifications, which are data.
- **The round-trip holds through the editor.** All four screenplay manuscripts come back byte
  for byte — 2,901 / 146,097 / 147,139 / 172,451 — *and* as the same model, asserted whole
  rather than only as bytes, because ADR-0021 records twice that the byte gate cannot see a
  misread element.
- Every one of ADR-0021's fourteen element types is displayed, each carrying its type in the
  page as `data-element`, which is what spellcheck keys on next slice (ADR-0029). Marks are
  `em`, `strong` and `u`; no delimiter is drawn. The title page is at the top, cut material is
  struck through, dual dialogue is stacked with its flag intact, and the five comments survive
  invisibly.
- The page follows the **spike** and the furniture the **prototype**; the page's spacing mirrors
  the serialiser's blank-line table, checked over all 196 ordered pairs of element types with
  the browser's own CSS parser, because CSS fails silently.
- Typing was off (`editable: () => false`) until #41 gave a keystroke somewhere to go; it is on.

### Done: the screenplay is laid out in industry format (#40)

**Courier Prime is bundled**, four weights, 304 KB, OFL with no reserved font name — so the page
is set in the face its pagination is defined against rather than in whatever fontconfig answers
with (ADR-0001, ADR-0030). The writer's machine has no Courier Prime and was answering with
Liberation Sans, a proportional face.

- **The geometry is one table**, `src/screenplay/geometry.ts`: the sheet, the type on it, and
  every element type's indent and measure in characters, each with its provenance beside it. The
  page reads it through `app/src/style/geometry.css`, which is *generated* from it and which a
  test fails on if it is stale; the page count (#48) reads the table directly. Two tables would
  let what the writer sees and what gets counted drift silently.
- **The numbers are measured from Final Draft's PDF of *Big Fish***, not from the spec and not
  from the reference stylesheet: all 122 pages decompressed and every text run's `Tm` matrix
  read, so the values are Final Draft's own pen positions rather than an extractor's guess at an
  ink box. Where the spike disagrees, the PDF wins and the disagreement is recorded beside the
  value — dialogue is 39 characters wide, not the spike's 35, and the leading is 12pt, not 1.4.
- **Action wraps at 61 characters where the margins imply 60.** Final Draft lays its own text out
  at about 7.0pt a character rather than Courier's 7.2, so 61 fit inside its 7.5in right margin.
  Write-ist matches the character count, because that is what moves a page break; the cost is a
  0.9in right margin rather than 1.0in, written down in the table.
- Measures are emitted as CSS `ch`, which *is* the advance width — ADR-0024's mitigation for the
  one risk its wrap measurement did not cover, at the one CSS rule it said it would cost.
- **No `text-transform` and no CSS-decided spacing**, the ticket's two named traps: capitals are
  in the writer's text or they are not there, and the serialiser's table decides blank lines.

### Done: the writer types, and it saves itself (#41)

The page is editable and Write-ist saves without being asked: a couple of seconds after typing
stops, when the window loses focus, and when the project is closed (ADR-0028). Close it, reopen
it, and the words are there.

- **One save routine**, `src/project/save.ts`, and autosave is only a clock over it
  (`src/project/autosave.ts`, a clock a test can be rather than wait for). Four things call it: the
  pause after typing, switching to another application, closing the project, and **Ctrl/Cmd+S**.
  It writes through the **existing serialiser** and nothing else.
- **Temp, flush, rename** (ADR-0008 rule 5), and the middle word needed the shell's first command:
  `@tauri-apps/plugin-fs` writes and renames but exposes no flush, so `commit_write` in
  `src-tauri/src/lib.rs` flushes the temporary file, renames it, and flushes the directory the
  rename is an entry in. The bytes do not cross that boundary. The test port does the same three
  steps with `node:fs`, because a test port that flushed less would be testing a weaker promise
  than the one that ships.
- **Switching away is asked of Tauri, not of the DOM.** `window`'s own `blur` is what a web page
  has; whether the system webview fires it when the *window* loses focus is the webview's business
  rather than a promise, and a leg of autosave that quietly never fires is the failure
  `docs/STANDARDS.md` is written against. The window's close button is the same gesture as **Quit**,
  so a writer who closes from the titlebar has closed the project.
- **The Editor will not come down over a save it could not finish.** Its `unmount` answers whether
  it came down; on a failed last save it says so beside the page and stays up, because the words
  are on screen and nowhere else and destroying the view would destroy them. Closing a project is
  awaited for the same reason: closing and immediately reopening must not read the file while the
  save that closing asked for is still in flight.
- **A manuscript that could not be read is never written over** as a *type* rather than a check:
  a session is made from an `OpenedProject`, and a failed read produces none (ADR-0008 rule 3).
- **Opening a project and closing it without typing writes nothing at all** — not equal bytes, no
  write, so nothing watching the file for an outside change (#42) sees one that never happened.
- **Comments move with the words they were left on.** Held as document positions while the
  project is open and mapped through every transaction, so the cost is the number of comments and
  not the length of the manuscript (ADR-0018, ADR-0019). Deleting everything a comment covers
  removes it with the text.
- **A blank line the writer makes is not written to the file.** ADR-0019: blank lines are not
  stored. Deleting every character of a line leaves an empty element on screen, and writing it
  out as a blank line would give a file that does not read back as itself — ADR-0020 point 2. All
  four screenplay manuscripts hold no element with empty text, which is what makes the rule safe,
  and a test pins that.
- **The keystroke budget: 0.07 ms** on the full acceptance corpus, measured including the
  measurement's own cost, against a 16 ms budget — and 0.04 ms on `Big-Fish-augmented.fountain`,
  which is the manuscript with comments in it, because the corpus has none. Everything the
  application does per keystroke is in that figure and is the real call rather than a stand-in;
  drawing the result is `prosemirror-view`'s and the webview's, which ADR-0024 puts on the other
  side of the line and #37's fourth seam gives to the writer. Turning the model back into bytes
  costs 11–14 ms on the corpus and is deliberately off that path: once per save, seconds after
  the writer stopped typing.
- **Enter and the two joining keys do nothing yet, deliberately** (#43). With no handler they fall
  through to the browser, which splits a `div` and leaves the engine reading back an element with
  no type. Inert is a missing feature; invented is a corrupted manuscript.
- 563 tests with the acceptance corpus present.

### Not started, and deliberately above this layer

Counts and pagination (ADR-0024), the rest of the keyboard (#43–#47), guarding against a change
made elsewhere (#42), drafts and locking (ADR-0002, ADR-0014), the ledger and registry (ADR-0017,
and the registry half of ADR-0015/0016), and the rest of the application — workspace bar, the
other workspaces.

### Still to run

- [ ] `/to-tickets` — tracer-bullet slices with blocking edges
- [ ] `/implement` — drives `/tdd` at pre-agreed seams, closes with `/code-review`

Open questions live in GitHub Issues and nowhere else. The one left is #15, leading whitespace,
deferred with a working default: preserve it.

---

## Not doing (yet)

- **Ralph loop / AFK agents.** Built for grinding through well-specified tickets. The
  current goal is understanding the whole yourself; an unattended loop defeats that.
- **Migrating the feature catalog.** It works, it's edited between sessions, and it
  becomes an *input* to `CONTEXT.md` — not a casualty of it.

  **But it has a sunset.** Decided 2026-09-10: as implementation approaches, the repo
  becomes the single source of truth. The catalog is scaffolding for *deciding*, not a
  system of record to maintain in parallel — a second store that drifts is exactly the
  staleness problem the anchor rules exist to prevent. Once its load-bearing content has
  landed in `CONTEXT.md`, the ADRs, and the tracker, retire it rather than syncing it.
