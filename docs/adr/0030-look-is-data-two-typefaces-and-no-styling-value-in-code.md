# Look is data: two typefaces, and no styling value written in code

**Every styling value — colour, typeface, size, weight, spacing, radius — is a named value held in
one place, and never a literal sitting in a component.** And the application wears two typefaces,
with a line between them:

| Where | Typeface |
|---|---|
| The screenplay manuscript, in the Editor | **Courier Prime** at 12pt, bundled ([ADR-0001](0001-desktop-platforms-and-pagination-font.md)) |
| The prose manuscript | **Courier Prime** for now, and the one place a writer may later choose from a short list |
| Everything else in the application | **JetBrainsMono Nerd Font** |

Decided 2026-09-19.

## The forcing reason

**Themes are coming, and the writer expects to change most of this.** Neither is speculation: themes
are on the feature catalog for v2, and the writer said in as many words that he will have a lot of
opinions and will want to change most things once he can see it.

A colour written into a component is a colour you have to go and find. Thirteen tickets' worth of
components, each with its own literals, is a hunt every time an opinion arrives — and a guarantee
that the fifth screen drifts from the first four. Held as named values, a theme is a set of values
rather than a code path, and an opinion costs one edit.

This is the same instinct [ADR-0005](0005-surfaces-are-engines-formats-are-manifests.md) applies to
formats — *"a manifest is data, never a branch in code"* — pointed at the look instead of at the
type system.

## Why the typefaces divide where they do

**ADR-0001 already fixes Courier Prime for the screenplay**, because pagination is defined against
its metrics and a different face moves a page break. It also already says font choice is *"a
prose-surface affordance, not a universal one"*, which is exactly where a writer's choice of face
may later live. Both halves of the row above are therefore ADR-0001's, restated so the scope is
unmistakable.

**What ADR-0001 never said is what the rest of the application wears**, and the answer is not
"Courier Prime as well". Courier Prime is a screenplay's face; it is the manuscript, not the
furniture. The rest of the application is JetBrainsMono Nerd Font.

**This is a deliberate departure from the styling reference.** The spike
(`nwilps/write-ist-ng`, `spike/src/style.css`) sets Courier Prime on `body` and lets everything
inherit it — its HUD, its help bar, all of it. The palette and the feel of that spike are the
reference for v2; **its typeface is not**, outside the manuscript itself.

## Measured, 2026-09-19

- **JetBrainsMono Nerd Font 3.5.1**, licensed **OFL-1.1-no-RFN** — the same Open Font Licence family
  as Courier Prime, so redistribution is unencumbered, which is the test ADR-0001 applied.
- **Four weights — regular, bold, italic, bold italic — measure 9.82 MiB.** That is an order more
  than ADR-0001's "a few hundred KB" for Courier Prime, because a Nerd Font build carries thousands
  of icon glyphs.
- **The writer's own machine has JetBrainsMono Nerd Font installed and does not have Courier Prime.**
  Which is the argument for bundling both rather than resolving either from the system: the machine
  the screenplay is being written on cannot render it correctly without the bundle.

## Considered options

- **One typeface everywhere, as the spike has it.** Rejected by the writer: Courier Prime is the
  manuscript's face, not the application's.
- **Resolve the interface font from the system.** Rejected: the same font would then be present on
  the writer's machine and absent on someone else's, so the application would look like two
  different applications. ADR-0001's reasoning about Courier Prime applies with less force — nothing
  about the interface moves a page break — but the conclusion is the same and costs nothing extra to
  hold.
- **Ship unpatched JetBrains Mono instead of the Nerd Font build**, at roughly a twelfth of the size.
  Not taken, because the Nerd Font build is what was asked for and its icon glyphs may be wanted in
  the interface. Recorded because it is the obvious lever if the interface turns out to use no icon
  glyphs: the text is identical, and it saves about 9 MB.

## Consequences

- **A theme is data.** The spike's palette becomes the first set of values rather than the only one,
  and light and dark stop being a code branch before they are ever built.
- **No component holds a styling literal** — not a hex colour, not a pixel size, not a font name.
  This is checkable, and cheap to check.
- **The screenplay manuscript's face is not themeable.** A writer may change colours around it, and
  the face stays Courier Prime, because ADR-0001's page count depends on it. The prose surface is
  where a face may be chosen.
- **Both faces are bundled**, and both are OFL.
- **The writer's later opinions are the point.** This ADR exists so that the styling conversation
  that has not happened yet costs a set of values when it does, rather than thirteen tickets' worth
  of edits.
