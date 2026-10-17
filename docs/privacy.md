# Privacy and storage

Sumyard has no backend, accounts, analytics or tracking, and makes no network requests (CI scans the build: see `scripts/checks/externalUrls.ts`). Fonts are bundled. Everything stays in the browser on this device.

This file lists every browser-storage key Sumyard writes. It is the source for About > Privacy (session B). `src/lib/storageKeys.ts` is the code's list; a test fails if a key there is missing here. A new key needs a migration plan and an entry here.

| Key | What | Record | Since |
|---|---|---|---|
| `sumyard:v1:theme` | Your theme choice: System, Light or Dark. | `{ "schemaVersion": 1, "theme": "system" \| "light" \| "dark" }`. Missing, unreadable or another schema version means System. | 0.1.0 |

## Migrations

- `sumyard:v1:theme` schema 1: first version, nothing to migrate. A future schema 2 must read schema 1 records. Until a migration exists, any other version falls back to System (safe: only the theme is lost).
