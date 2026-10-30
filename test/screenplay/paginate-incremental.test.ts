/**
 * #49 — The page count keeps up as you type.
 *
 * Incremental re-packs from the affected page onward must equal a full
 * `paginate` after any edits, and must not restart earlier pages.
 */
import { describe, expect, it } from "vitest";
import type { Element, ScreenplayDocument } from "../../src/screenplay/document.ts";
import { exportScreenplay, importScreenplay } from "../../src/screenplay/import.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { decodeFile } from "../../src/decode.ts";
import {
  paginate,
  repaginate,
  type PaginationDetail,
} from "../../src/screenplay/paginate.ts";
import { readFixtureBytes } from "../support/files.ts";

function loadFixture(name: string): ScreenplayDocument {
  return parse(
    decodeFile(exportScreenplay(importScreenplay(readFixtureBytes(name)).document)).text,
  );
}

function element(
  type: Element["type"],
  text: string,
  extra: Partial<Element> = {},
): Element {
  return { type, text, forced: false, ...extra };
}

function documentOf(elements: Element[]): ScreenplayDocument {
  return { titlePage: [], elements, comments: [], endsWithNewline: true };
}

function samePagination(a: PaginationDetail, b: PaginationDetail): void {
  expect(a.totalPages).toBe(b.totalPages);
  expect(a.fill).toEqual(b.fill);
  expect(a.pageOfElement).toEqual(b.pageOfElement);
}

describe("repaginate equals a full paginate", () => {
  it("matches after editing an early action line on Brick & Steel", () => {
    const doc = loadFixture("Brick-&-Steel.fountain");
    const full = paginate(doc);
    const dirty = doc.elements.findIndex((el) => el.type === "action");
    expect(dirty).toBeGreaterThanOrEqual(0);
    const edited: ScreenplayDocument = {
      ...doc,
      elements: doc.elements.map((el, i) =>
        i === dirty ? { ...el, text: el.text + " And then some." } : el,
      ),
    };
    const prior = paginate(doc);
    const incremental = repaginate(edited, prior, dirty);
    samePagination(incremental, paginate(edited));
    expect(incremental.resumedFromPage).toBeGreaterThanOrEqual(1);
    expect(incremental.resumedFromPage).toBeLessThanOrEqual(prior.pageOfElement[dirty] ?? 1);
    // Unrelated: full still 4-ish after a short append may stay 4.
    expect(full.totalPages).toBe(4);
  });

  it("matches after editing near the end of Big Fish and resumes late", () => {
    const doc = loadFixture("Big-Fish.fountain");
    const prior = paginate(doc);
    expect(prior.totalPages).toBe(120);
    // Last mapped action-like element.
    let dirty = -1;
    for (let i = doc.elements.length - 1; i >= 0; i--) {
      if (prior.pageOfElement[i] !== undefined && doc.elements[i]!.type === "action") {
        dirty = i;
        break;
      }
    }
    expect(dirty).toBeGreaterThan(0);
    const pageBefore = prior.pageOfElement[dirty]!;
    expect(pageBefore).toBeGreaterThan(100);
    const edited: ScreenplayDocument = {
      ...doc,
      elements: doc.elements.map((el, i) =>
        i === dirty ? { ...el, text: el.text + " More words on the last pages." } : el,
      ),
    };
    const incremental = repaginate(edited, prior, dirty);
    samePagination(incremental, paginate(edited));
    expect(incremental.resumedFromPage).toBeGreaterThan(50);
    // Resumes on the page before the edit so the break into the dirty page
    // is recomputed (traveling orphan blank).
    expect(incremental.resumedFromPage).toBeLessThanOrEqual(pageBefore);
    expect(incremental.resumedFromPage).toBeGreaterThanOrEqual(pageBefore - 1);
  });

  it("matches a sequence of appends on a small manuscript", () => {
    let doc = documentOf([
      element("scene-heading", "INT. ROOM - DAY"),
      element("action", "A quiet room."),
      element("character", "MAYA"),
      element("dialogue", "Hello there."),
    ]);
    let pages = paginate(doc);
    for (let step = 0; step < 40; step++) {
      const dirty = doc.elements.length - 1;
      doc = {
        ...doc,
        elements: [
          ...doc.elements,
          element("action", `Beat number ${step}. The clock keeps time on the shelf.`),
        ],
      };
      pages = repaginate(doc, pages, dirty);
      samePagination(pages, paginate(doc));
    }
    expect(pages.totalPages).toBeGreaterThan(1);
  });
});

describe("repaginate without prior state", () => {
  it("falls back to a full pack", () => {
    const doc = loadFixture("Brick-&-Steel.fountain");
    const incremental = repaginate(doc, undefined, 0);
    samePagination(incremental, paginate(doc));
    expect(incremental.resumedFromPage).toBe(1);
  });
});
