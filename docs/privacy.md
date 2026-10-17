# Privacy and storage

Sumyard has no backend, accounts, analytics or tracking, and makes no network requests (CI scans the build: see `scripts/checks/externalUrls.ts`). Fonts are bundled. Everything stays in the browser on this device.

## Storage keys

This table lists every browser-storage key Sumyard writes. `src/lib/storageKeys.ts` is the code's list, and About > Privacy renders that list. `scripts/checks/storageKeys.test.ts` fails if a key is used in code but not listed here, listed here but not owned or used, or written outside the `sumyard:v1:` namespace; it also fails on sessionStorage, IndexedDB or cookies. `src/sheets/AboutPage.test.tsx` checks About shows every key. A new key needs a migration plan and an entry here.

| Key | What | Record | Since |
|---|---|---|---|
| `sumyard:v1:theme` | Your theme choice: System, Light or Dark. Also read before first paint by the inline script in `index.html`. | `{ "schemaVersion": 1, "theme": "system" \| "light" \| "dark" }`. Missing, unreadable or another schema version means System. | 0.1.0 |
| `sumyard:v1:settings` | Your default region and how amounts are shown. | `{ "schemaVersion": 1, "region": "ruk" \| "scotland", "amounts": "pounds" \| "pence" }`. Another schema version means defaults (rest of UK, whole pounds); an invalid field falls back to its own default. | 0.2.0 |
| `sumyard:v1:last-seen-version` | The last version whose What’s new you opened (code name `lastSeenVersion`). | `{ "schemaVersion": 1, "version": "x.y.z" }`. Anything else means “not seen”, so the New marker shows. | 0.2.0 |
| `sumyard:v1:acknowledged` | That you have read the “illustrative, not advice” notice. | `{ "schemaVersion": 1, "acknowledged": true }`. Anything else shows the notice again. | 0.2.0 |

How much is stored: About > Storage used adds up every `sumyard:` key and value at two bytes per character (browsers keep localStorage as UTF-16). Other sites’ data is not counted.

## Migrations

- Every record is `{ schemaVersion, ... }`. A future schema 2 of any key must read schema 1 records. Until a migration exists, another version falls back to the default, which is safe for all four keys: at worst the theme resets to System, settings to their defaults, the New marker shows again, or the first-run notice shows again.
- `sumyard:v1:theme` stays the theme's key (session B kept it rather than folding it into settings), because the pre-paint script reads it before any app code runs.
- Rolling back from 0.2.0 to 0.1.0 is safe: 0.1.0 ignores the three new keys.

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

Session B tightened the list: each entry is pinned to its file type (the same string elsewhere fails), and the build fails if an entry is no longer in the build, so the list can only shrink. No entry was added. Credits in About carry package name, version and licence only (no homepage URLs), and What's new is injected as parsed data, so `CHANGELOG.md`'s link to the Keep a Changelog site is not bundled. Adding an entry is a privacy decision: flag it in the PR.
