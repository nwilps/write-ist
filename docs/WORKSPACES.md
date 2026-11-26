# Making a workspace

A **workspace** is one of the full screens a writer switches between with the bar at the top:
the Editor, Notes, Plan. This page is for someone making a new one. It is short on purpose.

The idea: **Write-ist already does the hard parts** — saving safely, remembering where the writer
was, spellcheck, the pills at the bottom, keyboard shortcuts, settings, menus, "are you sure?"
dialogs. A workspace does not build any of those again. It is handed a **toolbox** when it opens,
and each of those things is one call on it.

The rules behind this are in [ADR-0045](adr/0045-every-workspace-is-given-one-versioned-toolbox.md).

## The three steps

1. **Copy the template.** Copy `app/src/workspaces/_template/` to `app/src/workspaces/<your-id>/`.
   It is a small working workspace with a comment on every toolbox call.
2. **Fill in the manifest** — the few lines that say what your workspace is (below).
3. **Add it to the list.** One line in `app/src/workspaces/registry.ts`. That is the only file
   outside your folder you touch.

Your workspace then has a tab, an Alt key, a row in the Hotkeys list, a switch in Edit Project
Details and in New Project Defaults (so a writer can turn it off), and its settings drawn in the
right places — without anyone editing those screens.

**One rule:** import from `app/src/toolbox/index.ts` and nothing else of the application's. If you
find you need something the toolbox does not have, that is a question for the toolbox (add a call
there), not a reason to reach around it. A test (`test/app/toolbox.test.ts`) checks.

If your workspace has a file format of its own (Plan's cards, say), put the code that reads and
writes it in `src/<your-id>/`, where it can be tested without a window. That code takes the
toolbox's `files` rather than the disk (see `src/notes/notes-folder.ts`).

## The manifest

```ts
export const notesWorkspace: WorkspaceManifest = {
  id: "notes",              // lower case, never shown, never changed
  name: "Notes",            // the tab's name
  key: "2",                 // Alt+2 opens it; pick one no one else has
  icon: StickyNote,         // a Lucide icon (ADR-0035)
  files: ["notes/", "notes.md"], // what in the project folder is yours; "/" means a folder
  mount,                    // draws it, given the toolbox
};
```

Optional:

- `alwaysOn: true` — shown in every project and never switched off (only the Editor is).
- `showsProjectName: false` — hide the project's name pill at the bottom left while yours is on
  screen, if you need the room (Plan does).
- `showsPaperFade: false` — don't draw the paper's fades at the window's top and bottom edges
  while yours is on screen. They are for the Editor's paper; a workspace with no paper under them
  turns them off (Notes and Plan do).
- `settings: [...]` — switches of your own (see **Settings** below).

`mount(into, toolbox)` draws into `into` and answers a few things the application asks of it:
`unmount` (save, and answer `false` if the save failed so nothing is lost), and optionally `hide`,
`show`, `focus` and `relocate`. The template shows all of them.

## Every toolbox call

Notes is the worked example throughout (`app/src/workspaces/notes/notes.ts`).

### Files — `toolbox.files`

Only the files and folders your manifest declares. Paths are inside the project's folder:
`"notes/Ideas.md"`. Anything else is refused before the disk is touched.

```ts
const read = await toolbox.files.read("notes/Ideas.md");      // absent is "", unreadable rejects
const file = toolbox.files.open("notes/Ideas.md", { noun: "your notes", text: () => text, reload: (found) => (text = found) }, read);
file.changed();                                              // the writer typed: it saves itself after a pause
await file.leave();                                          // the last save; false if it failed
const entries = await toolbox.files.list("notes");           // what is in a declared folder
await toolbox.files.create("notes/Untitled.md");             // only where nothing is
await toolbox.files.move("notes/Untitled.md", "notes/Ideas.md"); // never over another file
await file.moveTo("notes/Ferry.md");                         // rename an open file between saves
await toolbox.files.remove("notes/Ideas.md");                // for good — ask first (Dialogs)
```

`open` brings everything with it: the safe save (nothing half-written), autosave after a pause, on
switching away and on leaving, quiet handling of a file changed by another program (a copy is kept
beside it), and the save pill at the bottom right. A file that would not read is never written over.

### Place memory — `toolbox.memory`

Where the writer was — a caret, a scroll, which tabs were open. Kept in the application's own
data, never in the project.

```ts
const place = await toolbox.memory.recall();                  // or recall("Ideas") for one item
await toolbox.memory.remember({ anchor: 14, head: 14, scroll: 340 }, "Ideas");
await toolbox.memory.forget("Ideas", "Ferry");               // an item renamed (or just forget it)
```

A place is a few named whole numbers and short texts. `remember` answers `false` if there is
nowhere to keep it yet.

### Spellcheck — `toolbox.spelling`

The same dictionary the Editor uses, offline. A word added here is added everywhere.

```ts
if (toolbox.spelling.available) {
  const wrong = await toolbox.spelling.check(text);           // [{ word, start, end }, …]
  const fixes = await toolbox.spelling.suggest("nihgt");
  await toolbox.spelling.addWord("Quimby");
}
```

Show the spellcheck pill while yours is on: `toolbox.pills.setSpellcheck(true)`.

### Pills — `toolbox.pills`

The small pills at the foot of the desk. The application draws them; you say what they say.

```ts
toolbox.pills.setStatus("w. 1,204");                         // the counts pill; "" hides it
toolbox.pills.setGoal({ text: "312 / 500", kind: "words", state: "short" }); // or undefined
toolbox.pills.whenGoalsAsked(() => openMyGoals());
toolbox.pills.setSaved("unsaved");                          // only if you do not use files.open
```

### Hotkeys — `toolbox.hotkeys`

```ts
toolbox.hotkeys.add({ id: "tidy", label: "Tidy Cards", chord: { key: "j", mod: true }, act: tidy });
```

`mod` is Ctrl (Cmd on a Mac). The key is listed in View ▸ Hotkeys and Settings ▸ Hotkeys under your
workspace's name, and works while your workspace is on screen. If someone already has that key —
or it is a bare letter, which is just typing — it is not added and `add` answers `undefined`.
Nothing is shown to the writer: pick another key. The standard keys every program has (Ctrl+S,
Ctrl+Z, the clipboard) you simply answer yourself, as Notes does; they are not listed twice.

### Menus — `toolbox.menus`

Write-ist draws its own menus; the system's never appear.

```ts
toolbox.menus.open({ label: "Notes", items: [{ label: "Delete", icon: Trash2, act: remove }], x, y, restoreFocus: () => view.focus() });
```

Items can have an icon, a key hint, a tick (`checked`), be greyed (`unavailable`), have a small
second action at their end (`aside`, Notes' delete), and be split by `{ divider: true }`. A picker
of your own (Plan's colour palette) calls `toolbox.menus.claim(it)` when it opens and `release`
when it closes, so only one menu is ever open.

### Dialogs — `toolbox.dialogs`

The application's "are you sure?", in your own words.

```ts
toolbox.dialogs.confirm({
  label: "Delete Note",
  question: `Delete "Ideas"?`,
  lines: ["This permanently deletes the note from your project's notes folder. It cannot be recovered."],
  confirm: "Delete",
  alarm: true,          // red, warning sign, and Cancel under the writer's hand — for what cannot be undone
  failed: "“Ideas” could not be deleted, so it is still in your notes.",
  act: async () => { await toolbox.files.remove("notes/Ideas.md"); return undefined; },
  closed: () => focus(),
});
```

`act` answers `undefined` when done (the dialog closes) or a sentence for the writer when it could
not be (the dialog stays, with the sentence). Never use the browser's `confirm()` or `alert()`.

### Settings — `toolbox.settings`

Declare switches in the manifest; the application draws them, in its own style, under your
workspace's name, and keeps them in its own settings files.

```ts
settings: [
  { id: "wrap", label: "Wrap long lines", place: "app", default: true },        // Settings ▸ General
  { id: "guides", label: "Show guides", place: "project", default: false },    // Edit Project Details, and New Project Defaults
],
```

```ts
const wrap = await toolbox.settings.read("wrap");
toolbox.settings.whenChanged(() => redraw());
toolbox.settings.open({ into, closed: () => focus() });      // open the whole Settings dialog
```

Notes and Plan have no settings yet; the test-only Sketch workspace uses both kinds.

### Project details — `toolbox.details`

```ts
const { targetPages } = await toolbox.details.read();
toolbox.details.whenAsked(() => toolbox.details.edit({ into, carryOut: relocate, closed: focus })); // the name pill
toolbox.details.whenChanged((details) => grid.resize(details.targetPages));
```

### Everything else

```ts
toolbox.report("Write-ist could not read the note “Ideas”, so nothing has been changed.");  // trouble, in the writer's words
toolbox.window.whenSwitchedAway(() => file.save());           // the writer went to another program
toolbox.leave.toHome();                                       // close the project
toolbox.project.marker.name;                                  // which project is open (read it when needed)
toolbox.version;                                              // 1
```

## Things a workspace never does

- Reach past the toolbox into the rest of the application.
- Keep the writer's work anywhere but its declared files, or the writer's place anywhere but
  `toolbox.memory` (never `localStorage`).
- Write over a file it could not read.
- Show its own pop-up messages or toasts. Trouble goes through `toolbox.report`; small fixes are
  made quietly.
- Use the browser's own menus, `confirm()` or `alert()`, or `title` tooltips.
- Put a colour, size or spacing in code or CSS that is not a token from
  `app/src/style/tokens.css` (ADR-0030).

## The toolbox is a promise

It has a version (`toolbox.version`, 1 today). New calls are added freely. A call is never removed
or renamed casually: that takes a new version and a dated note in ADR-0045, because a workspace
someone else wrote will be relying on it.

Not built yet, and on the way: loading a workspace from outside this repository, keeping such a
workspace in a sandbox where it can reach only its toolbox, and a way to install and trust one.
