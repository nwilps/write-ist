# Write-ist

A fully local, offline writing application. See [`README.md`](README.md) for the shape of the
project and [`docs/PLANNING.md`](docs/PLANNING.md) for the v1 post-mortem. Open questions are
GitHub Issues, never a doc.

**Status: v2, building slice 1 — the first application.** The document model is built and tested:
**bytes on disk ↔ a flat sequence of typed elements**, both surfaces, with marks and comments, in
`src/`. Above it, `src/project/` holds the bundle, the `project.md` marker, import and open. The
application launches — a Tauri window over the system webview, opening on a home screen, with
**Open Project** its own screen, listing projects and importing a screenplay into a new one
(#38, #55). Opening one shows the manuscript in the **Editor**, a ProseMirror workspace the shell
hosts through a manifest, with the round-trip holding through it (#39). **Nothing is typed into
it yet** — no keyboard, no saving, no industry layout, no ranges, no counts, no pagination.

Before proposing work, read `SETUP-CHECKLIST.md` Phase 5 for what is built and what is not. The
round-trip gate is the acceptance test for anything touching `src/`: `npm test`.

## Working a ticket

The work is cut into slices. **Issue #37** is the current slice's spec — the smallest Write-ist a
screenplay can be written in — and **#38–#50** are its tickets, attached to it and ordered by what
blocks what.

### What to read

**Read the ticket, its parent spec, and the decisions they cite — not the whole record.** There are
thirty ADRs, some 2,800 lines of them, and a ticket about keyboard shortcuts has no use for the one
about the ledger. The tickets cite what applies; follow the citations and stop there.

So, before starting:

1. **The ticket.** Its acceptance criteria are what "done" means.
2. **Its parent spec.** The spec's *Testing Decisions* govern how the work is checked.
3. **Every ADR the two of them name**, and no others.
4. **`CONTEXT.md`** — the glossary, for the project's words. Short, and it stops a ticket being
   implemented in the wrong vocabulary.
5. **`docs/STANDARDS.md`** — the rules, each naming the bug that produced it. Also short; read it
   whole.

Everything else — the rest of `docs/adr/`, `docs/PLANNING.md`, `docs/research/`,
`SETUP-CHECKLIST.md` — is reference. Open it when a question sends you there, not before.

### Working

- **Work in this folder, on a branch. Don't make a separate working copy.** One session runs at a
  time here, so a second copy buys nothing and costs a gigabyte and a fresh build of everything —
  builds in this folder are incremental.
- **A ticket starts only when everything in its "Blocked by" is closed.**
- **`npm test` runs everything.** The acceptance corpus is the writer's unpublished screenplay, read
  from `$WRITE_IST_CORPUS`. Its tests skip when it is absent, and **it is never committed.**
- **Assert what a result means, not only that the bytes survived.** Two defects here round-tripped
  perfectly while being wrong — a cue misread as action, and marks that stopped at the wrong place.
  Check the element census, not just the file.
- **Never edit an expected value to match what the code produced.** Say which number disagrees and
  why; one of the two is a bug.
- **Finish the ticket yourself: branch, commit, push, and open the pull request.** Reference the
  ticket so that merging closes it. No one is checking behind you ticket by ticket.
- **The pull request carries the numbers its acceptance criteria name** — byte counts, element
  counts, page counts, timings — measured, not asserted. That is what makes the next person's start
  clean.
- **CI runs the type check and the test suite on every pull request.** The corpus tests skip there,
  because the corpus is not in the repo: run those locally and put their numbers in the pull request
  too. A green CI plus those numbers is the hand-off.

## Start here — for work that proposes or decides

**This list is for deciding, not for implementing.** Writing an ADR, a spec or a ticket, changing
the glossary, or answering "should we…" means reading the whole record, because a decision can
contradict any part of it. Implementing a ticket does not: see *What to read* above.

In this order:

1. **`CONTEXT.md`** — the glossary. Use its terms; don't drift to synonyms it tells you to avoid.
2. **`docs/adr/`** — the decisions, each with its forcing reason. The spine runs
   0003 (local-first) → 0004 (Fountain) → 0010 and 0011 (prose) → 0019 and 0020 (the
   document model, and what the app may change in a writer's file), with 0008 (sidecar
   integrity) explaining why v2 is a rewrite. 0019–0030 are the newest and the most
   load-bearing for implementation.
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
