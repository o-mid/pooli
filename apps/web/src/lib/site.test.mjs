import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const { siteConfig, companyAddressLine } = await import(
  pathToFileURL(join(root, "src/lib/site.ts")).href
);

test("siteConfig core fields", () => {
  assert.equal(siteConfig.name, "Pooli");
  assert.ok(siteConfig.company.legalNameEn.includes("POOLI"));
  assert.equal(siteConfig.contact.support, "support@pooli.shop");
  assert.match(companyAddressLine("en"), /Porou 31/);
});

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === ".next") continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(tsx?|mjs|md)$/.test(name)) files.push(p);
  }
  return files;
}

test("no duplicate company address outside site config", () => {
  const needle = "Porou 31, Kentrikos Tomeas Athinon";
  const allowed = [
    join(root, "src/lib/site.ts"),
    join(root, "src/lib/site.test.mjs"),
    join(root, "src/i18n/messages/marketing-content.ts"),
  ];
  const hits = [];
  for (const file of walk(root)) {
    if (allowed.some((a) => file === a)) continue;
    if (file.includes("marketing-content")) continue;
    const text = readFileSync(file, "utf8");
    if (text.includes(needle)) hits.push(file);
  }
  assert.deepEqual(hits, []);
});
