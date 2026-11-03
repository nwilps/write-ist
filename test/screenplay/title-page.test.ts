/**
 * The title page form's model (slice 2, step 4): fields in, boxes out, and the
 * file back with nothing changed but what the writer changed.
 */
import { describe, expect, it } from "vitest";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import {
  TITLE_PAGE_KEYS,
  applyForm,
  formOf,
  sameTitlePage,
  type TitlePageForm,
  type TitlePageKey,
} from "../../src/screenplay/title-page.ts";
import { decodeFile } from "../../src/decode.ts";
import { exportScreenplay, importScreenplay } from "../../src/screenplay/import.ts";
import { readFixtureBytes } from "../support/files.ts";

/** The fixture as Write-ist holds it: ADR-0020's normalisations applied once, on import. */
const readFixtureText = (name: string): string =>
  decodeFile(exportScreenplay(importScreenplay(readFixtureBytes(name)).document)).text;

const FIXTURES = ["Big-Fish.fountain", "Big-Fish-augmented.fountain", "Brick-&-Steel.fountain"];

const withValue = (form: TitlePageForm, key: TitlePageKey, value: string): TitlePageForm => ({
  ...form,
  values: { ...form.values, [key]: value },
});

function saved(text: string, form: (opened: TitlePageForm) => TitlePageForm): string {
  const document = parse(text);
  const applied = applyForm(document.titlePage, form(formOf(document.titlePage)));
  if ("problem" in applied) throw new Error(applied.problem);
  return serialise({ ...document, titlePage: applied.titlePage });
}

describe("opening the dialog and saving unchanged", () => {
  for (const name of FIXTURES) {
    it(`${name}: writes the file byte for byte`, () => {
      const text = readFixtureText(name);
      expect(saved(text, (opened) => opened)).toBe(text);
    });
  }
});

describe("editing one field", () => {
  const lines = (text: string): string[] => text.split("\n");

  for (const name of FIXTURES) {
    for (const key of TITLE_PAGE_KEYS) {
      it(`${name}: changing ${key} changes only ${key}'s lines`, () => {
        const text = readFixtureText(name);
        const before = parse(text).titlePage;
        const had = formOf(before).values[key] !== "";
        const after = saved(text, (opened) => withValue(opened, key, "Changed\nSecond line"));
        const reread = parse(after);

        // The title page has this field, with the typed value, on a tab-indented continuation.
        const field = reread.titlePage.find((f) => f.key === key)!;
        expect(field.inline.text).toBe(" Changed");
        expect(field.continuations.map((c) => c.text)).toEqual(["Second line"]);
        // Nothing else moved: every other field is the very same text.
        const others = (fields: typeof before) =>
          fields.filter((f) => f.key !== key).map((f) => serialise({ titlePage: [f], elements: [], comments: [], endsWithNewline: false }));
        expect(others(reread.titlePage)).toEqual(others(before));
        // And the script below the title page is untouched.
        expect(serialise({ ...reread, titlePage: [] })).toBe(serialise({ ...parse(text), titlePage: [] }));
        // The diff is in that field's lines: the file grew by exactly the lines it gained.
        if (had) {
          const old = before.find((f) => f.key === key)!;
          const delta = 2 - (1 + old.continuations.length);
          expect(lines(after).length - lines(text).length).toBe(delta);
        }
      });
    }
  }

  it("keeps marks as written in the box, and unchanged marks survive an edit elsewhere", () => {
    const text = readFixtureText("Brick-&-Steel.fountain");
    const opened = formOf(parse(text).titlePage);
    expect(opened.values.Title).toBe("_**BRICK & STEEL**_\n_**FULL RETIRED**_");
    const after = saved(text, (form) => withValue(form, "Credit", "Screenplay by"));
    expect(after).toContain("\t_**BRICK & STEEL**_\n\t_**FULL RETIRED**_\n");
    expect(after).toContain("Credit: Screenplay by\n");
  });

  it("takes marks typed in a box as marks", () => {
    const after = parse(saved("Title: x\n\nHe waits.\n", (form) => withValue(form, "Title", "**Bold**")));
    expect(after.titlePage[0]!.inline).toEqual({ text: " Bold", marks: [{ mark: "bold", start: 1, end: 5 }] });
  });

  it("takes free text for the draft date", () => {
    const after = saved("Title: x\n\nHe waits.\n", (form) => withValue(form, "Draft date", "the week after next"));
    expect(after).toBe("Title: x\nDraft date: the week after next\n\nHe waits.\n");
  });

  it("places a new key among the others in the dialog's order", () => {
    const after = saved("Title: x\nContact: me\n\nHe waits.\n", (form) => withValue(form, "Author", "Me"));
    expect(after).toBe("Title: x\nAuthor: Me\nContact: me\n\nHe waits.\n");
  });

  it("removes a field whose box is emptied, and writes no title page when none is left", () => {
    expect(saved("Title: x\nCredit: y\n\nHe waits.\n", (f) => withValue(f, "Credit", "  \n "))).toBe(
      "Title: x\n\nHe waits.\n",
    );
    expect(saved("Title: x\n\nHe waits.\n", (f) => withValue(f, "Title", ""))).toBe("He waits.\n");
  });
});

describe("keys the dialog has no box for", () => {
  const TEXT = "Title: x\nRevision: Blue\nTagline: one\n\tof two\nTitle: again\nContact:\n\tA\n\tB\n\tC\n\nHe waits.\n";

  it("lists them, and a repeated key, under Other", () => {
    const form = formOf(parse(TEXT).titlePage);
    expect(form.values.Title).toBe("x");
    expect(form.other).toBe("Revision: Blue\nTagline: one\n\tof two\nTitle: again");
  });

  it("survives a save that changes something else, in place", () => {
    expect(saved(TEXT, (f) => withValue(f, "Title", "y"))).toBe(TEXT.replace("Title: x", "Title: y"));
  });

  it("survives an edit to Other itself", () => {
    const after = saved(TEXT, (f) => ({ ...f, other: "Revision: Pink" }));
    expect(after).toBe("Title: x\nRevision: Pink\nContact:\n\tA\n\tB\n\tC\n\nHe waits.\n");
  });

  it("refuses an Other that is not Key: value lines", () => {
    const applied = applyForm(parse(TEXT).titlePage, { ...formOf(parse(TEXT).titlePage), other: "just words" });
    expect("problem" in applied).toBe(true);
  });
});

describe("sameTitlePage", () => {
  it("is how Save knows it has nothing to write", () => {
    const a = parse("Title: x\n\nHe waits.\n").titlePage;
    expect(sameTitlePage(a, parse("Title: x\n\nShe waits.\n").titlePage)).toBe(true);
    expect(sameTitlePage(a, parse("Title: y\n\nHe waits.\n").titlePage)).toBe(false);
  });
});
