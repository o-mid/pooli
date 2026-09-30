#!/usr/bin/env node
/**
 * Deterministic eval runner — no live LLM. Scores gateway linter, tool surface, idempotency.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { aggregate, scoreCase } from './scoring.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CASES_PATH = join(ROOT, 'dataset', 'cases.yaml');
const OUT_DIR = join(ROOT, 'results');
const SUMMARY_PATH = join(ROOT, 'analysis', 'latest.json');

function loadCases() {
  const doc = parseYaml(readFileSync(CASES_PATH, 'utf8'));
  const cases = doc.cases ?? [];
  const min = doc.meta?.minimum_cases ?? 30;
  if (cases.length < min) {
    console.error(`FATAL: need at least ${min} cases, found ${cases.length}`);
    process.exit(1);
  }
  return { meta: doc.meta ?? {}, cases };
}

async function main() {
  const { meta, cases } = loadCases();
  const started = new Date().toISOString();
  const scored = [];

  for (const c of cases) {
    const outcome = await scoreCase(c);
    scored.push({
      id: c.id,
      group: c.group,
      pass: outcome.pass,
      failures: outcome.failures,
    });
    const mark = outcome.pass ? 'PASS' : 'FAIL';
    console.log(`${mark}  ${c.id} (${c.group})${outcome.failures.length ? ': ' + outcome.failures.join('; ') : ''}`);
  }

  const summary = aggregate(scored);
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(join(ROOT, 'analysis'), { recursive: true });

  const report = {
    meta,
    started,
    finished: new Date().toISOString(),
    summary,
    cases: scored,
  };

  writeFileSync(join(OUT_DIR, `run-${started.replace(/[:.]/g, '-')}.json`), JSON.stringify(report, null, 2));
  writeFileSync(SUMMARY_PATH, JSON.stringify(report, null, 2));

  console.log('');
  console.log(
    `Eval: ${summary.passed}/${summary.total} passed (${(summary.pass_rate * 100).toFixed(1)}%)`,
  );
  for (const [group, g] of Object.entries(summary.byGroup).sort()) {
    console.log(`  ${group}: ${g.pass}/${g.total}`);
  }

  if (summary.failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
