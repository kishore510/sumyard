# PHASE-BRIEF: Slice 3 Car decision

Status: 3a (finance engine) Done (0.17.0, PR #21); 3a.1 (APR) Done (0.17.1, PR #22); 3b (cost-of-ownership engine) Done (0.18.0, PR #23); 3c-1 next, its brief first. Slices 1b and 2 are built and stay open in `PLAN.md` until the owner's checks below are done. Status per part lives only in `PLAN.md`. Finished part scopes are in `docs/history/phase-brief-archive.md`.

## Docs rule

Close out every session with the tiered checklist in `CLAUDE.md` ("Session close-out checklist").

## Goal

Compare what a car costs over a fixed horizon under five options: keep the current car, buy outright, PCP, HP or a personal loan. Finance maths first, then the cost of ownership, then the page. Illustrative, not advice. Owner decisions F1 to F4, engine decisions F5 onwards: `docs/modelling-decisions-car.md`.

## Part 3b: cost-of-ownership engine (0.18.0, internal, no UI)

### Scope

- Step 1 (gate, before any engine code): this brief and the `PLAN.md` rows; owner decisions O1 to O8 as F16 to F23 and engine decisions F24 to F31 in `docs/modelling-decisions-car.md`; proposed bounds in `src/lib/inputLimits.ts` (F30); the litres in a gallon verified and logged (`docs/verification-log.md`, CO-1) in `src/lib/units.ts`.
- `src/calculators/car-ownership/` (`calc.ts`, `types.ts`, tests, `fixtures/`, `README.md`): `valueCurve`, `costPerMile`, `futureValueOfFlows`, the monthly cash-flow timeline per option, `ownershipCost` (per value case: totals, per-month cumulative net cost and equity, the breakdown, coverage, net cost per month of coverage), `compareOptions` (one horizon, coverage flags, ordering with ties) and `flipPoints`. Pure, no tax figure, money through `money.ts`, assumptions with no figures, typed refusals by field, overflow refused.
- Tests first (red, then green): hand-checkable cases; keep versus buy parity; the breakdown adds up; an exact-fraction reference on 300 seeded cases (loan, HP, PCP buy, PCP hand back, cash, keep); properties; edge cases; the literal guard. Mutation spot-checks (value curve fitted to the wrong end, opportunity cost omitted, hand back treated as covering the horizon, equity sign flipped, the general increase applied to fuel) must fail the suite.

### Out of scope

The page, registry entry, scenarios, Chart changes, tax or VED config, EV tax rules, replacement cars, early termination, any change to the 3a engine (unless a failing test proves a bug: then stop and report).

## Part 3c-1: the page with option cards

`#/c/car` on 3a and 3b: inputs in sections, one card per option (net cost per month of coverage and the total, monthly outlay, equity at the end; partial coverage flagged), scenarios and compare, Help, assumptions. Built from shared components.

## Part 3c-2: crossover chart, sensitivity, polish

The cumulative cost chart over the horizon with crossover points (shared Chart, table fallback), sensitivity to residual value, mileage and rate, and the browser matrix.

## Still with the owner

Confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input. Slice 2: fill `docs/compound-cross-checks.json` (eight cases, with source and date); confirm the C8 rate bounds and the starting years (`DEFAULT_PROJECTION_YEARS`).

Slice 3a: confirm decisions F5 to F14 and the bounds (`src/calculators/car-finance/README.md`); confirm F15 (one decimal place, the drawdown, an added fee as a charge) and settle CR-10 (a PCP's optional final payment, purchase and option fees in the APR) from a source before any page shows an APR for PCP or HP with an option fee; decide whether the hand-back path should also take condition charges. Slice 3b: confirm F24 to F31 and the bounds (`src/calculators/car-ownership/README.md`), and the two readings of O3 in F18 (equity rather than value when a balance is owed; keep's value as a sale forgone); confirm litres per gallon from legislation.gov.uk (CO-1).

## Last session

- 22 October 2026, part 3b (0.18.0, PR #23, internal): brief and decisions F16 to F31 (owner O1 to O8 as F16 to F23); bounds in `inputLimits.ts`; litres per gallon verified (CO-1, `units.ts`); the engine in `src/calculators/car-ownership/` (value curve, cost per mile, future value of flows, ownership cost, comparison, flip points); tests red then green; 300-case exact reference; mutation spot-checks all caught.
- Differs from the brief: O3 read as minus equity (value less any balance owed) and keep's value counted as a sale forgone (F18); totals at the end of coverage; litres per gallon from legislation.gov.uk (no GOV.UK page defines it); flips on mileage set both options' mileage; no overflow reachable within the bounds, so that test checks the largest inputs.
- Not verified: no published ownership-cost example (hand-checkable OWN-1 to OWN-6 instead); nothing in a browser (no UI). OPEN: CR-10 (APR for PCP and fees) carries over.
- Next: 3c-1 (the page), its brief first.

Full history (progress logs, finished part scopes, slice archives): `docs/history/` (grep it, don't read it whole).
