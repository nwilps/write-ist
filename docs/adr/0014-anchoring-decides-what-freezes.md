# Anchoring decides what freezes when a draft locks

ADR-0002 said a lock freezes the draft's manuscript and sidecar together. That was too broad.
**What freezes is the manuscript, plus the sidecar content anchored into it. Sidecar content
that anchors to nothing is project-level: there is one of it per project, it never freezes,
and it carries on across every lock.**

The forcing reason is ADR-0008 rule 1, read together with `CONTEXT.md`'s **Anchor**: *anchors
are scoped to a draft — the same anchor in two drafts refers to two different places.* So
anchored content is only meaningful against the manuscript it points into, and it has to
freeze with it or it is describing text that has moved. Content that points at nothing cannot
break, so freezing it buys no integrity and costs a full copy on every lock — which is
ADR-0009's argument, turned on the sidecar itself.

The split as it stands:

| Freezes with the draft | Project-level, never freezes |
|---|---|
| The manuscript | Plan cards — **one Plan per project** |
| Comments (they anchor to a place in the text) | Log entries — one Log per project |
| Anything else written into the manuscript, such as scene and chapter ids | Notes — they anchor to nothing |
| | Project metadata |

## Considered options

- **Freeze everything, for the archival record.** ADR-0002 calls locking "permanent and
  archival", which argues a locked draft should be a complete picture of the work at that
  moment — including the plan you were working to. Rejected, and the loss is real: you can
  never look back at what draft 2's structure was. There is precedent for accepting that loss.
  ADR-0009 already declined to keep export records on almost the same reasoning — notes on a
  draft "rarely depend on page numbers staying put, and some drift is part of revising
  anyway."
- **Case by case, each workspace declaring whether it freezes.** Rejected: it is a rule the
  shell would have to know, and it makes "does this freeze?" unanswerable without opening the
  manifest. One criterion that reads off a property the data already has is better than a flag
  someone has to remember to set.

## Consequences

- **Locking copies backward, not forward.** The in-progress draft is continuous and never
  stops; locking takes an archival copy *behind* the writer and stamps it with a number. So
  freezing always means *copying aside*, never *sealing in place*, and nothing the writer is
  currently touching becomes read-only under them. This is also what "work continues into a
  new draft" (ADR-0002) means mechanically.
- **One Plan and one Log for the life of the project.** Lock draft 2, start draft 3, and the
  cards are where you left them. The Log was never going to survive being cut into per-draft
  pieces — it is a record of days, not of text — and Plan follows the same rule rather than
  needing an exception.
- **Notes anchor to nothing.** This is the v1 evidence applied rather than re-derived: the
  anchored feature (highlights) died and `notes.md`, which anchored to nothing, survived the
  same bug. Work markers that look like anchored notes belong inline in the manuscript, as
  ADR-0008 already directs.
- **A draft's own bookkeeping lives in a project-level index**, not beside the frozen draft —
  its number, its lock date, whether a revision or a new draft follows. It is presentation:
  it shapes how the draft tree is drawn and a stranger reading the screenplay needs none of
  it. `CONTEXT.md`'s **Line** already required this, saying membership is "computed from where
  work is happening now, never stored on a draft".
  - **The guard that makes this safe:** a locked draft is stored under its own name, so its
    identity is self-evident and the index holds only presentation. Losing or corrupting the
    index costs lock dates, never the ability to tell which draft is which — and ADR-0002's
    "locked drafts are immutable on disk, which is what makes locking trustworthy" stays true,
    because the trustworthy part never depended on a mutable file. A draft's lineage needs no
    storing at all: `2a` already says it departs from 2, by ADR-0002's own naming rule.
  - **The index is a record, not a cache**, so ADR-0008 rule 3 applies to it in full. A failed
    read must never authorise a write. `docs/research/project-identity-and-cross-project-state.md`
    documents a careful codebase making exactly this mistake in exactly this class of file.
- **ADR-0009's lock-copying argument narrows but survives.** Its case against binary files was
  that locking copies the whole sidecar, so a mood board is copied once per lock. Far less is
  copied now — but comments are copied per lock, and the rule holds for anything that anchors.
- **Comments are the sidecar's one anchored member, and they are the riskiest thing in the
  app.** Margin comments tied to a place in the text are the same feature class as v1's
  highlights: 5,784 records against 5,788 lines, 532 KB describing nothing, abandoned rather
  than debugged. They must be designed against ADR-0008 rule 1 from the first line. How they
  are stored, and what a lock does to the live ones, is not decided here.
