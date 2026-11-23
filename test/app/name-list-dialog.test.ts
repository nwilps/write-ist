// @vitest-environment jsdom
/**
 * The Character List and Location List dialogs (Edit menu; Noah, 2026-11-21):
 * set like Settings ▸ Dictionary — a field that finds and adds, a cell for
 * each name with its Remove — saying nothing when a name is added or removed,
 * and keeping room on each row for a Replace that is not built yet.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { COMMANDS } from "../../app/src/workspaces/editor/commands.ts";
import { openNameListDialog } from "../../app/src/workspaces/editor/name-list-dialog.ts";
import { NameLists } from "../../src/screenplay/names.ts";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => document.body.replaceChildren());

/** A dialog over real lists: EDWARD and EDGAR on them by use (EDGAR once), EDNA by hand. */
function opened() {
  const lists = NameLists.of(["EDWARD", "EDWARD", "EDWARD", "EDGAR"].map((text) => ({ type: "character" as const, text })));
  lists.add("character", "EDNA");
  const closed = vi.fn();
  const modal = openNameListDialog(document.body, {
    title: "Character List",
    noun: "character",
    names: () => lists.list("character"),
    add: (name) => lists.add("character", name),
    remove: (name) => lists.remove("character", name),
    closed,
  });
  const field = modal.querySelector<HTMLInputElement>("#name-list-name")!;
  const shown = () => [...modal.querySelectorAll(".settings__row-name")].map((name) => name.textContent);
  const button = (label: string) => [...modal.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === label || b.textContent?.includes(label))!;
  const type = (text: string) => {
    field.value = text;
    field.dispatchEvent(new Event("input"));
  };
  return { lists, modal, field, shown, button, type, closed };
}

describe("a name list dialog", () => {
  it("lists the names autocomplete offers, by name", () => {
    expect(opened().shown()).toEqual(["EDGAR", "EDNA", "EDWARD"]);
  });

  it("finds as the writer types, in any case", () => {
    const { type, shown } = opened();
    type("edw");
    expect(shown()).toEqual(["EDWARD"]);
  });

  it("adds what the field holds, in capitals, and offers it at once", () => {
    const { type, button, shown, lists, field } = opened();
    type("zelda");
    button("Add").click();
    expect(lists.startingWith("character", "Z")).toEqual(["ZELDA"]);
    expect(field.value).toBe("");
    expect(shown()).toContain("ZELDA");
  });

  it("will not add a name already in the list, or nothing", () => {
    const { type, button } = opened();
    type("");
    expect(button("Add").disabled).toBe(true);
    type("edward");
    expect(button("Add").disabled).toBe(true);
  });

  it("removes a name: gone from the list and from autocomplete, though the script still uses it", () => {
    const { button, shown, lists } = opened();
    button("Remove EDWARD").click();
    expect(shown()).toEqual(["EDGAR", "EDNA"]);
    expect(lists.isRemoved("character", "EDWARD")).toBe(true);
    expect(lists.startingWith("character", "EDW")).toEqual([]);
    // The script's own EDWARD cues do not put it back as the lists settle.
    lists.settle();
    expect(shown()).toEqual(["EDGAR", "EDNA"]);
    expect(lists.list("character")).toEqual(["EDGAR", "EDNA"]);
  });

  it("says nothing when a name is added or removed", () => {
    const { modal, type, button } = opened();
    const words = () => modal.textContent;
    const before = words();
    type("zelda");
    button("Add").click();
    button("Remove ZELDA").click();
    expect(words()).toBe(before);
    expect(modal.querySelector(".trouble, [role=alert], [role=status]")).toBeNull();
  });

  it("keeps room on each row for a Replace, beside Remove", () => {
    const { modal } = opened();
    for (const row of modal.querySelectorAll(".settings__cell")) {
      const actions = row.querySelector(".name-list__actions")!;
      expect([...actions.children].map((child) => child.textContent)).toEqual([expect.stringContaining("Remove")]);
    }
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style", "settings.css"), "utf8");
    expect(css).toMatch(/\.name-list__actions \{[^}]*min-width: var\(--measure-name-list-actions\)/);
  });

  it("is closed by Done", () => {
    const { button, closed, modal } = opened();
    button("Done").click();
    expect(closed).toHaveBeenCalledOnce();
    expect(modal.isConnected).toBe(false);
  });
});

describe("the Edit menu", () => {
  it("opens each list's own dialog", () => {
    const editNameList = vi.fn();
    for (const [id, kind] of [["character-list", "character"], ["location-list", "location"]] as const) {
      const command = COMMANDS.find((entry) => entry.id === id)!;
      expect(command.menu?.name).toBe("Edit");
      command.run({ editNameList } as never, 0);
      expect(editNameList).toHaveBeenLastCalledWith(kind);
    }
    expect(COMMANDS.filter((entry) => entry.menu?.group === "names").map((entry) => entry.label)).toEqual(["Character List", "Location List"]);
  });
});
