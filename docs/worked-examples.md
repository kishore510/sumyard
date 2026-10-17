# Worked examples

Examples that GOV.UK and HMRC publish for the rules Sumyard models, copied as published: inputs, the published result and the page. **None is computed or invented here.** Session F mirrors the usable ones as engine tests (CLAUDE.md > Accuracy rules); the owner adds further cross-checks from HMRC's own calculators.

Collected in slice 1a session E from pages read on 17 October 2026. Each example says which tax year its figures belong to. Where that is not 2026 to 2027, the example tests the method with that year's figures passed in as test inputs (a fake config), never as 2026 to 2027 values. Two published examples are internally inconsistent; they are listed so nobody mirrors them by mistake.

**Count:** 23 published examples collected in session E, plus 3 added in session F for income tax (IT-1, IT-2, PA-1). 5 are stated for 2026 to 2027 and 7 more use current thresholds that match 2026 to 2027; the rest illustrate a method with another year's figures. More than five in total, but the **personal allowance taper has no published numeric example** on the pages read, and both HICBC examples need the owner's check (O4). The owner's HMRC-calculator cross-checks fill those gaps.

## Income tax and the personal allowance (added in session F)

Read on 17 October 2026, to confirm decision D2 (marginal bands) and the taper's zero point.

| # | Year | Inputs | Published result | Source | Mirror in F? |
|---|---|---|---|---|---|
| IT-1 | 2026 to 2027 ("in the 2026 to 2027 tax year") | Wages £29,570 and dividends £3,000; Personal Allowance £12,570 | "Take this off your total income to leave a taxable income of £20,000"; "This is in the basic rate tax band, so you would pay: 20% tax on £17,000 of wages" (dividends taxed separately) | Tax on dividends, https://www.gov.uk/tax-on-dividends | **Mirrored** (wages only; dividends are out of scope). |
| IT-2 | 2024 to 2025 | Earnings £60,270; £12,000 paid into a relief at source scheme | "You can claim an extra 20% tax relief on £10,000 (the same amount you paid 40% tax on)" | Tax on your private pension contributions: Tax relief, https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief | **Mirrored** for the band split only: £10,000 in the higher rate band. HMRC's "Income Tax rates and allowances for current and previous tax years" shows the same Personal Allowance and England, Wales and Northern Ireland bands for 2024 to 2025 as for 2026 to 2027, so the 2026-27 config stands in. The relief itself is session G (PR-1). |
| PA-1 | Current (page: 6 April 2026 to 5 April 2027) | Income at and above £125,140 | "Your personal allowance goes down by £1 for every £2 that your adjusted net income is above £100,000. This means your allowance is zero if your income is £125,140 or above." | Income Tax rates and Personal Allowances, https://www.gov.uk/income-tax-rates | **Mirrored** (a stated rule, not a worked calculation). Still no published numeric example inside the taper zone. |

## National Insurance

| # | Year | Inputs | Published result | Source | Mirror in F? |
|---|---|---|---|---|---|
| NI-1 | 2026 to 2027 (page: "from 6 April 2026 to 5 April 2027") | Category A, earnings £1,000 in a week | "nothing on the first £242"; "8% (£58) on your earnings between £242.01 and £967"; "2% (£0.66) on the remaining earnings above £967"; "your National Insurance payment will be £58.66 for the week" | National Insurance rates and categories, https://www.gov.uk/national-insurance-rates-letters | **Mirrored** with the example's weekly thresholds passed in (the engine is annual, D1; the method is the same). |

## Student loans

| # | Year | Inputs | Published result | Source | Mirror in F? |
|---|---|---|---|---|---|
| SL-1 | Current (thresholds match 2026 to 2027) | Plan 1, income £33,000 a year, paid £2,750 a month | "£2,750 – £2,241 ... = £509"; "9% of £509 = £45.81"; "the amount you’d repay each month would be £45" | Repaying your student loan: How much you repay, https://www.gov.uk/repaying-your-student-loan/what-you-pay | **Mirrored** in F. Yes (monthly; note the guide uses whole-pound thresholds). |
| SL-2 | Current | Plan 4, income £36,000 a year, paid £3,000 a month | "£3,000 – £2,816 ... = £184"; "9% of £184 = £16.56"; "would be £16" | Same page | **Mirrored** in F. Yes. |
| SL-3 | Current | Plan 1 and Plan 2, £38,400 a year, £3,200 a month | "£3,200 - £2,241 ... = £959"; "9% of £959 = £86.31"; "would be £86" | Same page | **Mirrored** in F. Yes. |
| SL-4 | Current | Plan 1 and Plan 2, repaying £86 a month: cap on Plan 1 | "£2,448 - £2,241 ... = £207"; "9% (the Plan 1 rate) of £200 = £18.63"; "The monthly payment cap for your Plan 1 loan is £18"; "£18 ... towards your Plan 1 loan and the remaining £68 ... Plan 2" | Same page | **No: inconsistent as published** (the text multiplies £200 although its own difference is £207). Split between plans is out of scope anyway. |
| SL-5 | Current | Postgraduate Loan and Plan 2, £30,000 a year, £2,500 a month | "£2,500 – £1,750 ... = £750"; "6% of £750 = £45"; "£2,500 – £2,448 ... = £52"; "9% of £52 = £4.68"; "would be £49" | Same page | **Mirrored** in F. Yes. |
| SL-6 | Current | Plan 1, employed and self-employed, combined income £42,000 (Self Assessment) | "£42,000 - £26,900 ... = £15,100"; "9% of £15,100 = £1,359"; "the amount you’d repay each year would be £1,359" | Same page | **Mirrored** in F. Yes (annual). |
| SL-7 | Current | Plan 1, two jobs paying £1,000 and £800 a month | "You will not have to make repayments because neither salary is above the £2,241 a month threshold." | Same page | **Mirrored** in F. Yes (per job, if modelled). |
| SL-8 | 2026 to 2027 | Plan 1, weekly earnings £565 | "Deduct the ‘pay period threshold’ of £517.30"; "The excess is £47.70"; "Multiply £47.70 by 0.09"; "Round down £4.29 to the nearest £"; "The £4.00 Student Loan deduction" | 2026 to 2027: Student and Postgraduate Loan deduction tables, https://www.gov.uk/government/publications/sl3-student-loan-deduction-tables/2026-to-2027-student-and-postgraduate-loan-deduction-tables | **Mirrored** in F. Yes. |
| SL-9 | 2026 to 2027 | Postgraduate Loan, monthly earnings £2,083 | "Deduct the ‘pay period threshold’ of £1,750"; "The excess is £333"; "Multiply £333 by 0.06"; "Round down £19.98 to the nearest £"; "The £19.00 PGL deduction" | Same page | **Mirrored** in F. Yes. |
| SL-10 | 2026 to 2027 | Plan 1, earnings £2,050 for a 25-day pay period | "25 × £26,900 ÷ 365 = £1,842.46 after rounding"; "£2,050 - £1,842.46 = £207.54"; "Multiply excess by 0.09 = £18.67"; "Round down to nearest £"; "The amount of Student Loan deduction of £18" | Same page | Only if odd pay periods are modelled. |
| SL-11 | 2026 to 2027 | Postgraduate Loan, earnings £1,998 for a 25-day pay period | "25 × £21,000 ÷ 365 = £1,438.35 after rounding"; "£1,998 - £1,438.35 = £559.65"; "Multiply excess by 0.06 = £33.57"; "The amount of PGL deduction of £33" | Same page | Only if odd pay periods are modelled. |

## Annual allowance taper

| # | Year | Inputs | Published result | Source | Mirror in F? |
|---|---|---|---|---|---|
| AA-1 | 2016-17 to 2019-20 figures ("The standard annual allowance is £40,000"; taper above £150,000; minimum £10,000) | Adjusted income £160,000 | "a reduced annual allowance of £35,000" | PTM057200, https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm057200 | Yes, with those figures as test inputs (method only). |
| AA-2 | Same | Adjusted income £215,000 | "a reduced annual allowance of £10,000" ("would have been reduced to £7,500") | Same page | Yes (minimum floor). |
| AA-3 | Same | Adjusted income £177,979 | "a reduced annual allowance of £26,011"; "One half of £27,979 is £13989.50 ... rounded down to the nearest £1 which is £13,989" | Same page | Yes (rounding). |
| AA-4 | Not tied to a year's limits | Jon: salary £112,000, net pay contributions £14,000, self-employed profit £44,000, £360 a month relief at source, £600 taxable savings, £1,900 dividends | Net income "£144,500"; relief at source gross "£450 per month", "£5,400"; threshold income "£139,100"; adjusted income running total "£158,500" after adding net pay contributions (the page continues with the defined benefit input amount) | Same page | Partly: threshold income and the net pay step. |

## High Income Child Benefit Charge

| # | Year | Inputs | Published result | Source | Mirror in F? |
|---|---|---|---|---|---|
| HICBC-1 | 2024 to 2025 onwards rule | Income £68,000; Child Benefit for one child £1,331.20 for the year | "£68,000 - £60,000 - £8,000 / 200 = 40%"; "The HICBC will be 40% of £1,331.20, which is equal to £453" | PAYE14015, https://www.gov.uk/hmrc-internal-manuals/paye-manual/paye14015 | **No: inconsistent as published** (£453 is not 40% of £1,331.20). OPEN O4. |
| HICBC-2 | 2023 to 2024 and earlier rule (1% per £100 over £50,000) | Income £54,000; Child Benefit for two children £1,752 | "£54,000 - £50,000 = £4,000 / 100 = 40%"; "40% of £1,752, which is equal to £700" | Same page | Method only, with those figures as test inputs, after the owner confirms the rounding (O4). |

## Adjusted net income

| # | Year | Inputs | Published result | Source | Mirror in F? |
|---|---|---|---|---|---|
| ANI-1 | Not tied to a year | Bill: self-employment £85,000, property £20,000, bank interest £10,000; pension contributions without tax relief £10,000 | "Bill’s net income is £105,000"; "this is his adjusted net income" | Personal Allowances: adjusted net income, https://www.gov.uk/guidance/adjusted-net-income | Yes (other income is simplified in Phase 1). |
| ANI-2 | Not tied to a year | Clara: employment £65,000, bank interest £5,000; pension contributions without tax relief £4,750; Gift Aid £1,000 | "Her net income is £65,250"; "She can take £1,250 off"; "Clara’s adjusted net income is £64,000" | Same page | Partly (Gift Aid is not an input). |

## Pension tax relief and childcare (method illustrations)

| # | Year | Inputs | Published result | Source | Mirror in F? |
|---|---|---|---|---|---|
| PR-1 | 2024 to 2025 | Earnings £60,270; £12,000 paid into a relief at source scheme | "You can claim an extra 20% tax relief on £10,000 (the same amount you paid 40% tax on)"; "You do not get additional relief on the remaining £2,000" | Tax on your private pension contributions: Tax relief, https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief | Only once O9 is settled; with 2024 to 2025 figures as test inputs. |
| CC-1 | Current | Childcare bill £250 (Tax-Free Childcare) | "You pay £200 into your childcare account (80% of the bill). The government adds £50 (20% of the bill)." | Tax-Free Childcare, https://www.gov.uk/tax-free-childcare | No (Sumyard tests eligibility only). |
| CC-2 | Current | Aged 21 or over, no regular income, earning £10,574.72 a year | "You’re eligible ... This is the same as earning £2,643.68 every 3 months on average." | Free Childcare for Working Parents: Check if you're eligible, https://www.gov.uk/free-childcare-if-working/check-youre-eligible | Only if minimum earnings are modelled (O7). |

## Mirrored in session F

`src/calculators/optimiser/published.test.ts` mirrors NI-1, SL-1, SL-2, SL-3, SL-5, SL-6, SL-7, SL-8, SL-9, IT-1, IT-2 and PA-1, each citing its page. Per-period examples pass in the example's own weekly or monthly thresholds (quoted from the same page) in place of the annual ones; SL-6 runs on the 2026-27 config as is. Not mirrored: SL-4 and HICBC-1 (inconsistent as published), SL-10 and SL-11 (odd pay periods, not modelled), and the annual allowance, HICBC, adjusted net income, pension relief and childcare examples (session G).

## HMRC cross-check harness

`docs/hmrc-cross-checks.json` holds 72 input cases derived from the verified 2026-27 config: taper start less £1, at the start, plus £1, the zone's midpoint, the zero point and £10,000 above it; for rUK and Scotland; with no student loan and with each plan alone (1, 2, 4, 5, postgraduate). Every expected result is `null`, so `crossChecks.test.ts` lists each case as a todo. The owner fills them from HMRC's own online calculators (pounds strings, the calculator's www.gov.uk page and the date checked); a filled case is then compared with the engine, within the file's `tolerancePence` (0 now). The test fails if the cases drift from the config.

## Gaps for the owner's cross-checks

- **Personal allowance taper and income tax:** no published numeric example found. Suggested: HMRC's "Estimate your Income Tax for the current year" at a few incomes either side of the taper, in England and Scotland.
- **HICBC:** HMRC's Child Benefit tax calculator at incomes such as just over the threshold, mid-band with a part of £200, and above the full-charge point.
- **Annual allowance with 2026 to 2027 limits:** HMRC's annual allowance calculator.
- **National Insurance monthly:** an HMRC calculator or a payslip, once O1 is decided.
