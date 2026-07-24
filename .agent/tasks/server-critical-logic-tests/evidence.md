# Evidence Bundle: server-critical-logic-tests

## Summary
- Overall status: PASS (with one pre-existing, out-of-scope gap noted below)
- Last updated: 2026-07-24

## Acceptance criteria evidence

### AC1 — resolveConnectionId() prefers configured DocumentCategory.ORDER routing
- Status: PASS
- Proof:
  - `src/modules/orders/orders.service.spec.ts` -- "prefers the configured DocumentCategory.ORDER routing connection when one exists" -- asserts `resolveConnectionId()` returns the mocked routing connection id (42) and calls `storageSettingsService.findOne` with `(DocumentCategory.ORDER, null)`.
  - raw/test-unit.txt: `PASS src/modules/orders/orders.service.spec.ts`

### AC2 — falls back to env var / connection id 1 when unrouted
- Status: PASS
- Proof:
  - Same spec file, two cases: env var set -> returns 7; env var unset -> returns 1.
  - Extra case added beyond the original spec: routing row exists but `storageConnection` is null -> still falls back.

### AC3 — persistent counter, no duplicate numbers across deletions
- Status: PASS
- Proof:
  - `quotes.service.spec.ts` and `invoices.service.spec.ts`, "two back-to-back calls never return the same number, even simulating a row deleted in between" -- asserts `#1` then `#2`, driven purely by the mocked settings row's `nextSequence` field, independent of how many quote/invoice rows exist.

### AC4 — never derives the number from COUNT(*) for org-scoped documents
- Status: PASS
- Proof:
  - Both specs assert `quotesRepo.count` / `invoicesRepo.count` is never called when `organizationId` is non-null, and that `settingsRepo.increment` is called with `nextSequence`.
  - The null-organization (super-admin) path intentionally still uses `count()` -- existing, accepted behavior -- confirmed by its own dedicated test in both specs.

### AC5 — encryptString/decryptString round-trip
- Status: PASS
- Proof: `encryption.util.spec.ts` -- parametrized round-trip across short/unicode(Hebrew)/long/app-password-shaped strings, plus null/undefined/empty and corrupted-payload handling, plus a wrong-key negative case.

### AC6 — encrypted output is never the plaintext
- Status: PASS
- Proof: `encryption.util.spec.ts`, "never returns the plaintext as the encrypted output" and "produces different ciphertext for the same plaintext on repeated calls (random IV)".

### AC7 — entity column transformers actually encrypt (not just select:false)
- Status: PASS
- Proof: `secret-columns.spec.ts` -- reads each entity's real TypeORM column transformer via `getMetadataArgsStorage()` and asserts the value that would be written to the DB column is not the plaintext and doesn't contain it, for `StorageConnection.password`, `DocumentEmailSettings.appPassword`, `OrderEmailSettings.appPassword`.

## Commands run
- `cd server && npm install` (added jest, ts-jest, @types/jest, @nestjs/testing -- none were present before this task)
- `cd server && npx jest` -> raw/test-unit.txt
- `cd server && npm run build` -> raw/build.txt
- `cd server && npm run lint` -> raw/lint.txt (see Known gaps)

## Raw artifacts
- .agent/tasks/server-critical-logic-tests/raw/build.txt
- .agent/tasks/server-critical-logic-tests/raw/test-unit.txt
- .agent/tasks/server-critical-logic-tests/raw/lint.txt

## Known gaps
- Lint is not runnable in this repo at all, independent of this task -- `npm run lint` invokes `eslint` but no eslint package/config is installed anywhere in `server/`. Predates this task, not a regression. Out of scope per the frozen spec's Non-goals.
- No integration tests against a live Postgres instance, per the frozen spec's Non-goals.
- Three Jest infrastructure issues had to be fixed along the way (see problems.md): a wrong relative import path in the first draft of secret-columns.spec.ts, and the `webdav` package (pulled in transitively via StorageService) being ESM-only with an ESM-only dependency tree, requiring a manual mock rather than a transform allowlist.
