# Three desktop platforms, with pagination pinned to a bundled Courier Prime

Write-ist v2 supports Linux, Windows and macOS. Desktop only — a mobile companion is
rejected, because it is the assumption most likely to reappear and demand sync, and sync
contradicts the local-first constraint.

"Supported" here means something stronger than "it launches there": **identical pagination
on all three platforms.** For screenplay, page count is semantic — one page is roughly one
minute of screen time — so a page break that moves between machines is a correctness bug,
not a cosmetic one.

Pagination is defined against **Courier Prime at 12pt, bundled with the application**, never
resolved from the system. Courier Prime is the industry-standard screenwriting face, is
metrically compatible with Courier, ships true bold and italic cuts rather than synthesized
ones, and is licensed under the SIL Open Font License, so redistribution is unencumbered.
System Courier varies across operating systems and across versions of the same operating
system; a fraction-of-a-point difference in advance width moves a page break.

## Consequences

- **Pagination must be computed by code we own**, against the bundled font's metrics — not
  delegated to the platform text stack. DirectWrite, Core Text and Pango/FreeType can make
  different line-breaking decisions from identical metrics. Owning the line-break and
  page-break math is what makes three platforms agree by construction, and it is the
  precondition that makes supporting three of them affordable at all.
- **One pagination engine, shared by screen and PDF export.** A second engine for export
  would let the on-screen page count and the exported page count disagree, which makes the
  count a lie.
- **User-chosen editor fonts stay constrained for screenplay.** A font that changes the page
  count is a bug, so font choice is a prose-surface affordance, not a universal one.
- Bundling the font costs a few hundred KB and removes an entire class of
  "the page count is different on my other machine" defects.
- **Under Tauri, owning the pagination is mandatory rather than merely wise.** Tauri renders
  in the *system* webview — WebKitGTK on Linux, WebView2 on Windows, WKWebView on macOS —
  which is three different text-layout engines. (Electron makes the opposite trade: it
  bundles Chromium, so layout is identical everywhere at the cost of size.) Any code path
  that asks the webview where text wraps — `measureText`, `getClientRects`, or simply
  letting CSS reflow a `contenteditable` — will produce three different page counts from
  identical input. Line-break and page-break decisions must come from our own engine,
  against the bundled font's metrics; the webview only draws a layout that has already been
  decided. Get that seam right and the system webview is harmless.
- This constrains the still-open **buffer-first vs model-first** question: a buffer-first
  editor that leans on native `contenteditable` reflow is the version of this that goes
  wrong.
