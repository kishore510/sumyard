# PHASE-BRIEF: Mortgage overpayment

Status: **M0 (brief and decisions)**: merged in PR #36; the owner's confirmations (23 October 2026) are in its follow-up PR. Decisions MO1 to MO15 are confirmed. M1 (engine) and M2 (page) are Not started. The household budget (0.25.0, PR #34) and the 0.25.1 fix release are merged and deployed. Slices 1 to 3 and the budget are Done (`PLAN.md`). Finished scopes, the budget's included, are in `docs/history/phase-brief-archive.md`.

## Docs rule

Close out every session with the tiered checklist in `CLAUDE.md` ("Session close-out checklist").

## Mortgage overpayment

### Goal

`#/c/mortgage`: what overpaying a mortgage does, regular or as lump sums, with a fixed rate that ends and a reversion rate after it: interest saved, the time saved or the lower payment, the balance at the fixed-rate end, the effective guaranteed return of a pound overpaid for each rate period, and with an early repayment charge the net saving in pounds and its break-even point. No tax rules (`taxRules: 'none'`, "Uses no tax rules"). Decisions MO1 to MO15 (confirmed) (`docs/modelling-decisions.md`); sources MR-1 to MR-10 (`docs/verification-log.md`); rounding in `docs/money.md`.

### Parts

- **M0, brief and decisions:** PR #36 and the owner's follow-up. No code, config or UI.
- **M1, engine (internal, no UI), tests first: a red commit, then a green one.** First, its own red then green commit pair (MO15): move `monthlyRate`, `interestOn` and the schedule helpers (`monthlyFactor`, `regularPayment`, `annualRate`, `MonthlyRate`) from car finance into a shared `src/lib/` module, car finance calling it, no behaviour change (every car test passes unchanged). Then `src/calculators/mortgage/`, importing only `src/lib/`, never another calculator: (`types.ts`, `calc.ts`, `README.md`, `fixtures/reference.ts`, `calc.test.ts`, `properties.test.ts`, `reference.test.ts`, `literals.test.ts`): the schedule with and without overpayments, both interest methods, the fixed-rate end, both effects, the ERC and allowance, interest saved, the net saving and break-even with an ERC, the return per rate period, refusals by field, and assumptions naming MO3's method and day count, MO5, MO6, MO7, MO10 and MO12. A pure calendar helper in `src/lib/` (days in a month, leap years, the payment date each month, days between two dates; no `Date.now`). `MAX_MORTGAGE_TERM_MONTHS` in `src/lib/inputLimits.ts`. Mutation spot-checks on the engine.
- **M2, page:** `definition.ts` (inputs version 1, `validateInputs`, `migrateInputs`, `summarise`, `taxRules: 'none'`), `MortgagePage.tsx` from shared components (`StickyResult`, `Section`, inputs, `SliderInput` for the regular overpayment, `ResultCard`/`StatRow`, `Chart/` with a table fallback, `AssumptionsPanel`, `NoTaxRulesBadge`), registry and route, scenarios and compare, Help topic `mortgage`, README. Browser matrix once (360 and 1280 px, light and dark, axe). No new storage key.

### Reuse (audited in M0; MO15)

The mortgage engine imports only `src/lib/`.

- Shared module (moved from `src/calculators/car-finance/calc.ts` in M1's first commit pair): `monthlyFactor`, `monthlyRate`, `interestOn`, `regularPayment` (nearest penny, F7; no upper bound on the term, a rate of nothing handled), `annualRate` (also MO9's `'monthly'` return), `MonthlyRate`. Its rate check against `MAX_FINANCE_RATE` must not need car finance's problem types. Not moved: `buildSchedule` (one payment for the whole term; the mortgage needs its own loop), `solveRate` and `apr`, `outstandingBalance`.
- `src/lib/money.ts`: `mulRound`, `ExactPence` for daily interest, `FinePence`/`Factor` for the daily return, `roundRatio`. `src/lib/periods.ts`: `MONTHS_PER_YEAR` (`DAYS_PER_YEAR` is compound interest's divisor, not MO3's day basis). `src/lib/isoDate.ts`: `isIsoDate`.
- Not imported: compound interest (its `effectiveAnnualRate(rate, 'monthly')` equals the shared `annualRate` of a twelfth of the rate); `src/lib/sweep.ts` (the optimiser's sweep, not needed in v1).
- No-tax-rules path: `registry.ts`, `session.ts`, `scenarios/`, `ComparePage.tsx`, `NoTaxRulesBadge`, as compound interest, the car decision and the budget. No change.
- To add in M1: a pure calendar helper in `src/lib/` (days in a month, leap years, the payment date each month, days between dates; no `Date.now`); `MAX_MORTGAGE_TERM_MONTHS` = 480 in `src/lib/inputLimits.ts`.

### Out of scope

Everything in MO14 (offset, savings or ISA comparison, tax, part-and-part, payment holidays, more than one product after the fixed rate, trackers, fees, porting, the APRC, mid-month overpayments, borrow-back); changes to other calculators beyond moving car finance's helpers into `src/lib/` (MO15).

### Edge cases to test (M1)

| Case | Expect |
|---|---|
| Overpayment above the balance | Only what clears it is used; the rest reported; ERC on the used part only (MO8) |
| Overpayments across the fixed-rate end | Payment recalculated at the end (MO4); `'reduce-term'` keeps the shortened months (MO5); no ERC after the ERC end |
| ERC above the penalty-free allowance | Charged on the excess per allowance year, allowance rounded down, ERC to the nearest penny; nothing within it; no carry-over; the net saving and break-even month, or none within the term (MO7, MO9) |
| Lump sum in the final month | Clears the balance; that month's payment shrinks to the remainder; nothing after (MO8) |
| Interest-only | Payment equals the month's interest; overpayments lower capital, interest and the amount owed at the end; `effect` ignored (MO2, MO5) |
| Zero rate (fixed, reversion, both) | Payment is balance ÷ months; no interest; nothing saved; return of nothing |
| Leap year, daily method | 29 February accrues a day; `'actual/365'` against `'actual/actual'` differ by exactly the leap-year days' share (MO3) |
| Term under a month | Refused (whole months from one) |
| Shared helpers (MO15) | Car finance, car ownership and car decision tests pass unchanged after the move |
| Also | No fixed period (end at nothing); fixed-rate end at the term; a start on the 29th to 31st (short months); daily against monthly on the same inputs; the largest balance, rate and term (no overflow); rows add up; interest saved is never below nothing without an ERC; more overpayment never raises total interest |

### Cross-check plan

- **Independent reference (M1):** `src/calculators/mortgage/fixtures/reference.ts` in exact rational arithmetic (BigInt fractions, no `money.ts` fine fixed point): the closed-form payment A i / (1 − (1 + i)^−n) rounded to the penny; the closed-form balance after k months, A (1 + i)^k − P ((1 + i)^k − 1) / i, within the rounding bound of the engine's replay; the payoff month as the first k where it reaches nothing; and a day-by-day daily-interest replay that counts days with its own day-number formula, not the engine's calendar helper. 300 seeded cases, as car finance's `reference.test.ts`.
- **A real statement or illustration (owner to supply):** `docs/mortgage-cross-checks.json` holds six todo cases (a statement year, a lump sum each way, an ERC above the allowance, the fixed-rate end, interest-only). The repository is public: figures only, no personal identifiers. M1 adds `crossChecks.test.ts` (todo until filled). Filling it settles MR-1, MR-2 and MR-4 (OPEN until then) and checks MO5, MO10 and MR-10 for that lender.

### Owner confirmations (given 23 October 2026)

All MO1 to MO14 confirmed, with: MO9 one return per rate period, and with an ERC the net saving in pounds and a break-even point, no blended percentage; MO6 kept, with an assumption that daily and monthly interest then differ only slightly, and an `'annual'` method and off-payment-date lump sums in `docs/backlog.md`; MO15, no import of car finance (helpers moved to `src/lib/` first); MO5, MO7, MO10, MO12 and MR-10 as proposed, each named in the assumptions; no network change; MR-1, MR-2 and MR-4 OPEN until the statement is added.

Still to come from the owner: the figures in `docs/mortgage-cross-checks.json`.

## Still with the owner (follow-ups; slices 1 to 3 and the budget are Done)

Household budget (0.25.0): confirm BD8 (savings rate excludes what is left over), BD9 (`MAX_BUDGET_LINES` = 40 per list), the template lines' periods (Fixed saver monthly), the shared `Field` label now wrapping anywhere.

Confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input. Slice 2: fill `docs/compound-cross-checks.json` (eight cases, with source and date); confirm the C8 rate bounds and the starting years (`DEFAULT_PROJECTION_YEARS`).

Slice 3a: confirm decisions F5 to F14 and the bounds (`src/calculators/car-finance/README.md`); confirm F15 (one decimal place, the drawdown, an added fee as a charge) and settle CR-10 (a PCP's optional final payment, purchase and option fees in the APR) from a source before any page shows an APR for PCP or HP with an option fee; decide whether the hand-back path should also take condition charges. Slice 3b: confirm F24 to F31 (`src/calculators/car-ownership/README.md`); F18's two readings and the bounds were confirmed at the start of 3c-1; confirm litres per gallon from legislation.gov.uk (CO-1). Slice 3c-1: fill `docs/car-cross-checks.json` (six cases: a spreadsheet, or a real dealer quote for the payment; source and date) and `docs/compound-cross-checks.json`; spot-check the litres per gallon line in a fuel cost per mile; confirm the page decisions F32 to F37 (`DEFAULT_HORIZON_MONTHS` = 48 accepted at the start of 3c-2); check the page on a real phone. Slice 3c-2: confirm the page decisions F38 to F42 (optional boxes read as nothing, the chart, the selected month, the sensitivity's shifts, any pair); whether to move the flip search and the sensitivity to a worker (one flip search is a 250 to 430 ms task after the inputs settle, `docs/performance.md`); check the chart and its selection on a real phone and with a screen reader.

Car results redesign (3d-1): confirm U29 to U33, the verdict's wording and the per-month gap (the total difference over the horizon, rounded once); confirm U34 to U36 (OQ-flip-tie was closed in 3d-2, F53; the monthly penny drift was accepted as it is in 3e, F52); check the page on a real phone and with a screen reader.

Finance on a kept car (3e): confirm F43 to F52 as built (the refusal of a final payment above the settlement and of no payments left even with no monthly payment, F50; the implied rate through `hirePurchase`, F45); check the page against a real lender statement and settlement quote; on a real phone and with a screen reader.

Thresholds and the cost bridge (3d-2): confirm F53 to F56 as built (the band said as "about", level or pennies apart; equity handed back as a bridge part; "Most of the difference" only past half and on the total's side; the bridge in pence whatever Settings shows; the bridge's own Selects sharing the pair); check the bridge on a real phone and with a screen reader.

Compare redesign (1b-iii): confirm U24's maximum (the engine's, pay-bounded) and U25's chart measure (net cost per pound, an average from no contribution); check the page on a real phone, with Safari and with a screen reader.

## Last session

- 23 October 2026, M0: pre-check, reuse audit, GOV.UK research (MR-1 to MR-10), decisions and this brief (PR #36, merged). Follow-up: the owner's confirmations written in (MO1 to MO15, MO6 and MO9 changed, MO15 added), money.md, the verification log's engine cells, backlog, open questions, and the `docs/mortgage-cross-checks.json` placeholder.
- Not verified: anything on MoneyHelper or a lender's terms (MR-1, MR-2, MR-4 OPEN).

## Next

- M1, the engine, in a fresh session: the MO15 extraction commit pair first, then the engine tests first.
- Owner: fill `docs/mortgage-cross-checks.json` from a statement or illustration.
- CR-10 (car finance) stays open.

Full history (progress logs, finished part scopes, slice archives): `docs/history/` (grep it, don't read it whole).
