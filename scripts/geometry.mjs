/**
 * Write `app/src/style/geometry.css` from the one table (#40).
 *
 * `npm run geometry`. The test that matters is
 * `test/app/manuscript-geometry.test.ts`, which fails if the checked-in file is
 * not what `stylesheet()` returns; this script is only how you make it so.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stylesheet } from "../src/screenplay/geometry.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "app", "src", "style", "geometry.css");
writeFileSync(path, stylesheet(), "utf8");
console.log(`wrote ${path}`);
