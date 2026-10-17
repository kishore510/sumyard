# Optimiser: core tax engine

Status: **internal** (slice 1a: session F, 0.6.0; session G1, 0.7.0). Pure functions only: no page, no registry entry, nothing a user can see yet. Session G1 added pensions (three methods), adjusted net income and the High Income Child Benefit Charge; session G2 adds the annual allowance, carry forward, the childcare check and `optimise()`; slice 1b adds the page. This file feeds the calculator's Help topic later, so it holds no tax figures: they are in `src/config/tax/<year>.ts`, with sources in `docs/verification-log.md`.

## What it does

Take-home pay for one tax year of employment income, with an optional pension contribution and optional Child Benefit, in integer pence (`src/lib/money.ts`):

| Function | In | Out |
|---|---|---|
| `personalAllowance(income, config, policy)` | Adjusted net income | The allowance after the taper, the reduction, the policy used |
| `incomeTax(income, region, config, policy, pension?)` | Gross employment income, `'rUK'` or `'scotland'`, an optional `PensionInput` | Taxable pay, adjusted net income, the band extension, allowance, taxable income, each band's income and tax (with its start after any extension), total |
| `employeeNI(niablePay, config)` | A year's NI-able pay | Main-rate and additional-rate slices, total |
| `studentLoan(plans, pay, config)` | Plans held (`plan1`, `plan2`, `plan4`, `plan5`, `postgraduate`) and pay | Each repayment with its threshold, rate and basis, total |
| `pensionContribution(pension, grossPay, config)` | `{ method, contribution }` and gross pay | What comes out of pay, the provider's relief, what goes in, taxable pay, NI-able pay, the student loan base, the ANI deduction and the band extension |
| `adjustedNetIncome(grossPay, pension, config)` | Gross pay and an optional pension | Net income (step 1), the relief at source deduction (step 3), adjusted net income |
| `hicbc(ani, children, config, policy)` | Adjusted net income and `{ children, payments: 'claimed' \| 'optedOut' }` | Child Benefit due and received, whole steps, percentage charged, the charge, Child Benefit less the charge |
| `takeHome(inputs, config, policy)` | `TaxInputs`: gross pay, region, plans, optional `pension`, optional `childBenefit` | Gross, income tax, NI, student loan, pension, HICBC, net, Child Benefit and net with it, annual, monthly and weekly, plus the breakdowns and an assumptions list |

`ModellingPolicy` holds the choices the rules leave open; `DEFAULT_POLICY` is `{ taperRounding: 'exact', childBenefitWeeks: CHILD_BENEFIT_WEEKS_PER_YEAR }` (`src/lib/periods.ts`). Types are in `types.ts`.

A pension's `contribution` is what comes out of the employee's pay: the salary given up (salary sacrifice), the deduction from gross pay (net pay), or the payment before the provider's relief (relief at source). `grossPay` is always the contractual pay before any sacrifice.

Every tax value is read through `requireVerified`. If any value a function needs is unverified, it returns the typed `Refusal` (the tax year and every unverified path) and no result; the relief-at-source rate is asked for only with relief at source, and the Child Benefit values only with Child Benefit. A negative amount throws `EngineInputError`; an amount that is not a safe whole number of pence throws `MoneyError`; an unknown region, plan, policy, pension method or Child Benefit choice, a child count that is not a whole number, or a gross pension contribution above gross pay throws `EngineInputError`. A config whose bands have no single band at the relief-at-source rate throws an `Error` for relief at source (the band to extend would be a guess).

## Assumptions

Decisions D1 to D7 in `docs/modelling-decisions.md`. In short:

- **Estimates.** Every result is marked as an estimate and carries `assumptions`, plain-language strings for the UI to show.
- **Annual model.** National Insurance and student loans are worked out on the year's pay with the annual thresholds. **Payroll works per pay period**, with weekly or monthly thresholds and rounding in each period, so a monthly payslip can differ from a twelfth of these figures, and a month with a large bonus can differ a lot (more NI at the additional rate that month, a student loan deduction in a month even if the year is under the threshold, and so on). The monthly and weekly views are the annual figures divided evenly, labelled as such, not payslip figures.
- **Marginal bands.** Each band's rate applies to taxable income above the band's start. The personal allowance comes off first.
- **Personal allowance taper.** The published rule, on adjusted net income. Odd amounts: `taperRounding: 'exact'` (default, confirmed by the owner in G1) keeps the exact reduction; `'wholePoundsDown'` rounds it down to a whole pound. They differ by less than a pound of allowance.
- **Adjusted net income** (decision G2). Gross pay, less any salary sacrificed or net pay contribution (neither is taxable pay), less the relief at source contribution grossed up (the guidance's step 3). No Gift Aid or other reliefs. Kept exact, so a gross-up's part of a penny reaches the taper and the HICBC steps unrounded.
- **Pension methods** (decisions G2 and G6, from GOV.UK):
  - *Salary sacrifice:* off taxable pay, NI-able pay (so the student loan base) and ANI; the same amount goes in as an employer contribution. Any extra the employer adds, its NI saving, and the National Minimum Wage floor on a sacrifice are not modelled.
  - *Net pay arrangement:* off taxable pay and ANI; NI-able pay and the student loan base are unchanged. No relief below the Personal Allowance (the low earner's pension payment is not modelled).
  - *Relief at source:* paid from take-home pay; the provider adds relief at the relief-at-source rate (also for a non-taxpayer); taxable and NI-able pay are unchanged; ANI falls by the gross amount; every band above the basic rate band starts later by the gross amount, which gives the higher-rate relief GOV.UK states for a Self Assessment claim (the band's rate less the relief-at-source rate, up to the income taxed at it). The result shows that relief as if claimed in full. The basic rate band is the one band taxed at the relief-at-source rate (PTM044220: the basic rate, or the Scottish basic rate for a Scottish taxpayer); a Scottish starter-rate taxpayer keeps the provider's relief and pays no more.
  - A gross contribution above gross pay is refused, for every method: relief above earnings, and relief at source with no earnings, are not modelled.
- **High Income Child Benefit Charge** (decisions G1 and G4). Child Benefit is the eldest or only child's weekly rate and each other child's, for the whole year, times `policy.childBenefitWeeks`. One percentage point of the Child Benefit received for each whole step of ANI over the threshold (a part step adds nothing), all of it above the full-charge point, rounded to the nearest penny. Opted out: no Child Benefit and no charge. Worked out for this person alone (if a partner has the higher ANI, the partner pays it).
- **Take-home.** Net is gross less income tax, NI, student loan, the pension contribution out of pay and the HICBC. Child Benefit received is shown beside it, with net including it. A salary-sacrificed amount counts as out of pay.
- **Rounding.** No intermediate rounding. Each band's tax and each NI rate's contribution to the nearest penny; each student loan repayment rounded down to a whole pound; totals are sums of the rounded parts (`docs/money.md`, "Decided rounding").
- **Student loans.** On NI-able pay, as HMRC's deduction tables say (the same gross pay as for the employer's secondary Class 1 NICs): lowered by salary sacrifice, not by net pay or relief at source (G6). With more than one undergraduate plan, one repayment at the lowest threshold of the plans held; a postgraduate loan is repaid on top; each rounded down on its own.
- **Region.** rUK (England, Wales and Northern Ireland) or Scotland bands. Scottish rates apply to a Scottish taxpayer; the engine takes the region as given.
- **Scope.** Employment income only. The standard Personal Allowance only. National Insurance category A, employee contributions only. One pension contribution, by one method.
- **Child Benefit weeks (OPEN, G4).** No GOV.UK page read states the count for 2026 to 2027; PAYE130030's method reads as 52 or 53 full weeks. The default is `CHILD_BENEFIT_WEEKS_PER_YEAR` from `src/lib/periods.ts` until the owner decides.

## Limitations (not modelled)

- Per-pay-period payroll: weekly or monthly thresholds, cumulative tax codes, week 1 / month 1, bonus months, mid-year starts and leavers, refunds of over-deducted student loan.
- The annual allowance, its taper, carry forward, the MPAA and childcare eligibility: session G2. `optimise()`: session G2.
- Employer pension contributions beyond a salary sacrifice, the employer's NI saving, several pensions at once, gross contributions with a claim, Gift Aid, the low earner's pension payment, the relief-at-source no-earnings allowance, the National Minimum Wage floor, the salary sacrifice NICs change from April 2029.
- Child Benefit for part of the year, the partner who pays the charge, the charge through PAYE or Self Assessment.
- Savings, dividends, property, self-employment and other income; benefits in kind; Marriage Allowance, Blind Person's Allowance and other allowances; tax codes; Welsh rates beyond what the config holds; other NI category letters; employer NI.
- How a student loan repayment is split between plans.
- Any tax year other than the one passed in.

## Sources

The config's sources are in `docs/verification-log.md`. The rules applied here:

- Bands and allowance: Income Tax rates and Personal Allowances, https://www.gov.uk/income-tax-rates; HMRC Income Tax rates and allowances for current and previous tax years, https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past; Income Tax in Scotland, https://www.gov.uk/scottish-income-tax.
- National Insurance: Rates and thresholds for employers 2026 to 2027, https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027; NIM11002 (rounding), https://www.gov.uk/hmrc-internal-manuals/national-insurance-manual/nim11002.
- Pensions, adjusted net income and HICBC (session G1; quotes in `docs/verification-log.md`, "Session G1 lookups"): EIM42780, https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim42780; NIM02330, https://www.gov.uk/hmrc-internal-manuals/national-insurance-manual/nim02330; NIM02331, https://www.gov.uk/hmrc-internal-manuals/national-insurance-manual/nim02331; Salary sacrifice for employers, https://www.gov.uk/guidance/salary-sacrifice-and-the-effects-on-paye; PTM044230, https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm044230; PTM044220, https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm044220; CWG2 2026 to 2027, https://www.gov.uk/government/publications/cwg2-further-guide-to-paye-and-national-insurance-contributions/2026-to-2027-employer-further-guide-to-paye-and-national-insurance-contributions; Tax on your private pension contributions: Tax relief, https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief; Personal Allowances: adjusted net income, https://www.gov.uk/guidance/adjusted-net-income; High Income Child Benefit Charge, https://www.gov.uk/child-benefit-tax-charge; PAYE130030, https://www.gov.uk/hmrc-internal-manuals/paye-manual/paye130030; Student loan and postgraduate loan repayment guidance for employers, https://www.gov.uk/guidance/special-rules-for-student-loans.
- Student loans: 2026 to 2027 Student and Postgraduate Loan deduction tables, https://www.gov.uk/government/publications/sl3-student-loan-deduction-tables/2026-to-2027-student-and-postgraduate-loan-deduction-tables; CSLM16030, https://www.gov.uk/hmrc-internal-manuals/collection-of-student-loans-manual/cslm16030; Repaying your student loan: How much you repay, https://www.gov.uk/repaying-your-student-loan/what-you-pay.

## Edge cases and tests

| Case | Test |
|---|---|
| Unverified values: typed refusal per function; `takeHome` lists each needed path once; only the region and plans in use are asked for | `calc.test.ts` |
| Personal allowance: at and below the taper start, a penny either side of the start and the zero point, past the zero point, the two policies within a pound | `calc.test.ts`, `published.test.ts` (PA-1) |
| Income tax: zero up to the allowance; a penny either side of every band boundary in both regions; past the zero point (no allowance); Scotland against rUK at the same income; agreement with an independent reference across incomes, regions and policies | `calc.test.ts` |
| Marginal bands against published examples | `published.test.ts` (IT-1, IT-2) |
| NI: a penny either side of the primary threshold and the upper earnings limit; the published weekly example | `calc.test.ts`, `published.test.ts` (NI-1) |
| Student loans: each plan alone at and around its threshold; each plan with the postgraduate loan; several plans at the lowest threshold; duplicates; unknown plans; the published examples | `calc.test.ts`, `published.test.ts` (SL-1, 2, 3, 5, 6, 7, 8, 9) |
| Tax, NI and loans never negative and never falling as pay rises; take-home never negative or above gross; zero in gives zero | `properties.test.ts` |
| Taper zone: the marginal rate equals the band rate times one plus the taper rate, and is above the higher rate | `properties.test.ts` |
| Negative input, unsafe or fractional pence, the largest safe amount | `calc.test.ts` |
| The engine holds no figure: only 0, 1, 2 and 100 in code, no figure in its comments or strings | `literals.test.ts` |
| HMRC calculator cross-checks (pending until the owner fills them) | `crossChecks.test.ts`, `docs/hmrc-cross-checks.json` |
| Pensions: each method's effect on taxable pay, NI-able pay, the student loan base and ANI; zero contributions; refusals; contributions above earnings (each method, a penny over); negative, unsafe and unknown inputs | `pensions.test.ts` |
| The taper a penny either side of its start on ANI, for each method; net pay and salary sacrifice equal to tax on the lower pay; relief at source against the reference; bands moved up above the basic rate band in each region; a config with no band at the relief-at-source rate | `pensions.test.ts` |
| Net pay against relief at source for a non-taxpayer and for a taper-zone earner; Scotland's starter rate; Scotland against rUK; salary sacrifice against net pay | `pensions.test.ts` |
| Published examples: PEN-1, PEN-2, PEN-3, ANI-3, PR-1, HICBC-3 | `published.test.ts` |
| HICBC: a penny either side of the threshold, a step and the full-charge point; families of zero to six; opted out; weeks from the policy; exact ANI (a quarter penny under a step); refusals; bad inputs; take-home with Child Benefit | `hicbc.test.ts` |
| Tax and NI never negative; take-home rising by no more than gross; never falling for rises of a hundred pounds or more without Child Benefit (a penny more can cost a pound of student loan); HICBC never above Child Benefit; salary sacrifice never costing more than the amount sacrificed; the band extension equal to GOV.UK's claim rates; relief at source never behind net pay for the same amount in; the engine against the reference on random inputs | `properties.test.ts` |

Expected values come from the config through `fixtures/reference.ts`, an independent implementation for tests only, or from the cited published examples (`docs/worked-examples.md`).
