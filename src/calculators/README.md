# Calculators

One folder per calculator: `<name>/calc.ts` (pure function, no UI, storage, date-now or network imports), `calc.test.ts`, `definition.ts` (the registry entry: defaults, `validateInputs`, `migrateInputs`, `summarise` for compare), the page, and a `README.md` with assumptions, sources and edge cases. See `CLAUDE.md` > Architecture rules.

- `registry.ts`: the registry type and `readInputs` (migrate, then validate). `index.ts`: the app's calculators. `pages.tsx`: each one's lazily loaded page (`#/c/<id>`).
- `session.ts`: what a page shows (tax year, inputs, which scenario is open) for the visit.
- `optimiser/`: the optimiser (slices 1a and 1b): the pure engine (`calc.ts`, `types.ts`), the take-home page (`definition.ts`, `OptimiserPage.tsx`, at `#/c/optimiser`), tests and `README.md`. The pension sweep reaches the page in 1b-ii.
- `compound-interest/`: the compound interest engine (slice 2a, 0.15.0): `calc.ts`, `types.ts`, tests and `README.md`. No page or registry entry until 2b.
- The Hello placeholder was removed in 0.9.0; scenarios stored for it are kept but hidden (the scenario store's `preserved`).
- A definition may set `applySettings` to take Settings defaults (the region) on a fresh start (`session.ts`).
- `fixtures/`: fake calculators for tests only.
