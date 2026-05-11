.PHONY: up down migrate migrate-down api worker web test lint simulate-pay tidy verify

up:
	docker compose up -d

down:
	docker compose down

migrate:
	go run ./cmd/migrate up

migrate-down:
	go run ./cmd/migrate down

api:
	go run ./apps/api

worker:
	go run ./apps/chain-worker

web:
	npm run dev --workspace=@pooli/web

tidy:
	go mod tidy

test:
	go test $$(go list ./... | grep -v /node_modules/)
	npm run test --workspace=@pooli/web || true

lint:
	go vet $$(go list ./... | grep -v /node_modules/)
	npm run lint --workspace=@pooli/web || true

# Simulate a payment for a payment option (requires API + ENABLE_CHAIN_SIMULATOR=true)
simulate-pay:
	@test -n "$(PAYMENT_OPTION_ID)" || (echo "PAYMENT_OPTION_ID required" && exit 1)
	./scripts/simulate-chain-event.sh "$(PAYMENT_OPTION_ID)"

# Full MVP verification including API restart persistence check
verify:
	./scripts/verify-mvp-runner.sh
