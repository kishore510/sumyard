# Tax config

The only place tax rules live (see `CLAUDE.md` > Architecture and Accuracy rules).

- `schema.ts`: `TaxYearConfig` (structure only), `TaxBand`, the leaf-path types, and `TAX_GROUPS` (the groups and labels the Tax data screen shows).
- `sourced.ts`: `Sourced<T>` (`{ status: 'todo' }` or `{ status: 'verified', value, sourceUrl, verifiedOn }`), `isSourceUrl`, `isVerified`, `requireVerified`, and the counts behind the Tax data screen and the verified badge.
- `audit.ts`: `auditTaxYear`, the check behind the repo-level test (`configs.test.ts`).
- `index.ts`: the registry: `getTaxYear(id)`, `latestTaxYear()`, `listTaxYears()`, `taxYearLabel(id)`.
- `<yyyy-yy>.ts`: one file per tax year, exporting `taxYear`. `2026-27.ts` is a skeleton: every leaf is `TODO` until slice 1a verifies it.
- `fixtures/`: **fake** years for tests only. Never imported by the app, never copied into a real file.

Adding or changing a value: look it up on GOV.UK or HMRC, set the leaf to `{ status: 'verified', value, sourceUrl, verifiedOn }` (amounts with `fromPounds`, rates with `percent` or `ratio` from `src/lib/money.ts`), and log it in `docs/verification-log.md`. Sources must be `https://www.gov.uk/` pages; any other site needs an owner decision on the build's URL allowlist first (`docs/privacy.md`). Each change to tax values is its own PR.
