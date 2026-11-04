/**
 * Step 7's wiring: the File menu offers the copy, the window may ask where it
 * goes, and the offline rule still holds.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { editorMenus } from "../../app/src/workspaces/editor/menus.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...path: string[]): string => readFileSync(join(root, ...path), "utf8");

describe("Save a Copy as Fountain…", () => {
  it("is in the File menu, beside the other things done with the project", () => {
    const saveCopy = vi.fn();
    const file = editorMenus({
      save: vi.fn(), saveCopy, exportPdf: vi.fn(), toProjects: vi.fn(), toHome: vi.fn(), editTitlePage: vi.fn(),
      viewTitlePage: vi.fn(), editGoals: vi.fn(), confirmName: vi.fn(), confirmLocation: vi.fn(), confirmHere: vi.fn(),
      toggleSpellcheck: vi.fn(), spellcheckOn: () => false, search: vi.fn(), view: () => undefined,
      cut: vi.fn(), copy: vi.fn(), paste: vi.fn(), selectAll: vi.fn(), misspellingAt: () => undefined,
    })["File"]!;
    const item = file.find((entry) => "label" in entry && entry.label === "Save a Copy as Fountain…");
    expect(item).toBeDefined();
    if (item !== undefined && "act" in item) item.act();
    expect(saveCopy).toHaveBeenCalledOnce();
  });

  it("asks the writer where, and writes nothing when they cancel", () => {
    const editor = read("app", "src", "workspaces", "editor", "editor.ts");
    expect(editor).toMatch(/destination === undefined\) return;/);
    expect(editor).toContain("context.chooseCopyLocation(");
  });

  it("copies the model as it is now, never through the save routine", () => {
    const editor = read("app", "src", "workspaces", "editor", "editor.ts");
    const start = editor.indexOf("const saveCopy = (): void =>");
    const body = editor.slice(start, editor.indexOf("Step 5:"));
    expect(body).toContain("writing.manuscript()");
    expect(body).not.toMatch(/\.save\(|saving\.now|saveAndShow/);
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
      ["src", "screenplay", "fountain-copy.ts"],
    ]) {
      expect(read(...file)).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|https?:\/\//);
    }
  });
});
