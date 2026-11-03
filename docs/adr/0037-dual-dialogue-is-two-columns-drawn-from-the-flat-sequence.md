# Dual dialogue is two columns, drawn from the flat sequence

**A dual-dialogue pair — a speech, and the speech after it whose cue carries `^` — is set side by side on
the paper in two columns. The model stays flat and the file stays the same: the `^` is the second cue's
attribute, never drawn, always written. Which speeches form a pair is one function
(`dualPairs`, `src/screenplay/dual-dialogue.ts`) that the page count, the paper and the editing commands
all ask.**

**Status: decided by Noah, 2026-11-02.**

## The forcing reason

The count already stacked a pair into a shared band (`collapseDualDialogue`), but at the full single-column
measures and with nothing on the paper to draw it: the writer saw two stacked speeches, with a `^` they had
typed vanishing into the cue. The page, the count and the commands had no common idea of what a pair was,
and an edit that ended the element carrying the caret (a join, a retype, a multi-line delete) dropped it
from the file without a word.

## What is decided

1. **A pair is two touching speeches.** A speech is a cue and the parentheticals and dialogue directly after
   it. The second speech's cue carries the caret and nothing — action, a transition, a scene heading,
   centred text, a note, a boneyard delimiter, a page break — lies between. A speech belongs to one pair
   at most, so a third caret after a pair pairs nothing; it is kept in the file and does nothing.
2. **Two columns of 29 characters, 2 apart**, filling the 60-character measure; the right column ends at the
   right margin. Cue, parenthetical and dialogue keep their order of indent inside a column
   (`DUAL_GEOMETRY` in `geometry.ts`, generated into `geometry.css`). **These numbers are not measured**:
   no Final Draft PDF in hand has dual dialogue. They follow the common layout and are whole characters so
   that the wrap is exact.
3. **The count wraps each column at its own measure and the band is as tall as the taller one.** A band is
   never split and never gets `(MORE)` or `CONT'D` (ADR-0033); it moves whole.
4. **The paper draws the columns with decorations, never the document.** The blocks stay one after another;
   the right-hand cue is pulled back up to the left cue's row by the number of rows the left speech took,
   from the same wrap the count used, and a thin rule in the gutter links the two. If a blank line the
   writer has just started lies inside the pair the speeches stack until it is resolved.
5. **Typing `^` at the end of a cue pairs it with the speech above, if that is a valid pair**, and the `^`
   is not put in the text. Otherwise it is an ordinary character.
6. **Three commands, bound to nothing yet**: `makeDualDialogue` (the speech above first, then below; a
   neighbour already in a pair is skipped), `makeNormalDialogue`, and `swapSpeakers`, each with a
   `can…` check for a menu to grey the item (ADR-0034's menu). Each is one undo step; a comment inside a
   swapped speech travels with its words.
7. **A line edit never drops a caret.** Where an edit ends the element that carries one it is written into
   the text exactly as on disk (ADR-0020), including a multi-line deletion that joins a paired cue onto the
   line above. If the whole of the cue's text was selected, it goes with its caret.
