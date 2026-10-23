# Mortgage overpayment (M1 engine)

The mortgage overpayment engine (**M1, 0.26.0**, internal: no page, registry entry, config or storage key yet). The page at `#/c/mortgage` comes in M2. Uses no tax rules (MO11). Illustrative, not financial advice.

Decisions: MO1 to MO15 in `docs/modelling-decisions.md` (confirmed by the owner on 23 October 2026). Sources and what could not be found: `docs/verification-log.md`, MR-1 to MR-10 (MR-1, MR-2 and MR-4 OPEN until the owner's statement is in `docs/mortgage-cross-checks.json`). Rounding per step: `docs/money.md`, "Mortgage overpayment".

## Files

- `types.ts`: `MortgageInputs` (start date, balance, term, repayment type, fixed rate and its end month, reversion rate, effect, a regular overpayment, lump sums, an early repayment charge, the policy), `MortgagePolicy` (`interestMethod`, `dayCount`), `MonthRow`, `Schedule`, `YearRow`, `BalancePoint`, `PeriodReturn`, `ChargeOutcome`, `AllowanceYear`, warnings, `MortgageResult`, refusals by field.
- `calc.ts`: the pure engine.
  - `overpay(inputs)`: the baseline (no overpayments) and the overpaying schedule to the end of the term; months saved, interest saved over the term and to the fixed-rate end, the charge (net saving and break-even month), allowance years, yearly rows, the balance series, one effective return per rate period, warnings and assumptions. Or a typed refusal.
  - `checkInputs(inputs)`: every problem, by field (MO12); never throws on untrusted shapes.
  - `DEFAULT_MORTGAGE_POLICY`: `'monthly'` interest, `'actual/365'` for daily (MO3, MR-10).
- Imports only `src/lib/` (MO15): `amortising.ts` (the shared payment, monthly rate, interest and annual rate, moved from car finance), `calendar.ts` (payment dates, days between dates, days by year, leap years; no clock), `inputLimits.ts` (`MAX_MORTGAGE_TERM_MONTHS` = 480, `MAX_INPUT_AMOUNT`, `MAX_FINANCE_RATE`, `MAX_LIST_ITEMS`), `money.ts`, `periods.ts`, `isoDate.ts`.

## How it works

- Months count payment dates: month one is a month after the start date, on the same day or a shorter month's last day (MO1).
- Repayment: the level payment from the shared formula on a twelfth of the rate, rounded to the nearest penny; the schedule's last month takes the rounding (MO2, MO10). Interest-only: the payment is the month's interest; the capital is owed at the end.
- Interest (MO3): `'monthly'`, opening balance × a twelfth, to the nearest penny; `'daily'`, balance × rate × days ÷ day basis (365, or each day's own year with `'actual/actual'`), exact through the month, rounded once on the payment date.
- Fixed-rate end (MO4): on the first payment date after it, a repayment payment is worked out again at the reversion rate on the balance then. With `'reduce-term'` and an overpayment already made, over the months the shortened schedule had left (the months the current payment takes to clear the balance at the fixed rate, no more overpayments), else over the contract's months left (MO5).
- `'reduce-payment'`: after any month with an overpayment, the next payment is worked out again over the contract's months left (MO5).
- Overpayments (MO6, MO8): the regular amount and any lump sums of a month are paid with that month's payment, after it, up to what is still owed; the rest is reported as not used. **In the schedule's last month the overpayment goes first and the payment is what remains** (MO8's "a lump sum in the final month clears what is left, and that month's payment shrinks to the remainder").
- Charge (MO7, MO10): allowance years are twelve payment dates each from the start date (months one to twelve, and so on). A percentage allowance is the balance before the year's first payment × the percentage, rounded down; an amount is as entered. In each overpayment month up to the charge's end month, the charge is the rate × the part of the year's overpayments newly above the allowance, rounded to the nearest penny, paid in cash (not added to the balance). Unused allowance is lost at the year's end.
- Interest saved, net saving and break-even (MO9): differences of whole-pence totals. Break-even is the first month from which the cumulative interest saved stays at least the cumulative charge to the end of the term (null if it is behind at the end). If it is never behind, that is month one.
- Return per rate period (MO9): `'monthly'`, the shared `annualRate` of a twelfth; `'daily'`, twelve months from the period's start compounded in fixed point, each 1 + r × (days ÷ day basis).

## Assumptions

Listed in the result's `assumptions`, in words with no digits: payment timing and the last payment's rounding; the interest method and day count; overpayments on payment dates only, so daily and monthly differ only slightly; the fixed-rate end and the reversion rate as a guess; the effect (or, interest-only, that it does not apply); overpayments never below nothing and the last month's order; the charge, allowance years, rounding down, no carry-over, paid in cash; what interest saved, the return, the net saving and break-even mean; the bounds (refused, never changed); what is not modelled.

## Sources and cross-checks

- No lender's method or rounding was found (MR-1, MR-2, MR-4 OPEN). `docs/mortgage-cross-checks.json` holds six cases for the owner's statement or illustration; `crossChecks.test.ts` shows each as a todo until filled, then compares it within the file's tolerance, trying both interest methods and day counts where the document does not state them.
- `reference.test.ts` checks the engine against `fixtures/reference.ts` (exact BigInt fractions, no fine fixed point, its own civil-calendar day numbers): the closed-form payment to the penny, the monthly schedule replayed penny for penny (also with a lump sum, reduce-term), every balance within the compounded half-penny bound of the closed-form balance, the closed-form payoff month after a lump sum, and a day-by-day replay of daily interest with both day counts (300 and 2 × 100 seeded cases).

## Edge cases and their tests

| Case | Test |
|---|---|
| Overpayment above the balance: only what clears it used, the rest reported; charge on the used part | `calc.test.ts` |
| Across the fixed-rate end: payment worked out again; reduce-term keeps the shortened months; no charge after the charge's end | `calc.test.ts` |
| Charge over the allowance: allowance rounded down, charge to the nearest penny, reset each year, no carry-over, net saving, break-even and never | `calc.test.ts`; `properties.test.ts` |
| Lump sum in the final month | `calc.test.ts` |
| Interest-only, with overpayments and the effect ignored | `calc.test.ts` |
| Zero rate (fixed, reversion, both) | `calc.test.ts` |
| Leap year, both day counts; a month across the year end | `calc.test.ts`; `reference.test.ts` |
| A term under a month (refused); the longest term with the largest balance and rate | `calc.test.ts` |
| No fixed period; fixed rate to the term; a start on the 29th to 31st | `calc.test.ts`; `reference.test.ts` |
| Balance never below nothing; rows add up; total paid = balance + interest + charges − owed at the end; nothing overpaid = the baseline; more overpayment never lengthens the term or raises interest; interest saved never below nothing without a charge | `properties.test.ts` (200 seeded cases each) |
| Refusals by field, untrusted shapes | `calc.test.ts` |
| Literal guard (day-count names exempt as exact strings) | `literals.test.ts` |

Mutation spot-checks (M1, by hand): daily and monthly swapped, the charge rounded down, the allowance rounded up, the allowance not reset each year, `'actual/actual'` ignored, reduce-term not shortened at the fixed-rate end. Each failed at least one test.

## Known behaviour to confirm

- With daily interest the level payment comes from a twelfth of the rate (MO2, MO4), so over a long term the schedule drifts and the last payment takes it (one 39-year `'actual/actual'` case: a last payment of about a twentieth of the level payment). A `'reduce-payment'` schedule worked out again later drifts less, so in the last months it can sit above the baseline; the property that the overpaying balance never exceeds the baseline is tested for monthly interest only.
