/**
 * The `SpellEngine` port over Tauri's IPC (slice 2, step 10; ADR-0032).
 *
 * The dictionary is in Rust (`src-tauri/src/spelling.rs`). Each call crosses
 * the boundary and returns when a thread of Tauri's pool has answered, so the
 * thread that types never waits on a lookup. This is the only file in the
 * application that knows the engine is reached through Tauri; everything above
 * it — `src/screenplay/spelling.ts` — takes the port.
 */
import { invoke } from "@tauri-apps/api/core";
import type { SpellEngine } from "../../src/screenplay/spelling.ts";
import type { SettingsDictionary } from "./screens/settings.ts";

export const tauriSpellEngine: SpellEngine = {
  misspelled: (words) => invoke<string[]>("spell_misspelled", { words }),
  suggest: (word) => invoke<string[]>("spell_suggest", { word }),
  addWord: (word) => invoke<boolean>("spell_add_word", { word }),
  removeWord: (word) => invoke<boolean>("spell_remove_word", { word }),
};

/** The writer's own words, for Settings ▸ Dictionary: the same engine, and the same file. */
export const tauriDictionary: SettingsDictionary = {
  words: () => invoke<string[]>("spell_words"),
  add: tauriSpellEngine.addWord,
  remove: tauriSpellEngine.removeWord,
};
