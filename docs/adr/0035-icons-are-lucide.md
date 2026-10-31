# Icons are Lucide

**The application's icons are drawn from Lucide, bundled with the application. This supersedes the one
part of [ADR-0030](0030-look-is-data-two-typefaces-and-no-styling-value-in-code.md) that expected the
interface's icons to come from JetBrainsMono Nerd Font's glyphs.** Everything else in ADR-0030 stands:
the two typefaces, and the rule that no styling value is written in code.

**Status: decided by Noah, 2026-10-31**, on the desk design's handoff (`HANDOFF.md` §4).

## The forcing reason

**The desk design is drawn with Lucide.** Its icons — bold, italic, underline, add comment, search,
saved, saving — are Lucide's, at 14px and 16px with the library's default stroke. Rebuilding them from
Nerd Font codepoints would mean a second, different set of drawings, and the screen would stop
matching the design it was approved from.

ADR-0030 kept the Nerd Font build, rather than plain JetBrains Mono, only because *"its icon glyphs may
be wanted in the interface"*, and named that as the lever if they were not. They are not: the icons come
from Lucide.

## What this decides

- **Lucide is the one icon set.** Icons are drawn at the sizes the design gives, in the colour of the
  label beside them, with Lucide's own stroke — never the heavier absolute stroke.
- **Bundled, never fetched.** Local-first ([ADR-0003](0003-local-first-and-readable-without-the-app.md)) means no icon is loaded
  from a network. Lucide is an npm package built into the application, as the typefaces are bundled.
- **No React.** The design handoff names `lucide-react`; this application has no React. The framework
  independent `lucide` package, or its SVG files, is what is meant.
- **The sizes and colours stay tokens.** An icon's size and colour are named values like any other
  (ADR-0030), not literals in a component.

## What this does not decide

- **Whether to ship plain JetBrains Mono** instead of the Nerd Font build, which would save about 9 MB
  (ADR-0030's measurement). It is now the obvious lever, but it is a separate choice and is not made here.
- **The dependency lands with the first change that draws an icon.** The paper (the desk design's first
  step) has none, so nothing was added to `package.json` then. The `lucide` package landed with the workspace bar's tab pill, the first icon drawn.

## Considered options

- **Nerd Font glyphs, as ADR-0030 anticipated.** Rejected: they would not match the approved design, and
  the whole of the Nerd Font build's weight would be carried for glyphs the interface does not draw.
- **Hand-drawn SVGs.** Rejected: it is Lucide's drawings again, copied without the library, and with no
  way to take its corrections.
