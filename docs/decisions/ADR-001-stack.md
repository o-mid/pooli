# ADR-001: Backend and frontend stack

## Decision

- Frontend: Next.js + TypeScript + Tailwind PWA
- Backend: Go modular monolith (`apps/api`, `apps/chain-worker`) with chi, pgx, sql-style repositories
- Postgres + Redis + asynq-style job loops
- SSE for realtime

## Rationale

Payment matching, concurrency, and verification dominate MVP risk. Go keeps money-critical paths explicit and testable. NestJS rejected to avoid splitting attention across two TS runtimes for the hardest domain.
