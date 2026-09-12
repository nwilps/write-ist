# The planning workspaces do not refer to the manuscript

Neither Plan nor the Log holds a reference to anything in the manuscript. A plan card names
no scene, no chapter and no page; a log entry records no scene it was captured against. The
two workspaces refer to nothing outside themselves.

This follows from ADR-0008. A stored reference from the sidecar to a place in the manuscript
is an **anchor**, and an anchor must exist on both sides or be derivable from content. So
there are only two ways to build one, and both are bad here. Make it a real anchor, and every
card and every task demands an id written into the manuscript — two planning surfaces putting
pressure on the authored text for a convenience neither needs. Make it a not-quite-anchor, an
id the sidecar holds alone, and it is v1's `lineId` with better manners: it resolves until the
scene moves, and then it fails silently.

The prototype settled it as evidence rather than argument. The Log carried a reference field
through its whole build; it earned nothing, and it is gone.

## Considered options

- **An inert breadcrumb** — the reference kept as plain text that nothing ever resolves,
  recording where a thought was captured without claiming to point at it. Rejected, and it is
  the option worth explaining, because it is the one a reasonable person will propose. A field
  that looks like a link invites a picker; a picker invites choosing from real scenes; and
  choosing from real scenes invites storing which one was chosen. The halfway house has no
  stable resting place — it is one convenience request away from the thing it was designed to
  avoid. The prototype's own planning notes reached exactly that point, listing a picker that
  "must draw from actual Draft scenes and Plan cards" as the next step.
- **Real in-band anchors for cards and tasks**, on the mechanism ADR-0008 confirms for scenes.
  Technically legal and rejected on scope: it buys backlinks, which is not a problem anyone
  writing a screenplay in this app has reported having.

## Consequences

- **This constrains the app, not the writer.** Nothing stops a writer typing "fix the car in
  scene 40" into a task. Their words are their own; what is refused is a structured field the
  app maintains and promises to keep true.
- **There is no reference picker**, in either workspace, ever.
- **Retrieval is search and the timeline**, not backlinks. Nobody finds a note by remembering
  which scene they were looking at when they wrote it.
- **A global capture surface, if one is ever built, captures one field and no provenance.**
  The provenance half of that design is withdrawn by this decision.
- **Plan and the Log cannot drift, because they hold nothing that could.** This is the same
  property that let v1's `notes.md` survive the bug that emptied every highlight — it anchored
  to nothing. ADR-0008 treats that as the lucky case; here it is the designed one.
- Plan's independence is already part of what a plan card *is* in `CONTEXT.md`. This ADR is
  where its reason lives, and it extends the same rule to the Log.
