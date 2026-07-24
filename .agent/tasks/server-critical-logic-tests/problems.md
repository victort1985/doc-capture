# Problems: server-critical-logic-tests

No unresolved acceptance-criteria findings -- all 7 ACs PASS (see evidence.md).

## Problems found and fixed during this task (audit trail, not blocking)

### P1: Wrong relative import path in the first draft of secret-columns.spec.ts
- Where: server/src/common/crypto/secret-columns.spec.ts
- What: used `../modules/...` from `src/common/crypto/`, which only goes up
  to `src/common/`, not `src/`. Needed `../../modules/...`.
- Fix: corrected the import paths. Caught immediately by TS2307 on the first
  test run (fresh verify working as intended).

### P2: `webdav` package is ESM-only with an ESM-only dependency tree
- Where: transitively imported via OrdersService/InvoicesService ->
  StorageService -> storage-adapter.factory.ts -> synology-storage.adapter.ts
  -> `webdav` -> (layerr, hot-patcher, ...).
- What: ts-jest's default config doesn't transform node_modules, so any spec
  that even imports StorageService as a DI token (to mock it) fails to parse.
- Fix: added a manual mock at server/__mocks__/webdav.js and mapped it via
  jest.config.js's moduleNameMapper, instead of chasing an ever-growing
  transformIgnorePatterns allowlist of webdav's transitive ESM dependencies.

## Out-of-scope observation (not a task failure, flagged for awareness)

- `npm run lint` is non-functional in server/ -- no eslint package or config
  installed at all, independent of this task. Pre-existing gap, not touched
  here per the frozen spec's Non-goals. Worth a separate task if wanted.
