/**
 * Everything the application asks of its window, it is allowed to ask (#64).
 *
 * Tauri refuses a window call the capability does not grant, and the refusal
 * is a rejected promise — which, when nothing is waiting on it, is a gesture
 * that quietly does nothing. That is how every way of closing Write-ist came
 * to do nothing at all: the close button, **Quit**, `q` and the window
 * manager's own close. Closing had been taken over by a listener, Tauri's
 * wrapper around that listener finishes a close by destroying the window, and
 * destroying was never granted. No test could see it, because the refusal
 * happens only with a window.
 *
 * So the grant is checked against the source instead: every call made on the
 * window must be one the capability names.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = join(root, "app", "src");
const CAPABILITY = join(root, "src-tauri", "capabilities", "default.json");

function sources(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

function granted(): ReadonlySet<string> {
  const capability = JSON.parse(readFileSync(CAPABILITY, "utf8")) as {
    permissions: readonly (string | { identifier: string })[];
  };
  return new Set(
    capability.permissions.map((permission) =>
      typeof permission === "string" ? permission : permission.identifier,
    ),
  );
}

/** Every method called on the window, and the file that calls it. */
function windowCalls(): readonly { method: string; file: string }[] {
  const calls: { method: string; file: string }[] = [];
  for (const file of sources(APP)) {
    const text = readFileSync(file, "utf8");
    for (const found of text.matchAll(/getCurrentWindow\(\)\s*\.\s*(\w+)\s*\(/g)) {
      calls.push({ method: found[1]!, file: relative(root, file) });
    }
  }
  return calls;
}

/** `setAlwaysOnTop` → `core:window:allow-set-always-on-top`. */
function permissionFor(method: string): string {
  return `core:window:allow-${method.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

describe("the window may do what Write-ist asks of it (#64)", () => {
  it("finds the calls it is checking", () => {
    // A pattern that matched nothing would pass every check below.
    expect(windowCalls().map((call) => call.method)).toContain("destroy");
  });

  it("grants every window action the application calls", () => {
    const permissions = granted();
    for (const { method, file } of windowCalls()) {
      // Listening is `core:event:default`, which `core:default` carries.
      if (/^on[A-Z]/.test(method)) {
        expect(permissions, `${file} listens on the window`).toContain("core:default");
        continue;
      }
      expect(permissions, `${file} calls ${method}()`).toContain(permissionFor(method));
    }
  });

  it("grants destroying the window wherever closing it is listened for", () => {
    // Tauri's own wrapper destroys the window after a close-request listener
    // lets a close go ahead — a call that appears nowhere in this source, and
    // the exact one that was missing.
    const listens = windowCalls().some((call) => call.method === "onCloseRequested");
    expect(listens).toBe(true);
    expect(granted()).toContain("core:window:allow-destroy");
  });
});
