/**
 * The home screen's logo is the design's art, to the byte (ADR-0042).
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderHome } from "../../app/src/screens/home.ts";
import { LOGO } from "../../app/src/screens/logo.ts";

const fixture = readFileSync(join(__dirname, "..", "fixtures", "home-logo.txt"));

describe("The home logo", () => {
  it("is logo.txt byte for byte", () => {
    expect(Buffer.from(LOGO, "utf8").equals(fixture)).toBe(true);
    expect(LOGO.split("\n")).toHaveLength(16);
    expect(LOGO).toContain("¯");
  });

  it("is drawn as hidden art under an h1 named Write-ist", () => {
    const into = document.createElement("div");
    renderHome(into, { onNewProject: () => {}, onOpenProject: () => {}, onQuit: () => {} });
    const heading = into.querySelector("h1.wordmark")!;
    expect(heading.getAttribute("aria-label")).toBe("Write-ist");
    const art = heading.querySelector("pre.wordmark__art")!;
    expect(art.getAttribute("aria-hidden")).toBe("true");
    expect(art.textContent).toBe(LOGO);
  });
});
