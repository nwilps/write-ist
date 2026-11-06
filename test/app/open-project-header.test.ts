/**
 * The Open Project header is the design's art, to the byte (ADR-0043).
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderOpenProject } from "../../app/src/screens/open-project.ts";
import { OPEN_PROJECT_ART, OPEN_PROJECT_HEADER } from "../../app/src/screens/open-project-header.ts";

const fixture = readFileSync(join(__dirname, "..", "fixtures", "open-project-header.txt"));

const screen = {
  listing: { projects: [], unreadable: [] },
  importing: false,
  onImport: () => {},
  onOpen: () => {},
  onNewProject: () => {},
  onSearch: () => {},
  onBack: () => {},
};

describe("The Open Project header", () => {
  it("is open-project.txt byte for byte, trailing newlines and all", () => {
    expect(Buffer.from(OPEN_PROJECT_ART, "utf8").equals(fixture)).toBe(true);
    expect(OPEN_PROJECT_ART.endsWith("\\/__/\n\n\n\n\n\n\n")).toBe(true);
    expect(OPEN_PROJECT_ART).toContain("¯");
    expect([...OPEN_PROJECT_ART].filter((c) => c === "＼")).toHaveLength(10);
  });

  it("is drawn as the seventeen lines, the blank line between the words kept", () => {
    const lines = OPEN_PROJECT_HEADER.split("\n");
    expect(lines).toHaveLength(17);
    expect(lines[8]).toBe("");
    expect(OPEN_PROJECT_ART.startsWith(OPEN_PROJECT_HEADER)).toBe(true);
    expect(OPEN_PROJECT_ART.slice(OPEN_PROJECT_HEADER.length)).toMatch(/^\n+$/);
    expect(Math.max(...lines.map((l) => [...l].length))).toBe(91);
  });

  it("is hidden art under an h1 named Open Project, in place of the old title", () => {
    const into = document.createElement("div");
    renderOpenProject(into, screen);
    const heading = into.querySelector("h1")!;
    expect(heading.className).toBe("open-project__header");
    expect(heading.getAttribute("aria-label")).toBe("Open Project");
    const art = heading.querySelector("pre.open-project__art")!;
    expect(art.getAttribute("aria-hidden")).toBe("true");
    expect(art.textContent).toBe(OPEN_PROJECT_HEADER);
    expect(into.querySelector(".screen__name")).toBeNull();
  });
});
