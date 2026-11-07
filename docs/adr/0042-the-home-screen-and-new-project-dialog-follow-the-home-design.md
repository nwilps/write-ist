# The home screen and the New Project dialog follow the home design

**The home screen and the New Project dialog are drawn as Noah's home design (approved 2026-11-03,
`HOME-HANDOFF.md`) draws them: the interface's one typeface throughout, a centred menu between two
rules with the first row selected, and a dialog with no heading whose buttons carry the keys they
answer to.** Nothing about what the screens do changes.

**Status: built, 2026-11-03.**

## What it decides

- **The typeface is the one already bundled.** The handoff says JetBrains Mono "is not in the repo
  yet". It is: ADR-0030's interface face is JetBrainsMono Nerd Font, a patched JetBrains Mono with the
  same letterforms and metrics, bundled with its licence (`app/public/fonts/OFL-JetBrainsMono.txt`).
  Nothing was added; the screens already inherit `--face-interface`.
- **The menu's look is the home screen's alone.** `menu()` takes `{ home: true }`, which adds
  `menu--home`; the Open Project screen is the same markup without it and was unchanged, as the design
  asked. (It has since been redrawn to its own design: ADR-0043.) The selected row is the first one until the pointer or the keyboard is on another, then that
  one — so there is never a second highlight.
- **Colour names map to tokens:** `surfaces.base` → `--colour-base`, `raised` → `--colour-raised`,
  `overlay` → `--colour-overlay`, `borders.strong` → `--colour-border-strong`, `text.primary` →
  `--colour-text`, `muted` → `--colour-muted`, `faint` → `--colour-faint`, `accents.yellow` →
  `--colour-accent`. The dim layer is the existing `--veil` (70%, no blur).
- **The dialog has its own classes** (`.new-project-dialog…`, in `app/src/style/home.css`). The Edit
  Title Page and Goals dialogs reuse `.report`, `.new-project__form`, `.field` and
  `.new-project__actions`; the redesign adds to none of them, and a test pins both halves.
- **Cancel [Esc] left, Confirm [Enter] right.** Escape cancels through the native modal dialog; Enter
  confirms from anywhere but a button (a `<select>` does not submit a form by itself). Confirm is
  disabled, and Enter does nothing, while the title is empty. "Untitled" is a placeholder, never a value.
- **The drop-down is a closed native `<select>`** with Lucide's `chevron-down` drawn over it (ADR-0035).
  Screenplay is the only option. The open list is the platform's; no custom one is built, and no
  other project type is enabled.

## What it does not decide

- **The ASCII slash background** is explicitly not built. (The ASCII logo is built: the art is
  `app/src/screens/logo.ts`, held byte for byte to the design's `logo.txt` by a test, and set in
  JetBrains Mono 15px in the accent colour. It scales down on a narrow window rather than wrapping.)
- **Metrics and Settings do nothing yet.** The design draws them, so the home screen lists them —
  `Metrics [m]` and `Settings [s]`, between Open Project and Quit, in the same muted colour as every
  unselected row. Neither exists, and **by Noah's decision they intentionally do nothing for now**,
  on a click or on their key. They are real, enabled buttons (not `unavailable`), so the hover and
  keyboard highlight moves through them like any row. `home.ts` carries a TODO where each gets its
  behaviour.
- **The dialog's wording against the glossary.** The design labels the field *Project type*, which
  `GLOSSARY.md` says to avoid for **Format**. The label is the design's; the word stays out of code
  and prose.
