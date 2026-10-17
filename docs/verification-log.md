# Verification log

One row for every tax config value Sumyard holds: where it came from, when it was checked, and who checked it. A value enters `src/config/tax/<year>.ts` as a verified leaf only with a row here, in the same PR (see `CLAUDE.md` > Workflow).

Sources must be `https://www.gov.uk/` pages. Another site, such as legislation.gov.uk, needs an owner decision on the build's URL allowlist first (`docs/privacy.md`).

## 2026-27

**No value is verified yet.** `src/config/tax/2026-27.ts` is a skeleton (slice 0.5, session C): every leaf is `{ status: 'todo' }`. Slice 1a fills it in.

| Path | Value | Source | Verified on | Checked by | Notes |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

Rounding modes for each calculation step are logged in `docs/money.md` when 1a verifies them.
