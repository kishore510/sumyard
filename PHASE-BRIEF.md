# PHASE-BRIEF: Slice 2 Compound interest

Status: 2a (engine) in progress. Slice 1b is built (to 0.14.0) and stays open in `PLAN.md` until the owner's checks below are done. Status per part lives only in `PLAN.md`. Finished part scopes are in `docs/history/phase-brief-archive.md`.

## Docs rule

Close out every session with the tiered checklist in `CLAUDE.md` ("Session close-out checklist").

## Goal

A compound interest calculator: a lump sum and regular contributions, compounding, an annual contribution increase, a percentage fee, and inflation, with a yearly table and chart in nominal and real terms and the fee drag. Illustrative, no tax and no tax wrappers. Decisions C1 to C9: `docs/modelling-decisions-compound.md`.

## Part 2a: the engine (0.15.0, internal, no UI)

### Scope

- `src/calculators/compound-interest/` (`calc.ts`, `types.ts`, tests, `fixtures/`, `README.md`): pure `effectiveAnnualRate`, `periodRate` (C2), `realRate` (Fisher, C5), `futureValue`, `project` (per-year rows: opening, contributions, growth, fees, closing, cumulative contributions, growth and fees; nominal and real; with and without the fee) and `feeDrag`; a result with `assumptions` (no figures in the strings); typed refusals (C8).
- Fixed-point `FinePence` and `Factor` in `src/lib/money.ts` (C9); calendar divisors in `src/lib/periods.ts` (C7); input bounds in `src/lib/inputLimits.ts` (C8).
- Tests first (red, then green): hand-checkable cases; published examples (`docs/worked-examples.md`); an independent closed-form reference in exact rational arithmetic on 300 seeded random cases; properties; edge cases; a literal guard like the optimiser's (only 0, 1, 2 and 100).
- Mutation spot-checks (timing flipped, fee before growth, nominal used as effective, Fisher replaced by subtraction) must fail the suite.

### Out of scope

The page, chart, registry entry, scenarios, compare and Help (2b); flat fees; tax wrappers; sequence-of-returns or Monte Carlo; any tax config change.

## Part 2b: the page (next)

`#/c/compound-interest` from shared components on the 2a engine: registry entry (`definition.ts`, inputs version 1), `StickyResult` and `Section` layout, inputs per C1, results (closing balance, contributions, growth, fees, fee drag, nominal and real), a yearly table and a chart with its table fallback, scenarios and compare (`summarise`), assumptions, the disclaimer, a Help topic. Its own brief is written here when 2a merges.

## Still with the owner

Confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input.

## Last session

- 21 October 2026, part 1b-ii-b (0.14.0, PR #17): Year / Month drives the optimiser chart, table and cards; Change vs now and a chosen point; zoom with Full range; cost of a pound more, thresholds in words, warnings across the sweep, childcare eligibility, compare now and chosen (`reading.ts`); compare rows show the version 4 inputs; Help topic "Pension contributions and the optimiser".
- Differs from the brief: the chosen point is a select of the points shown (no tapping the chart); thresholds are measured from now, not the chosen point; Chart's `rowNotes` became generic `columns`.
- Not verified: 768 px, a real phone, Safari, Firefox, a screen reader, the deployed site.
- Next: slice 2 (compound interest), brief first.

Full history (progress logs, finished part scopes, slice archives): `docs/history/` (grep it, don't read it whole).
