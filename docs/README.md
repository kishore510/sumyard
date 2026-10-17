# Docs

Area detail that does not belong in `CLAUDE.md`.

- `design-tokens.md`: token layers, the semantic colour table, and differences from Chalkline.
- `privacy.md`: every browser-storage key Sumyard writes (About > Privacy shows the same list), their migrations, export, import, backup and restore files, and the external-URL allowlist, including how tax-data source links are treated.
- `performance.md`: Lighthouse (mobile) results and the browser and axe checks, with what was not checked.
- `money.md`: the money type (integer pence), exact pence for steps that leave part of a penny, rounding modes, what GOV.UK and HMRC say about rounding for each tax step (slice 1a session E), the rounding decided for each step (sessions F and G1), and display formatting.
- `verification-log.md`: every tax config value: source, date, the line it came from, a second source, status, plus the OPEN questions, the Budget check and figures published but not stored. `src/config/tax/verification.test.ts` keeps it in step with the config.
- `worked-examples.md`: worked examples GOV.UK and HMRC publish, as published, which of them the engine tests mirror, and the HMRC cross-check harness.
- `modelling-decisions.md`: how Sumyard applies the published rules where GOV.UK leaves a choice (the owner's decisions for the core tax engine, D1 to D7, and those recorded for session G, G1 to G4), each with the OPEN questions it answers.
- `hmrc-cross-checks.json`: input cases derived from the config for cross-checking the engine against HMRC's own calculators; the owner fills the expected results (`src/calculators/optimiser/crossChecks.test.ts`).
