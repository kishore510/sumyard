# Privacy and storage

Sumyard has no backend, accounts, analytics or tracking, and makes no network requests (CI scans the build: see `scripts/checks/externalUrls.ts`). Fonts are bundled. Everything stays in the browser on this device.

## Storage keys

This table lists every browser-storage key Sumyard writes. `src/lib/storageKeys.ts` is the code's list, and About > Privacy renders that list. `scripts/checks/storageKeys.test.ts` fails if a key is used in code but not listed here, listed here but not owned or used, or written outside the `sumyard:v1:` namespace; it also fails on sessionStorage, IndexedDB or cookies. `src/sheets/AboutPage.test.tsx` checks About shows every key. A new key needs a migration plan and an entry here.

| Key | What | Record | Since |
|---|---|---|---|
| `sumyard:v1:theme` | Your theme choice: System, Light or Dark. Also read before first paint by the inline script in `index.html`. | `{ "schemaVersion": 1, "theme": "system" \| "light" \| "dark" }`. Missing, unreadable or another schema version means System. | 0.1.0 |
| `sumyard:v1:settings` | Your default region, tax year and how amounts are shown. | `{ "schemaVersion": 2, "region": "ruk" \| "scotland", "amounts": "pounds" \| "pence", "taxYear": "2026-27" }` (`taxYear` is any id in the tax-year registry). Schema 1 (0.2.0, no `taxYear`) is migrated on read; a newer or unreadable version means defaults (rest of UK, whole pounds, the latest registered tax year); an invalid field, or a tax year no longer registered, falls back to its own default. | 0.2.0 (schema 2 since 0.3.0) |
| `sumyard:v1:last-seen-version` | The last version whose What’s new you opened (code name `lastSeenVersion`). | `{ "schemaVersion": 1, "version": "x.y.z" }`. Anything else means “not seen”, so the New marker shows. | 0.2.0 |
| `sumyard:v1:acknowledged` | That you have read the “illustrative, not advice” notice. | `{ "schemaVersion": 1, "acknowledged": true }`. Anything else shows the notice again. Restoring a backup can set it either way; “Clear all data” removes it. | 0.2.0 |
| `sumyard:v1:scenarios` | Your saved scenarios: each one’s name, calculator, tax year and inputs. Inputs only: results are always worked out again. | `{ "schemaVersion": 1, "scenarios": [{ "id", "calculatorId", "taxYear", "name", "inputs", "inputsVersion", "createdAt", "updatedAt" }] }`; `taxYear` is left out for a calculator that uses no tax rules (compound interest, from 0.16.0; the car decision, from 0.19.0), and refused if present for one, so the schema is unchanged. Each scenario is checked on read (`readScenario`): its calculator must be registered, its inputs migrated through the calculator’s `migrateInputs` and validated, and a fresh object is built. Scenarios this version can’t use (an unknown calculator, newer inputs) are kept untouched and written back, so a rollback loses nothing. A record that isn’t JSON, has `__proto__`, `constructor` or `prototype` keys, or has a newer schema is never written over (“blocked”) until a restore or “Clear all data”. Capped at 200 scenarios, 80-character names, 20,000 characters of inputs each and 1,000,000 characters in total. | 0.4.0 |

How much is stored: About > Storage used adds up every `sumyard:` key and value (scenarios included) at two bytes per character (browsers keep localStorage as UTF-16). Other sites’ data is not counted.

## Files: export, import, backup and restore (0.4.0)

Nothing is uploaded: files are made in the browser (a Blob and a download link) and read from a file picker.

- **Scenarios export** (`sumyard-scenarios-YYYY-MM-DD.json`): `{ "app": "sumyard", "kind": "scenarios", "exportVersion": 1, "appVersion", "exportedAt", "scenarios": [...] }`, every scenario or one calculator’s.
- **Backup** (`sumyard-backup-YYYY-MM-DD.json`): the same envelope with `"kind": "backup"`, plus `settings`, `theme` and `acknowledged`. The What’s new marker (`last-seen-version`) is left out: it belongs to the browser. Scenarios this version can’t show are not included.
- **Import and restore treat the file as untrusted** (`src/scenarios/exchange.ts`, `backup.ts`, `src/lib/validate.ts`): refused before parsing if over about 2 MB; refused outright if it isn’t JSON, has a `__proto__`, `constructor` or `prototype` key anywhere, is nested too deeply, is another app’s or kind, or has a newer export version; each scenario is then checked on its own, so a bad one is skipped with a reason. A preview shows counts, names (as plain text), what is skipped and why, and conflicts; nothing is written until the person confirms. Import offers **Add** (new ids, exact duplicates skipped) or **Replace**; restore replaces everything, after offering an export of the current data.
- **Clear all data** (Settings) removes every key above, after a confirmation that offers a backup first. It can’t be undone.

## Migrations

- Every record is `{ schemaVersion, ... }`. A newer schema of any key must read the older ones, through the migration hook `upgradeRecord` in `src/lib/storage.ts` (it runs one step per version and falls back to defaults if a step is missing or fails). A version with no migration falls back to the default, which is safe for the first four keys: at worst the theme resets to System, settings to their defaults, the New marker shows again, or the first-run notice shows again.
- **`sumyard:v1:settings` schema 1 to 2 (0.3.0):** keeps `region` and `amounts` and adds `taxYear` with its default, the latest year in the registry. The stored record is left as it is until the next change, which saves schema 2. Tested in `src/settings/settings.test.ts`.
- `sumyard:v1:theme` stays the theme's key (session B kept it rather than folding it into settings), because the pre-paint script reads it before any app code runs.
- Rolling back from 0.2.0 to 0.1.0 is safe: 0.1.0 ignores the three new keys.
- Rolling back from 0.3.0 to 0.2.0 is safe but loses saved defaults once settings have been saved as schema 2: 0.2.0 reads only schema 1, so it falls back to rest of UK and whole pounds. Nothing else is affected. 0.3.0 added no key.
- **`sumyard:v1:scenarios` (new in 0.4.0, schema 1).** Migration plan: a schema 2 adds a step to `MIGRATIONS` in `src/scenarios/store.ts` (run by `upgradeRecord`); a record with a newer schema than the app knows is never written over. Each scenario’s **inputs** are versioned separately (`inputsVersion`), and each calculator migrates its own (`migrateInputs` in the registry, `src/calculators/registry.ts`), on read and on import.
- Rolling back from 0.4.0 to 0.3.0 is safe: 0.3.0 ignores `sumyard:v1:scenarios` (the scenarios stay in the browser for when 0.4.0 or later is back). The other keys are unchanged.

## External-URL allowlist

The build scan (`scripts/checks/externalUrls.ts`, run by `npm run build`) fails on any external URL except:

1. **Plain https GOV.UK links** (`https://www.gov.uk/...` or `https://gov.uk/...`), and never where the browser would fetch them (script, stylesheet, image, CSS `url()`). Help can link only there: the Markdown parser shows any other link as text.
2. **Exact inert strings** in `INERT_URLS`, each allowed only in one kind of file and never fetched:

| String | File type | Why it is in the build |
|---|---|---|
| `http://www.w3.org/2000/svg` | `.js` | SVG namespace identifier used by React DOM. |
| `http://www.w3.org/1999/xlink` | `.js` | XLink namespace identifier used by React DOM. |
| `http://www.w3.org/1998/Math/MathML` | `.js` | MathML namespace identifier used by React DOM. |
| `http://www.w3.org/XML/1998/namespace` | `.js` | XML namespace identifier used by React DOM. |
| `https://react.dev/errors/` | `.js` | Prefix of React's production error messages (console only). |
| `https://tailwindcss.com` | `.css` | Tailwind's licence comment. |

### Tax-data sources (0.3.0)

Verified tax-config values carry a GOV.UK source URL, and the Tax data screen shows each as a link, so those URLs are strings in the JavaScript bundle. Session C checked how the scan treats them and changed nothing in it:

- The scan reads every URL in every text file in `dist/`, including JavaScript strings. `https://www.gov.uk/...` and `https://gov.uk/...` already pass anywhere except where the browser would fetch them; every other host fails, **including `www.legislation.gov.uk` and `assets.publishing.service.gov.uk`**. No `INERT_URLS` entry is about gov.uk.
- The config side is narrower than the scan: `isSourceUrl` (`src/config/tax/sourced.ts`) accepts only `https://www.gov.uk/` pages with a path and no credentials, port, spaces, quotes, angle brackets or backslashes. The type `SourceUrl` enforces the prefix at compile time, and the config audit test enforces the rest. The Tax data screen renders sources only from verified leaves, as plain anchors with `target="_blank"` and `rel="noopener noreferrer"`; nothing fetches them (Sumyard makes no requests).
- A minified bundle can't show where a string came from, so "only strings from `src/config/tax`" is enforced at the source rather than in the scan.
- Fixture tests (`scripts/checks/externalUrls.test.ts`) prove a verified leaf and its anchor pass the scan, that every URL the config accepts passes, and that legislation.gov.uk still fails. The build also fails if the fake fixtures' marker reaches `dist/`.
- **Open owner decision:** allowing legislation.gov.uk (or another gov.uk host) as a source would widen the allowlist. The narrowest form would be an exact `https://www.legislation.gov.uk/` prefix, allowed only in `.js` files, mirrored in `isSourceUrl`. Not done; ask first.

Session B tightened the list: each entry is pinned to its file type (the same string elsewhere fails), and the build fails if an entry is no longer in the build, so the list can only shrink. No entry was added. Credits in About carry package name, version and licence only (no homepage URLs), and What's new is injected as parsed data, so `CHANGELOG.md`'s link to the Keep a Changelog site is not bundled. Adding an entry is a privacy decision: flag it in the PR.
