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
    "save", "saveCopy", "exportPdf", "toProjects", "toHome", "editTitlePage", "viewTitlePage", "editGoals",
    "toggleSpellcheck", "search", "undo", "redo",
  ] as const;
  const spies = Object.fromEntries(names.map((name) => [name, vi.fn()]));
  return { ...spies, spellcheckOn: vi.fn(() => true), view: () => view } as never;
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

  it("is nothing for Ctrl+K or Cmd+K: no command has that key", () => {
    for (const keys of ["editor", "window"] as const) {
      expect(commandForKey(press("k", { ctrl: true }), keys)).toBeUndefined();
      expect(commandForKey(press("K", { meta: true }), keys)).toBeUndefined();
    }
    expect(COMMANDS.filter((command) => command.chord?.key.toLowerCase() === "k")).toEqual([]);
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

  it("is asked only in the place the command is answered", () => {
    // Ctrl+S is the Editor's; Alt+Enter is the window's. Neither answers the other's.
    expect(commandForKey(press("s", { ctrl: true }), "window")).toBeUndefined();
    expect(commandForKey(press("Enter", { alt: true }), "editor")).toBeUndefined();
  });

  it("leaves the keys other code answers alone: Ctrl+1…7 are the surface's, Escape the window's", () => {
    expect(commandForKey(press("1", { ctrl: true }), "editor")).toBeUndefined();
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
  });


  it("is absent where there is no key", () => {
    expect(hintOf(commandById("save-copy")!)).toBeUndefined();
    expect(hintOf(commandById("edit-title-page")!)).toBeUndefined();
  });

  it("is true for every command: whatever key a hint shows, pressing it finds a command", () => {
    for (const command of COMMANDS) {
      if (command.chord === undefined || command.keys === "elsewhere") continue;
      const found = commandForKey(
        { key: command.chord.key, altKey: command.chord.alt === true, ctrlKey: command.chord.mod === true, metaKey: false },
        command.keys ?? "editor",
      );
      expect(found?.id, command.id).toBe(command.id);
    }
  });

  it("is never claimed twice: no two commands answer the same key in the same place", () => {
    const seen = new Map<string, string>();
    for (const { id, chord, keys, sameKeyAs } of COMMANDS) {
      if (chord === undefined || sameKeyAs !== undefined) continue;
      const claim = `${keys ?? "editor"}:${chord.mod ? "mod+" : ""}${chord.alt ? "alt+" : ""}${chord.key.toLowerCase()}`;
      expect(seen.get(claim), `${id} and ${seen.get(claim)} both answer ${claim}`).toBeUndefined();
      seen.set(claim, id);
    }
  });
});

describe("the Editor's menus", () => {
  const drawn = (): Record<string, string[]> =>
    Object.fromEntries(
      Object.entries(editorMenus(host())).map(([name, entries]) => [
        name,
        entries.map((entry) => ("divider" in entry ? "---" : `${entry.label}${entry.hint ?? ""}`)),
      ]),
    );

  it("hold what they held before the table, in the same order and groups", () => {
    expect(drawn()).toEqual({
      File: [
        "Save Project[Ctrl + S]",
        "Save a Copy as Fountain…",
        "Export as PDF…",
        "---",
        "Open Project",
        "---",
        "Home[Esc]",
      ],
      Edit: ["Undo[Ctrl + Z]", "Redo[Ctrl + Y]", "---", "Edit Title Page…", "---", "Edit Goals…"],
      View: ["View Title Page", "---", "Spellcheck[Ctrl + ;]"],
    });
  });

  it("run the command the table names", () => {
    const act = host();
    const items = Object.values(editorMenus(act)).flat();
    const choose = (label: string): void => {
      const item = items.find((entry) => !("divider" in entry) && entry.label === label);
      if (item === undefined || "divider" in item) throw new Error(label);
      item.act();
    };
    choose("Save Project");
    choose("Save a Copy as Fountain…");
    choose("Export as PDF…");
    choose("Open Project");
    choose("Home");
    choose("Edit Title Page…");
    choose("View Title Page");
    choose("Spellcheck");
    choose("Undo");
    choose("Redo");
    expect(act["save"]).toHaveBeenCalledOnce();
    expect(act["saveCopy"]).toHaveBeenCalledOnce();
    expect(act["exportPdf"]).toHaveBeenCalledOnce();
    expect(act["toProjects"]).toHaveBeenCalledOnce();
    expect(act["toHome"]).toHaveBeenCalledOnce();
    expect(act["editTitlePage"]).toHaveBeenCalledOnce();
    expect(act["viewTitlePage"]).toHaveBeenCalledOnce();
    expect(act["toggleSpellcheck"]).toHaveBeenCalledOnce();
    expect(act["undo"]).toHaveBeenCalledOnce();
    expect(act["redo"]).toHaveBeenCalledOnce();
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
    expect(item !== undefined && !("divider" in item) && item.checked?.()).toBe(true);
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
