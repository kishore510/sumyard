# Calculators

One folder per calculator: `<name>/calc.ts` (pure function, no UI, storage, date-now or network imports), `calc.test.ts`, `definition.ts` (the registry entry: defaults, `validateInputs`, `migrateInputs`, `summarise` for compare), the page, and a `README.md` with assumptions, sources and edge cases. See `CLAUDE.md` > Architecture rules.

- `registry.ts`: the registry type and `readInputs` (migrate, then validate). `index.ts`: the app's calculators. `pages.tsx`: each one's lazily loaded page (`#/c/<id>`).
- `session.ts`: what a page shows (tax year, inputs, which scenario is open) for the visit.
- `optimiser/`: the optimiser (slices 1a and 1b): the pure engine (`calc.ts`, `types.ts`), the take-home page (`definition.ts`, `OptimiserPage.tsx`, at `#/c/optimiser`), tests and `README.md`. The pension sweep reaches the page in 1b-ii.
- `compound-interest/`: compound interest (slice 2): the engine (2a, 0.15.0: `calc.ts`, `types.ts`) and the page (2b, 0.16.0: `definition.ts`, `results.ts`, `CompoundPage.tsx`, at `#/c/compound-interest`), tests and `README.md`.
- `car-finance/`: the car finance engine (slice 3a, 0.17.0, internal, no page yet: `calc.ts`, `types.ts`): loan, HP and PCP schedules, an effective rate solver (not the statutory APR) and the outstanding balance, tests and `README.md`.
- A definition with `taxRules: 'none'` reads no tax config: its scenarios carry no tax year (`scenarioTaxYear` in `session.ts`), and the page shows `NoTaxRulesBadge` in place of `VerifiedBadge`. An engine refusal reaches `RefusalNotice` and compare as an `InputRefusal` (`registry.ts`).
- The Hello placeholder was removed in 0.9.0; scenarios stored for it are kept but hidden (the scenario store's `preserved`).
- A definition may set `applySettings` to take Settings defaults (the region) on a fresh start (`session.ts`).
- `fixtures/`: fake calculators for tests only.
