/**
 * Spellcheck never goes online, and never ships a dictionary without its notice
 * (slice 2, step 10; ADR-0032; the spec's *offline rule*).
 *
 * The same shape as the check that fails on a styling literal in a component:
 * a source scan, because "nothing is fetched" cannot be seen from inside a
 * running test. Step 11 runs the whole pass with the network unavailable; this
 * is what keeps step 10's own files honest until then.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...path: string[]): string => readFileSync(join(root, ...path), "utf8");

/** Code, without its comments: prose may say "http" and a URL. */
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("spellcheck is offline", () => {
  const FILES = [
    ["src", "screenplay", "spelling.ts"],
    ["src", "screenplay", "spellcheck.ts"],
    ["app", "src", "spell-tauri.ts"],
  ];

  it.each(FILES)("%s/%s/%s makes no network request", (...path) => {
    const text = code(read(...path));
    expect(text).not.toMatch(/\bfetch\s*\(/);
    expect(text).not.toMatch(/XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
    expect(text).not.toMatch(/https?:\/\//);
  });

  it("reaches the dictionary only through its three commands", () => {
    const text = read("app", "src", "spell-tauri.ts");
    expect([...text.matchAll(/invoke<[^>]*>\("([a-z_]+)"/g)].map((found) => found[1])).toEqual([
      "spell_misspelled",
      "spell_suggest",
      "spell_add_word",
    ]);
  });

  it("grants the window no HTTP scope", () => {
    const capabilities = join(root, "src-tauri", "capabilities");
    for (const name of readdirSync(capabilities)) {
      expect(readFileSync(join(capabilities, name), "utf8"), name).not.toMatch(/\bhttp\b/i);
    }
  });

  it("uses no HTTP client in the Rust shell", () => {
    const manifest = read("src-tauri", "Cargo.toml");
    expect(manifest).not.toMatch(/reqwest|hyper|ureq|tauri-plugin-http/);
    expect(code(read("src-tauri", "src", "spelling.rs"))).not.toMatch(/TcpStream|reqwest|https?:\/\//);
  });

  it("switches the webview's own spellcheck off on the manuscript", () => {
    expect(read("app", "src", "workspaces", "editor", "editor.ts")).toMatch(/spellcheck:\s*"false"/);
  });
});

describe("dictionaries ship with their notices", () => {
  const folder = join(root, "src-tauri", "dictionaries");
  const shipped = readdirSync(folder).filter((name) => statSync(join(folder, name)).isDirectory());

  it("ships at least en_US", () => {
    expect(shipped).toContain("en_US");
  });

  it.each(shipped)("%s has its .aff, .dic and a licence notice beside them", (language) => {
    for (const file of [`${language}.aff`, `${language}.dic`, "LICENSE"]) {
      expect(existsSync(join(folder, language, file)), `${language}/${file}`).toBe(true);
    }
    // The notice is the dictionary's own, not an empty file standing in for one.
    const notice = readFileSync(join(folder, language, "LICENSE"), "utf8");
    expect(notice).toMatch(/SCOWL|Copyright/);
    expect(notice.length).toBeGreaterThan(1000);
  });

  it("is compiled in by its notice as well as its words", () => {
    const rust = read("src-tauri", "src", "spelling.rs");
    for (const language of shipped) {
      expect(rust).toContain(`dictionaries/${language}/${language}.dic`);
      expect(rust).toContain(`dictionaries/${language}/LICENSE`);
    }
  });
});
