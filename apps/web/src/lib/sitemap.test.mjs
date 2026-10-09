import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const sitemapMod = await import(pathToFileURL(join(root, "src/app/sitemap.ts")).href);
const defaultFn = sitemapMod.default;

test("sitemap lists public routes only", () => {
  const entries = defaultFn();
  const urls = entries.map((e) => e.url);
  assert.ok(urls.some((u) => u.endsWith("pooli.shop/") || u.endsWith("pooli.shop")));
  assert.ok(urls.some((u) => u.includes("/about")));
  assert.ok(!urls.some((u) => u.includes("/app")));
  assert.ok(!urls.some((u) => u.includes("/p/")));
  assert.equal(entries.length, sitemapMod.PUBLIC_PATHS.length);
});
