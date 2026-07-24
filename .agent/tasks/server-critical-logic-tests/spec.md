# Task Spec: server-critical-logic-tests

## Metadata
- Task ID: server-critical-logic-tests
- Created: 2026-07-24T10:08:56+00:00
- Repo root: /tmp/doc-capture-inspect
- Working directory at init: /tmp/doc-capture-inspect

## Guidance sources
- None detected at init time.

## Original task statement
Add Jest unit tests for the server-side logic that has broken silently before in this codebase and had no test coverage:

1. OrdersService.resolveConnectionId() (server/src/modules/orders/orders.service.ts) - must prefer the DocumentCategory.ORDER storage routing setting when configured, and fall back to ORDERS_STORAGE_CONNECTION_ID env var / connection id 1 when not configured.

2. Quote/Invoice number generation (generateQuoteNumber / generateInvoiceNumber in quotes.service.ts / invoices.service.ts) - must use the persistent nextSequence counter (atomic increment), never derive the number from COUNT(*) of existing rows, and must never produce the same number twice even if rows are deleted between calls.

3. AES-256-GCM encryption round-trip (server/src/common/crypto/encryption.util.ts) - encryptString(x) then decryptString(...) must return the original value, and StorageConnection.password / DocumentEmailSettings.appPassword / OrderEmailSettings.appPassword transformers must actually invoke this encryption (not store plaintext).

Use the project's existing NestJS + TypeORM + Jest setup. Tests should use an in-memory/mocked repository where reasonable, not a live Postgres connection.

## Acceptance criteria
- AC1: `resolveConnectionId()` returns the configured DocumentCategory.ORDER routing connection id when one exists in document_type_settings.
- AC2: `resolveConnectionId()` falls back to `ORDERS_STORAGE_CONNECTION_ID` env var (or `1` if unset) when no routing row exists for the ORDER category.
- AC3: Quote/invoice number generation claims `nextSequence`, then increments it, and two back-to-back calls never return the same number even if rows in between are deleted.
- AC4: Number generation never queries `COUNT(*)` of quotes/invoices as its source of truth (regression guard for the bug fixed earlier this project).
- AC5: `encryptString` -> `decryptString` round-trips arbitrary strings (including empty-adjacent edge cases: short strings, strings with unicode/Hebrew characters, long strings).
- AC6: `encryptString` output is never equal to the plaintext input (i.e. it's actually encrypting, not passing through).
- AC7: Saving a StorageConnection/DocumentEmailSettings/OrderEmailSettings entity and reading the raw column back (bypassing the transformer) does not contain the plaintext secret.

## Constraints
- Use the project's existing Jest + `@nestjs/testing` setup (server/package.json already has Jest configured for this NestJS project).
- Mock TypeORM repositories (`Repository<T>`) rather than hitting a live Postgres instance — this is unit-level coverage, not integration/e2e.
- Do not modify the behavior of the code under test; if a test reveals an actual bug, report it in problems.md rather than silently changing production code to make the test pass.

## Non-goals
- No integration tests against a real database in this task.
- No test coverage for unrelated modules (calls, warehouse, fleet, etc.) — scope is strictly the three items in the task statement.
- No CI pipeline changes (adding a GitHub Actions test job is out of scope here).

## Verification plan
- Build: `cd server && npm run build`
- Unit tests: `cd server && npx jest orders.service.spec.ts quotes.service.spec.ts invoices.service.spec.ts encryption.util.spec.ts`
- Integration tests: none (out of scope, see Non-goals)
- Lint: `cd server && npm run lint` (if a lint script exists; otherwise `npx tsc --noEmit`)
- Manual checks: read each new spec file and confirm assertions actually match the acceptance criteria above, not just "it didn't throw"
