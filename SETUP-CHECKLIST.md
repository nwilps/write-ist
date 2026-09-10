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
- [ ] Restart Claude Code so the plugin skills load
- [ ] Run `/setup-matt-pocock-skills` in this repo — tracker = **local files**, not GitHub Issues

## Phase 1 — See the whole

- [ ] **Write `CONTEXT.md`** — the shared glossary. *This is the "I can't see the whole" deliverable.*
      Source it from `docs/PLANNING.md` plus the catalog's 101 load-bearing notes.
      Terms already in play: surface, format, manifest, sidecar, bundle, anchor,
      manuscript, element, workspace, round-trip, project.
- [ ] **Convert locked decisions into ADRs** — one record each, with its forcing reason:
    - [ ] Fountain is the source of truth
    - [ ] Surfaces vs formats
    - [ ] Formats set defaults, never restrictions
    - [ ] Poetry is a prose format, not a surface
    - [ ] Recipes and chord layers cut
    - [ ] Home and Open Project are separate screens
    - [ ] **Which desktop platforms are supported** — new; the catalog says answer it
          *before* the editor question. Should take five minutes.

## Phase 2 — Evidence

- [ ] **Review the prototypes together** (Plan, Log) — deliberately *after* Phase 1, so
      they're read against a written standard instead of becoming a gravity well.
      Withheld on purpose so the plan wouldn't be reverse-justified from existing code;
      that risk drops once the decisions are written down and dated.

## Phase 3 — The blocker

- [ ] **`/grill-with-docs` on the document model** — typed elements over Fountain.
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
