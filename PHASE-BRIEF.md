# PHASE-BRIEF: Slice 1b Optimiser: UI

Status: In progress. The take-home pay page at `#/c/optimiser` is live (1b-i to 0.12.0: benefits in kind, deductions, percentages, salary sacrifice benefits, tax code and PAYE estimate, monthly breakdown, the sectioned page with a sticky result). Next is 1b-ii: the optimiser on the same page, in two parts, 1b-ii-a then 1b-ii-b. Status per part lives only in `PLAN.md`.

## Docs rule

Close out every session with the tiered checklist in `CLAUDE.md` ("Session close-out checklist").

## Goal

The £100k+ optimiser page, built from shared components on the slice 1a engine: take-home now, then candidate pension contributions with their cliffs, thresholds, annual allowance and childcare position, never one called "the best".

## Next: part 1b-ii-a (the optimiser sweep and chart)

On the same page and inputs (version 3 since 0.11.0), in the 0.12.0 layout. Add a migration to `MIGRATIONS` in `definition.ts` only if the stored shape changes; the version follows. `optimise()` already sweeps from cash pay after salary given up for benefits.

### Scope

- A new `Section` for the optimiser's inputs; its results in the `StickyResult` results column, with the chart below the split bar.
- `optimise(inputs, config, policy, options?)` from the page inputs: `toTaxInputs` plus `pension` (the method and the resolved current contribution, from `resolveInputs`), `savings` (the resolved `employerContribution`, carry forward and the MPAA flag as new inputs) and `checkChildcare`. A sweep over contributions is in amounts; a contribution entered as a percentage can be shown as a percentage of pensionable pay beside it.
- The take-home (or spendable) against contribution chart from `points`, markers for `current`, `maximum` and each threshold, `cliffs` drawn as labelled jumps, a table fallback (the shared `Chart`).
- The layout-shift fix (backlog): reserve the page's height while a calculator page loads, so the footer is not pushed off-screen when the page arrives (Lighthouse CLS 0.137 on the take-home page).

### Out of scope

- Everything in 1b-ii-b below.
- No point labelled "best".

## Then: part 1b-ii-b (reading the result)

### Scope

- "Cost of £1 more pension" from `netCostPerPound` and `marginalRate`, labelled with what each is measured against.
- Thresholds in words from `thresholds` ("already under", "contribute £X more", "out of reach" with the reason); the HICBC full-charge point said plainly (the charge first falls a penny below it).
- Warnings from each point (annual allowance, taper, carry forward, childcare), never hidden, never a cap; childcare as eligibility only, with what isn't checked.
- Compare: the current contribution against a chosen one. No point labelled "best".
- Help and assumptions for the optimiser.

### Out of scope

- Slice 2 and later calculators.

## Still with the owner

Confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input.

## Last session

- 21 October 2026, part 1b-ii-a (unreleased, no version bump until merge): inputs version 4 (carry forward, MPAA flag, childcare check) in a "Pension allowances" section; `optimise()` on the page through `optimiserInputs.ts`; the contribution chart below the split bar (`chartData.ts`, shared `Chart` gained numeric x, markers and ranges); load height reserved (CLS 0.137 to 0).
- Differs from the brief: compare does not show the new inputs (compare changes out of scope); the "not modelled" list was compiled from the engine's assumptions, as the brief has none.
- Not verified: 768 px, a real phone, Safari, Firefox, a screen reader, the deployed site.
- Next: part 1b-ii-b.

Full history (progress logs, finished part scopes, slice archives): `docs/history/` (grep it, don't read it whole).
