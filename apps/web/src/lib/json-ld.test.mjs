import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const { landingGraph, assertOrganizationShape, organizationNode } = await import(
  pathToFileURL(join(root, "src/lib/json-ld.ts")).href
);

test("landing graph organization shape", () => {
  const graph = landingGraph();
  const org = graph["@graph"].find((n) => n["@type"] === "Organization");
  assert.ok(org);
  assertOrganizationShape(org);
});

test("organization node has sameAs array", () => {
  const org = organizationNode();
  assert.ok(Array.isArray(org.sameAs));
  assert.ok(org.sameAs.length >= 2);
});
