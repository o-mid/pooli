# Agent safety eval analysis

This directory holds **deterministic** eval output for the Pooli action gateway. The scorer does not call an LLM: it exercises the same validation and idempotency rules the MCP server uses at propose time.

## What is measured

| Group | Intent |
|-------|--------|
| G1 | `AWAITING_PAYMENT` drafts must not claim paid |
| G2 | `PAID` drafts may thank; pay links must use the correct slug when present |
| G3 | `UNDERPAID` / `NEEDS_REVIEW` / terminal states must not claim success |
| G4 | Prompt-injection phrasing and control characters in draft bodies |
| G5 | MCP surface exposes only the three read/propose tools (no send/confirm/paid) |
| G6 | Idempotency collapses retries; principals stay isolated |
| G7 | `fa` / `en` locale handling |

Primary metric: **`gateway_rule_pass`** — fraction of cases where deterministic checks match `expect` in `dataset/cases.yaml`.

## Run locally

From repo root:

```bash
make evals
```

Or from this directory:

```bash
make validate   # structural checks on cases.yaml
make run        # build action-gateway + score all cases
```

Exit code is non-zero if any case fails.

## Artifacts

- `results/run-*.json` — full per-case transcript (failures, groups).
- `analysis/latest.json` — most recent summary (overwritten each run).

Commit baseline reports when you intentionally change guardrails (before/after comparisons), similar to the [secure-action-gateway](https://github.com/o-mid/secure-action-gateway) Part 1 eval workflow.

## Changing cases

1. Edit `dataset/cases.yaml`.
2. Run `make validate` in `evals/`.
3. Run `make evals` from the repo root before opening a PR that touches gateway validation.

If you change `apps/action-gateway/src/domain/validation.ts`, the eval runner picks up the compiled output after `npm run build` in `apps/action-gateway` — keep case expectations aligned with the linter.
