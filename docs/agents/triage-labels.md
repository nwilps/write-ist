# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the label
strings that actually exist in this repo's issue tracker (`gh label list`).

| Label in mattpocock/skills | Label in our tracker | Meaning                                 |
| -------------------------- | -------------------- | --------------------------------------- |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation           |
| `needs-triage`             | *not used*           | —                                       |
| `needs-info`               | *not used*           | —                                       |
| `wontfix`                  | *not used*           | —                                       |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label
string from this table. **For a role marked *not used*, apply no label and do not create one** —
say in the issue what it is waiting for instead.

## Other labels in use

Not triage roles, but they exist and are applied:

| Label                 | Meaning                                          |
| --------------------- | ------------------------------------------------ |
| `bug`                 | Something isn't working                          |
| `slice-2`             | Slice 2: finish the core                         |
| `later-work`          | Recorded direction; not scheduled                |
| `waits-for-penpot`    | Waits for Noah's Penpot design                   |
| `wayfinder:map`       | The map for a wayfinding effort                  |
| `wayfinder:research`  | Decision ticket: resolved by research            |
| `wayfinder:grilling`  | Decision ticket: resolved by conversation        |
| `wayfinder:prototype` | Decision ticket: resolved by a rough artifact    |
| `wayfinder:task`      | Manual work that unblocks a decision             |

Keep both tables matched to `gh label list`; a label that is not in the tracker does not belong
here.
