# Spellcheck is ours: on demand, offline, and it knows the script's names

**Write-ist checks spelling with its own engine, in Rust, with dictionaries that ship inside the
application. It runs only when the writer asks for a pass, checks the ordinary words in cues and
headings, and treats the script's confirmed names and locations as known words.** The webview's
spellcheck is switched off.

**Status: decided, 2026-10-31 — Noah approved it. Proposed the same day with
[the Slice 2 spec](../specs/slice-2.md). Supersedes
[ADR-0029](0029-spellcheck-is-the-systems-and-skips-names-and-headings.md).**

## The forcing reason

ADR-0029 chose the system's spellcheck because it was free and because v1's slowness no longer applied.
Its own considered-options section named the cost it accepted: *"the system spellcheck has no way to
take a list of words from the page"*, so an invented name is flagged until added, cues and headings
have to be skipped altogether, and a typo in a name can only be caught by autocomplete. The hard rule
of Slice 2 is that **everything works offline with the dictionaries shipped inside the app**, and the
writer wants three things the system's spellcheck cannot do: know the script's names, still check the
words inside headings, and say *"Did you mean MICHAEL?"* about a rare near-match of a confirmed name.
The system's dictionaries also differ on each of the three platforms (ADR-0001), and on Linux need a
package the writer may not have.

## What is decided

- **Own engine, Rust side of Tauri.** `spellbook` (MPL-2.0, Hunspell-compatible) is the preferred
  choice; `zspell`, `hunspell-sys` and `nspell` are the alternatives. **The choice is confirmed by the
  evaluation ticket**, which verifies licences, size and speed. This ADR does not bind the crate, only
  that it is ours, in Rust, and offline.
- **Dictionaries ship with the application**, with their notices kept. This restores ADR-0009's
  original sentence that spellcheck dictionaries ship with the app, not inside each project.
- **On demand.** Off while writing; a hotkey toggles a pass; underlines are drawn on screen only and
  never written to a file. v1's always-on spellcheck is why spellcheck was removed.
- **The custom dictionary and the language persist**, outside every bundle.
- **Confirmed names and locations count as known words** (a derived list, ADR-0022, plus whatever
  stored state Slice 2's Question 1 settles).

## What stays from ADR-0029

The lists are derived, not a word bank. Autocomplete offers entries from those lists. Right-click is not
used for comments (ADR-0018 as amended) — though the spelling menu is now ours rather than the system's
(Slice 2 Question S), and [ADR-0033](0033-write-ist-draws-its-own-context-menus.md) takes that further:
every context menu will be ours.

## Considered options

- **Keep the system's spellcheck.** Rejected for the three reasons above and for the offline rule.
- **A per-script dictionary** (ADR-0029's "real want"). Not needed: the confirmed lists play that role.
- **Check in the webview, in TypeScript.** Rejected: a dictionary lookup per word on the same thread as
  typing is what made v1 slow; Rust is across a boundary the keystroke never waits on.

## Consequences

- ADR-0029 is marked superseded; its "Right-click stays the system's" and "To verify" sections no
  longer apply.
- ADR-0009's amendment line is revised.
- App size grows by the dictionaries (measured by the evaluation ticket).
- A new character used once or twice is underlined until confirmed or added to the dictionary.
