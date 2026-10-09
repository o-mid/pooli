import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const { siteConfig, withLegalStatus } = await import(pathToFileURL(join(root, "src/lib/site.ts")).href);

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === ".next") continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(tsx?|mjs)$/.test(name)) files.push(p);
  }
  return files;
}

test("legal status follows the single flag", async () => {
  assert.equal(withLegalStatus("Privacy policy"), siteConfig.legalReviewed ? "Privacy policy" : "Privacy policy (draft)");
  const { GET: llms } = await import(pathToFileURL(join(root, "src/app/llms.txt/route.ts")).href);
  const { GET: humans } = await import(pathToFileURL(join(root, "src/app/humans.txt/route.ts")).href);
  const llmsBody = await (await llms()).text();
  const humansBody = await (await humans()).text();
  for (const body of [llmsBody, humansBody]) {
    if (siteConfig.legalReviewed) assert.doesNotMatch(body, /draft/i);
    else assert.match(body, /draft/i);
  }
  assert.match(readFileSync(join(root, "src/components/marketing/LegalDraftBanner.tsx"), "utf8"), /legalReviewed/);
  assert.match(readFileSync(join(root, "src/components/marketing/SiteFooter.tsx"), "utf8"), /legalReviewed/);
  assert.match(readFileSync(join(root, "src/components/marketing/views/PrivacyView.tsx"), "utf8"), /legalDocumentsUpdatedOn/);
  assert.match(readFileSync(join(root, "src/components/marketing/views/TermsView.tsx"), "utf8"), /legalDocumentsUpdatedOn/);
});

test("public files do not hard-code draft apart from the flag", () => {
  const roots = [join(root, "src/app"), join(root, "src/components/marketing"), join(root, "src/lib")];
  const hits = [];
  for (const dir of roots) {
    for (const file of walk(dir)) {
      if (file.endsWith("legal-flag.test.mjs")) continue;
      const text = readFileSync(file, "utf8");
      if (!/\(draft\)|Draft —|پیش‌نویس/.test(text)) continue;
      if (!text.includes("legalReviewed")) hits.push(file.replace(root + "/", ""));
    }
  }
  assert.deepEqual(hits, []);
});

test("draft copy in messages is only the gated banner and footer line", () => {
  const text = readFileSync(join(root, "src/i18n/messages/marketing-content.ts"), "utf8");
  const lines = text.split("\n");
  const bad = [];
  for (const line of lines) {
    if (!/draft|پیش‌نویس/i.test(line)) continue;
    if (!/draftBanner|legalDraft/.test(line)) bad.push(line.trim());
  }
  assert.deepEqual(bad, []);
});
