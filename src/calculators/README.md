# Calculators

One folder per calculator: `<name>/calc.ts` (pure function, no UI, storage, date-now or network imports), `calc.test.ts`, `definition.ts` (the registry entry: defaults, `validateInputs`, `migrateInputs`, `summarise` for compare), the page, and a `README.md` with assumptions, sources and edge cases. See `CLAUDE.md` > Architecture rules.

- `registry.ts`: the registry type and `readInputs` (migrate, then validate). `index.ts`: the app's calculators. `pages.tsx`: each one's lazily loaded page (`#/c/<id>`).
- `session.ts`: what a page shows (tax year, inputs, which scenario is open) for the visit.
- `hello/`: the Hello calculator, a **placeholder** removed when the first real calculator ships.
- `fixtures/`: fake calculators for tests only.
