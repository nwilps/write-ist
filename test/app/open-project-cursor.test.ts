/**
 * Home's `>` on the Open Project screen: beside the one thing lit — a project
 * row, or Home, Import or New Project along the foot — and nowhere else, with
 * the pointer, Tab and the arrows all moving the same single highlight.
 *
 * Every project name here is made up.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHome } from "../../app/src/screens/home.ts";
import { renderOpenProject, type OpenProjectScreen } from "../../app/src/screens/open-project.ts";
import { answerKey, type KeyPress } from "../../app/src/screens/shortcuts.ts";
import type { Project } from "../../src/project/bundle.ts";
import type { ProjectsListing } from "../../src/project/projects.ts";

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
const uncommented = (file: string) => readFileSync(join(style, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const css = uncommented("open-project.css");
const home = uncommented("home.css");

const project = (name: string): Project => ({
  path: `/projects/${name}`,
  marker: { name, formatVersion: "1", projectId: `id-${name}`, format: "Feature" },
});
const listing = (...names: string[]): ProjectsListing => ({ projects: names.map(project), unreadable: [] });
const press = (key: string): KeyPress => ({ key, altKey: false, ctrlKey: false, metaKey: false });

afterEach(() => document.body.replaceChildren());

function draw(overrides: Partial<OpenProjectScreen> = {}) {
  const into = document.createElement("div");
  document.body.replaceChildren(into);
  const calls = {
    onOpen: vi.fn(),
    onBack: vi.fn(),
    onNewProject: vi.fn(),
    onSearch: vi.fn(),
    onImport: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
  };
  const drawn = renderOpenProject(into, {
    listing: listing("Paper Boats", "Quiet Road", "Untitled Short"),
    importing: false,
    ...calls,
    ...overrides,
  });
  const rows = [...into.querySelectorAll<HTMLButtonElement>("button.project")];
  const foot = [...into.querySelectorAll<HTMLButtonElement>(".menu--foot button.gesture")];
  // Everything that can be lit, and which of it is.
  const lit = () =>
    [...rows.map((r, i) => [`row ${i}`, r] as const), ...foot.map((b) => [b.querySelector(".gesture__label")!.textContent!, b] as const)]
      .filter(([, button]) => button.classList.contains("gesture--selected"))
      .map(([name]) => name);
  const key = (p: KeyPress) =>
    answerKey(p, { dialogOpen: document.querySelector("dialog[open]") !== null, gestures: drawn.gestures, navigate: drawn.navigate });
  return { into, calls, rows, foot, lit, key };
}

const hover = (target: Element) => target.dispatchEvent(new MouseEvent("mouseenter"));

describe("Home's `>` on Open Project", () => {
  it("is Home's own: the same element, beside every row and every foot action", () => {
    const homeInto = document.createElement("div");
    const drawnHome = renderHome(homeInto, { onNewProject() {}, onOpenProject() {}, onQuit() {}, ghostwriter: { reducedMotion: true } });
    const homeCursor = homeInto.querySelector(".gesture__cursor")!.outerHTML;
    drawnHome.stop();

    const { rows, foot } = draw();
    for (const button of [...rows, ...foot]) {
      const cursors = button.querySelectorAll(".gesture__cursor");
      expect(cursors).toHaveLength(1);
      expect(cursors[0]!.outerHTML).toBe(homeCursor);
      expect(cursors[0]!.getAttribute("aria-hidden")).toBe("true");
    }
    // Not part of a row's name, for a screen reader or a click.
    expect(rows[0]!.querySelector(".project__name")!.textContent).toBe("Paper Boats");
  });

  it("starts on the first row, and only there", () => {
    expect(draw().lit()).toEqual(["row 0"]);
  });

  it("moves to a foot action the pointer reaches, taking focus — and the row lets go", () => {
    const { rows, foot, lit } = draw();
    hover(foot[1]!);
    expect(lit()).toEqual(["Import"]);
    expect(document.activeElement).toBe(foot[1]);
    hover(foot[2]!);
    expect(lit()).toEqual(["New Project"]);
    hover(rows[2]!);
    expect(lit()).toEqual(["row 2"]);
    expect(document.activeElement).toBe(rows[2]);
  });

  it("follows Tab into the foot and back, one highlight throughout", () => {
    const { rows, foot, lit } = draw();
    rows[1]!.focus();
    expect(lit()).toEqual(["row 1"]);
    foot[0]!.focus();
    expect(lit()).toEqual(["Home"]);
    rows[2]!.focus();
    expect(lit()).toEqual(["row 2"]);
  });

  it("goes back to the row it left when an arrow is pressed in the foot, and the arrows still wrap", () => {
    const { rows, foot, lit, key } = draw();
    hover(rows[2]!);
    hover(foot[0]!);
    expect(key(press("ArrowUp"))).toBe(true);
    expect(lit()).toEqual(["row 2"]);
    expect(document.activeElement).toBe(rows[2]);
    key(press("ArrowDown"));
    expect(lit()).toEqual(["row 0"]);
    key(press("ArrowUp"));
    expect(lit()).toEqual(["row 2"]);
  });

  it("Enter is the lit thing's: a focused foot button keeps its own, a lit one with focus gone acts", () => {
    const { foot, calls, key } = draw();
    hover(foot[2]!);
    // Focused: the button's own Enter, which the browser turns into its click.
    expect(key(press("Enter"))).toBe(false);
    expect(calls.onOpen).not.toHaveBeenCalled();
    // A click on blank space takes focus away; the foot button is still the lit one.
    foot[2]!.blur();
    expect(key(press("Enter"))).toBe(true);
    expect(calls.onNewProject).toHaveBeenCalledOnce();
    expect(calls.onOpen).not.toHaveBeenCalled();
  });

  it("never lights an action that is unavailable", () => {
    const { foot, lit } = draw({ importing: true });
    hover(foot[1]!);
    expect(lit()).toEqual(["row 0"]);
  });

  it("stays on the menu's project while a right-click menu is open, and the menu acts on it", () => {
    const { rows, foot, lit, calls } = draw();
    rows[1]!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }));
    expect(lit()).toEqual(["row 1"]);
    hover(foot[2]!);
    hover(rows[0]!);
    expect(lit()).toEqual(["row 1"]);
    [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((i) => i.textContent === "Rename Project")!.click();
    expect(calls.onRename).toHaveBeenCalledExactlyOnceWith(project("Quiet Road"));
  });

  it("works along the foot with no projects to light", () => {
    const { foot, lit, key, calls } = draw({ listing: listing() });
    expect(lit()).toEqual([]);
    hover(foot[0]!);
    expect(lit()).toEqual(["Home"]);
    foot[0]!.blur();
    key(press("Enter"));
    expect(calls.onBack).toHaveBeenCalledOnce();
  });

  it("is drawn only beside what is lit, laid over the room it sits in so nothing moves", () => {
    // Home's rule, which these follow: shown on the selected row, and not for hover or focus alone.
    expect(home).toMatch(/\.menu--home \.gesture--selected \.gesture__cursor[^{]*\{\s*visibility:\s*visible/);
    // A row: at its start, over the room the name keeps clear of.
    expect(css).toMatch(/\.project\s*\{[^}]*position:\s*relative/);
    expect(css).toMatch(/\.project \.gesture__cursor\s*\{[^}]*position:\s*absolute[^}]*left:\s*var\(--space-tight\)/);
    expect(css).toMatch(/\.project__name\s*\{[^}]*padding-left:\s*var\(--space-project-cursor\)/);
    expect(css).toMatch(/\.project\.gesture--selected \.gesture__cursor\s*\{\s*visibility:\s*visible/);
    // The foot: just before the label, in the gap between labels.
    expect(css).toMatch(/\.menu--foot \.gesture\s*\{[^}]*position:\s*relative/);
    expect(css).toMatch(/\.menu--foot \.gesture__cursor\s*\{[^}]*position:\s*absolute[^}]*right:\s*calc\(100% \+ var\(--space-tight\)\)/);
    expect(css).toMatch(/\.menu--foot \.gesture:hover \.gesture__cursor,\s*\.menu--foot \.gesture:focus-visible \.gesture__cursor\s*\{\s*visibility:\s*hidden/);
    expect(css).toMatch(/\.menu--foot \.gesture--selected \.gesture__cursor,[^{]*\{\s*visibility:\s*visible/);
    // Hover and focus alone light nothing in the foot: only the one lit.
    expect(css).toMatch(/\.menu--foot \.gesture:hover,\s*\.menu--foot \.gesture:focus-visible\s*\{[^}]*color:\s*var\(--colour-muted\)/);
    expect(css).not.toMatch(/\.menu--foot \.gesture__cursor\s*\{[^}]*display:\s*none/);
  });
});
