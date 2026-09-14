# Write-ist v2 — setup & planning checklist

Working order agreed 2026-09-10. Temporary: delete this once implementation starts.

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

- [ ] `/to-tickets` — tracer-bullet slices with blocking edges
- [ ] `/implement` — drives `/tdd` at pre-agreed seams, closes with `/code-review`

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
