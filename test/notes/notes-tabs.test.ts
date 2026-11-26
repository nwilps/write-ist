/**
 * Six tabs at the most (`src/notes/tabs.ts`), and which of an older
 * session's tabs open again: the first six, the one in front always among them.
 */
import { describe, expect, it } from "vitest";
import { MOST_OPEN_NOTES, tabsToReopen } from "../../src/notes/tabs.ts";

const notes = (count: number) => Array.from({ length: count }, (_, index) => `Note ${index + 1}`);

describe("tabsToReopen", () => {
  it("is six", () => {
    expect(MOST_OPEN_NOTES).toBe(6);
  });

  it("opens every tab when there are six or fewer, in order", () => {
    expect(tabsToReopen([], undefined)).toEqual([]);
    expect(tabsToReopen(notes(3), "Note 2")).toEqual(notes(3));
    expect(tabsToReopen(notes(6), "Note 6")).toEqual(notes(6));
  });

  it("keeps the first six of more, when the one in front is among them", () => {
    expect(tabsToReopen(notes(8), "Note 3")).toEqual(notes(6));
    expect(tabsToReopen(notes(8), "Note 6")).toEqual(notes(6));
    expect(tabsToReopen(notes(8), undefined)).toEqual(notes(6));
  });

  it("puts the one in front in the sixth place when it was further along", () => {
    expect(tabsToReopen(notes(8), "Note 7")).toEqual(["Note 1", "Note 2", "Note 3", "Note 4", "Note 5", "Note 7"]);
    expect(tabsToReopen(notes(14), "Note 14")).toEqual(["Note 1", "Note 2", "Note 3", "Note 4", "Note 5", "Note 14"]);
  });

  it("ignores a front that is not among the tabs", () => {
    expect(tabsToReopen(notes(7), "Elsewhere")).toEqual(notes(6));
  });

  it("does not change the list it is given", () => {
    const tabs = notes(7);
    tabsToReopen(tabs, "Note 7");
    expect(tabs).toEqual(notes(7));
  });
});
