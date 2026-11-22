/**
 * No system right-click menu anywhere (ADR-0034, `native-menu.ts`): every
 * right-click is cancelled at the window, and Write-ist's own menus still open
 * where they are drawn — a row of Open Project here, and a handler of the same
 * shape as the paper's and the name pill's.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suppressNativeMenus } from "../../app/src/menus/native-menu.ts";
import { openContextMenu } from "../../app/src/menus/context-menu.ts";
import { renderOpenProject } from "../../app/src/screens/open-project.ts";
import type { Project } from "../../src/project/bundle.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let stop: () => void;
beforeEach(() => {
  stop = suppressNativeMenus(window);
});
afterEach(() => {
  stop();
  document.body.replaceChildren();
});

function rightClick(target: EventTarget): MouseEvent {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 60 });
  target.dispatchEvent(event);
  return event;
}

describe("the system's right-click menu", () => {
  it("is cancelled wherever the writer right-clicks: the body, chrome, a panel, a dialog, a text field", () => {
    const places = [
      document.body,
      Object.assign(document.createElement("div"), { className: "desk" }),
      Object.assign(document.createElement("aside"), { className: "desk__column" }),
      document.createElement("dialog"),
      Object.assign(document.createElement("input"), { type: "text" }),
      document.createElement("textarea"),
    ];
    for (const place of places) {
      if (place !== document.body) document.body.append(place);
      expect(rightClick(place).defaultPrevented).toBe(true);
    }
  });

  it("is cancelled even where a handler stops the event on its way up", () => {
    const pill = document.createElement("span");
    pill.addEventListener("contextmenu", (event) => event.stopPropagation());
    document.body.append(pill);
    expect(rightClick(pill).defaultPrevented).toBe(true);
  });

  it("comes back once suppression is stopped (so the listener is the window's one switch)", () => {
    stop();
    expect(rightClick(document.body).defaultPrevented).toBe(false);
    stop = suppressNativeMenus(window);
    expect(rightClick(document.body).defaultPrevented).toBe(true);
  });

  it("is suppressed by the application as it starts, before any screen is drawn", () => {
    const main = readFileSync(join(root, "app/src/main.ts"), "utf8");
    const suppressed = main.indexOf("suppressNativeMenus(window)");
    expect(suppressed).toBeGreaterThan(-1);
    expect(suppressed).toBeLessThan(main.indexOf("draw();\n"));
  });
});

describe("Write-ist's own menus", () => {
  it("still hear the right-click and open", () => {
    const paper = document.createElement("div");
    document.body.append(paper);
    const restoreFocus = vi.fn();
    paper.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openContextMenu({ label: "Edit", items: [{ label: "Paste", act: () => {} }], x: event.clientX, y: event.clientY, restoreFocus });
    });
    rightClick(paper);
    const menu = document.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect([...menu!.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)).toEqual(["Paste"]);
    menu!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  it("open on a row of Open Project, with its items", () => {
    const into = document.createElement("div");
    document.body.append(into);
    const project = (name: string): Project => ({
      path: `/projects/${name}`,
      marker: { name, formatVersion: "1", projectId: `id-${name}`, format: "Feature" },
    });
    renderOpenProject(into, {
      listing: { projects: [project("Paper Boats")], unreadable: [] },
      importing: false,
      onOpen: vi.fn(),
      onBack: vi.fn(),
      onNewProject: vi.fn(),
      onSearch: vi.fn(),
      onImport: vi.fn(),
      onRename: vi.fn(),
      onDelete: vi.fn(),
    });
    const event = rightClick(into.querySelector("button.project")!);
    expect(event.defaultPrevented).toBe(true);
    const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((item) => item.textContent);
    expect(items).toEqual(["Rename Project", "Delete Project"]);
    document.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
});
