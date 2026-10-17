# Verification log

One row for every tax config value Sumyard holds: where it came from, when it was read, and the line it came from. A value enters `src/config/tax/<year>.ts` as a verified leaf only with a row here, in the same PR (see `CLAUDE.md` > Workflow). `src/config/tax/verification.test.ts` reads the **Values** table below and fails if it and the config disagree: one row per value, the same status, URL and date, and the same verified count per group as the Tax data screen.

Rules for every row:

- Sources are `https://www.gov.uk/` pages, fetched and read in the session that verified the value. Another site, such as legislation.gov.uk, needs an owner decision on the build's URL allowlist first (`docs/privacy.md`).
- The page must show the value for this tax year (a column or heading naming it, or a statement that it applies to it). Where a page only says "the current tax year", the row says so.
- Where two GOV.UK pages give the value, both are read; if they disagree the value stays `todo` and the conflict is logged.
- Status is `verified`, `todo` or `OPEN` (a question about how the value is applied, which the engine needs answered; the value itself may still be verified).
- Amounts are shown as the sources print them. In the config, money is integer pence and rates are exact ratios (`docs/money.md`).

## 2026-27

Checked by Claude in slice 1a session E, from pages fetched on 17 October 2026. Owner spot-check pending (the PR lists the riskiest values first).

### Summary

| Group | Verified | Todo |
|---|---|---|
| period | 0 | 2 |
| personal-allowance | 0 | 3 |
| income-tax-ruk | 0 | 1 |
| income-tax-scotland | 0 | 1 |
| ni-employee | 0 | 4 |
| ni-employer | 0 | 2 |
| student-loans | 0 | 10 |
| pension | 0 | 8 |
| child-benefit | 0 | 5 |
| childcare | 0 | 2 |
| **All** | **0** | **38** |

### OPEN questions

Questions about how a published figure is applied. None of them blocks a value from being verified; each blocks the engine step named, which session F raises with the owner before writing it.

- **O1. National Insurance: annual or per pay period.** The config holds the annual thresholds HMRC publishes for employers (Rates and thresholds for employers 2026 to 2027). Payroll applies weekly or monthly thresholds to each pay period (the HMRC rates page and the employers page give "£242 per week", "£1,048 per month" for the primary threshold), and twelve monthly thresholds are not the annual figure. Engine step: `employeeNI`. Decide whether Sumyard models a year of equal monthly pay (then monthly thresholds need their own leaves, one config change) or an annual approximation (then the result is labelled as one). The exact percentage method rounds per pay period (`docs/money.md`).
- **O2. Student loans: which pay figure, and per period or per year.** HMRC's 2026 to 2027 deduction tables say "The figure to use is the same gross pay amount that you would use to calculate your employer’s secondary Class 1 National Insurance contributions", and CSLM16030 says "the earnings figure as would be calculated for employer’s secondary Class 1 NICs. (Not income liable to tax)". The GOV.UK guide says "the amount you earn (including things like bonuses and overtime) before tax and other deductions". What this means for each pension method (salary sacrifice, net pay, relief at source) is not stated on the pages read; confirm before the engine encodes it. Deductions are per pay period and non-cumulative, with a refund if the year's income is under the yearly threshold (GOV.UK guide); Self Assessment uses the year's income. Engine step: `studentLoan`.
- **O3. Band boundaries.** HMRC prints bands in whole pounds ("Up to £37,700", "£37,701 to £125,140"). The config stores each band's `from` as the previous band's published upper limit and the engine is to apply a band's rate to income above it, so pence between £37,700 and £37,701 are taxed at the higher rate. Confirm. The HMRC rates page also prints the top band as "Over £125,141" where its own higher band ends at £125,140 and three other pages say "over" or "above £125,140". Engine step: `incomeTax`.
- **O4. HICBC: partial £200 and rounding.** GOV.UK: "1% of your Child Benefit for every £200 you earn over £60,000"; PAYE14015: "for each £200 of income which falls between £60,000 and £80,000". Whether a part of £200 counts, and how the charge is rounded, is not stated on the pages read. PAYE14015's 2024-25 example gives "40% of £1,331.20" as "£453", which is not 40% of £1,331.20; its 2023-24 example gives 40% of £1,752 as "£700". Do not mirror either as a test until the owner checks them against HMRC's Child Benefit tax calculator. Engine step: `hicbc`.
- **O5. Personal allowance taper: odd pounds and pence.** "£1 for every £2" over £100,000; how half a pound (or pence) of excess is handled is not stated on the pages read. Engine step: `incomeTax`.
- **O6. Income tax rounding.** No rounding rule for income tax was found on a reachable www.gov.uk page; HMRC's tax tables (a PDF on assets.publishing.service.gov.uk) could not be fetched from this environment. Engine step: `incomeTax`.
- **O7. Childcare conditions beyond the income limit.** Both schemes test each partner's "expected adjusted net income ... for the current tax year" (over £100,000 is ineligible) and require minimum expected earnings over the next 3 months (£2,643.68 for 21 and over, £2,256.80 for 18 to 20, £1,664 under 18 or an apprentice). The schema holds only the income limit. Free Childcare for Working Parents is England only. Decide whether the optimiser models the minimum earnings and the region. Engine step: childcare cliff warnings.
- **O8. Child Benefit for a year.** Rates are weekly. HMRC's PAYE Manual (PAYE130030) counts full weeks of entitlement and multiplies by the weekly rate. How many weeks the optimiser assumes for 2026 to 2027 is not stated on the pages read. Engine step: `hicbc`.
- **O9. Relief at source and higher-rate relief.** GOV.UK describes higher-rate relief as a Self Assessment claim ("20% up to the amount of any income you have paid 40% tax on"; Scotland 1%, 22%, 25% and 28% at 21%, 42%, 45% and 48%), and adjusted net income deducts the grossed-up contribution ("for every £1 of pension contribution you made, take £1.25"). Whether the engine models this as a claim or as a basic-rate band extension, and the order of the ANI steps for salary sacrifice and net pay (not stated on the ANI page), need confirming. Engine step: `pensionContribution`, `adjustedNetIncome`.

### Values

| Group | Path | Value | Page title | URL | Read on | Quote | Second source | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| period | `period.start` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| period | `period.end` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| personal-allowance | `incomeTax.personalAllowance` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| personal-allowance | `incomeTax.taperStart` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| personal-allowance | `incomeTax.taperRate` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| income-tax-ruk | `incomeTax.bands.rUK` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| income-tax-scotland | `incomeTax.bands.scotland` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| ni-employee | `nationalInsurance.employee.primaryThreshold` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| ni-employee | `nationalInsurance.employee.upperEarningsLimit` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| ni-employee | `nationalInsurance.employee.mainRate` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| ni-employee | `nationalInsurance.employee.additionalRate` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| ni-employer | `nationalInsurance.employer.secondaryThreshold` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| ni-employer | `nationalInsurance.employer.rate` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| student-loans | `studentLoans.plan1.threshold` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| student-loans | `studentLoans.plan1.rate` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| student-loans | `studentLoans.plan2.threshold` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| student-loans | `studentLoans.plan2.rate` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| student-loans | `studentLoans.plan4.threshold` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| student-loans | `studentLoans.plan4.rate` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| student-loans | `studentLoans.plan5.threshold` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| student-loans | `studentLoans.plan5.rate` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| student-loans | `studentLoans.postgraduate.threshold` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| student-loans | `studentLoans.postgraduate.rate` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| pension | `pension.annualAllowance` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| pension | `pension.taper.thresholdIncome` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| pension | `pension.taper.adjustedIncome` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| pension | `pension.taper.minimumAllowance` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| pension | `pension.taper.reductionRate` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| pension | `pension.carryForward.yearsBack` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| pension | `pension.moneyPurchaseAnnualAllowance` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| pension | `pension.reliefAtSourceRate` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| child-benefit | `childBenefit.weeklyRates.eldestOrOnly` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| child-benefit | `childBenefit.weeklyRates.additionalChild` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| child-benefit | `childBenefit.hicbc.threshold` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| child-benefit | `childBenefit.hicbc.fullChargeAt` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| child-benefit | `childBenefit.hicbc.incomePerPercent` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| childcare | `childcare.taxFreeChildcare.incomeLimit` | — | — | — | — | — | — | todo | Not yet checked in session E. |
| childcare | `childcare.thirtyHours.incomeLimit` | — | — | — | — | — | — | todo | Not yet checked in session E. |

### Published but not stored

Figures read in session E that the schema does not hold. None is used by Sumyard.

| Item | As published | Source | Why not stored |
|---|---|---|---|
| Personal allowance zero point | "your allowance is zero if your income is £125,140 or above" | Income Tax rates and Personal Allowances, https://www.gov.uk/income-tax-rates | Stated, but it follows from the allowance, taper start and taper rate; the engine works it out. The HMRC rates page only says "It can go down to zero". |
| Weekly and monthly NI thresholds | PT £242 / £1,048; UEL £967 / £4,189; ST £96 / £417; LEL £129 / £559 (£6,708 a year) | Rates and allowances: National Insurance contributions; Rates and thresholds for employers 2026 to 2027 | Depends on O1. |
| Student loan pay period thresholds | For example Plan 1 £517.30 a week, £2,241.66 a month | 2026 to 2027 Student and Postgraduate Loan deduction tables | Depends on O2. The GOV.UK guide prints them in whole pounds (£517, £2,241). |
| Starting rate for savings | 0% on up to £5,000 | Income Tax rates and allowances for current and previous tax years | Savings income is out of scope (reserved slot). |
| Dividend rates 2026 to 2027 | 10.75%, 35.75%, 39.35%; allowance £500 | Same page; Budget 2025 OOTLAR Annex A | Dividends are out of scope (reserved slot). Budget 2025 raised the first two from 6 April 2026. |
| Alternative annual allowance | £50,000 | Pension schemes rates | Only after flexible access; not modelled. |
| Tax-Free Childcare top-up | £2 for every £8; up to £500 every 3 months (£2,000 a year) per child | Tax-Free Childcare, https://www.gov.uk/tax-free-childcare | The optimiser tests eligibility only. |
| Childcare minimum earnings | See O7 | Both eligibility pages | O7. |
| Other NI category letters | B, C, D, E, F, H, I, J, K, L, M, N, S, V, Z | National Insurance rates and categories | Standard employee (category A) only. |

### Informational, not modelled

**Salary sacrifice and National Insurance from April 2029.** Status per GOV.UK on 17 October 2026: announced at Budget 2025; not yet in force; not shown as legislated.

- HM Treasury, "Changes to salary sacrifice for pensions from April 2029" (published 26 November 2025), https://www.gov.uk/government/publications/changes-to-salary-sacrifice-for-pensions-from-april-2029/changes-to-salary-sacrifice-for-pensions-from-april-2029: "From April 2029, only the first £2,000 of employee pension contributions through salary sacrifice each year will be exempt from NICs." Employer contributions stay free of NICs; Income Tax treatment unchanged; "Further guidance will be published on GOV.UK before April 2029."
- Budget 2025 OOTLAR, 2.9 (updated 5 December 2025), https://www.gov.uk/government/publications/budget-2025-overview-of-tax-legislation-and-rates-ootlar/budget-2025-overview-of-tax-legislation-and-rates-ootlar: "The changes will be introduced through primary and secondary legislation in due course, and will take effect from 6 April 2029."
- Effect on 2026 to 2027: none. Tagged **informational, not modelled**: no config leaf, no engine logic. A later tax year that includes April 2029 would need it.

### Budget check

- The latest Budget on GOV.UK is **Budget 2025** (26 November 2025); no 2026 Budget or Statement topical event existed on GOV.UK on 17 October 2026. Whether one is scheduled was not checked.
- Budget 2025's tax documents (OOTLAR, Annex A) give 2026 to 2027 rates that match every 2026 to 2027 value above that they cover (rUK bands and rates, personal allowance and taper, NI weekly thresholds and rates). OOTLAR says the 2026 to 2027 income tax charge and rates "will" be set in Finance Bill 2025-26. HMRC's rates pages, updated 6 April 2026, present the same figures as the 2026 to 2027 rates. **Not verified:** that Finance Bill 2025-26 received Royal Assent; no GOV.UK page read in this session says so.
- Announced changes for later years, none affecting a 2026 to 2027 value: salary sacrifice NICs cap (April 2029, above); separate property income rates (from 2027 to 2028); reliefs ordering (from 6 April 2027); personal allowance, basic rate limit, NI primary threshold and upper earnings limit kept at their current levels to 2030-31.
- Changed for 2026 to 2027 by Budget 2025 but out of scope: dividend ordinary and upper rates; Class 2 and 3 rates; the lower earnings limit.
- If a Budget or Statement after 17 October 2026 changes a 2026 to 2027 value, that value goes back to `todo` until re-read.

### Pages that could not be read

- HMRC PDFs on `assets.publishing.service.gov.uk` (CA38 National Insurance tables 2026 to 2027, CA44 National Insurance for company directors 2026 to 2027, Taxable pay tables B to D 2026 to 2027): the request was refused by this environment's network proxy (HTTP 403). They would cover NI rounding by table, directors' annual earnings periods and income tax rounding in PAYE. Their GOV.UK publication pages were read.
- legislation.gov.uk and gov.scot were not consulted (source rules).
