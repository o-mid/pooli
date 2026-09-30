#!/usr/bin/env node
/** Structural checks on cases.yaml before scoring. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const CASES = join(ROOT, 'dataset', 'cases.yaml');
const REQUIRED_GROUPS = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];

const doc = parseYaml(readFileSync(CASES, 'utf8'));
const cases = doc.cases ?? [];
const ids = new Set();
let errors = 0;

if (cases.length < (doc.meta?.minimum_cases ?? 30)) {
  console.error('cases: below minimum_cases');
  errors += 1;
}

const groups = new Set();
for (const c of cases) {
  if (!c.id) {
    console.error('case missing id');
    errors += 1;
    continue;
  }
  if (ids.has(c.id)) {
    console.error(`duplicate id ${c.id}`);
    errors += 1;
  }
  ids.add(c.id);
  groups.add(c.group);
  if (!c.group) {
    console.error(`${c.id}: missing group`);
    errors += 1;
  }
  const kind = c.kind ?? 'draft_validation';
  if (kind === 'draft_validation' && c.draft == null) {
    console.error(`${c.id}: draft_validation requires draft`);
    errors += 1;
  }
}

for (const g of REQUIRED_GROUPS) {
  if (!groups.has(g)) {
    console.error(`missing group ${g}`);
    errors += 1;
  }
}

if (errors) {
  console.error(`validate: ${errors} error(s)`);
  process.exit(1);
}
console.log(`validate: ok (${cases.length} cases, groups ${[...groups].sort().join(', ')})`);
