/**
 * The Open Project screen as designed (ADR-0043): the real projects between two
 * rules, one row lit, Home, Import and New Project along the foot, no search
 * drawn, and Alt+Enter for the search that is there anyway.
 *
 * Every project name here is made up.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderOpenProject, RULE_LENGTH, type OpenProjectScreen } from "../../app/src/screens/open-project.ts";
import { showNewProject } from "../../app/src/screens/new-project.ts";
import { answerKey, type KeyPress } from "../../app/src/screens/shortcuts.ts";
import { createProject } from "../../src/project/create.ts";
import { listProjects, type ProjectsListing } from "../../src/project/projects.ts";
import type { Project } from "../../src/project/bundle.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

// jsdom has no modal dialog.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
const uncommented = (file: string) => readFileSync(join(style, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const css = uncommented("open-project.css");
const tokens = uncommented("tokens.css");

const project = (name: string): Project => ({
  path: `/projects/${name}`,
  marker: { name, formatVersion: "1", projectId: `id-${name}`, format: "Feature" },
});
const listing = (...names: string[]): ProjectsListing => ({ projects: names.map(project), unreadable: [] });

const press = (key: string, held: { alt?: true; ctrl?: true } = {}): KeyPress => ({
  key,
  altKey: held.alt === true,
  ctrlKey: held.ctrl === true,
  metaKey: false,
});

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
  const lit = () => rows.findIndex((r) => r.classList.contains("gesture--selected"));
  const key = (p: KeyPress) =>
    answerKey(p, {
      dialogOpen: document.querySelector("dialog[open]") !== null,
      gestures: drawn.gestures,
      navigate: drawn.navigate,
    });
  return { into, calls, drawn, rows, lit, key };
}

describe("Open Project, as designed", () => {
  it("draws header, rule, list, rule, foot — in that order", () => {
    const { into } = draw();
    const order = [...into.querySelector(".composition")!.children].map((c) => c.className.split(" ")[0]);
    // The list is drawn in its window, with the chevrons that say it scrolls.
    expect(order).toEqual(["open-project__header", "open-project-rule", "projects-window", "open-project-rule", "menu"]);
    const rules = [...into.querySelectorAll(".open-project-rule")].map((r) => r.textContent);
    expect(RULE_LENGTH).toBe(70);
    expect(rules).toEqual(["─".repeat(70), "─".repeat(70)]);
  });

  it("does not wear the home screen's menu or rules", () => {
    const { into } = draw();
    expect(into.querySelector(".menu--home")).toBeNull();
    expect(into.querySelector(".home-rule")).toBeNull();
  });

  it("has Home [Esc] on the left, Import [I] in the middle and New Project [N] on the right, and nothing else", () => {
    const { into } = draw();
    const foot = [...into.querySelectorAll<HTMLButtonElement>(".menu--foot button.gesture")];
    expect(foot.map((b) => b.querySelector(".gesture__label")!.textContent + " " + b.querySelector(".gesture__key")!.textContent)).toEqual([
      "Home [Esc]",
      "Import [I]",
      "New Project [N]",
    ]);
    // All three drawn alike: the same element, the same classes.
    expect(new Set(foot.map((b) => b.className))).toEqual(new Set(["gesture"]));
  });

  it("Home goes home, by click and by Escape", () => {
    const { into, calls, key } = draw();
    into.querySelector<HTMLButtonElement>(".menu--foot button.gesture")!.click();
    expect(key(press("Escape"))).toBe(true);
    expect(calls.onBack).toHaveBeenCalledTimes(2);
  });

  it("New Project asks for the dialog, by click and by N", () => {
    const { into, calls, key } = draw();
    into.querySelectorAll<HTMLButtonElement>(".menu--foot button.gesture")[2]!.click();
    expect(key(press("n"))).toBe(true);
    expect(key(press("N"))).toBe(true);
    expect(calls.onNewProject).toHaveBeenCalledTimes(3);
  });

  it("draws no search: no label, no icon, no button", () => {
    const { into, drawn } = draw();
    expect(into.textContent).not.toMatch(/search/i);
    // The list's chevrons are the one drawing, and they say it scrolls.
    expect(into.querySelector("svg:not(.projects-hint__icon), .search, [aria-label*='earch']")).toBeNull();
    expect(drawn.gestures.map((g) => g.label)).not.toContain("Search");
  });

  it("opens the search on Alt+Enter, and only on Alt+Enter", () => {
    const { calls, key } = draw();
    expect(key(press("Enter", { alt: true }))).toBe(true);
    expect(calls.onSearch).toHaveBeenCalledTimes(1);
    key(press("Enter", { alt: true, ctrl: true }));
    key(press("Enter"));
    expect(calls.onSearch).toHaveBeenCalledTimes(1);
  });

  it("Import imports, by click and by I; not while one is running", () => {
    const { into, calls, key } = draw();
    const button = () => into.querySelectorAll<HTMLButtonElement>(".menu--foot button.gesture")[1]!;
    button().click();
    expect(key(press("i"))).toBe(true);
    expect(key(press("I"))).toBe(true);
    expect(calls.onImport).toHaveBeenCalledTimes(3);
    const busy = draw({ importing: true });
    const busyButton = busy.into.querySelectorAll<HTMLButtonElement>(".menu--foot button.gesture")[1]!;
    expect(busyButton.disabled).toBe(true);
    busyButton.click();
    busy.key(press("i"));
    expect(busy.calls.onImport).not.toHaveBeenCalled();
    expect(busy.into.querySelector(".reading")!.textContent).toBe("Importing…");
  });

  it("says no more than Import does about importing: no hidden letter in the empty list", () => {
    const empty = draw({ listing: { projects: [], unreadable: [] } }).into.querySelector(".nothing-yet")!;
    expect(empty.textContent).not.toMatch(/press I/);
    expect(empty.textContent).toMatch(/Import/);
  });
});

describe("Open Project, the list", () => {
  it("lists each project's name and format, the first one lit", () => {
    const { rows, lit } = draw();
    expect(rows.map((r) => [r.querySelector(".project__name")!.textContent, r.querySelector(".project__format")!.textContent])).toEqual([
      ["Paper Boats", "Feature"],
      ["Quiet Road", "Feature"],
      ["Untitled Short", "Feature"],
    ]);
    expect(lit()).toBe(0);
    expect(rows.filter((r) => r.classList.contains("gesture--selected"))).toHaveLength(1);
  });

  it("Down and Up move the light and wrap; Enter opens the lit project", () => {
    const { rows, lit, key, calls } = draw();
    for (const expected of [1, 2, 0]) {
      expect(key(press("ArrowDown"))).toBe(true);
      expect(lit()).toBe(expected);
    }
    key(press("ArrowUp"));
    expect(lit()).toBe(2);
    expect(document.activeElement).toBe(rows[2]);
    expect(key(press("Enter"))).toBe(true);
    expect(calls.onOpen).toHaveBeenCalledTimes(1);
    expect(calls.onOpen.mock.calls[0]![0].marker.name).toBe("Untitled Short");
  });

  it("hover lights a row without opening it; a click opens it", () => {
    const { rows, lit, calls } = draw();
    rows[1]!.dispatchEvent(new MouseEvent("mouseenter"));
    expect(lit()).toBe(1);
    expect(calls.onOpen).not.toHaveBeenCalled();
    rows[1]!.click();
    expect(calls.onOpen.mock.calls[0]![0].marker.name).toBe("Quiet Road");
  });

  it("Enter on a focused foot button is that button's, not the lit project's", () => {
    const { into, key, calls } = draw();
    into.querySelector<HTMLButtonElement>(".menu--foot button.gesture")!.focus();
    expect(key(press("Enter"))).toBe(false);
    expect(calls.onOpen).not.toHaveBeenCalled();
  });

  it("says when there are none yet, or the folder is still being read", () => {
    expect(draw({ listing: { projects: [], unreadable: [] } }).into.querySelector(".nothing-yet")).not.toBeNull();
    expect(draw({ listing: undefined }).into.querySelector(".reading")!.textContent).toBe("Reading your projects…");
  });

  it("is drawn from the real listing of the projects folder", async () => {
    const temporary = temporaryDirectory();
    try {
      const folder = join(temporary.path, "write-ist");
      let minted = 0;
      for (const title of ["Kitchen Draft", "Big Fish", "The Long Winter"]) {
        await createProject({ filesystem: nodeFilesystem, newProjectId: () => `id-${++minted}` }, folder, {
          title,
          type: "Screenplay",
        });
      }
      const real = await listProjects(nodeFilesystem, folder);
      const { rows, calls } = draw({ listing: real });
      expect(rows.map((r) => r.querySelector(".project__name")!.textContent)).toEqual(
        real.projects.map((p) => p.marker.name),
      );
      expect(rows).toHaveLength(3);
      rows[0]!.click();
      expect(calls.onOpen).toHaveBeenCalledWith(real.projects[0]);
    } finally {
      temporary.remove();
    }
  });
});

describe("Open Project, the New Project dialog over it", () => {
  let onCreate: ReturnType<typeof vi.fn<(request: { type: string; title: string }) => Promise<string | undefined>>>;
  let screen: ReturnType<typeof draw>;

  beforeEach(() => {
    onCreate = vi.fn(async () => undefined as string | undefined);
    screen = draw({
      onNewProject: () => showNewProject(document.body, { onCreate, onClose: () => {} }),
    });
  });
  afterEach(() => document.body.replaceChildren());

  it("opens on top of the screen, which stays drawn underneath", () => {
    expect(screen.key(press("n"))).toBe(true);
    const modal = document.querySelector("dialog.new-project-dialog[open]");
    expect(modal).not.toBeNull();
    expect(screen.into.querySelector(".projects")).not.toBeNull();
    expect(screen.calls.onBack).not.toHaveBeenCalled();
  });

  it("hears the keys itself while open: N and Escape do not reach the screen", () => {
    screen.key(press("n"));
    expect(screen.key(press("n"))).toBe(false);
    expect(screen.key(press("Escape"))).toBe(false);
    expect(document.querySelectorAll("dialog")).toHaveLength(1);
    expect(screen.calls.onBack).not.toHaveBeenCalled();
  });

  it("Cancel closes it and leaves the writer on Open Project", () => {
    screen.key(press("n"));
    document.querySelector<HTMLButtonElement>(".new-project-dialog__action:not(.new-project-dialog__action--confirm)")!.click();
    expect(document.querySelector("dialog")).toBeNull();
    expect(screen.into.querySelector(".projects")).not.toBeNull();
    expect(screen.calls.onBack).not.toHaveBeenCalled();
    // And the screen answers again.
    expect(screen.key(press("ArrowDown"))).toBe(true);
  });

  it("Confirm asks for the project to be made", async () => {
    screen.key(press("n"));
    const title = document.querySelector<HTMLInputElement>("#new-project-title")!;
    title.value = "Paper Boats Two";
    title.dispatchEvent(new Event("input"));
    document.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(onCreate).toHaveBeenCalledWith({ type: "Screenplay", title: "Paper Boats Two" });
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector("dialog")).toBeNull();
  });
});

describe("Open Project, the look", () => {
  it("lights the selected row with the overlay bar and an accent name; others muted, formats faint", () => {
    expect(css).toMatch(/\.project\.gesture--selected\s*\{[^}]*background:\s*var\(--colour-overlay\)/);
    expect(css).toMatch(/\.project\.gesture--selected \.project__name\s*\{[^}]*color:\s*var\(--colour-accent\)/);
    expect(css).toMatch(/\.project__name\s*\{[^}]*color:\s*var\(--colour-muted\)/);
    expect(css).toMatch(/\.project__format\s*\{[^}]*color:\s*var\(--colour-faint\)/);
  });

  it("draws the header in the accent, and the rules faint and cut by whole dashes", () => {
    expect(css).toMatch(/\.open-project__header\s*\{[^}]*color:\s*var\(--colour-accent\)/);
    expect(css).toMatch(/\.open-project-rule\s*\{[^}]*round\(down, 100%, var\(--measure-column\)\)[^}]*overflow:\s*hidden[^}]*color:\s*var\(--colour-faint\)/);
  });

  it("draws the header at 9px and the rules at most 70 columns — the same as RULE_LENGTH", () => {
    expect(tokens).toMatch(/--size-open-project-art:\s*9px;/);
    expect(css).toMatch(/\.open-project__header\s*\{[^}]*font-size:\s*var\(--size-open-project-art\)/);
    expect(tokens).toMatch(new RegExp(`--measure-open-project-rule:\\s*${RULE_LENGTH}ch;`));
    expect(css).toMatch(/\.open-project-rule\s*\{[^}]*font-size:\s*var\(--size-body\)/);
    expect(tokens).toMatch(/--size-body:\s*15px;/);
    // 70 columns of a 0.6em face at 15px: 630px.
    expect(RULE_LENGTH * 15 * 0.6).toBe(630);
  });

  it("centres the search on this screen", () => {
    expect(css).toMatch(/\.search--centred\s*\{[^}]*align-items:\s*center/);
  });
});
