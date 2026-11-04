# The paper has a right-click menu, and it is read from the command table

**Right-clicking the paper opens Write-ist's own menu at the pointer, in the look of File, Edit and View.
Its items are not written for it: a command is offered there by giving its entry in the command table a
`context`, and the label, icon, hint, greying and action all come from that entry. The webview's own menu
is suppressed on the paper.** This is the first piece of [ADR-0034](0034-write-ist-draws-its-own-context-menus.md)
to be built; the rest of that direction (text fields, the desk around the paper) is unchanged.

**Status: built, 2026-11-03.** Linux first, as ADR-0034 says. The calls the brief left open are under
*Calls made without Noah*, for him to overturn.

## The forcing reason

ADR-0034 said a menu item "must reach the same code as the keyboard shortcut, not a second path", and the
command table (`app/src/workspaces/editor/commands.ts`) already holds that code, with the dual-dialogue
three registered "for a context menu" and drawn nowhere. A second list of items, with its own labels and
hints, would have been the four-places-for-one-fact the table was made to end. And a second copy of the
drop-down menus' look would drift from them the first time a token changed.

## What is decided

1. **The list is shared.** `menuList` in `app/src/menus/drop-menu.ts` builds the items, rules, icons,
   ticks, hints and arrow keys; the drop-downs and the context menu both draw it, with the same classes
   (`.drop-menu`, `.drop-menu__item`…). The context menu adds one modifier, `.drop-menu--context`, which
   only changes how it is placed. Only one menu of either kind is open at a time.
2. **Items come from the table.** `Command.context = { group, contextual? }` offers a command; items are
   drawn in table order with a rule where `group` changes. A `contextual` group (Dual Dialogue) is drawn
   only where at least one of its commands would do something at that spot, and greyed item by item inside
   it. Adding an item is one line in the table (`context-menu-items.ts` is not touched).
3. **Where it acts.** A right-click outside the selection moves the caret to the word pointed at, so the
   menu acts on what was pointed at; inside a selection the selection stays, for Cut and Copy. Commands
   that act at a place are given that position (`run(host, at)`), not the caret.
4. **Cut, Copy and Select All** ask the webview to do what the key does (`document.execCommand`), so the
   clipboard code of #47 runs unchanged. **Paste** reads the clipboard and goes through `pasteInto`, the
   function `handlePaste` now calls too: one paste path. Their keys are the webview's, so they are
   `keys: "elsewhere"` entries that exist to draw the hint.
5. **Spelling.** When the pass is on and the word is underlined, up to five suggestions lead the menu (the
   "Did you mean" fix for a confirmed name first), then **Add to Dictionary**, which already existed
   (`addToDictionary`, ADR-0032). A suggestion replaces the word in one undo step (`replaceWord`). If the
   dictionary cannot answer, the menu opens with "No Suggestions" and the rest. The suggestions are not
   table entries: they are per word, not commands.
6. **Placement and closing.** It opens with its corner at the pointer, flips to the other side of the point
   if it would leave the window, and is then held inside it (`placeMenu`). It closes on Escape (which
   stops there; the window would close the project), a press outside, a scroll, a resize, the window
   losing focus, or choosing an item. Focus returns to the paper.
7. **Keyboard.** The Menu key and Shift+F10 open it at the caret with the first item lit; arrows, Home,
   End and Enter work as in a drop-down. A pointer-opened menu has focus on the list, so Down goes to the
   first item and Up to the last.
8. **The look stays data (ADR-0030).** The point is the one measured value code must hand over. It goes in
   as unitless custom properties (`--menu-x`, `--menu-y`) and the stylesheet gives it its unit from
   `--size-pixel`. `no-styling-literals.test.ts` allows exactly `style.setProperty("--…")` and still
   rejects every other style set from code.

## Considered options

- **A second, separate menu component.** Rejected: it would be a copy of the drop-down's look and keys.
- **A hand-written list of items in the Editor.** Rejected: a second path to the same commands.
- **Paste via `execCommand("paste")`.** Rejected: webviews refuse it. The clipboard API is used instead.

## Calls made without Noah

- Cut/Copy/Paste/Select All are **not** added to the Edit menu; the Edit menu is unchanged. They are
  context-menu items only, though the table could now put them there with a `menu`.
- Dual Dialogue is hidden, not greyed, away from a speech.
- The Menu key and Shift+F10 were added although the brief named only the pointer, because ADR-0034 calls
  keyboard access its largest cost.
- Text fields (the title page form) and the desk's panels keep the webview's menu; ADR-0034 leaves that
  open and this does not decide it.

## Not tested

- **Reading the clipboard from a menu click** without a prompt is still [I] on all three webviews. If it is
  refused, the writer is told to press Ctrl+V; nothing is lost. Cut and Copy use `execCommand`, which is
  not subject to it.
- Everything above runs in jsdom tests; the real window (seam 4) is checked by the writer right-clicking.
