// @vitest-environment jsdom
/**
 * The autocomplete offer as the view draws it (slice 2, step 9): ghost text
 * for the first choice, a list only when there is more than one, the chosen
 * row marked, and all of it kept out of the writer's own text.
 */
import { describe, expect, it } from "vitest";
import { drawOffer } from "../../app/src/workspaces/editor/autocomplete-draw.ts";

describe("the drawn offer", () => {
  it("is ghost text alone for a single choice", () => {
    const drawn = drawOffer({ ghost: "WARD", choices: ["EDWARD"], selected: 0 });
    expect(drawn.querySelector(".autocomplete__ghost")?.textContent).toBe("WARD");
    expect(drawn.querySelector(".autocomplete__list")).toBeNull();
  });

  it("is a list for several, with the one Tab would take marked", () => {
    const drawn = drawOffer({ ghost: "AWN", choices: ["DAY", "DAWN", "DUSK"], selected: 1 });
    const rows = [...drawn.querySelectorAll(".autocomplete__choice")];
    expect(rows.map((row) => row.textContent)).toEqual(["DAY", "DAWN", "DUSK"]);
    expect(rows.map((row) => row.classList.contains("autocomplete__choice--selected"))).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("is not the writer's text: not editable, not announced", () => {
    const drawn = drawOffer({ ghost: "X", choices: ["X"], selected: 0 });
    expect(drawn.contentEditable).toBe("false");
    expect(drawn.getAttribute("aria-hidden")).toBe("true");
  });
});
