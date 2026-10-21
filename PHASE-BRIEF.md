# PHASE-BRIEF: Slice 3 Car decision

Status: 3a (finance engine) In progress. Slices 1b and 2 are built and stay open in `PLAN.md` until the owner's checks below are done. Status per part lives only in `PLAN.md`. Finished part scopes are in `docs/history/phase-brief-archive.md`.

## Docs rule

Close out every session with the tiered checklist in `CLAUDE.md` ("Session close-out checklist").

## Goal

Compare what a car costs over a fixed horizon under five options: keep the current car, buy outright, PCP, HP or a personal loan. Finance maths first, then the cost of ownership, then the page. Illustrative, not advice. Owner decisions F1 to F4, engine decisions F5 onwards: `docs/modelling-decisions-car.md`.

## Part 3a: finance engine (0.17.0, internal, no UI)

### Scope

- Step 1 (gate, before any engine code): this brief and the `PLAN.md` rows; owner decisions in `docs/modelling-decisions-car.md`; the APR definition and the PCP and HP conventions verified from official sources and logged in `docs/verification-log.md` ("Car finance (slice 3a)"), anything unreachable marked OPEN; published worked examples in `docs/worked-examples.md`.
- `src/calculators/car-finance/` (`calc.ts`, `types.ts`, tests, `fixtures/`, `README.md`): the amortising payment and schedule (pennies that add up); a rate solver for a cash-flow series (documented method, tolerance and bound, a typed refusal); loan, HP and PCP (hand back or buy at the end, mileage excess); the outstanding balance at any month for 3b. Pure, config-free, money through `money.ts` (`FinePence` / `Factor` where a root or solve needs them). Assumptions carry no figures; refusals name the field; bounds in `src/lib/inputLimits.ts`.
- Tests first (red, then green): hand-checkable cases; published examples; an exact-fraction reference on 300 seeded cases; a rate round trip on 300 cases; properties; edge cases; the literal guard. Mutation spot-checks (interest on the closing balance, fee left out of the rate, balloon left out of the final payment, time basis changed) must fail the suite.

### Out of scope

Ownership costs, fuel, depreciation, the page, registry entry, scenarios, Chart changes, any tax or VED config, early termination or settlement rebates, a flat rate (no definition verified).

## Part 3b: cost-of-ownership engine (internal, no UI)

Each option's cost over the fixed horizon (F2): finance from 3a; depreciation from the user's residual values (low, expected, high, F3); running costs with fuel types including electric (per-mile energy cost, user-entered prices); VED as a user-entered annual amount (F4); equity and negative equity from 3a's outstanding balance; flip points (the mileage or residual value where the cheapest option changes); the opportunity cost of cash through the compound engine. Its own brief and decisions before code.

## Part 3c-1: the page with option cards

`#/c/car` on 3a and 3b: inputs in sections, one card per option (cost over the horizon, monthly outlay, what you own at the end), scenarios and compare, Help, assumptions. Built from shared components.

## Part 3c-2: crossover chart, sensitivity, polish

The cumulative cost chart over the horizon with crossover points (shared Chart, table fallback), sensitivity to residual value, mileage and rate, and the browser matrix.

## Still with the owner

Confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input. Slice 2: fill `docs/compound-cross-checks.json` (eight cases, with source and date); confirm the C8 rate bounds and the starting years (`DEFAULT_PROJECTION_YEARS`).

## Last session

- 21 October 2026, part 3a (0.17.0, in progress): slice 3 brief, decisions and verification first; engine to follow.

Full history (progress logs, finished part scopes, slice archives): `docs/history/` (grep it, don't read it whole).
