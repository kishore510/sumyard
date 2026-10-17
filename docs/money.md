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

What GOV.UK and HMRC say about rounding for each step the optimiser needs, read on 17 October 2026. **No mode is chosen here.** Where guidance states a rule, the quote and source are given; where it is silent, the row says **not stated** and the mode is to be agreed with the owner before session F writes the step. The `money.ts` mode that appears to match is noted only as a pointer for that conversation.

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
