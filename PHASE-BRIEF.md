# PHASE-BRIEF: Slice 2 Compound interest

Status: 2a (engine) Done (0.15.0, PR #19); 2b (page) Done (0.16.0, PR #20). Slice 2 stays open in `PLAN.md` until the owner fills the compound cross-checks. Slice 1b is built (to 0.14.0) and stays open in `PLAN.md` until the owner's checks below are done. Status per part lives only in `PLAN.md`. Finished part scopes are in `docs/history/phase-brief-archive.md`.

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

## Part 2b: the page (0.16.0)

### Scope

- `#/c/compound-interest` on the 2a engine: `definition.ts` (inputs version 1, `taxRules: 'none'`), `results.ts`, `CompoundPage.tsx`, built from `Section` and `StickyResult` (`docs/ui-patterns.md`).
- Inputs: "Your savings" always visible; "Growth and costs" (with the effective annual rate shown); "Over time".
- Results: the final balance with a Nominal / Today's money switch and a not-a-forecast caveat; paid in, growth, fees; fee drag; rates; the shared Chart; the engine's yearly rows as a table.
- Refusals through `RefusalNotice`. Scenarios carry no tax year (registry `taxRules`), shown as "Uses no tax rules". Compare rows. Assumptions and a Help topic.
- `docs/compound-cross-checks.json`: seeded cases, expected values null (todo tests).
- Tests first: definition, page, 150 random inputs against the engine, banned words; mutation spot-checks.

### Out of scope

Flat fees, tax wrappers, Monte Carlo or varying returns, withdrawals, any engine or tax config change.

## Still with the owner

Confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input. Slice 2: fill `docs/compound-cross-checks.json` (eight cases, with source and date); confirm the C8 rate bounds and the starting years (`DEFAULT_PROJECTION_YEARS`).

## Last session

- 21 October 2026, part 2b (0.16.0, PR #20): the compound interest page at `#/c/compound-interest` (definition, results, page, Help topic, compare rows); scenarios with no tax year (registry `taxRules: 'none'`); `RefusalNotice` and compare show an engine input refusal; the Chart's data table is a focusable scroll region; `docs/compound-cross-checks.json` seeded.
- Differs from the brief: the pre-check found RefusalNotice and scenarios tax-only, so (owner's call) registry and RefusalNotice changes came first, each red then green; PLAN 2a was already Done, so no first commit; the literal guard now also covers `definition.ts`, `results.ts` and the page; `DEFAULT_PROJECTION_YEARS` added to `inputLimits.ts`.
- Not verified: a real phone, Safari, Firefox, a screen reader, the deployed site; no external cross-check yet.
- Owner checks: fill `docs/compound-cross-checks.json` (spreadsheet FV or a reputable calculator, with source and date); confirm the C8 rate bounds and the starting years.
- Next: slice 3 (car decision), its brief first.

Full history (progress logs, finished part scopes, slice archives): `docs/history/` (grep it, don't read it whole).
