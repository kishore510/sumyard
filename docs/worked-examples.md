# Worked examples

Examples that GOV.UK and HMRC publish for the rules Sumyard models, copied as published: inputs, the published result and the page. **None is computed or invented here.** Session F mirrors the usable ones as engine tests (CLAUDE.md > Accuracy rules); the owner adds further cross-checks from HMRC's own calculators.

Collected in slice 1a session E from pages read on 17 October 2026. Each example says which tax year its figures belong to. Where that is not 2026 to 2027, the example tests the method with that year's figures passed in as test inputs (a fake config), never as 2026 to 2027 values. Two published examples are internally inconsistent; they are listed so nobody mirrors them by mistake.

**Count:** 23 published examples collected in session E, plus 3 added in session F for income tax (IT-1, IT-2, PA-1), plus 5 added in session G1 (PEN-1, PEN-2, PEN-3, ANI-3, HICBC-3), plus 6 added in session G2 (CF-1, AAC-1, AAC-2, AAC-3, CB-1, CC-3; AA-1 to AA-4 were collected in E and are now mirrored). 5 are stated for 2026 to 2027 and 7 more use current thresholds that match 2026 to 2027; the rest illustrate a method with another year's figures. More than five in total, but the **personal allowance taper has no published numeric example** on the pages read, and both HICBC examples need the owner's check (O4). The owner's HMRC-calculator cross-checks fill those gaps.

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
| AA-1 | 2016-17 to 2019-20 figures ("The standard annual allowance is £40,000"; taper above £150,000; minimum £10,000) | Adjusted income £160,000 | "a reduced annual allowance of £35,000" | PTM057200, https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm057200 | **Mirrored in G2**, with those figures as test inputs (method only). |
| AA-2 | Same | Adjusted income £215,000 | "a reduced annual allowance of £10,000" ("would have been reduced to £7,500") | Same page | **Mirrored in G2** (minimum floor). |
| AA-3 | Same | Adjusted income £177,979 | "a reduced annual allowance of £26,011"; "One half of £27,979 is £13989.50 ... rounded down to the nearest £1 which is £13,989" | Same page | **Mirrored in G2** (rounding). |
| AA-4 | Not tied to a year's limits | Jon: salary £112,000, net pay contributions £14,000, self-employed profit £44,000, £360 a month relief at source, £600 taxable savings, £1,900 dividends | Net income "£144,500"; relief at source gross "£450 per month", "£5,400"; threshold income "£139,100"; adjusted income running total "£158,500" after adding net pay contributions (the page continues with the defined benefit input amount) | Same page | **Mirrored in G2, partly** (AA-4a, AA-4b): each step on its own, with the published net income standing in as employment pay (the engine takes employment income and one pension method). |

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
| PR-1 | 2024 to 2025 | Earnings £60,270; £12,000 paid into a relief at source scheme | "You can claim an extra 20% tax relief on £10,000 (the same amount you paid 40% tax on)"; "You do not get additional relief on the remaining £2,000" | Tax on your private pension contributions: Tax relief, https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief | **Mirrored in G1** (decision G2), with the 2026-27 config standing in as for IT-2. The £12,000 is read as the total going in (the "remaining £2,000" is £12,000 less £10,000). |
| CC-1 | Current | Childcare bill £250 (Tax-Free Childcare) | "You pay £200 into your childcare account (80% of the bill). The government adds £50 (20% of the bill)." | Tax-Free Childcare, https://www.gov.uk/tax-free-childcare | No (Sumyard tests eligibility only). |
| CC-2 | Current | Aged 21 or over, no regular income, earning £10,574.72 a year | "You’re eligible ... This is the same as earning £2,643.68 every 3 months on average." | Free Childcare for Working Parents: Check if you're eligible, https://www.gov.uk/free-childcare-if-working/check-youre-eligible | Only if minimum earnings are modelled (O7). |

## Pension relief, adjusted net income and HICBC (added in session G1)

Read on 17 October 2026.

| # | Year | Inputs | Published result | Source | Mirrored? |
|---|---|---|---|---|---|
| PEN-1 | Not tied to a year's limits (the relief at source rates of the time) | A total contribution of £1,000 by a higher rate (40%) taxpayer | "The member deducts and retains £200 and pays £800 to the pension scheme. The pension scheme claims £200 from HMRC. The total contribution is £1,000. The member is a higher rate taxpayer (40%) and claims the extra £200 (40% - 20% already claimed by pension scheme)" | PTM044220, https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm044220 | **Yes** (gross-up, provider relief, and the extra relief from the band extension at a higher-rate pay). |
| PEN-2 | As PEN-1 | A higher rate taxpayer wanting £100 in the scheme | "They have paid net contributions of £80"; "the extra tax relief due to them will be £20 (40% less 20%)" | Same page | **Yes.** |
| PEN-3 | Not tied to a year (AA-4's relief at source step) | £360 a month relief at source | "£450 per month"; "£5,400" a year | PTM057200, https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm057200 | **Yes** (gross-up only). |
| ANI-3 | Not tied to a year | A relief at source contribution | "So, for every £1 of pension contribution you made, take £1.25 from your ‘net income’." | Personal Allowances: adjusted net income, https://www.gov.uk/guidance/adjusted-net-income | **Yes** (a stated rule). |
| HICBC-3 | 2024 to 2025 onwards | Income over the threshold | "You’ll pay back 1% of your Child Benefit for every £200 you earn over £60,000."; "If you earn over £80,000 you’ll pay it all back." | High Income Child Benefit Charge, https://www.gov.uk/child-benefit-tax-charge | **Yes** (a stated rule, whole steps per G1). |

Still not mirrored: HICBC-1 (inconsistent as published) and HICBC-2 (the 2023 to 2024 rule; it prints £700 for 40% of £1,752, whole pounds, where decision G1 rounds to the nearest penny); ANI-1 and ANI-2 (self-employment, property, savings income, Gift Aid and gross contributions are not inputs); the annual allowance examples (mirrored in session G2). No GOV.UK page read gives a worked example of the student loan base under a pension method, or of salary sacrifice with figures for 2026 to 2027 (the salary sacrifice guide's examples are weekly childcare vouchers and a bonus, not tied to a year).

## Annual allowance, carry forward, the charge, Child Benefit and childcare (added in session G2)

Read on 17 October 2026.

| # | Year | Inputs | Published result | Source | Mirrored? |
|---|---|---|---|---|---|
| CF-1 | 2014-15 (annual allowance £40,000; earlier years' unused amounts given) | Total pension input amount £65,000; unused 2013-14 £15,000, 2012-13 £20,000, 2011-12 £27,000 | "available annual allowance of £102,000"; "used up the £40,000 annual allowance for the current tax year and £25,000 worth of the unused annual allowance from three years ago"; "she still has £2,000 unused annual allowance from three years ago" | PTM055100 (example 9), https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm055100 | **Yes**, with the example's allowance as a test input. |
| AAC-1 | Not tied to a year's limits | Excess £30,000; reduced net income £140,000; basic rate limit £40,000; higher rate limit £150,000 | "£20,000 @ 45 per cent = £9,000"; "£10,000 @ 40 per cent = £4,000"; "Frances’s annual allowance tax charge is £13,000" | PTM056110, https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm056110 | **Yes**, with those limits as test inputs. |
| AAC-2 | Not tied to a year's limits (limits £37,400 and £150,000) | Siva: Gift Aid lifts the limits to £38,400 and £151,000; reduced net income £112,275; £15,000 over | "taxed at 40 per cent"; "The amount of Siva’s annual allowance charge is £6,000" | PTM056130, https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm056130 | **Yes** (the Gift Aid extension passed in as the band extension). |
| AAC-3 | As AAC-2 | Alan: relief at source £40,000 gross and Gift Aid £1,000 lift the limits to £78,400 and £191,000; reduced net income £152,275; £15,000 over | "The amount of Alan’s annual allowance charge is £6,000" | Same page | **Yes.** |
| CB-1 | 2026 to 2027 ("From 6 April", published 31 March 2026) | Weekly rates | "£27.05 per week - or £1,406.60 a year - for the eldest or only child and £17.90 per week - or £930.80 a year - for each additional child" | Millions of families in line for Child Benefit rate increase (HMRC), https://www.gov.uk/government/news/millions-of-families-in-line-for-child-benefit-rate-increase | **Yes** (the default weeks give the yearly amounts; G4). |
| CC-3 | Current tax year | Expected adjusted net income | "You cannot claim if ... you or your partner’s expected adjusted net income ... is over £100,000 for the current tax year" | Tax-Free Childcare: Check if you're eligible, https://www.gov.uk/tax-free-childcare/check-if-youre-eligible | **Yes** (a stated rule: eligible at the limit, not a penny over). |

Not mirrored: Jon's full adjusted income (it needs a defined benefit pension input amount, not modelled); PTM057100's carry forward amounts under the MPAA and the taper for an earlier year (unused amounts are inputs here); the MPAA guidance has no worked figures. No GOV.UK page read gives a worked annual allowance example with 2026 to 2027 limits; HMRC's annual allowance calculator is the cross-check for that (owner).

## Mirrored in session G2

`published.test.ts` adds AA-1, AA-2, AA-3, AA-4a, AA-4b, CF-1, AAC-1, AAC-2, AAC-3, CB-1 and CC-3, each citing its page.

## Mirrored in session G1

`published.test.ts` adds PEN-1, PEN-2, PEN-3, ANI-3, PR-1 and HICBC-3, each citing its page. The properties test checks that the band extension gives the higher-rate relief the pension tax relief guide states (each band's rate less the relief-at-source rate, up to the income taxed at it).

## Mirrored in session F

`src/calculators/optimiser/published.test.ts` mirrors NI-1, SL-1, SL-2, SL-3, SL-5, SL-6, SL-7, SL-8, SL-9, IT-1, IT-2 and PA-1, each citing its page. Per-period examples pass in the example's own weekly or monthly thresholds (quoted from the same page) in place of the annual ones; SL-6 runs on the 2026-27 config as is. Not mirrored: SL-4 and HICBC-1 (inconsistent as published), SL-10 and SL-11 (odd pay periods, not modelled), and the annual allowance, HICBC, adjusted net income, pension relief and childcare examples (session G).

## Benefits in kind and post-tax deductions (session 1b-i)

No GOV.UK page read in session 1b-i prints a numeric example with a taxable benefit in kind (Tax on company benefits, the medical benefits pages, the ANI guidance, NIM13090, CSLM16030; lines in `docs/verification-log.md`, "Session 1b-i lookups"), so none is mirrored. `src/calculators/optimiser/benefits.test.ts` checks the stated rules instead, against `fixtures/reference.ts`: a benefit adds to taxable pay and adjusted net income only; a post-tax deduction moves take-home and nothing else.

## Benefits taken from pay and tax codes (0.11.0)

Mirrored in `published.test.ts`. The figures are each page's own; none is a 2026 to 2027 rate.

| Id | Year | Inputs | Published result | Source | Mirrored |
|---|---|---|---|---|---|
| BEN-1 | Not tied to a year | Medical insurance costing £500; salary of £600 given up | "The relevant amount is £600, being the greater of the cost of providing the benefit and the amount foregone" | EIM44120, https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim44120 (also 480 Appendix 12, example 1) | **Yes**, the first step. The second (£100 made good on top) is not representable: an item gives up salary or pays after tax, not both (B10). |
| BEN-2 | Not tied to a year | A workplace gym, otherwise exempt, for £300 of salary | "The cost of the benefit is treated as nil. The relevant amount is the salary foregone of £300." | Optional remuneration arrangements (480: Appendix 12), example 13, https://www.gov.uk/guidance/optional-remuneration-arrangements-480-appendix-12 | **Yes** (value entered as nothing). |
| BEN-3 | Not tied to a year | Salary £35,000; £2,000 given up for childcare vouchers | "NICs will be due only on the £33,000 cash." | NIM02330, https://www.gov.uk/hmrc-internal-manuals/national-insurance-manual/nim02330 | **Yes**, NI-able pay only (the vouchers' exemption is not modelled). |
| BEN-4 | 2021 to 2022 | A benefit of £2,500; £500 made good | "The amount of earnings chargeable to income tax is reduced to £2,000." | NIM15201, https://www.gov.uk/hmrc-internal-manuals/national-insurance-manual/nim15201 | **Yes** (after tax). |
| TC-1 | Names 2025 to 2026 | Code 1257L; pay £27,000 a year | "can earn £12,570 before being taxed"; "their taxable income is £14,430" | Understanding your employees' tax codes, https://www.gov.uk/employee-tax-codes | **Yes** (the code's allowance and the year's taxable pay to date). |
| TC-2 | Not tied to a year | A tax-free amount of £11,000 | "This would mean your tax code is 1100L." | Tax codes: What your tax code means, https://www.gov.uk/tax-codes/what-your-tax-code-means | **Yes**, read back from the code. |
| TC-3 | Names 2025 to 2026 | Code K475; salary £27,000 | "has taxable income of £31,750" | Understanding your employees' tax codes | **No** for the figure (K codes are not modelled); the code is mirrored as not modelled. |

No GOV.UK HTML page read gives a worked PAYE deduction for a month; the tables that do (Tables B to D) are PDFs not read (O11).

## HMRC cross-check harness

`docs/hmrc-cross-checks.json` holds 72 input cases derived from the verified 2026-27 config: taper start less £1, at the start, plus £1, the zone's midpoint, the zero point and £10,000 above it; for rUK and Scotland; with no student loan and with each plan alone (1, 2, 4, 5, postgraduate). Every expected result is `null`, so `crossChecks.test.ts` lists each case as a todo. The owner fills them from HMRC's own online calculators (pounds strings, the calculator's www.gov.uk page and the date checked); a filled case is then compared with the engine, within the file's `tolerancePence` (0 now). The test fails if the cases drift from the config.

## Gaps for the owner's cross-checks

- **Pensions:** not added to `docs/hmrc-cross-checks.json` in G1 (expected values come only from HMRC's calculators, and the harness takes no pension inputs yet). Suggested: HMRC's "Estimate your Income Tax for the current year" with a pension contribution, near the taper start, in England and Scotland.

- **Personal allowance taper and income tax:** no published numeric example found. Suggested: HMRC's "Estimate your Income Tax for the current year" at a few incomes either side of the taper, in England and Scotland.
- **HICBC:** HMRC's Child Benefit tax calculator at incomes such as just over the threshold, mid-band with a part of £200, and above the full-charge point.
- **Annual allowance with 2026 to 2027 limits:** HMRC's annual allowance calculator (the engine now models the taper, carry forward, the MPAA and the charge; the harness has no annual allowance cases yet).
- **Benefits in kind:** HMRC's "Estimate your Income Tax for the current year" with a benefit entered, and the owner's own annual statement of benefits against a year of payslips (the value is not yet confirmed, decision B1).
- **National Insurance monthly:** an HMRC calculator or a payslip, once O1 is decided.
