# PHASE-BRIEF: Mortgage overpayment

Status: **M0 (brief and decisions) is in review**; M1 (engine) and M2 (page) are Not started. The household budget (0.25.0, PR #34) and the 0.25.1 fix release are merged and deployed (Pages run 34, 23 October 2026). Slices 1 to 3 and the budget are Done (`PLAN.md`). Finished scopes, the budget's included, are in `docs/history/phase-brief-archive.md`.

## Docs rule

Close out every session with the tiered checklist in `CLAUDE.md` ("Session close-out checklist").

## Mortgage overpayment

### Goal

`#/c/mortgage`: what overpaying a mortgage does, regular or as lump sums, with a fixed rate that ends and a reversion rate after it: interest saved (before and after any early repayment charge), the time saved or the lower payment, the balance at the fixed-rate end, and the effective guaranteed return of a pound overpaid. No tax rules (`taxRules: 'none'`, "Uses no tax rules"). Decisions MO1 to MO14 (`docs/modelling-decisions.md`); sources MR-1 to MR-10 (`docs/verification-log.md`); rounding in `docs/money.md`.

### Parts

- **M0, brief and decisions (this PR):** no code, config or UI.
- **M1, engine (internal, no UI), tests first: a red commit, then a green one.** `src/calculators/mortgage/` (`types.ts`, `calc.ts`, `README.md`, `fixtures/reference.ts`, `calc.test.ts`, `properties.test.ts`, `reference.test.ts`, `literals.test.ts`): the schedule with and without overpayments, both interest methods, the fixed-rate end, both effects, the ERC and allowance, interest saved, the effective guaranteed return, refusals by field. A pure calendar helper in `src/lib/` (days in a month, leap years, the payment date each month, days between two dates; no `Date.now`). `MAX_MORTGAGE_TERM_MONTHS` in `src/lib/inputLimits.ts`. Mutation spot-checks on the engine.
- **M2, page:** `definition.ts` (inputs version 1, `validateInputs`, `migrateInputs`, `summarise`, `taxRules: 'none'`), `MortgagePage.tsx` from shared components (`StickyResult`, `Section`, inputs, `SliderInput` for the regular overpayment, `ResultCard`/`StatRow`, `Chart/` with a table fallback, `AssumptionsPanel`, `NoTaxRulesBadge`), registry and route, scenarios and compare, Help topic `mortgage`, README. Browser matrix once (360 and 1280 px, light and dark, axe). No new storage key.

### Reuse (audited in M0)

Call directly:

- `src/calculators/car-finance/calc.ts`: `regularPayment(balance, monthly, term, finalPayment)` (the amortising payment, nearest penny, F7; no upper bound on the term, a rate of nothing handled); `monthlyFactor(rate, 'monthly')` (r / 12 as a `Factor`; refuses above `MAX_FINANCE_RATE`); `annualRate(monthly)` ((1 + i)^12 − 1). Not needed in v1: `solveRate` (a single credit then payments; MO9's net-of-ERC rate would need a general root), `apr` (consumer credit, not a mortgage's APRC), `outstandingBalance` (takes a car `FinanceResult`).
- `src/calculators/compound-interest/calc.ts`: `effectiveAnnualRate(rate, 'monthly')` for MO9's `'monthly'` return. Its yearly projection (`simulate`, `toProjection`) and `feeDrag` are private or typed to its own `Views`: the "with against without" shape is the pattern for interest saved, not a call.
- `src/lib/money.ts`: `mulRound` (`'nearest' | 'down' | 'up'`, exact `Ratio`), `ExactPence` (`exactMul`, `exactAdd`, `roundExact`) for daily interest, `FinePence`/`Factor` (`factorMul`, `factorPow`) for the payment and the daily return, `roundRatio` for showing a rate.
- `src/lib/periods.ts`: `MONTHS_PER_YEAR`. `DAYS_PER_YEAR` (365) is compound interest's calendar divisor, documented as "not a day count for any rule": MO3's day basis gets its own named choice.
- `src/lib/isoDate.ts`: `IsoDate`, `isIsoDate` for the start date.
- No-tax-rules path: `registry.ts` (`taxRules?: 'none'`), `session.ts` (`scenarioTaxYear`), `scenarios/store.ts` and `scenario.ts` (no tax year), `ComparePage.tsx` and `NoTaxRulesBadge`; already used by compound interest, the car decision and the budget. No change needed.

Missing, to add in M1:

- A schedule that changes: car finance's `buildSchedule` keeps one payment for the whole term, has no rate change, overpayment or recalculation, and its `interestOn` and `monthlyRate` are private. Proposal: export `monthlyRate` and `interestOn` from car finance (no behaviour change, its tests unchanged) rather than copy them.
- Day counts and calendar months: nothing in `src/lib` gives days in a month, leap years or the next payment date. A new pure helper, unit-tested.
- A term bound: `MAX_FINANCE_TERM_MONTHS` is 120; mortgages need `MAX_MORTGAGE_TERM_MONTHS` (MO12).
- `src/lib/sweep.ts` is the optimiser's contribution sweep (steps in pounds, a page point budget); not needed unless M2 adds a chart of interest saved against the overpayment, which is out of v1.

### Out of scope

Everything in MO14 (offset, savings or ISA comparison, tax, part-and-part, payment holidays, more than one product after the fixed rate, trackers, fees, porting, the APRC, mid-month overpayments, borrow-back); changes to other calculators beyond exporting the two car finance helpers.

### Edge cases to test (M1)

| Case | Expect |
|---|---|
| Overpayment above the balance | Only what clears it is used; the rest reported; ERC on the used part only (MO8) |
| Overpayments across the fixed-rate end | Payment recalculated at the end (MO4); `'reduce-term'` keeps the shortened months (MO5); no ERC after the ERC end |
| ERC above the penalty-free allowance | Charged on the excess per allowance year, allowance rounded down, ERC to the nearest penny; nothing within it; no carry-over (MO7) |
| Lump sum in the final month | Clears the balance; that month's payment shrinks to the remainder; nothing after (MO8) |
| Interest-only | Payment equals the month's interest; overpayments lower capital, interest and the amount owed at the end; `effect` ignored (MO2, MO5) |
| Zero rate (fixed, reversion, both) | Payment is balance ÷ months; no interest; nothing saved; return of nothing |
| Leap year, daily method | 29 February accrues a day; `'actual/365'` against `'actual/actual'` differ by exactly the leap-year days' share (MO3) |
| Term under a month | Refused (whole months from one) |
| Also | No fixed period (end at nothing); fixed-rate end at the term; a start on the 29th to 31st (short months); daily against monthly on the same inputs; the largest balance, rate and term (no overflow); rows add up; interest saved is never below nothing without an ERC; more overpayment never raises total interest |

### Cross-check plan

- **Independent reference (M1):** `src/calculators/mortgage/fixtures/reference.ts` in exact rational arithmetic (BigInt fractions, no `money.ts` fine fixed point): the closed-form payment A i / (1 − (1 + i)^−n) rounded to the penny; the closed-form balance after k months, A (1 + i)^k − P ((1 + i)^k − 1) / i, within the rounding bound of the engine's replay; the payoff month as the first k where it reaches nothing; and a day-by-day daily-interest replay that counts days with its own day-number formula, not the engine's calendar helper. 300 seeded cases, as car finance's `reference.test.ts`.
- **A real statement or illustration (owner to supply):** one annual mortgage statement or a lender's overpayment illustration, with the balance, rate, term, payment, interest for a period and the effect of an overpayment. To go in `docs/worked-examples.md` (and a `docs/mortgage-cross-checks.json` if more than one), mirrored as a test. It settles MR-1, MR-2, MR-9, MR-10 and the rounding for that lender.

### Owner confirmations (before M1 starts)

1. MO1: one fixed rate then one reversion rate; the reversion rate is the person's guess.
2. MO3: `interestMethod` default `'monthly'`; `dayCount` default `'actual/365'`.
3. MO5: `effect` default `'reduce-term'`; at the fixed-rate end, the shortened months (proposed) or the contract's.
4. MO6: overpayments on payment dates only in v1.
5. MO7: ERC and allowance as inputs with no default figure; allowance as a percentage or an amount; allowance years from the start date; no carry-over; the ERC paid from pocket, not added to the balance.
6. MO9: the return shown per rate period; whether to add one rate net of the ERC.
7. MO10: the rounding modes, in particular the allowance rounded down.
8. MO12: `MAX_MORTGAGE_TERM_MONTHS` = 480; rates up to `MAX_FINANCE_RATE`.
9. Exporting `monthlyRate` and `interestOn` from car finance.
10. Network: allow `www.moneyhelper.org.uk` (and a lender's site, if wanted) so the OPEN items can be read from a source, or supply the statement.

## Still with the owner (follow-ups; slices 1 to 3 and the budget are Done)

Household budget (0.25.0): confirm BD8 (savings rate excludes what is left over), BD9 (`MAX_BUDGET_LINES` = 40 per list), the template lines' periods (Fixed saver monthly), the shared `Field` label now wrapping anywhere.

Confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input. Slice 2: fill `docs/compound-cross-checks.json` (eight cases, with source and date); confirm the C8 rate bounds and the starting years (`DEFAULT_PROJECTION_YEARS`).

Slice 3a: confirm decisions F5 to F14 and the bounds (`src/calculators/car-finance/README.md`); confirm F15 (one decimal place, the drawdown, an added fee as a charge) and settle CR-10 (a PCP's optional final payment, purchase and option fees in the APR) from a source before any page shows an APR for PCP or HP with an option fee; decide whether the hand-back path should also take condition charges. Slice 3b: confirm F24 to F31 (`src/calculators/car-ownership/README.md`); F18's two readings and the bounds were confirmed at the start of 3c-1; confirm litres per gallon from legislation.gov.uk (CO-1). Slice 3c-1: fill `docs/car-cross-checks.json` (six cases: a spreadsheet, or a real dealer quote for the payment; source and date) and `docs/compound-cross-checks.json`; spot-check the litres per gallon line in a fuel cost per mile; confirm the page decisions F32 to F37 (`DEFAULT_HORIZON_MONTHS` = 48 accepted at the start of 3c-2); check the page on a real phone. Slice 3c-2: confirm the page decisions F38 to F42 (optional boxes read as nothing, the chart, the selected month, the sensitivity's shifts, any pair); whether to move the flip search and the sensitivity to a worker (one flip search is a 250 to 430 ms task after the inputs settle, `docs/performance.md`); check the chart and its selection on a real phone and with a screen reader.

Car results redesign (3d-1): confirm U29 to U33, the verdict's wording and the per-month gap (the total difference over the horizon, rounded once); confirm U34 to U36 (OQ-flip-tie was closed in 3d-2, F53; the monthly penny drift was accepted as it is in 3e, F52); check the page on a real phone and with a screen reader.

Finance on a kept car (3e): confirm F43 to F52 as built (the refusal of a final payment above the settlement and of no payments left even with no monthly payment, F50; the implied rate through `hirePurchase`, F45); check the page against a real lender statement and settlement quote; on a real phone and with a screen reader.

Thresholds and the cost bridge (3d-2): confirm F53 to F56 as built (the band said as "about", level or pennies apart; equity handed back as a bridge part; "Most of the difference" only past half and on the total's side; the bridge in pence whatever Settings shows; the bridge's own Selects sharing the pair); check the bridge on a real phone and with a screen reader.

Compare redesign (1b-iii): confirm U24's maximum (the engine's, pay-bounded) and U25's chart measure (net cost per pound, an average from no contribution); check the page on a real phone, with Safari and with a screen reader.

## Last session

- 23 October 2026, M0: pre-check (main at 0.25.1, Pages run 34 succeeded; the brief matched). Reuse audit; GOV.UK research (MR-1 to MR-10: MoneyHelper, lender sites and GOV.UK's PDF host refused by the network policy); decisions MO1 to MO14 and the proposed rounding; this brief; `PLAN.md` rows. The budget's scope moved to the archive.
- Not verified: anything on MoneyHelper or a lender's terms (OPEN items MR-1, MR-2, MR-4, MR-9, MR-10).

## Next

- Owner: the confirmations above, and a statement or illustration for the cross-check.
- M1, the engine, in a fresh session, tests first.
- CR-10 (car finance) stays open.

Full history (progress logs, finished part scopes, slice archives): `docs/history/` (grep it, don't read it whole).
