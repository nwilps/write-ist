# Write-ist

A fully local, offline writing application. See [`README.md`](README.md) for the shape of the
project and [`docs/PLANNING.md`](docs/PLANNING.md) for the v1 post-mortem. Open questions are
GitHub Issues, never a doc.

**Status: v2, pre-implementation.** No application code yet.

## Start here

Read these before proposing anything, in this order:

1. **`CONTEXT.md`** — the glossary. Use its terms; don't drift to synonyms it tells you to avoid.
2. **`docs/adr/`** — the decisions, each with its forcing reason. The spine runs
   0003 (local-first) → 0004 (Fountain) → 0010 and 0011 (prose), with 0008 (sidecar
   integrity) explaining why v2 is a rewrite.
3. **`docs/STANDARDS.md`** — the rules, which are not decisions. Each one names the bug that
   produced it. Short; read it whole.
4. **`SETUP-CHECKLIST.md`** — where the work has got to, and the rule that the setup is
   timeboxed.
5. **`docs/PLANNING.md`** — the v1 post-mortem, and how to read the feature catalog.
6. **`docs/research/`** — the evidence behind ADR-0010 and ADR-0011, and the editor-shape
   spike that Phase 3 decides with.

The live feature catalog is a published Artifact (URL and access in `PLANNING.md`). Always
read the store, never a copy of it. It is scaffolding for deciding, and it is being retired
as the repo takes over — so extract from it, never add to it.

## Agent skills

### Issue tracker

GitHub Issues on `nwilps/write-ist`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
