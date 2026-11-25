/**
 * Five tabs at the most (`src/notes/tabs.ts`), and which of an older
 * session's tabs open again: the first five, the one in front always among them.
 */
import { describe, expect, it } from "vitest";
import { MOST_OPEN_NOTES, tabsToReopen } from "../../src/notes/tabs.ts";

const notes = (count: number) => Array.from({ length: count }, (_, index) => `Note ${index + 1}`);

describe("tabsToReopen", () => {
  it("is five", () => {
    expect(MOST_OPEN_NOTES).toBe(5);
  });

  it("opens every tab when there are five or fewer, in order", () => {
    expect(tabsToReopen([], undefined)).toEqual([]);
    expect(tabsToReopen(notes(3), "Note 2")).toEqual(notes(3));
    expect(tabsToReopen(notes(5), "Note 5")).toEqual(notes(5));
  });

  it("keeps the first five of more, when the one in front is among them", () => {
    expect(tabsToReopen(notes(8), "Note 3")).toEqual(notes(5));
    expect(tabsToReopen(notes(8), "Note 5")).toEqual(notes(5));
    expect(tabsToReopen(notes(8), undefined)).toEqual(notes(5));
  });

  it("puts the one in front in the fifth place when it was further along", () => {
    expect(tabsToReopen(notes(8), "Note 6")).toEqual(["Note 1", "Note 2", "Note 3", "Note 4", "Note 6"]);
    expect(tabsToReopen(notes(14), "Note 14")).toEqual(["Note 1", "Note 2", "Note 3", "Note 4", "Note 14"]);
  });

  it("ignores a front that is not among the tabs", () => {
    expect(tabsToReopen(notes(7), "Elsewhere")).toEqual(notes(5));
  });

  it("does not change the list it is given", () => {
    const tabs = notes(7);
    tabsToReopen(tabs, "Note 7");
    expect(tabs).toEqual(notes(7));
  });
});
