# Linux draws no title bar; macOS and Windows keep theirs

**On Linux the window has no decorations. On macOS and Windows it keeps the operating system's own title
bar.** The desk design (`HANDOFF.md` §2.1) removes window chrome, and on Linux that is the one platform
where the chrome can be removed without taking something the writer relies on.

**Status: decided by Noah, 2026-10-31.**

## The forcing reason

**The title bar on Linux was a second, foreign bar above the desk** (Noah's screenshot of the Scenes
bug showed it: "Write-ist" with three buttons, in the compositor's style, not ours). Slice 1 ships on
Linux (ADR-0001), and the people on Linux who run Write-ist most are on tiling compositors such as
Hyprland, where the bar is wasted space and is not how they move, size or close windows.

## What this decides

- **Per platform, in configuration — and once more in code.** `drop_title_bar` in `src-tauri/src/lib.rs` calls `set_decorations(false)` on Linux at startup, as a backstop for a build that missed the config.
- **The configuration:** `src-tauri/tauri.linux.conf.json` is merged over
  `tauri.conf.json` on Linux only and sets `decorations: false` for the main window. Because it is read
  before the window exists, there is no frame of title bar at startup. macOS and Windows read only
  `tauri.conf.json` and are unchanged.
- **Closing** still works. The compositor's close (Hyprland's `killactive`, a window manager's
  Alt+F4) raises the same close request as the old button, and `main.ts` answers it exactly as it
  answers Quit (ADR-0028): the project closes and saves first. **Esc** closes the project from the
  desk, and Quit closes the window.
- **Moving and resizing** are the window manager's: Super + drag, Super + right-drag, tiling, on
  Hyprland. An undecorated Tauri window on Linux still gets resize borders from the toolkit on floating
  desktops. Write-ist draws **no drag strip of its own**; a desktop with neither a keyboard move nor
  a tiler would be where that is revisited.
- **macOS and Windows keep their native title bars.** Their title bars carry the traffic lights and the
  snap layouts the writer expects, and nothing in the desk design needs them gone.

## Not decided

An in-app drag region for floating Linux desktops. Open it as an issue if a writer needs it.
