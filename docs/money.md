# Money, rounding and formatting

Code: `src/lib/money.ts` (arithmetic) and `src/lib/format.ts` (display). Both are tested in `money.test.ts` and `format.test.ts`, including boundary and negative cases.

## Decision (slice 0.5, session C)

**Money is integer pence**, a JavaScript `number` branded as `Money`, always a safe integer (up to about £90 trillion either way). No decimal library: every amount Sumyard handles fits, rates are exact `Ratio`s of integers, and no dependency is added.

- Make amounts with `fromPence(n)` or `fromPounds(x)`. `fromPounds` takes a safe whole number of pounds, or a string of digits with at most two decimal places (`"12"`, `"12.3"`, `"-0.05"`). It rejects anything else (commas, a `£`, more decimals) instead of rounding: parsing what a person types belongs to the input components (session D).
- `add`, `subtract`, `compare`, `min`, `max`, `mulRound`, `roundToPounds`. Every operation checks that its inputs are safe integers (a cast can forge a `Money`) and that its result is, and throws `MoneyError` otherwise. Nothing silently loses precision.
- **Rates are `Ratio`s** (`{ numerator, denominator }`, safe integers, denominator above zero), made with `ratio(n, d)` or `percent("7.5")` (75 / 1000). There is no float factor anywhere.
- `mulRound(amount, factor, mode)` multiplies in `BigInt` and rounds once, to whole pence, by an explicit mode.
- `toPence(amount)` gives the plain integer, for storage or display code.

**Rule:** no float arithmetic on amounts outside `money.ts` (and `format.ts`, which uses the same integer helpers). Calculators add, compare and multiply only through these functions.

## Rounding modes

| Mode | Meaning | Negative amounts |
|---|---|---|
| `nearest` | The nearer penny. An exact half goes **away from zero**. | Symmetric: `nearest(-x) = -nearest(x)`. |
| `down` | Towards minus infinity (floor). | -2.5p rounds to -3p. |
| `up` | Towards plus infinity (ceiling). | -2.5p rounds to -2p. |

`roundToPounds(amount, mode)` rounds to a multiple of 100 pence with the same modes.

## Rounding per calculation (slice 1a, session E)

What GOV.UK and HMRC say about rounding for each step the optimiser needs, read on 17 October 2026. Where guidance states a rule, the quote and source are given; where it is silent, the row says **not stated**. The modes now used are in **Decided rounding** below (session F); this table stays as the record of what the guidance says.

| Step | What the guidance says | Unit | Source | Status |
|---|---|---|---|---|
| Income tax on bands (annual) | Not stated on the www.gov.uk pages read. HMRC's taxable pay tables (PDF on assets.publishing.service.gov.uk) could not be fetched from this environment. | Not stated | — | **Not stated** (OPEN O6) |
| Personal allowance taper | "goes down by £1 for every £2" of adjusted net income over the limit. How an odd pound or pence of excess is handled is not stated. | Not stated | Income Tax rates and Personal Allowances, https://www.gov.uk/income-tax-rates; HMRC Income Tax rates and allowances | **Not stated** (OPEN O5) |
| National Insurance (Class 1, exact percentage method) | "round NICs calculations to the nearest penny (amounts of less than £0.005 are disregarded)"; employee and employer NICs calculated separately; per earnings period. | Penny, per pay period | NIM11002, https://www.gov.uk/hmrc-internal-manuals/national-insurance-manual/nim11002 (citing regulation 12(1) SSCR 2001) | **Stated.** Appears to match `nearest` for amounts of zero or more (a half penny rounds up); confirm. Annual or per period: OPEN O1. |
| Student loan and postgraduate loan deductions (PAYE) | "Multiply the result (the excess) by 9% (0.09), round down this figure to the nearest whole pound" (6% for postgraduate loans). For a pay period that is not a whole week or month, the pro-rata threshold is "Round[ed] down ... to the nearest penny". | Whole pound per pay period; threshold to the penny | 2026 to 2027: Student and Postgraduate Loan deduction tables, https://www.gov.uk/government/publications/sl3-student-loan-deduction-tables/2026-to-2027-student-and-postgraduate-loan-deduction-tables | **Stated.** Appears to match `roundToPounds(…, 'down')` for deductions of zero or more; confirm. |
| Student loan repayments (Self Assessment, annual) | "Balance (income less threshold) X rate = Student Loans and or Postgraduate Loan repayments for the year". No rounding stated. | Not stated | CSLM16030, https://www.gov.uk/hmrc-internal-manuals/collection-of-student-loans-manual/cslm16030 | **Not stated** |
| High Income Child Benefit Charge | "1% of your Child Benefit for every £200 you earn over £60,000"; "One per cent of the full Child Benefit award, for each £200 of income which falls between £60,000 and £80,000". Whether a part of £200 counts, and rounding of the charge, not stated; PAYE14015's examples show whole pounds but one is inconsistent. | Not stated | High Income Child Benefit Charge, https://www.gov.uk/child-benefit-tax-charge; PAYE14015, https://www.gov.uk/hmrc-internal-manuals/paye-manual/paye14015 | **Not stated** (OPEN O4) |
| Relief at source gross-up | "for every £1 of pension contribution you made, take £1.25" (adjusted net income); PTM057200's example: £360 paid, £90 relief, £450 gross. No rounding stated. | Not stated | Personal Allowances: adjusted net income, https://www.gov.uk/guidance/adjusted-net-income; PTM057200, https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm057200 | **Not stated** |
| Annual allowance taper | "If the reduction to be made from the annual allowance is not a multiple of £1, the reduction is rounded down to the nearest £1." | Whole pound (the reduction) | PTM057100, https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm057100; worked in PTM057200 | **Stated.** Appears to match `roundToPounds(…, 'down')` on the reduction; confirm. |

Not read: HMRC's CA38 (National Insurance tables) and CA44 (directors) for 2026 to 2027, and the taxable pay tables, all PDFs that this environment's proxy refused. Legislation was not consulted.

If a step's guidance rounds negative amounts differently (for example towards zero rather than towards minus infinity), session F adds a mode rather than reuse one that does not match.

## Decided rounding (slice 1a, session F)

The owner's decision D3 (`docs/modelling-decisions.md`), recorded 17 October 2026. **Where the guidance above states a rule, it is used. Everywhere else there is no intermediate rounding:** amounts stay exact, fractions of a penny included, and each output component is rounded once to the nearest penny (`nearest`, halves away from zero). Totals are sums of the rounded components.

| Step | Mode | Where | Basis |
|---|---|---|---|
| Personal allowance taper reduction | Exact by default (`ModellingPolicy.taperRounding: 'exact'`); the allowance shown is rounded to the nearest penny, and income tax uses the exact figure. Option `'wholePoundsDown'`: the reduction is rounded down to a whole pound (`roundToPounds(…, 'down')`). | `personalAllowance`, `incomeTax` | Decisions D3, D4. Not stated on GOV.UK. The option differs from the default by less than £1 of allowance. |
| Taxable income and each band's income | Exact; rounded to the nearest penny for output only. | `incomeTax` | D3. |
| Income tax, each band | Exact rate × band income, rounded to the nearest penny (`roundExact(…, 'nearest')`). Total = sum of the bands. | `incomeTax` | D3 (O6: not stated on GOV.UK). |
| Employee National Insurance | Each rate's contribution to the nearest penny (`mulRound(…, 'nearest')`; amounts are never negative, so a half penny rounds up, as NIM11002 states). Annual, not per period. | `employeeNI` | Stated (NIM11002); annual model D1. |
| Student loan and postgraduate loan repayments | Rate × pay above the threshold, rounded down to a whole pound (`mulRound(…, 'down')` then `roundToPounds(…, 'down')`, which equals one floor to the pound). Each plan's repayment separately. Annual, not per period. | `studentLoan` | Stated for PAYE deductions (SL3 2026 to 2027), applied to the annual figure by decision D3; annual model D1. |
| Monthly and weekly views | Each annual component divided by the months or weeks in a year (`src/lib/periods.ts`), to the nearest penny. A view's net can differ by a penny or so from its gross less its deductions. | `takeHome` | D3. Display only, not payroll. |
| Adjusted net income | Exact (a relief at source gross-up can leave part of a penny); the taper and the HICBC steps use the exact figure; shown to the nearest penny. | `adjustedNetIncome`, `incomeTax`, `hicbc`, `takeHome` | D3. Session G1. |
| Relief at source gross-up | The payment divided by one less the relief-at-source rate, exact; the ANI deduction and the basic rate band extension use the exact amount; the gross contribution and the provider's relief are shown to the nearest penny (the relief as the rounded gross less the payment, so they add up). | `pensionContribution`, `incomeTax`, `takeHome` | D3. Session G1 re-read PTM044220, PTM057200 and the ANI guidance: no rounding stated. |
| Band starts after a relief at source extension | Exact; shown to the nearest penny. | `incomeTax` | D3. Session G1. |
| Child Benefit for the year | The weekly rate times the policy's weeks (whole pence, so exact), per child. | `hicbc` | D3, G4. |
| HICBC charge | Whole steps of exact ANI over the threshold (`wholeSteps`, rounded down); the charge, the percentage times the Child Benefit received, to the nearest penny. | `hicbc` | Decisions G1, D3. Session G1 found no GOV.UK rounding rule; PAYE14015's older example prints whole pounds (HICBC-2, not followed). |
| Annual allowance taper | The reduction is the reduction rate times adjusted income over the limit, rounded down to a whole pound (`mulRound(…, 'down')` then `roundToPounds(…, 'down')`, one floor to the pound); the allowance never goes below the minimum. Adjusted income is whole pence. | `annualAllowanceCheck` | Stated (PTM057100); mirrored (AA-3). Session G2. |
| Threshold income | Exact (a relief at source gross-up can leave part of a penny); the taper test and the threshold solver use the exact figure; shown to the nearest penny. | `annualAllowanceCheck`, `thresholdContributions` | D3. Session G2. |
| Pension savings counted | The gross relief at source contribution as it reaches the pot, to the nearest penny (the same figure as the gross contribution shown); salary sacrifice and employer contributions are whole pence. | `annualAllowanceCheck` | D3, G8. Session G2. |
| Annual allowance charge | The excess stacked on exact taxable income; each band's part and its charge to the nearest penny; the total is the sum of the bands. | `annualAllowanceCharge`, `annualAllowanceCheck` | D3 (no rounding stated in PTM056110 to PTM056130, whose examples are whole pounds). Session G2. |
| Childcare headroom | Exact adjusted net income against the limit; the headroom rounded down and the amount over rounded up to a penny, so a part of a penny over shows as a penny over. | `childcareCheck` | G12. Session G2. |
| Threshold contributions | Closed form in exact pence: the measure over the limit (times one less the relief-at-source rate for relief at source), rounded up to a penny, so the measure lands on or just under the limit. | `thresholdContributions` | G14. Session G2. |
| Net cost per pound and marginal rate | Exact ratios of whole pence (no rounding). | `optimise` | G13. Session G2. |

Exact amounts use `ExactPence` (`exact`, `exactMul`, `exactAdd`, `exactSubtract`, `compareExact`, `roundExact` in `money.ts`, added in session F): BigInt fractions of a penny in lowest terms, which become `Money` only through `roundExact`. `wholeSteps(amount, step)` (session G1) counts the whole steps in an exact amount, rounded down, for the HICBC.

Rounding of each component means take-home is not strictly monotone at a penny: under salary sacrifice in the personal allowance taper zone, a penny more sacrifice can leave a penny more take-home (income tax and NI each round to the nearest penny). Session G2 found such steps when scanning a range penny by penny; they are not listed as cliffs.

## Compound interest (slice 2a)

Decisions C6 (rounding) and C9 (arithmetic) in `docs/modelling-decisions-compound.md`. No tax rule is involved.

**Fine fixed point.** The equivalent rate per contribution period (C2) is a root when the compounding frequency is not a whole multiple of the contribution frequency, so it is irrational and `ExactPence` cannot hold it. The engine works in `FinePence` (pence) and `Factor` (plain numbers) from `money.ts`: BigInt integers in units of 10^-40 (`FINE_DIGITS`). `fineMul`, `fineDivide`, `factorMul` and `factorDivide` round each result to the nearest unit; `factorPow` squares and multiplies; `factorRoot` takes the integer n-th root by Newton's iteration and then the nearer unit. A `FinePence` becomes `Money` only through `roundFine`, which throws `MoneyError` past the safe range. `factorToRatio` shows a rate as a `Ratio` over 10^15 (`RATE_RATIO_DIGITS`).

**Error bound.** A factor from `factorPow` or `factorRoot` is within a few hundred units (a few times 10^-38 relative) of its true value: the 365th power in `money.fine.test.ts` is within 365 units. Each step of a projection multiplies by such factors and rounds by half a unit. Over at most 5,200 steps (a hundred years weekly) on a balance within the safe range of `Money` (below 10^16 pence) the accumulated error is below about 10^-17 of a penny.

**Test tolerance.** Because of that bound, the engine's one rounding to the penny must equal the exact value rounded to the nearest penny. `reference.test.ts` compares 300 seeded cases with `fixtures/reference.ts` (closed forms in exact BigInt fractions, a bisection root to 2^-224 where the rate is irrational) and allows a one-penny difference only when the exact value is within 10^-12 of a penny of a half penny, where the two roundings may legitimately fall either side. That margin is five orders of magnitude above the engine's error and still makes a penny tie vanishingly unlikely; none of the 300 cases is that close.

| Step | Mode | Where | Basis |
|---|---|---|---|
| Growth, fee, contributions with the increase, inflation index | Fine fixed point, nearest unit at each step; no rounding to the penny | `simulate` | C6, C9 |
| Closing balance, cumulative contributions, cumulative fees (each year, nominal and real) | Each to the nearest penny once (`roundFine`, `nearest`) | `toProjection` | C6 |
| A year's contributions and fees | Rounded cumulative figure less the previous year's | `toProjection` | C6: rows add up to totals |
| A year's growth | Closing − opening − contributions + fees (takes the penny) | `toProjection` | C6: every row balances |
| Fee drag | Rounded closing without the fee less rounded closing with it | `feeDrag` | C4 |
| Rates shown (effective, per period, after fees, real) | Nearest at fifteen decimal places | `factorToRatio` | C6 |

## Car finance (slice 3a)

Decisions F7 (rounding), F8 and F9 (the rate) in `docs/modelling-decisions-car.md`. No tax rule is involved, and no lender's rounding was verified (`docs/verification-log.md`, CR-1).

**Arithmetic.** The payment and the rate solver work in `FinePence` and `Factor` (as compound interest, C9): an `'annual'` basis monthly rate is a twelfth root, and a solved rate is a long binary search, so neither is held exactly. On the `'monthly'` basis the monthly rate r / 12 is rational, so each month's interest is rounded with `mulRound` on an exact `Ratio`; an exact half penny goes up, as it would by hand.

**The rate solver (F9).** Bisection on f(i) = present value of the payments at i − credit received, which falls as i rises because every payment after the start is zero or more. The bracket is [0, 1] a period (refused as `'no-solution'` if f(0) < 0 or f(1) > 0); each step halves it, keeping f(low) > 0 ≥ f(high), until it is at most `RATE_SOLVE_TOLERANCE` = 10^-`RATE_SOLVE_DIGITS` = 10^-24 wide; the midpoint is returned, within half that of the root. That takes about eighty steps; `RATE_SOLVE_MAX_STEPS` (200) bounds it, and reaching the bound is the refusal `'no-convergence'`. Present values are worked by Horner's rule, each product to the nearest unit of 10^-40 of a penny. Deterministic: no float, no starting guess.

**Round-trip tolerance.** With at most 120 payments, each within the safe range, the slope of the present value is below about 10^14 pence per unit of rate, so a rate within 10^-24 of the root discounts the payments to the credit within about 10^-10 of a penny. `rate.test.ts` allows 10^-9 of a penny (exact fractions), on 300 seeded agreements, and checks that the root lies strictly between the solved rate less and plus 10^-24.

**Reference tolerance.** The payment is within about 10^-30 of a penny of the exact closed form, so `reference.test.ts` requires the engine's payment to equal the exact one rounded to the nearest penny (the same near-half margin as compound interest, 10^-12 of a penny; no seed is that close), and every schedule row to equal the reference's exact replay of F7.

**The statutory APR (slice 3a.1, F15).** `apr` solves F9's monthly equation and returns X = (1 + i)^12 − 1 (`annualRate`), good to about 10^-20; `annual` is that to fifteen places (`factorToRatio`, nearest). `display` rounds `annual` to `APR_DISPLAY_DIGITS` (3: one decimal place of a percentage) with `roundRatio`, mode `'nearest'`: a following figure of five or more rounds up, as CONC App 1.2.6R(3)(f) requires (CR-3). Rounding from fifteen places rather than from the 40-place factor is deliberate: a rate exactly on a display half can solve to a factor about 10^-24 below it, which would round down. `apr.test.ts` checks the display against exact fractions on 300 seeded yearly cases (the root lies in [k − ½, k + ½) thousandths) and 300 exact round trips, some exactly on a half.

| Step | Mode | Where | Basis |
|---|---|---|---|
| Monthly rate | Exact `Ratio` (basis `'monthly'`); fine fixed point (basis `'annual'`, or solved) | `monthlyFactor` | F6 |
| Regular payment | Closed form in fine fixed point, rounded once to the nearest penny | `regularPayment` | F7 |
| Each month's interest | Opening balance × monthly rate, to the nearest penny | `buildSchedule` | F7 |
| Last month | Priced by rate: the last payment brings the balance to the final payment. Priced by payment: the last month's interest does | `buildSchedule` | F7 |
| Excess mileage charge | Whole miles × whole pence a mile: exact | `pcp` | F11 |
| Effective rate, monthly and annual | Bisection to 10^-24, shown to fifteen decimal places (`factorToRatio`); nothing rounded for display | `solveRate`, `annualRate` | F8, F9 |
| Statutory APR | `annual`: as the effective rate. `display`: `annual` to one decimal place of a percentage, nearest, a following five rounding up | `apr`, `roundRatio` | F15; CR-3 (verified) |

## Car ownership (slice 3b)

Decisions F17, F18, F21, F25, F29 and F53 to F55 in `docs/modelling-decisions-car.md`. No tax rule is involved.

| Step | Mode | Where | Basis |
|---|---|---|---|
| Cost per mile | Exact (`ExactPence`): price per litre × litres per gallon ÷ miles per gallon; blended price per kWh ÷ miles per kWh; or as entered | `costPerMile` | F21, CO-1 |
| Each month's running cost and fuel | Exact: a twelfth of annual × (1 + change)^year, rounded once to the nearest penny | `monthly` | F21, F25 |
| Value curve | q = (VH / V0)^(1/H) by bisection on the fine grid to one unit (the largest q with V0 q^H ≤ VH); V(m) = V0 q^m in fine fixed point, rounded once to the nearest penny; V(0) and V(H) exact | `valueCurve` | F17 |
| Fitted yearly change | q^12 − 1, shown to fifteen decimal places | `valueCurve` | F17 |
| Opportunity cost | Horner's rule in fine fixed point at (1 + s)^(1/12) (`factorRoot`), less the outflows, rounded once each month | `futureValueOfFlows`, `opportunity` | F18 |
| Net cost, equity, breakdown | Sums and differences of whole pennies: exact, so the breakdown adds up to the net cost | `costCase` | F26 |
| Net cost per month of coverage | Net cost ÷ coverage, nearest penny, for display; ranking compares net × the other's coverage exactly | `costCase`, `rank` | F27 |
| Flip: horizon value | Exact crossing (a rational), to the nearest penny | `valueFlip` | F29 |
| Flip: savings return, mileage | Grid of `FLIP_SCAN_STEPS`, then bisection to neighbours 10^-`FLIP_RATE_DIGITS` apart or one mile apart. From a strict order a tie is carried past to the other option lower; a band of ties between is `level`, its ends one step from `below` and `above` (3d-2) | `search` | F29, F53 |
| Flip: fuel or energy price | The first option's cost per mile on the same grid, in steps of 1 / `FLIP_RATE_DENOMINATOR` of a penny from nothing to `MAX_PENCE_PER_UNIT`; exact (`ExactPence`). A price per litre from it: pence per mile × miles per gallon ÷ litres per gallon, exact, shown to a tenth of a penny | `fuelPriceFlip`, `pencePerLitreFor` | F54 |
| Cost bridge | Each part: the difference of the two whole-penny parts ÷ months owned, exact. Shown: the total rounded once to the nearest penny (halves away from nothing: the verdict's gap); each part cut towards nothing, the pennies still needed given one each to the largest remainders that way (by size, then part order), so the shown parts add up to the shown total and each is within a penny of exact. Shown in pence whatever Settings says | `costBridge` | F55 |

**Reference tolerance.** `fixtures/reference.ts` works in exact fractions with the two roots (the curve's q and the monthly growth) as 256-bit binary fractions; each power is truncated to 256 bits. The engine's roots are within a unit of 10^-40, so a value or opportunity cost could differ only within about 10^-25 of a penny of a half; the test compares every one not within 10^-12 of a half penny, and fails if ten or more figures across the 300 seeded cases are skipped that way.

**`futureValueOfFlows` against `project()`.** For level monthly payments the compound engine's closing balance (annual compounding with monthly contributions at the end, C2) and this function agree within a penny on 60 seeded cases (`properties.test.ts`).

## Car decision page (slice 3c-2)

The page does no money arithmetic of its own except two things through `money.ts`, both on engine figures:

| Step | Mode | Where | Basis |
|---|---|---|---|
| Sensitivity: an end value moved by p percent | `mulRound(value, (100 + p) / 100, 'nearest')` | `shiftOption` | F41 |
| Sensitivity: the savings return, a fuel or energy price moved by p percent | Exact `Ratio` (numerator × (100 + p), denominator × 100) | `shiftOption` | F41 |
| Sensitivity: the annual mileage moved by p percent | `divideRound(miles × (100 + p), 100, 'nearest')`, whole miles | `shiftOption` | F41 |
| Sensitivity: the change | `subtract` of two engine figures (net cost per month of coverage), exact | `driverRow` | F41 |

The chart's points and the readout are the engine's `MonthPoint`s, unchanged.

## Pension compare (0.21.0)

`compareContributions` (`src/calculators/optimiser/compare.ts`) takes two engine points (the contribution now and a target, each from `optimise()`) and does arithmetic only, through `money.ts`:

| Step | Mode | Basis |
|---|---|---|
| Year: now, new | The engine's annual figures, unrounded further | Engine |
| Year: change | `subtract(new, now)`, exact | Arithmetic |
| Month: now, new | `perPeriod(annual, 'month')`: the year's figure times one over `MONTHS_PER_YEAR`, nearest penny (as B14) | Display policy |
| Month: change | `subtract` of the two month figures as shown, so each row adds up to the penny; it can differ by a penny from the year's change divided evenly | Display policy |
| % change | Exact `Ratio` of the year's change over the year's figure now; null when that figure is nothing or below | Arithmetic |
| Share of pay, change in points | Exact `Ratio`s of the contribution over pensionable pay, and their difference (`subtractRatio`); null with no pensionable pay | Arithmetic |
| Cost per £1 (average over the range) | Exact `Ratio` of take-home given up over the extra total paid into the pension; null when that extra is nothing | Arithmetic |

Total paid into the pension is the engine's `pension.total` at each point (own contribution, provider relief, other employer contributions); it is never the contribution change added on.

## Mortgage overpayment (session M0)

Decisions MO3, MO9, MO10 and MO15 in `docs/modelling-decisions.md`, confirmed by the owner on 23 October 2026; built in M1 (0.26.0, `src/calculators/mortgage/calc.ts`). No tax rule is involved, and no lender's rounding was found (`docs/verification-log.md`, MR-1, MR-2, MR-10): every mode below is a modelling choice, one per step, named in the result's assumptions, so a real statement can correct one line. "Shared" is `src/lib/amortising.ts`, moved from car finance in M1 (MO15).

| Step | Mode | Where | Basis |
|---|---|---|---|
| Monthly rate, `'monthly'` method | Exact `Ratio`, a twelfth of the annual rate | shared `monthlyRate` | MO3; MR-5 (described) |
| Regular payment, and each recalculation (fixed-rate end, `'reduce-payment'`) | Closed form in fine fixed point, rounded once to the nearest penny | shared `regularPayment` | F7, MO4, MO5 |
| Interest-only payment | The month's interest, as charged | engine | MO2 |
| Each month's interest, `'monthly'` | Opening balance × monthly rate, `mulRound` to the nearest penny | shared `interestOn` | MO10 |
| Each month's interest, `'daily'` | Each day's balance × annual rate ÷ day basis, summed exactly (`ExactPence`), rounded once to the nearest penny when charged on the payment date | engine | MO3, MO10 |
| Last payment | Brings the balance to exactly nothing, so it takes the rounding | engine | F7 |
| Overpayment past the balance | Limited to what clears it: whole pence, exact | engine | MO8 |
| Penalty-free allowance (percentage) | Balance at the allowance year's start × percentage, `mulRound` down | engine | MO7, MO10 |
| ERC | Overpaid above the allowance × ERC rate, `mulRound` to the nearest penny | engine | MO7 |
| Interest saved, net saving after the ERC | Differences of whole-pence totals: exact | engine | MO9 |
| Break-even point | The first month whose cumulative interest saved is at least the cumulative ERC paid: whole pence, exact | engine | MO9 |
| Effective guaranteed return, per rate period | `'monthly'`: shared `annualRate` of a twelfth of the rate. `'daily'`: twelve monthly factors multiplied in `Factor` fixed point (C9). Shown with `roundRatio`, nearest; no blended rate | engine | MO9 |

## Next pound decision (session C0)

Decisions CP2 to CP7 in `docs/modelling-decisions.md`; to be built in C1 (`src/calculators/next-pound/`). The composer rounds as little as it can: each engine keeps its own rounding (`docs/money.md` sections above), and the composer works on the whole-pence results they return. The pages read in C0 state **no rounding rule** for the tax-free lump sum or for tax on a pension withdrawal (NP-2, NP-8): those modes are modelling choices, marked "not stated", named in the assumptions, for the owner to confirm.

| Step | Mode | Where | Basis |
|---|---|---|---|
| Extra contribution E for X of take-home | Whole pence, searched; no rounding of its own. Its cost is spendable income at two optimiser points (each already whole pence), so exact | composer, on `optimise()` | CP3; the optimiser's own rounding (above, "Decided rounding") |
| Pension added (net cost to gross) | The difference in `pension.total` between the two points: whole pence, exact. A relief-at-source gross-up keeps the optimiser's rounding (nearest penny, above) | composer | CP3, D3 |
| Leftover cash in a column | X less what the leg used: whole pence, exact | composer | CP2 |
| Pension pot and ISA at the horizon | Compound interest's `project()`: fine fixed point, the closing balance rounded once to the nearest penny, nominal and real | `compound-interest` | C6, C9 |
| Tax-free part of the pot | Pot × the tax-free share, capped at the allowance available. **Not stated**; proposed `mulRound` **down** (never overstates what is tax-free) | composer | CP4, NP-2, NP-6 |
| Tax on the rest | (Pot − tax-free part) × the retirement rate, `mulRound` to the **nearest** penny, as each income tax band (above). **Not stated** for a withdrawal | composer | CP4, NP-8, D3 |
| Pension after tax | Pot − tax: whole pence, exact | composer | CP4 |
| Mortgage leg | Balances and payments from `overpay()` (its own modes, "Mortgage overpayment" above); differences and the sum of freed payments are whole pence, exact | composer | CP5, MO10 |
| Overpayment O within X with its ERC | Whole pence, searched (the ERC is the mortgage engine's, nearest penny) | composer, on `overpay()` | CP5, MO7 |
| Today's money for the mortgage leg, the pension after tax and leftover cash | Nominal × one over (one plus inflation) to the power of the years, in `Factor` fixed point (`factorPow`), rounded once to the nearest penny: each column's nominal value is deflated once. The ISA and the pension pot use compound interest's real view, the same deflator (C1 as built) | composer | CP2, C5, C9 |
| Break-even ISA return | Bisection on the growth rate within `GROWTH_RATE_BOUND`, comparing whole-pence closings; stopped when the bracket is narrower than the display precision, shown with `roundRatio`, nearest. A penny tie gives a bracket, not one rate: the lower end is shown. **Not stated** (no source involved) | composer, on `project()` | CP7 |

## Display (`format.ts`)

Locale en-GB. Formatting works from integer pence in `BigInt`, never by dividing a float, so the digits are exact at any size. **Display rounding is nearest, halves away from zero**; it is for showing results and is not a tax rule.

| Function | Example | Notes |
|---|---|---|
| `formatGBP(amount, 'pence')` | `£1,234.56`, `-£0.05` | The Settings choice “Pounds and pence”. |
| `formatGBP(amount, 'pounds')` | `£1,235` | “Whole pounds”. Never `-£0`. |
| `formatGBPCompact(amount)` | `£950`, `£1.2k`, `£12k`, `£1.5m`, `£3bn` | For chart axes later. One decimal below ten of a unit, none from ten up; moves up a unit when rounding reaches a thousand. |
| `formatPercent(ratio, maxDecimals = 2)` | `7%`, `7.5%`, `33.33%` | Trailing zeros dropped; never `-0%`. |
| `formatIsoDate('2098-01-02')` | `2 January 2098` | The same in every time zone. |

Callers pass the amount style from Settings (`settingsStore`); `format.ts` reads no store.
