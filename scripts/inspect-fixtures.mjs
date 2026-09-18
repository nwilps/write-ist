// Throwaway: report the raw shape of each fixture before any parser exists.
// Run with: node scripts/inspect-fixtures.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../test/fixtures/", import.meta.url).pathname;
for (const name of readdirSync(dir).sort()) {
  if (name.endsWith(".mjs")) continue;
  const path = join(dir, name);
  if (!statSync(path).isFile()) continue;
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  const cr = (text.match(/\r/g) ?? []).length;
  const nfc = text.normalize("NFC");
  const nonAscii = [...text].filter((c) => c.codePointAt(0) > 127).length;
  const tripleBlank = (text.match(/\n{3,}/g) ?? []).length;
  const trailingWs = (text.match(/[ \t]+\n/g) ?? []).length;
  const tabIndented = (text.match(/^\t+/gm) ?? []).length;
  console.log(
    [
      name.padEnd(30),
      `bytes=${bytes.length}`.padEnd(14),
      `chars=${text.length}`.padEnd(14),
      `CR=${cr}`.padEnd(7),
      `nonASCII=${nonAscii}`.padEnd(13),
      `NFC=${nfc === text}`.padEnd(10),
      `3+NL=${tripleBlank}`.padEnd(9),
      `trailWS=${trailingWs}`.padEnd(12),
      `tabIndent=${tabIndented}`.padEnd(13),
      `endsNL=${text.endsWith("\n")}`,
    ].join(" "),
  );
}
