/**
 * Step 7's wiring: the File menu offers the copy, the window may ask where it
 * goes, and the offline rule still holds.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...path: string[]): string => readFileSync(join(root, ...path), "utf8");

describe("Save a Copy as Fountain…", () => {
  it("is in the File menu, beside the other things done with the project", () => {
    const editor = read("app", "src", "workspaces", "editor", "editor.ts");
    expect(editor).toMatch(/label: "Save a Copy as Fountain…"[^}]*act: \(\) => saveCopy\(\)/);
  });

  it("asks the writer where, and writes nothing when they cancel", () => {
    const editor = read("app", "src", "workspaces", "editor", "editor.ts");
    expect(editor).toMatch(/destination === undefined\) return;/);
    expect(editor).toContain("context.chooseCopyLocation(");
  });

  it("copies the model as it is now, never through the save routine", () => {
    const editor = read("app", "src", "workspaces", "editor", "editor.ts");
    const start = editor.indexOf("saveCopy = () =>");
    const body = editor.slice(start, editor.indexOf("Alt+Enter asks to search"));
    expect(body).toContain("manuscriptOf(state.doc)");
    expect(body).not.toMatch(/session\.save|saving\.now|saveAndShow/);
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
