import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const { en } = await import(pathToFileURL(join(root, "src/i18n/messages/en.ts")).href);
const { fa } = await import(pathToFileURL(join(root, "src/i18n/messages/fa.ts")).href);

function keys(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...keys(v, p));
    else out.push(p);
  }
  return out.sort();
}

test("marketing keys match en and fa", () => {
  const enKeys = keys(en.marketing);
  const faKeys = keys(fa.marketing);
  assert.deepEqual(faKeys, enKeys);
});
