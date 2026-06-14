// Generates public/emergence.json from the canonical ledger source (src/content/emergence.ts).
// Run via `npm run gen:emergence` (wired into the build). Keeps the machine-readable manifest a
// build artifact so it cannot drift from the in-app ledger (AC9).
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest } from "../src/content/emergence";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../public/emergence.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(buildManifest(), null, 2) + "\n", "utf8");
// eslint-disable-next-line no-console
console.log(`wrote ${out}`);
