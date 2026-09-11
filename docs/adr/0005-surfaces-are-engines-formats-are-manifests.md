# Surfaces are engines, formats are manifests

A **surface** is an editing engine: one element vocabulary, one set of layout rules.
Surfaces are expensive and deliberately few — screenplay and prose. A **format** is what the
user picks at New Project: a label naming a surface, plus defaults. Formats are data.

Adding a format is a config entry. Adding a surface is real work. Keeping the two apart is
what makes the format list — feature, TV, novel, novella, short story, essay, article —
cheap enough to be generous with.

## Consequences

- **The element vocabulary belongs to the surface, never the format.** One element set per
  surface, no per-format lists to plumb through the editor.
- **Poetry is a prose format, not a surface.** If the prose surface preserves authored line
  breaks, poetry costs a flag rather than an engine. Song lyrics ride poetry — viable only
  because chord layers are out (ADR-0007).
- **Workspaces use the same shape.** The shell hosts them through a uniform registry; each
  declares itself — its name, its place in the workspace bar, which formats show it by
  default — and the shell hosts it without knowing what it is. This matters more than it
  first appears: the set of workspaces is deliberately open, and new ones will keep being
  invented after v2 ships. Get this right and a new workspace is a manifest; get it wrong
  and every workspace is surgery in the shell.
- **Changing format within a surface is free** (short story to novel: a label and config
  swap). **Changing surface after creation is refused** — prose to screenplay is a real
  document conversion, and refusing it outright is a legitimate answer.
- **User-defined formats become nearly free** once formats are data. User-defined *surfaces*
  are not on the table and should never be.
- Stage play is deferred rather than cheap: it looks adjacent to screenplay and is not.
  Different element vocabulary, different pagination, and Fountain does not cover it — so it
  needs a third engine, not a manifest.
