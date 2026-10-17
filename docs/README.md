# Docs

Area detail that does not belong in `CLAUDE.md`.

- `design-tokens.md`: token layers, the semantic colour table, and differences from Chalkline.
- `privacy.md`: every browser-storage key Sumyard writes (About > Privacy shows the same list), their migrations, export, import, backup and restore files, and the external-URL allowlist, including how tax-data source links are treated.
- `performance.md`: Lighthouse (mobile) results and the browser and axe checks, with what was not checked.
- `money.md`: the money type (integer pence), rounding modes, what GOV.UK and HMRC say about rounding for each tax step (slice 1a), and display formatting.
- `verification-log.md`: every tax config value: source, date, the line it came from, a second source, status, plus the OPEN questions, the Budget check and figures published but not stored. `src/config/tax/verification.test.ts` keeps it in step with the config.
- `worked-examples.md`: worked examples GOV.UK and HMRC publish, as published, for session F to mirror as tests.
