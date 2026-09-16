# How Fountain parsers recognise transitions: evidence

Evidence behind the transitions section of
[ADR-0021](../adr/0021-the-screenplay-surface-implements-all-of-fountain.md). Gathered
2026-09-16, from parser source rather than from documentation.

Confidence markers as in the other research notes: **[V]** read in source, **[S]** secondary,
**[I]** inferred.

## The spec contradicts its own sample script

**[V]** [fountain.io/syntax](https://fountain.io/syntax/): a transition is "Uppercase / Preceded
by and followed by an empty line / Ending in TO:". No phrase list, no exceptions.

**[V]** The official *Big Fish* sample ends with an unforced `CUT TO BLACK.`, on the line before
a `>`-forced centered title — so the author knew the forcing syntax and chose not to use it.
**[V]** Every other transition in that file ends in `TO:`; this is the sole exception.

**[I]** That one line is almost certainly why the whitelist below exists. A strictly conformant
parser renders the last transition of the format's own reference script as left-aligned action.

## What the parsers actually do

**[V]** **Yousefi's `Fountain`** (Objective-C, the origin) — a generic rule, then an exact-match
set, in `FastFountainParser.m`:

```objc
if ([line isMatchedByRegex:@"[^a-z]*TO:$"]) { ... @"Transition" ... }
NSSet *transitions = [NSSet setWithArray:@[@"FADE OUT.", @"CUT TO BLACK.", @"FADE TO BLACK."]];
```

Exact string equality — the trailing period is required, so `FADE OUT` without it is action. The
same three are baked into `FountainRegexes.m`'s `TRANSITION_PATTERN`.

**[V]** **afterwriting**, via `aw-parser/parser.js`:

```js
transition: /^((?:FADE (?:TO BLACK|OUT)|CUT TO BLACK)\.|.+ TO\:|^TO\:$)|^(?:> *)(.+)/,
```

The same three phrases. **[V]** Two divergences from the spec worth noting: it also accepts a
bare `TO:`, and its generic branch is **not uppercase-gated**, so a lowercase line ending in
" TO:" is typed as a transition.

**[V]** **`fountain-js`** (npm) — the same whitelist with tighter anchoring, in `src/rules.ts`.

**[V]** **Beat** — no phrase list, but accepts any `…IN:` suffix as well as `…TO:`, properly
uppercase-gated. So Beat types `FADE IN:` as a transition and the JavaScript lineage does not.

**[V]** **Jouvence** (`RE_TRANSITION_LINE = re.compile(r"^\s*[^a-z]+TO\:$")`) and **screenplain**
(`if text.isupper() and to_colon`) follow the spec strictly. No whitelist.

**[S]** **Highland 2** and **Slugline** are closed source. Slugline documents a Force Transition
command but publishes no recognised-phrase list. **Could not verify.**

## Summary

| Tool | Unforced non-`TO:`? | Phrases |
|---|---|---|
| Yousefi `Fountain` | yes | `FADE OUT.` `CUT TO BLACK.` `FADE TO BLACK.` |
| afterwriting | yes | the same three, plus bare `TO:` |
| `fountain-js` | yes | the same three |
| Beat | partly | any `…IN:` suffix |
| Jouvence | no | — |
| screenplain | no | — |
| Highland 2, Slugline | could not verify | — |

**[V]** `DISSOLVE:` and `IRIS OUT.` are recognised by **none** of them. `DISSOLVE TO:` needs no
special case, since it matches the generic rule everywhere.

**[I]** The ecosystem splits along language lines: the JavaScript and Objective-C lineage carries
the whitelist, the Python lineage does not. So `CUT TO BLACK.` silently changes element type
between afterwriting and screenplain, and `> CUT TO BLACK.` is the only fully portable spelling.

## What this changed in the design

An earlier draft of ADR-0021 proposed a ten-phrase vocabulary including `DISSOLVE:`, `IRIS OUT.`
and `WIPE:`, on the reasoning that the spec's rule was too narrow. The reasoning was right and
the list was wrong: three of those phrases are recognised by no parser in existence, so shipping
them would have produced files that render differently in Write-ist than anywhere else — the
exact failure the extension was meant to avoid. The vocabulary is now the three the ecosystem
already agrees on, and nothing else.
