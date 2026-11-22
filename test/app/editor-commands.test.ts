/**
 * The Editor's command table: one entry per command, and the key, the menu
 * and the hint beside it are all read from that entry.
 *
 * What is checked is the table's interface — which command a key press asks
 * for, what each menu holds, what hint is drawn — and that the three agree
 * because they are one fact. The menu expectations below are the literal
 * labels and hints the Editor drew before the table existed: nothing the
 * writer sees has changed.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { TextSelection, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  COMMANDS,
  commandById,
  commandForKey,
  hintOf,
  isAvailable,
  runCommand,
  type CommandHost,
} from "../../app/src/workspaces/editor/commands.ts";
import { editorMenus } from "../../app/src/workspaces/editor/menus.ts";
import { hintNow } from "../../app/src/menus/drop-menu.ts";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { startOfElement } from "../support/editor-positions.ts";

/** A key press as the window reports it, with nothing held down. */
function press(key: string, held: Partial<Record<"alt" | "ctrl" | "meta" | "shift", true>> = {}) {
  return {
    key,
    altKey: held.alt === true,
    ctrlKey: held.ctrl === true,
    metaKey: held.meta === true,
    shiftKey: held.shift === true,
  };
}

/** A host whose every action is a spy, and whose editor is the one given. */
function host(view?: EditorView): CommandHost & Record<string, ReturnType<typeof vi.fn>> {
  const names = [
    "save", "exportAs", "toProjects", "editProjectDetails", "openSettings", "toHome", "editTitlePage", "viewTitlePage", "editGoals",
    "toggleSpellcheck", "keyboardShortcuts", "search", "undo", "redo", "zoomIn", "zoomOut", "resetZoom",
  ] as const;
  const spies = Object.fromEntries(names.map((name) => [name, vi.fn()]));
  return { ...spies, spellcheckOn: vi.fn(() => true), zoomLevel: vi.fn(() => 2), view: () => view } as never;
}

describe("the command a key press asks for", () => {
  it("is Ctrl+S, and Cmd+S on a Mac, for a save", () => {
    expect(commandForKey(press("s", { ctrl: true }), "editor")?.id).toBe("save");
    expect(commandForKey(press("s", { meta: true }), "editor")?.id).toBe("save");
    expect(commandForKey(press("S", { ctrl: true, shift: true }), "editor")?.id).toBe("save");
  });

  it("is never a bare letter, which is the writer typing, nor Ctrl+Alt+letter", () => {
    for (const letter of ["s", "k", ";"]) {
      expect(commandForKey(press(letter), "editor"), letter).toBeUndefined();
      expect(commandForKey(press(letter, { ctrl: true, alt: true }), "editor"), letter).toBeUndefined();
    }
  });

  it("is Hotkeys for Ctrl+K or Cmd+K, from anywhere in the window, and nothing else", () => {
    for (const held of [{ ctrl: true }, { meta: true }] as const) {
      expect(commandForKey(press("k", held), "window")?.id).toBe("keyboard-shortcuts");
      expect(commandForKey(press("K", held), "window")?.id).toBe("keyboard-shortcuts");
      expect(commandForKey(press("k", held), "editor")).toBeUndefined();
    }
    expect(COMMANDS.filter((command) => command.chord?.key.toLowerCase() === "k").map((command) => command.id)).toEqual([
      "keyboard-shortcuts",
    ]);
    expect(commandById("add-name")).toBeUndefined();
  });

  it("is Ctrl+; or Cmd+; for the spelling pass, and not a bare semicolon", () => {
    expect(commandForKey(press(";", { ctrl: true }), "editor")?.id).toBe("toggle-spellcheck");
    expect(commandForKey(press(";", { meta: true }), "editor")?.id).toBe("toggle-spellcheck");
    expect(commandForKey(press(";", { shift: true }), "editor")).toBeUndefined();
  });

  it("is Alt+Enter for a search, from anywhere in the window, and nothing else held", () => {
    const alt = press("Enter", { alt: true });
    expect(commandForKey(alt, "window")?.id).toBe("search");
    expect(commandForKey({ ...alt, altKey: false }, "window")).toBeUndefined();
    expect(commandForKey({ ...alt, ctrlKey: true }, "window")).toBeUndefined();
    expect(commandForKey({ ...alt, key: "f" }, "window")).toBeUndefined();
  });

  it("is Zoom In for Ctrl+= and for Ctrl++ (Shift+= on a US keyboard, or the number pad), and Cmd on a Mac", () => {
    for (const held of [{ ctrl: true }, { meta: true }] as const) {
      expect(commandForKey(press("=", held), "window")?.id).toBe("zoom-in");
      expect(commandForKey(press("+", { ...held, shift: true }), "window")?.id).toBe("zoom-in");
      expect(commandForKey(press("+", held), "window")?.id).toBe("zoom-in");
      expect(commandForKey(press("Add", held), "window")?.id).toBe("zoom-in");
    }
    // A bare = or + is the writer typing.
    expect(commandForKey(press("="), "window")).toBeUndefined();
    expect(commandForKey(press("+", { shift: true }), "window")).toBeUndefined();
    expect(commandForKey(press("=", { ctrl: true }), "editor")).toBeUndefined();
  });

  it("is Zoom Out for Ctrl+- and Reset Zoom for Ctrl+0, and Cmd on a Mac", () => {
    for (const held of [{ ctrl: true }, { meta: true }] as const) {
      expect(commandForKey(press("-", held), "window")?.id).toBe("zoom-out");
      expect(commandForKey(press("Subtract", held), "window")?.id).toBe("zoom-out");
      expect(commandForKey(press("0", held), "window")?.id).toBe("reset-zoom");
    }
    expect(commandForKey(press("-"), "window")).toBeUndefined();
    expect(commandForKey(press("0"), "window")).toBeUndefined();
    expect(commandForKey(press("0", { ctrl: true, alt: true }), "window")).toBeUndefined();
  });

  it("zooms from anywhere in the window, held keys stepping on, so the webview never zooms the whole window", () => {
    for (const id of ["zoom-in", "zoom-out", "reset-zoom"]) expect(commandById(id)?.keys, id).toBe("window");
    // Reset Zoom is View's own item; In and Out are the Zoom row's − and +.
    expect(commandById("reset-zoom")!.menu).toEqual({ name: "View", group: "zoom" });
    expect(commandById("zoom")!.menu).toEqual({ name: "View", group: "zoom" });
    expect(commandById("zoom")!.steps).toMatchObject({ less: "zoom-out", more: "zoom-in", count: 5 });
    expect(commandById("zoom")!.chord).toBeUndefined();
    expect(commandById("zoom-in")!.repeats).toBe(true);
    expect(commandById("zoom-out")!.repeats).toBe(true);
    // Every other window key answers a held key once, so a dialog does not flicker.
    expect(COMMANDS.filter((command) => command.repeats === true).map((command) => command.id)).toEqual([
      "zoom-in",
      "zoom-out",
    ]);
  });

  it("is asked only in the place the command is answered", () => {
    // Ctrl+S is the Editor's; Alt+Enter is the window's. Neither answers the other's.
    expect(commandForKey(press("s", { ctrl: true }), "window")).toBeUndefined();
    expect(commandForKey(press("Enter", { alt: true }), "editor")).toBeUndefined();
  });

  it("answers Ctrl+1…7 itself, before the surface's keymap, and leaves Escape to the window", () => {
    expect(commandForKey(press("1", { ctrl: true }), "editor")?.id).toBe("element-scene-heading");
    expect(commandForKey(press("7", { ctrl: true }), "editor")?.id).toBe("element-centered");
    expect(commandForKey(press("Escape"), "editor")).toBeUndefined();
    expect(commandForKey(press("Escape"), "window")).toBeUndefined();
  });
});

describe("the hint drawn beside a command", () => {
  it("is read from the key, so it cannot say what the key does not do", () => {
    expect(hintOf(commandById("save")!)).toBe("[Ctrl + S]");
    expect(hintOf(commandById("search")!)).toBe("[Alt + Enter]");
    expect(hintOf(commandById("to-home")!)).toBe("[Esc]");
    expect(hintOf(commandById("toggle-spellcheck")!)).toBe("[Ctrl + ;]");
    expect(hintOf(commandById("element-scene-heading")!)).toBe("[Ctrl + 1]");
    expect(hintOf(commandById("element-centered")!)).toBe("[Ctrl + 7]");
    // Zoom In's hint names the = key; Ctrl++ is the same key with Shift.
    expect(hintOf(commandById("zoom-in")!)).toBe("[Ctrl + =]");
    expect(hintOf(commandById("zoom-out")!)).toBe("[Ctrl + -]");
    expect(hintOf(commandById("reset-zoom")!)).toBe("[Ctrl + 0]");
  });


  it("is absent where there is no key", () => {
    expect(hintOf(commandById("export-as")!)).toBeUndefined();
    expect(hintOf(commandById("edit-title-page")!)).toBeUndefined();
  });

  it("is true for every command: whatever key a hint shows, pressing it finds a command", () => {
    for (const command of COMMANDS) {
      if (command.chord === undefined || command.keys === "elsewhere") continue;
      // The key the hint names, and every other name it arrives under.
      for (const key of [command.chord.key, ...(command.chord.alsoKeys ?? [])]) {
        const found = commandForKey(
          { key, altKey: command.chord.alt === true, ctrlKey: command.chord.mod === true, metaKey: false },
          command.keys ?? "editor",
        );
        expect(found?.id, `${command.id} by ${key}`).toBe(command.id);
      }
    }
  });

  it("is never claimed twice: no two commands answer the same key in the same place", () => {
    const seen = new Map<string, string>();
    for (const { id, chord, keys, sameKeyAs } of COMMANDS) {
      if (chord === undefined || sameKeyAs !== undefined) continue;
      for (const key of [chord.key, ...(chord.alsoKeys ?? [])]) {
        const claim = `${keys ?? "editor"}:${chord.mod ? "mod+" : ""}${chord.alt ? "alt+" : ""}${key.toLowerCase()}`;
        expect(seen.get(claim), `${id} and ${seen.get(claim)} both answer ${claim}`).toBeUndefined();
        seen.set(claim, id);
      }
    }
  });
});

describe("the Editor's menus", () => {
  const drawn = (): Record<string, string[]> =>
    Object.fromEntries(
      Object.entries(editorMenus(host())).map(([name, entries]) => [
        name,
        entries.map((entry) =>
          "divider" in entry ? "---" : "less" in entry ? `${entry.label} − ○○●○○ +` : `${entry.label}${hintNow(entry) ?? ""}`,
        ),
      ]),
    );

  it("hold what they held before the table, in the same order and groups", () => {
    expect(drawn()).toEqual({
      File: [
        "Save Project[Ctrl + S]",
        "Export As…",
        "---",
        "Open Project",
        "Edit Project Details…",
        "---",
        "Settings…",
        "---",
        "Home[Esc]",
      ],
      Edit: ["Undo[Ctrl + Z]", "Redo[Ctrl + Y]", "---", "Edit Title Page…", "---", "Edit Goals…", "---", "Character List", "Location List"],
      View: [
        "View Title Page",
        "---",
        "Spellcheck[Ctrl + ;]",
        "---",
        "Zoom − ○○●○○ +",
        "Reset Zoom[Ctrl + 0]",
        "---",
        "Hotkeys[Ctrl + K]",
      ],
    });
  });

  it("run the command the table names", () => {
    const act = host();
    const items = Object.values(editorMenus(act)).flat();
    const choose = (label: string): void => {
      const item = items.find((entry) => !("divider" in entry) && entry.label === label);
      if (item === undefined || "divider" in item || "less" in item) throw new Error(label);
      item.act();
    };
    const zoom = items.find((entry) => "less" in entry);
    if (zoom === undefined || !("less" in zoom)) throw new Error("Zoom");
    choose("Save Project");
    choose("Export As…");
    choose("Open Project");
    choose("Edit Project Details…");
    choose("Settings…");
    choose("Home");
    choose("Edit Title Page…");
    choose("View Title Page");
    choose("Spellcheck");
    choose("Undo");
    choose("Redo");
    zoom.more.act();
    zoom.less.act();
    choose("Reset Zoom");
    expect([zoom.less.label, zoom.more.label]).toEqual(["Zoom Out", "Zoom In"]);
    expect(zoom.at()).toEqual({ index: 2, count: 5 });
    expect(act["save"]).toHaveBeenCalledOnce();
    expect(act["exportAs"]).toHaveBeenCalledOnce();
    expect(act["toProjects"]).toHaveBeenCalledOnce();
    expect(act["editProjectDetails"]).toHaveBeenCalledOnce();
    expect(act["openSettings"]).toHaveBeenCalledOnce();
    expect(act["toHome"]).toHaveBeenCalledOnce();
    expect(act["editTitlePage"]).toHaveBeenCalledOnce();
    expect(act["viewTitlePage"]).toHaveBeenCalledOnce();
    expect(act["toggleSpellcheck"]).toHaveBeenCalledOnce();
    expect(act["undo"]).toHaveBeenCalledOnce();
    expect(act["redo"]).toHaveBeenCalledOnce();
    expect(act["zoomIn"]).toHaveBeenCalledOnce();
    expect(act["zoomOut"]).toHaveBeenCalledOnce();
    expect(act["resetZoom"]).toHaveBeenCalledOnce();
  });

  // Undo's keys are the screenplay surface's keymap, which runs the session's
  // undo (Add to Dictionary included): the table only draws them.
  it("offer Undo and Redo at the top of Edit, with the keys the paper answers", () => {
    for (const id of ["undo", "redo"]) {
      expect(commandById(id)?.keys, id).toBe("elsewhere");
      expect(commandById(id)?.menu, id).toEqual({ name: "Edit", group: "undo" });
    }
    expect(commandById("undo")?.chord).toEqual({ key: "z", mod: true });
    expect(commandById("redo")?.chord).toEqual({ key: "y", mod: true });
    expect(commandForKey(press("z", { ctrl: true }), "editor")).toBeUndefined();
  });

  it("tick the spelling item from whether the pass is on", () => {
    const entries = Object.values(editorMenus(host())).flat();
    const item = entries.find((entry) => !("divider" in entry) && entry.label === "Spellcheck");
    expect(item !== undefined && !("divider" in item) && !("less" in item) && item.checked?.()).toBe(true);
  });

  it("do not hold the commands that are not in a menu yet: the dual-dialogue three", () => {
    const labels = Object.values(editorMenus(host())).flat().map((entry) => ("divider" in entry ? "" : entry.label));
    for (const id of ["make-dual-dialogue", "make-normal-dialogue", "swap-speakers"]) {
      expect(labels).not.toContain(commandById(id)!.label);
    }
    expect(labels.join()).not.toMatch(/Add name|Confirm|Remove from list/);
  });
});

describe("the dual-dialogue commands, registered for a context menu to read (ADR-0034)", () => {
  const TWO = "INT. A - DAY\n\nSTEEL\nHi.\n\nBRICK\nYo.\n";
  const PAIR = "INT. A - DAY\n\nSTEEL\nHi.\n\nBRICK ^\nYo.\n";

  /** A view-shaped stand-in: the table reads `state`, `dispatch` and `focus`. */
  function editing(text: string) {
    let state: EditorState = editorStateFor(parse(text));
    const view = {
      get state() {
        return state;
      },
      dispatch: (tr: Parameters<EditorState["apply"]>[0]) => {
        state = state.apply(tr);
      },
      focus: () => {},
    } as unknown as EditorView;
    return { view, saved: () => serialise(manuscriptOf(state.doc)), state: () => state };
  }
  const inSecondSpeech = (state: EditorState): number => startOfElement(state, 4);

  it("sit in the table with a name, and with no key and no menu", () => {
    for (const id of ["make-dual-dialogue", "make-normal-dialogue", "swap-speakers"]) {
      const command = commandById(id);
      expect(command?.label, id).toBeTruthy();
      expect(command?.chord, id).toBeUndefined();
      expect(command?.menu, id).toBeUndefined();
    }
  });

  it("say whether they would do anything where the writer clicked", () => {
    const two = editing(TWO);
    const at = inSecondSpeech(two.state());
    expect(isAvailable(commandById("make-dual-dialogue")!, host(two.view), at)).toBe(true);
    expect(isAvailable(commandById("make-normal-dialogue")!, host(two.view), at)).toBe(false);
    expect(isAvailable(commandById("swap-speakers")!, host(two.view), at)).toBe(false);

    const pair = editing(PAIR);
    const there = inSecondSpeech(pair.state());
    expect(isAvailable(commandById("make-dual-dialogue")!, host(pair.view), there)).toBe(false);
    expect(isAvailable(commandById("make-normal-dialogue")!, host(pair.view), there)).toBe(true);
    expect(isAvailable(commandById("swap-speakers")!, host(pair.view), there)).toBe(true);
  });

  it("are unavailable before the manuscript has been read", () => {
    expect(isAvailable(commandById("make-dual-dialogue")!, host(undefined), 1)).toBe(false);
  });

  it("do the work the named command does, as the file would show it", () => {
    const writing = editing(TWO);
    const at = inSecondSpeech(writing.state());
    runCommand(commandById("make-dual-dialogue")!, host(writing.view), at);
    expect(writing.saved()).toBe(PAIR);

    runCommand(commandById("swap-speakers")!, host(writing.view), at);
    expect(writing.saved()).toBe("INT. A - DAY\n\nBRICK\nYo.\n\nSTEEL ^\nHi.\n");

    runCommand(commandById("make-normal-dialogue")!, host(writing.view), at);
    expect(writing.saved()).toBe("INT. A - DAY\n\nBRICK\nYo.\n\nSTEEL\nHi.\n");
  });

  it("default to the caret when no place is given", () => {
    const writing = editing(TWO);
    writing.view.dispatch(
      writing.state().tr.setSelection(TextSelection.create(writing.state().doc, inSecondSpeech(writing.state()))),
    );
    runCommand(commandById("make-dual-dialogue")!, host(writing.view));
    expect(writing.saved()).toBe(PAIR);
  });
});
