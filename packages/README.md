# packages/

Workspace stubs (`@pooli/ui`, `@pooli/domain`, `@pooli/config`) are **not** consumed by `apps/web` today.

Canonical domain logic lives in Go under `internal/`. Frontend shares types/helpers under `apps/web/src/lib/`.

**Decision:** DEFER deletion until a real shared TS package is needed. Do not expand these stubs.
