# Car finance (slice 3a)

The car finance engine (**3a, 0.17.0**; the statutory APR in **3a.1, 0.17.1**; internal: no page yet). It works out a personal loan, hire purchase (HP) or PCP month by month: the payment, the schedule, the cost of credit, an effective rate and what each end of the term costs. Slice 3b builds the cost of ownership on it and 3c the page. Illustrative, not financial advice; no tax.

Decisions: F1 to F15 in `docs/modelling-decisions-car.md`. Sources and what could not be verified: `docs/verification-log.md`, "Car finance (slice 3a)" (CR-1 to CR-18). Rounding and the solver's precision: `docs/money.md`, "Car finance (slice 3a)".

**Two rates.** The **effective rate** (F8, HMRC's CFM21180, CR-5) is solved for every agreement, fees included, on the PCP buy path; it is never labelled APR. The **statutory APR** (F15) comes from `apr(flows)`, which follows the regulator's rule (CONC App 1.2.6R, verified 22 October 2026, CR-1 to CR-3): on the same cash flows its unrounded value equals the effective rate's annual figure; it is also shown to one decimal place. Which flows count for a PCP's optional final payment and for purchase and option fees is **OPEN** (CR-10), so the engine builds no agreement-level APR and the page must not show an APR for those agreements until it closes.

## Files

- `types.ts`: `LoanInputs`, `HirePurchaseInputs`, `PcpInputs` (with `Pricing`: a rate and its basis, or the payment), `ScheduleRow`, `Schedule`, `EffectiveRate`, `EndPath`, `FinanceResult`, `FinanceOutcome` and the refusal reasons; `CashFlows` for the solver.
- `calc.ts`: the pure engine.
  - `loan(inputs)`, `hirePurchase(inputs)`, `pcp(inputs)`: the schedule, the monthly rate, the cost of credit (interest + arrangement fee + purchase fee), the effective rate (monthly and annual), the owning path (and PCP's hand-back path, with excess mileage) and assumptions; or a typed refusal naming each field (F13).
  - `outstandingBalance(result, month)`: the balance after that month's payment, for 3b's equity (F12). Not a settlement figure.
  - `monthlyFactor(rate, basis)`: r / 12 (`'monthly'`) or (1 + r)^(1/12) − 1 (`'annual'`) (F6).
  - `regularPayment(balance, monthly, term, finalPayment)`: (A − B v^n) i / (1 − v^n), rounded once to the penny (F7).
  - `buildSchedule(balance, monthly, term, payment, finalPayment, last)`: interest on the opening balance to the penny; the last payment or the last month's interest takes the rounding (F7).
  - `solveRate(flows)`: bisection to 10^-24 a period, at most 200 steps; `'no-solution'` or `'no-convergence'` (F9).
  - `annualRate(monthly)`: (1 + i)^12 − 1 (F8).
  - `apr(flows)`: the statutory APR from one drawdown and payments on whole months (`AprFlows`); `annual` to fifteen places and `display` to one decimal place of a percentage, or `'no-solution'` / `'no-convergence'`; a malformed month or amount throws (F15).
- Constants live outside the folder: `MONTHS_PER_YEAR` (`src/lib/periods.ts`); `MAX_FINANCE_TERM_MONTHS`, `MAX_FINANCE_RATE`, `MAX_MILEAGE`, `MAX_EXCESS_PER_MILE`, `MAX_INPUT_AMOUNT` (`src/lib/inputLimits.ts`); `RATE_SOLVE_DIGITS`, `RATE_SOLVE_TOLERANCE`, `RATE_SOLVE_MAX_STEPS`, `APR_DISPLAY_DIGITS`, `roundRatio` (`src/lib/money.ts`).

## Proposed bounds (F13, for the owner to confirm)

| Bound | Value | Why |
|---|---|---|
| Term | 1 to 120 months | Ten years covers car loans, HP and PCP with room to spare. |
| Annual rate | nothing to 100% | Far above any car finance rate a person would type; keeps every monthly factor small. Negative rates are refused. |
| Amounts | nothing to `MAX_INPUT_AMOUNT` (£10m) | As every other calculator. A cash price or loan of nothing is refused. |
| Deposit | below the cash price | A deposit at or above the price leaves nothing to finance (buy outright is 3b's option). |
| Final payment, balloon | up to the amount financed | Above it the balance would grow. |
| Miles | whole miles, nothing to 1,000,000 over the agreement | |
| Excess per mile | whole pence, nothing to £10 | |
| Solver | [0, 1] a period | A payment that needs more than 100% a month is refused. |

## Assumptions

Listed in the result's `assumptions` (no figures): monthly payments in arrears, a month a twelfth of a year; interest on the opening balance, rounded to the penny, the last month taking the rounding; an arrangement fee paid at the start or added; the effective rate is not the statutory APR; the outstanding balance is not a settlement figure (early settlement and voluntary termination not modelled); no tax, insurance, running costs or depreciation. Per product: a loan's car is owned from the start; HP's balloon and option fee are paid with the last payment, then the car is owned; PCP's buy or hand back, with condition and damage charges not modelled and the effective rate on the buy path.

## Sources and cross-checks

- Published, mirrored in `published.test.ts` (`docs/worked-examples.md`): EIR-1 and EIR-2 (CFM21180: 10% and 6%, the first year's return), EIR-3 (BLM15505: 7.63% and the year-by-year split; the last year within the pound the table moves there so its whole pounds add up), HP-1 (VBDR2420: £9,000 financed, £1,800 interest, £10,800 payable).
- No published example with an APR (CONC App 1 and SI 2010/1011 have none, CR-17), and none for PCP, was found. `apr.test.ts` mirrors the hand-checkable APR-1 to APR-4 instead.
- `apr.test.ts`: an exact round trip (300 seeded rates on whole years, some exactly on a display half) and an exact-fraction reference (300 seeded yearly cases: the unrounded rate within 10^-14 of the root, the display exactly the rule's); the APR equals the effective rate's annual figure on the same flows (300 seeded agreements); properties: a charge never lowers the APR, so it is above the effective rate of the flows without it; paying later never raises it; the display is within half a step.
- `reference.test.ts`: 300 seeded agreements against `fixtures/reference.ts` (exact fractions: the closed-form payment, F7 replayed month by month, the closed-form balance within the rounding bound).
- `rate.test.ts`: 300 round trips, half priced by a payment: discounting at the solved rate returns the credit within 10^-9 of a penny, and the root lies within the solver's tolerance.

## Edge cases and their tests

| Case | Test |
|---|---|
| No interest; one payment; two payments; the last payment taking the rounding; interest on the opening balance (an exact half penny) | `calc.test.ts` |
| Both rate bases; a rate of nothing either way | `calc.test.ts`; `properties.test.ts` |
| Fee at the start; fee added; fees larger than the interest; a fee as large as the loan (no effective rate) | `calc.test.ts` |
| HP option fee and balloon; PCP buy, hand back, excess mileage and none | `calc.test.ts` |
| A balloon equal to the amount financed (interest only) | `calc.test.ts` |
| Priced by payment: exact cover (rate nothing), one payment, too low, too high | `calc.test.ts` |
| Zero, part and too many months; deposit at and above the price; balloon or final payment above the amount financed; bad rates, bases, choices, amounts and miles | `calc.test.ts`, refusals |
| A rounded payment that would leave the last payment below nothing | `calc.test.ts` |
| The longest term at the top rate, both bases; the largest inputs everywhere (no overflow) | `calc.test.ts` |
| The schedule adds up; cost = price + cost of credit; the outstanding balance follows the schedule | `properties.test.ts` |
| Higher rate, longer term, a balloon, a fee: each moves the payment, interest, cost or rate the right way | `properties.test.ts` |
| No figure in the engine | `literals.test.ts` |
| APR: one repayment a year, two years and half a year on; a charge at the drawdown; payments in the same month; a rate of nothing; display halves either side; refusals (nothing borrowed or repaid, charges at or above the drawdown, a negative rate, malformed months and amounts) | `apr.test.ts` |

Mutation spot-checks (slice 3a), each made by hand in `calc.ts`, run, and reverted (of 986 tests): interest on the closing balance instead of the opening (264 fail); the arrangement fee left out of the effective rate (90); the purchase fee left out of it (203); the balloon left out of the final payment in the rate's cash flows (119); the balloon left out of the owning path's total (78); the time basis changed: the annual figure as twelve times the monthly (5), the `'annual'` basis divided by twelve like `'monthly'` (145), payments discounted a period late (312).

Mutation spot-checks (slice 3a.1), each made by hand in `apr` and reverted (of 1,213 tests in `apr.test.ts`): the time basis as twelve times the monthly rate (1,109 fail); the display rounded down (594); the display a digit short (1,168); charges at the drawdown ignored (298); payments in the same month overwriting instead of adding (877); payments a month late (1,109); the display rounded from the 40-place factor instead of the fifteen-place rate (14).
