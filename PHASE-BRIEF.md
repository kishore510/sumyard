# PHASE-BRIEF: Slice 1b Optimiser: UI

Status: In progress. **Session 1b-i is done (0.9.0, user-visible):** the first usable calculator, take-home pay at `#/c/optimiser`, with taxable benefits in kind and post-tax deductions in the engine, and the Hello placeholder removed. **Part 1b-i.1 is done (0.10.0, user-visible):** pension contributions as a percentage of pensionable pay, and benefits in kind and post-tax deductions as lists of named items per month or per year (inputs version 2). **Part 0.11.0 is done (user-visible):** benefits taken from pay before or after tax, an optional tax code with a PAYE estimate, a Year / Month breakdown (inputs version 3). **0.12.0 is done (user-visible, UI only):** the take-home page redesign (sections with summaries, a sticky result, a split bar, payslip net pay with a code). **Next:** session 1b-ii (the optimiser itself on the same page), starting from inputs version 3. Slice 1a is Done (0.8.0, PR #8), with the HMRC cross-checks still pending. Rewritten at the start of every slice; roadmap and status live in `PLAN.md`. Slice 1a's brief and progress log are archived below, above slice 0.5's and slice 0's.

## Docs rule

Every build session ends by updating the docs: this file (progress and next session), `PLAN.md`, `CHANGELOG.md`, and `CLAUDE.md` if a rule or the stack changed. The full checklist is in `CLAUDE.md` ("Session close-out checklist"). A session is not finished until that is done.

## Goal

The £100k+ optimiser page, built from shared components on the slice 1a engine: take-home now, then candidate pension contributions with their cliffs, thresholds, annual allowance and childcare position, never one called "the best".

## Next: session 1b-ii (the optimiser on the page)

What 1b-ii picks up, on the same page and inputs (version 3 since 0.11.0; the 0.12.0 layout: put the optimiser's inputs in a new `Section` and its results in the `StickyResult` results column, with the chart below the split bar; add a migration to `MIGRATIONS` in `definition.ts` only if the stored shape changes; the version follows). `optimise()` already sweeps from cash pay after salary given up for benefits.

- `optimise(inputs, config, policy, options?)` from the page inputs: `toTaxInputs` plus `pension` (the method and the resolved current contribution, from `resolveInputs`), `savings` (the resolved `employerContribution`, carry forward and the MPAA flag as new inputs) and `checkChildcare`. A sweep over contributions is in amounts; a contribution entered as a percentage can be shown as a percentage of pensionable pay beside it.
- The take-home (or spendable) against contribution chart from `points`, markers for `current`, `maximum` and each threshold, `cliffs` drawn as labelled jumps, a table fallback (the shared `Chart`).
- "Cost of £1 more pension" from `netCostPerPound` and `marginalRate`, labelled with what each is measured against.
- Thresholds in words from `thresholds` ("already under", "contribute £X more", "out of reach" with the reason); the HICBC full-charge point said plainly (the charge first falls a penny below it).
- Warnings from each point (annual allowance, taper, carry forward, childcare), never hidden, never a cap; childcare as eligibility only, with what isn't checked.
- No point labelled "best". Compare: the current contribution against a chosen one.
- **Still with the owner:** confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input.

