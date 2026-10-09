import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const robotsMod = await import(pathToFileURL(join(root, "src/app/robots.ts")).href);

test("robots disallows private paths", () => {
  const r = robotsMod.default();
  const disallow = r.rules.disallow;
  assert.ok(disallow.includes("/app/"));
  assert.ok(disallow.includes("/p/"));
  assert.ok(disallow.includes("/login"));
  assert.ok(r.sitemap.includes("sitemap.xml"));
});
