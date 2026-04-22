.PHONY: up down migrate api tidy test

up:
	docker compose up -d

down:
	docker compose down

migrate:
	go run ./cmd/migrate up

api:
	go run ./apps/api

tidy:
	go mod tidy

test:
	go test $$(go list ./... | grep -v /node_modules/)
