# Formats set defaults, never restrictions

Every element a surface knows stays available in every format running on it. Act breaks in a
feature, a title page on a novel, dual dialogue in a short story — a format may decide what
appears on the toolbar and what a new project starts with, but it never removes an element
from the writer's reach.

This is the rule that keeps formats cheap (ADR-0005), and it is **forced by import**:
Fountain does not gate elements by format, so the parser cannot either. A file arriving from
another tool may contain anything the surface understands, and refusing to represent it
would mean losing the writer's text.

Recorded because it is the kind of rule a reasonable person will try to "fix" — gating act
breaks out of a novel format looks like tidiness and is actually data loss.
