// The census of a spelling pass over a manuscript, with the real dictionary
// (slice 2, step 10): words checked, distinct words, words flagged, by kind of
// element, and how many flagged are near-matches of a confirmed name.
//
//   cargo build --release --example spell_words --manifest-path src-tauri/Cargo.toml
//   npx vite-node scripts/spell-census.mjs -- path/to/script.fountain [...]
//
// The words are sent to the Rust example in one go and its answer is handed to
// the same `Spellcheck.census` the editor uses, through the same port.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { DEFAULT_PREFERENCES } from "../src/preferences.ts";
import { importScreenplay } from "../src/screenplay/import.ts";
import { toEditorDocument } from "../src/screenplay/editor.ts";
import { namesOf } from "../src/screenplay/names-sync.ts";
import { Spellcheck } from "../src/screenplay/spellcheck.ts";

const binary = new URL("../src-tauri/target/release/examples/spell_words", import.meta.url).pathname;
const files = process.argv.slice(2).filter((argument) => argument !== "--");

for (const file of files) {
  const bytes = readFileSync(file);
  const document = importScreenplay(new Uint8Array(bytes)).document;
  const doc = toEditorDocument(document);
  const names = namesOf(doc);

  const engine = {
    misspelled: async (words) => {
      const started = performance.now();
      const out = execFileSync(binary, { input: words.join("\n") + "\n", maxBuffer: 1 << 28 }).toString();
      engine.lastMs = performance.now() - started;
      return out.split("\n").filter((line) => line !== "");
    },
    suggest: async () => [],
    addWord: async () => {},
    lastMs: 0,
  };
  const spell = new Spellcheck({
    engine,
    names: () => names,
    pause: 0,
    spelling: {
      nearDistance: DEFAULT_PREFERENCES.spellcheckNearDistance,
      nearMinLength: DEFAULT_PREFERENCES.spellcheckNearMinLength,
    },
  });
  const started = performance.now();
  const census = await spell.census(doc);
  const total = performance.now() - started;
  console.log(`\n${file} (${bytes.length} bytes)`);
  console.log(`  words checked ${census.checked}, distinct ${census.distinct}`);
  console.log(`  flagged ${census.flagged} (${census.flaggedDistinct} distinct), of which near-matches ${census.near}`);
  console.log(`  flagged by element: ${JSON.stringify(census.flaggedByType)}`);
  console.log(`  confirmed names/locations: ${names.confirmed("character").length}/${names.confirmed("location").length}; ` +
    `unconfirmed: ${names.unconfirmed("character").length}/${names.unconfirmed("location").length}`);
  console.log(`  first full pass (one process spawn, ${spell.spelling.cached} lookups): ${total.toFixed(0)} ms, of which dictionary ${engine.lastMs.toFixed(0)} ms`);
}
