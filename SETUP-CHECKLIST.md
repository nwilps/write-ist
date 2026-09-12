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

- [ ] **Review the prototypes together** (Plan, Log) — deliberately *after* Phase 1, so
      they're read against a written standard instead of becoming a gravity well.
      Withheld on purpose so the plan wouldn't be reverse-justified from existing code;
      that risk drops once the decisions are written down and dated.

## Phase 3 — The blocker

- [ ] **`/grill-with-docs` on the document model** — typed elements over Fountain and
      Pandoc Markdown.
      The agreed next step and the thing everything else waits on.
      Updates `CONTEXT.md` and ADRs as it goes, so output lands somewhere durable.

## Phase 4 — Chart the rest

- [ ] **`/wayfinder`** over the remaining open questions → decision tickets, resolved in order:
    - [ ] Live pagination matching the PDF
    - [ ] The sidecar anchoring scheme (ids in Fountain `[[ ]]` notes?)
    - [ ] Whether log tasks/notes link to scenes — *current recommendation: don't*
- [ ] **`/prototype` the buffer-first vs model-first spike.**
      Not an argue-it-out question. Acceptance test is already written:
      **lossless Fountain round-trip of the 170 KB manuscript.**

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
