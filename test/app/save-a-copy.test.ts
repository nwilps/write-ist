/**
 * The Fountain copy's wiring: File ▸ Export As… reaches it, the window may ask
 * where it goes, and the offline rule still holds.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { editorMenus } from "../../app/src/workspaces/editor/menus.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...path: string[]): string => readFileSync(join(root, ...path), "utf8");

describe("the Fountain copy, through Export As…", () => {
  it("is reached from the File menu, which no longer has an item of its own for it", () => {
    const exportAs = vi.fn();
    const file = editorMenus({
      save: vi.fn(), exportAs, toProjects: vi.fn(), editProjectDetails: vi.fn(), openContextMenu: vi.fn(), openSettings: vi.fn(), toHome: vi.fn(), editTitlePage: vi.fn(),
      viewTitlePage: vi.fn(), editGoals: vi.fn(), editNameList: vi.fn(),
      toggleSpellcheck: vi.fn(), spellcheckOn: () => false, keyboardShortcuts: vi.fn(), search: vi.fn(), view: () => undefined,
      zoomIn: vi.fn(), zoomOut: vi.fn(), resetZoom: vi.fn(), zoomLevel: () => 2,
      cut: vi.fn(), copy: vi.fn(), paste: vi.fn(), selectAll: vi.fn(), undo: vi.fn(), redo: vi.fn(), misspellingAt: () => undefined,
    })["File"]!;
    const labels = file.map((entry) => ("label" in entry ? entry.label : "—"));
    expect(labels).not.toContain("Save a Copy as Fountain…");
    const item = file.find((entry) => "label" in entry && entry.label === "Export As…");
    expect(item).toBeDefined();
    if (item !== undefined && "act" in item) item.act();
    expect(exportAs).toHaveBeenCalledOnce();
  });

  it("is granted the save dialog, and no wider write scope than the project already had", () => {
    const capability = JSON.parse(read("src-tauri", "capabilities", "default.json")) as {
      permissions: (string | { identifier: string; allow?: { path: string }[] })[];
    };
    const names = capability.permissions.map((p) => (typeof p === "string" ? p : p.identifier));
    expect(names).toContain("dialog:allow-save");
    const scope = capability.permissions.find(
      (p): p is { identifier: string; allow: { path: string }[] } =>
        typeof p !== "string" && p.identifier === "fs:scope",
    )!;
    // The chosen path is added to the scope by the dialog at run time; nothing
    // like `/**` or a drive root is granted here.
    expect(scope.allow.map((a) => a.path)).toEqual(["$HOME/**", "$APPLOCALDATA", "$APPLOCALDATA/**"]);
    expect(names.some((n) => n.startsWith("http"))).toBe(false);
  });

  it("makes no network request", () => {
    for (const file of [
      ["src", "project", "copy.ts"],
      ["src", "project", "export-formats.ts"],
      ["src", "screenplay", "fountain-copy.ts"],
    ]) {
      expect(read(...file)).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|https?:\/\//);
    }
  });
});
