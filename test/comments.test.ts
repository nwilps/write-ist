/**
 * Comments, modelled (ADR-0018).
 *
 * A comment is the writer's remark about a span of text, stored inline:
 *
 *   screenplay   [[c:a1 remark]]span[[/c:a1]]
 *   prose        <!--c:a1 remark-->span<!--/c:a1-->
 *
 * The bytes of every fixture round-tripped before comments were modelled —
 * the delimiters simply sat in the text — so a byte test proves nothing here.
 * Every test below asserts the comments themselves, and the classification of
 * the element a comment is wrapped round, which is the part of this change the
 * byte gate cannot see.
 */
import { describe, expect, it } from "vitest";
import type { Comment } from "../src/comments.ts";
import { exportProse, importProse, reopenAndSave as reopenProse } from "../src/prose/import.ts";
import { parse as parseProse } from "../src/prose/parse.ts";
import { serialise as serialiseProse } from "../src/prose/serialise.ts";
import {
  exportScreenplay,
  importScreenplay,
  reopenAndSave as reopenScreenplay,
} from "../src/screenplay/import.ts";
import { parse as parseScreenplay } from "../src/screenplay/parse.ts";
import { serialise as serialiseScreenplay } from "../src/screenplay/serialise.ts";
import { readFixtureBytes } from "./support/files.ts";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** Parse, write, and assert the text came back exactly as it went in. */
const roundTripsScreenplay = (source: string): void =>
  expect(serialiseScreenplay(parseScreenplay(source))).toBe(source);
const roundTripsProse = (source: string): void =>
  expect(serialiseProse(parseProse(source))).toBe(source);

/** The text a comment covers, when it starts and ends in one element. */
function covered(
  document: { elements: readonly { text: string }[]; comments: readonly Comment[] },
  id: string,
): string {
  const comment = document.comments.find((c) => c.id === id)!;
  expect(comment.start.element).toBe(comment.end.element);
  return document.elements[comment.start.element]!.text.slice(
    comment.start.offset,
    comment.end.offset,
  );
}

describe("the Republic's four comments", () => {
  const { document } = importProse(readFixtureBytes("Republic-manuscript.md"));

  it("reads each remark back exactly, quotation marks and all", () => {
    expect(document.comments.map((c) => [c.id, c.remark])).toEqual([
      ["a1", 'does "went down" carry the descent to Piraeus?'],
      ["b1", 'is "turned round" too casual for Socrates?'],
      ["b2", "whose master, Polemarchus or Cephalus?"],
      // Written `--&gt;` in the file; read back as the arrow the writer typed.
      ["c1", 'Jowett glosses this "concessive --> ironic"'],
    ]);
  });

  it("puts each over the words it was written round", () => {
    expect(covered(document, "a1")).toBe("I went down yesterday to the Piraeus");
    expect(covered(document, "b1")).toBe("I turned round, and asked him");
    expect(covered(document, "b2")).toBe("and asked him where his master was.");
    expect(covered(document, "c1")).toBe("You are not far wrong, I said.");
  });

  it("leaves no comment delimiter in any element's text, and the fixture note alone", () => {
    for (const element of document.elements) {
      if (element.type === "passthrough") continue;
      expect(element.text).not.toMatch(/<!--\/?c:/);
    }
    // An HTML comment with no `c:` is not a Write-ist comment: still a passthrough.
    const notes = document.elements.filter((e) => e.text.startsWith("<!-- Fixture note"));
    expect(notes.map((e) => e.type)).toEqual(["passthrough"]);
  });
});

describe("a comment across lines is one comment with one remark", () => {
  it("screenplay: opens on one action line and closes two lines later", () => {
    const source = [
      "INT. KITCHEN - DAY",
      "",
      "[[c:x1 all of this drags]]He runs.",
      "",
      "She follows.",
      "",
      "They stop.[[/c:x1]]",
    ].join("\n");
    const document = parseScreenplay(source);

    expect(document.elements.map((e) => e.type)).toEqual([
      "scene-heading",
      "action",
      "action",
      "action",
    ]);
    expect(document.comments).toEqual([
      {
        id: "x1",
        remark: "all of this drags",
        start: { element: 1, offset: 0 },
        end: { element: 3, offset: "They stop.".length },
      },
    ]);
    roundTripsScreenplay(source);
  });

  it("prose: opens in one wrapped line and closes in a later paragraph", () => {
    const source = [
      "The first line of a paragraph <!--c:x1 slow-->that wraps",
      "onto a second line.",
      "",
      "And a second paragraph, where it ends.<!--/c:x1-->",
    ].join("\n");
    const document = parseProse(source);

    expect(document.comments).toEqual([
      {
        id: "x1",
        remark: "slow",
        start: { element: 0, offset: "The first line of a paragraph ".length },
        end: { element: 1, offset: "And a second paragraph, where it ends.".length },
      },
    ]);
    roundTripsProse(source);
  });
});

describe("comments nest and cross, matched by id", () => {
  it("round-trips a crossing pair in Fountain", () => {
    const source = "[[c:b1]]a [[c:b2]]b[[/c:b1]] c[[/c:b2]]";
    const document = parseScreenplay(source);

    expect(document.elements[0]!.text).toBe("a b c");
    expect(covered(document, "b1")).toBe("a b");
    expect(covered(document, "b2")).toBe("b c");
    roundTripsScreenplay(source);
  });

  it("round-trips a crossing pair in Markdown", () => {
    roundTripsProse("<!--c:b1-->a <!--c:b2-->b<!--/c:b1--> c<!--/c:b2-->");
  });

  it("orders two delimiters at the same position by id, so re-saving is stable", () => {
    // Written z9 first; written back a1 first, once, and then never again.
    const source = "[[c:z9 later]][[c:a1 earlier]]Text.[[/c:a1]][[/c:z9]]";
    const once = serialiseScreenplay(parseScreenplay(source));

    expect(once).toBe("[[c:a1 earlier]][[c:z9 later]]Text.[[/c:a1]][[/c:z9]]");
    expect(serialiseScreenplay(parseScreenplay(once))).toBe(once);
  });

  it("keeps a comment outside a mark that begins and ends with it", () => {
    roundTripsScreenplay("[[c:a1 x]]**bold**[[/c:a1]] and not");
    const document = parseScreenplay("[[c:a1 x]]**bold**[[/c:a1]] and not");
    expect(document.elements[0]!.text).toBe("bold and not");
    expect(covered(document, "a1")).toBe("bold");
  });
});

describe("classification does not change: comments come out first", () => {
  it("reads a commented scene heading as a scene heading", () => {
    const document = parseScreenplay("[[c:a1 weak]]INT. KITCHEN - DAY[[/c:a1]]");

    expect(document.elements.map((e) => e.type)).toEqual(["scene-heading"]);
    expect(document.elements[0]!.text).toBe("INT. KITCHEN - DAY");
    expect(covered(document, "a1")).toBe("INT. KITCHEN - DAY");
    roundTripsScreenplay("[[c:a1 weak]]INT. KITCHEN - DAY[[/c:a1]]");
  });

  it("reads a commented cue as a cue, and (CONT'D) still knows the speaker", () => {
    const source = [
      "[[c:a1 x]]EDWARD[[/c:a1]]",
      "Hello.",
      "",
      "He waits.",
      "",
      "EDWARD",
      "Again.",
    ].join("\n");
    const { document, report } = importScreenplay(utf8(source));

    expect(document.elements.map((e) => e.type)).toEqual([
      "character",
      "dialogue",
      "action",
      "character",
      "dialogue",
    ]);
    expect(document.elements[0]!.text).toBe("EDWARD");
    // The second cue is the same speaker resuming, which is only known if the
    // first was read as EDWARD rather than as `[[c:a1 x]]EDWARD[[/c:a1]]`.
    expect(document.elements[3]!.text).toBe("EDWARD (CONT'D)");
    expect(report.applied).toContainEqual({ kind: "continuations-added", count: 1 });
    // The first cue gains nothing, and its comment still closes on the name.
    expect(text(exportScreenplay(document)).split("\n")[0]).toBe("[[c:a1 x]]EDWARD[[/c:a1]]");
  });

  it("reads a commented line of action as action", () => {
    const document = parseScreenplay("[[c:a1 x]]He runs.[[/c:a1]]");

    expect(document.elements.map((e) => e.type)).toEqual(["action"]);
    expect(document.elements[0]!.text).toBe("He runs.");
  });

  it("leaves a note with no c: a plain note", () => {
    const note = "[[Check the catfish is described the same way in the wedding scene]]";
    const document = parseScreenplay(note);

    expect(document.elements.map((e) => [e.type, e.text])).toEqual([["note", note]]);
    expect(document.comments).toEqual([]);
  });

  it("keeps a forcing marker outside the comment, and the heading forced", () => {
    const source = ".[[c:a1 x]]INT. KITCHEN - DAY[[/c:a1]]";
    const document = parseScreenplay(source);

    expect(document.elements.map((e) => [e.type, e.forced])).toEqual([["scene-heading", true]]);
    expect(document.elements[0]!.text).toBe("INT. KITCHEN - DAY");
    roundTripsScreenplay(source);
  });

  it("reads a commented prose heading as a heading", () => {
    const document = parseProse("## <!--c:a1 rename?-->Book I<!--/c:a1-->");

    expect(document.elements.map((e) => [e.type, e.text])).toEqual([["heading", "Book I"]]);
    roundTripsProse("## <!--c:a1 rename?-->Book I<!--/c:a1-->");
  });
});

describe("an unmatched delimiter is kept and reported, never discarded", () => {
  it("screenplay: opens, keeps the characters, and says so", () => {
    const source = "INT. KITCHEN - DAY\n\n[[c:a1 dangling]]He runs.";
    const { document, report } = importScreenplay(utf8(source));

    expect(document.comments).toEqual([]);
    expect(document.elements[1]!.text).toBe("[[c:a1 dangling]]He runs.");
    expect(report.applied).toContainEqual({ kind: "unmatched-comment-delimiters", count: 1 });
    expect(text(exportScreenplay(document))).toBe(source);
  });

  it("prose: a closer with no opener is kept and counted", () => {
    const source = "She left.<!--/c:a1--> He stayed.";
    const { document, report } = importProse(utf8(source));

    expect(document.elements[0]!.text).toBe(source);
    expect(report.applied).toContainEqual({ kind: "unmatched-comment-delimiters", count: 1 });
    expect(text(exportProse(document))).toBe(source);
  });

  it("keeps a delimiter standing alone on its line, rather than re-reading the lines round it", () => {
    // Cutting it out would leave an empty line, and in Fountain an empty line
    // ends a speech. So it stays as characters, and so does its partner.
    const source = "EDWARD\n[[c:a1 x]]Hello.\n[[/c:a1]]";
    const { document, report } = importScreenplay(utf8(source));

    expect(document.elements.map((e) => e.type)).toEqual(["character", "dialogue", "dialogue"]);
    expect(document.comments).toEqual([]);
    expect(report.applied).toContainEqual({ kind: "unmatched-comment-delimiters", count: 2 });
    expect(text(exportScreenplay(document))).toBe(source);
  });

  it("has no entry at all for a file whose comments all match", () => {
    const { report } = importScreenplay(readFixtureBytes("Big-Fish-augmented.fountain"));
    const kinds = report.applied.map((entry) => entry.kind);
    expect(kinds).not.toContain("unmatched-comment-delimiters");
  });
});

describe("the one prose escape", () => {
  it("reads --&gt; in a remark as --> and writes it back as --&gt;", () => {
    const source = "<!--c:a1 cut this --&gt; move to ch. 4-->She left.<!--/c:a1-->";
    const document = parseProse(source);

    expect(document.comments[0]!.remark).toBe("cut this --> move to ch. 4");
    roundTripsProse(source);
  });

  it("leaves a bare -- alone", () => {
    const source = "<!--c:a1 a pause -- then on-->She left.<!--/c:a1-->";

    expect(parseProse(source).comments[0]!.remark).toBe("a pause -- then on");
    roundTripsProse(source);
  });
});

describe("a file Write-ist wrote comes back byte-identical", () => {
  it("holds on both commented fixtures", () => {
    const screenplay = exportScreenplay(
      importScreenplay(readFixtureBytes("Big-Fish-augmented.fountain")).document,
    );
    expect([...reopenScreenplay(screenplay)]).toEqual([...screenplay]);

    const prose = exportProse(importProse(readFixtureBytes("Republic-manuscript.md")).document);
    expect([...reopenProse(prose)]).toEqual([...prose]);
  });
});
