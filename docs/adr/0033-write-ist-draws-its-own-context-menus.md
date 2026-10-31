# Write-ist draws its own context menus, and uses none of the system's

**Write-ist will replace the webview's native right-click menus with its own. It does not use the
operating system's spellcheck ([ADR-0032](0032-spellcheck-is-ours-on-demand-and-offline.md)), and the
menu that carried spellcheck was the one reason to keep the system's. Without it, there is no reason
left.** The writer sees one menu, in Write-ist's look, on every platform.

**Status: decided, 2026-10-31 — Noah's direction. Not built, and not scheduled: this records where
the application is going so that nothing built meanwhile points the other way.** The work is tracked
as later work in [issue #105](https://github.com/nwilps/write-ist/issues/105).

## The forcing reason

[ADR-0029](0029-spellcheck-is-the-systems-and-skips-names-and-headings.md) kept right-click the
system's for one stated reason: the suggestions and "Add to dictionary" live in the menu the system
provides, and a page that takes over right-click replaces it. That is why ADR-0018 was amended so
comments are created by keybinding and menu item, not right-click. ADR-0032 removes the premise: the
spelling menu is Write-ist's own, so the native menu is carrying nothing Write-ist needs from it. What
remains is a native menu that differs on each of the three webviews
([ADR-0001](0001-desktop-platforms-and-pagination-font.md)) and cannot be restyled, and that offers
items (Reload, Inspect, Look Up, Services, a Fonts submenu) that mean nothing in a writing
application. Leaving it half-replaced — ours for a misspelt word, the system's elsewhere — is two
menus where the writer expects one.

## What is decided

- **Direction: every context menu in Write-ist is Write-ist's own.** The webview's default menu is
  suppressed wherever Write-ist handles the gesture, and no menu comes from the system.
- **Not now.** Slice 2 still draws a spelling menu of its own (Slice 2 Question S, and step 10); it
  is built so the menu can later grow into the general one rather than be thrown away.
- **Right-click is available for comments again.** ADR-0018's original *"a keybinding or a
  right-click"* stands once the menu exists. Until then the keybinding and the menu item are how a
  comment is made.

## Considered options

- **Keep the system's menu everywhere except on a misspelt word.** Rejected: the writer gets a
  different menu depending on where they click, in a different look, with items that do nothing.
- **Keep the system's menu for everything but spelling, indefinitely.** Rejected for the same reason,
  and because it keeps the three-webview difference alive for no benefit.
- **Build it now.** Rejected: Slice 2 is the core of a finished screenplay and PDF; nothing in it
  needs a general menu beyond the spelling one.

## Consequences

Each of these is a cost the later work takes on, and none is built:

- **Everything the native menu did must be done by us.** Cut, Copy, Paste, Select All, and Undo/Redo,
  at least. Paste in particular goes through the clipboard rules of
  [#47](https://github.com/nwilps/write-ist/issues/47); a menu item must reach the same code as the
  keyboard shortcut, not a second path. Whether the webviews allow reading the clipboard from a menu
  click without a permission prompt is **not tested** [I].
- **Text fields are covered too**, or deliberately not: the Edit Title Page fields and any other input
  are webview inputs with the native menu. Either they get the same menu or they are an
  acknowledged exception; the later work decides, and it must not leave it to chance.
- **Keyboard and assistive access.** A native menu opens from the Menu key and Shift+F10 and is
  exposed to screen readers. A drawn menu has to do both itself, or it makes the application less
  accessible than the one it replaces. This is the largest cost.
- **A menu drawn by us is drawn in the Editor's own look**, from tokens
  ([ADR-0030](0030-look-is-data-two-typefaces-and-no-styling-value-in-code.md)), not styling values
  in code.
- **Three webviews.** Suppressing a native menu behaves per webview (WebKitGTK, WebView2, WKWebView).
  ADR-0029 called this inferred [I], not tested, and it still is; Linux first, as Slice 1 and 2.
- **Spellcheck stays offline and ours**, so nothing here reintroduces a dependency on the system's.
- **ADR-0018's amendment is superseded in intent.** The line was added because the system kept
  right-click. It is annotated there rather than rewritten.
- **Slice 2's spec** carries a note; the later work is [#105](https://github.com/nwilps/write-ist/issues/105), labelled `later-work`.
