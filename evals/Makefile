# Agent safety eval harness (deterministic; no LLM).

.PHONY: setup validate run clean

setup:
	npm install --silent

validate: setup
	node validate.mjs

run: setup
	cd ../apps/action-gateway && npm run build
	node runner/run_eval.mjs

clean:
	rm -rf node_modules results analysis/latest.json
