# Optimiser: core tax engine

Status: **internal** (slice 1a, session F, 0.6.0). Pure functions only: no page, no registry entry, nothing a user can see yet. Session G adds pensions, adjusted net income, the High Income Child Benefit Charge, the annual allowance, the childcare check and `optimise()`; slice 1b adds the page. This file feeds the calculator's Help topic later, so it holds no tax figures: they are in `src/config/tax/<year>.ts`, with sources in `docs/verification-log.md`.

## What it does

Take-home pay for one tax year of employment income with **no pension**, in integer pence (`src/lib/money.ts`):

| Function | In | Out |
|---|---|---|
| `personalAllowance(income, config, policy)` | An income figure (gross pay here; adjusted net income in session G) | The allowance after the taper, the reduction, the policy used |
| `incomeTax(income, region, config, policy)` | Income, `'rUK'` or `'scotland'` | Allowance, taxable income, each band's income and tax, total |
| `employeeNI(niablePay, config)` | A year's NI-able pay | Main-rate and additional-rate slices, total |
| `studentLoan(plans, pay, config)` | Plans held (`plan1`, `plan2`, `plan4`, `plan5`, `postgraduate`) and pay | Each repayment with its threshold, rate and basis, total |
| `takeHome(inputs, config, policy)` | `TaxInputs`: gross pay, region, plans | Gross, income tax, NI, student loan and net, annual, monthly and weekly, plus the breakdowns and an assumptions list |

`ModellingPolicy` holds the choices the rules leave open; `DEFAULT_POLICY` is `{ taperRounding: 'exact' }`. Types are in `types.ts`.

Every tax value is read through `requireVerified`. If any value a function needs is unverified, it returns the typed `Refusal` (the tax year and every unverified path) and no result. A negative amount throws `EngineInputError`; an amount that is not a safe whole number of pence throws `MoneyError`; an unknown region, plan or policy throws `EngineInputError`.

## Assumptions

Decisions D1 to D7 in `docs/modelling-decisions.md`. In short:

- **Estimates.** Every result is marked as an estimate and carries `assumptions`, plain-language strings for the UI to show.
- **Annual model.** National Insurance and student loans are worked out on the year's pay with the annual thresholds. **Payroll works per pay period**, with weekly or monthly thresholds and rounding in each period, so a monthly payslip can differ from a twelfth of these figures, and a month with a large bonus can differ a lot (more NI at the additional rate that month, a student loan deduction in a month even if the year is under the threshold, and so on). The monthly and weekly views are the annual figures divided evenly, labelled as such, not payslip figures.
- **Marginal bands.** Each band's rate applies to taxable income above the band's start. The personal allowance comes off first.
- **Personal allowance taper.** The published rule, on the income passed in. With no pension contributions, Gift Aid or other reliefs, `takeHome` uses gross pay as adjusted net income. Odd amounts: `taperRounding: 'exact'` (default) keeps the exact reduction; `'wholePoundsDown'` rounds it down to a whole pound. They differ by less than a pound of allowance.
- **Rounding.** No intermediate rounding. Each band's tax and each NI rate's contribution to the nearest penny; each student loan repayment rounded down to a whole pound; totals are sums of the rounded parts (`docs/money.md`, "Decided rounding").
- **Student loans.** On NI-able pay (gross pay here), as HMRC's deduction tables say (the same gross pay as for the employer's secondary Class 1 NICs). With more than one undergraduate plan, one repayment at the lowest threshold of the plans held; a postgraduate loan is repaid on top; each rounded down on its own.
- **Region.** rUK (England, Wales and Northern Ireland) or Scotland bands. Scottish rates apply to a Scottish taxpayer; the engine takes the region as given.
- **Scope.** Employment income only. The standard Personal Allowance only. National Insurance category A, employee contributions only.

## Limitations (not modelled)

- Per-pay-period payroll: weekly or monthly thresholds, cumulative tax codes, week 1 / month 1, bonus months, mid-year starts and leavers, refunds of over-deducted student loan.
- Pensions (all three methods), salary sacrifice, adjusted net income beyond gross pay, Gift Aid: session G.
- The High Income Child Benefit Charge, the annual allowance and childcare eligibility: session G.
- Savings, dividends, property, self-employment and other income; benefits in kind; Marriage Allowance, Blind Person's Allowance and other allowances; tax codes; Welsh rates beyond what the config holds; other NI category letters; employer NI.
- How a student loan repayment is split between plans.
- Any tax year other than the one passed in.

## Sources

The config's sources are in `docs/verification-log.md`. The rules applied here:

- Bands and allowance: Income Tax rates and Personal Allowances, https://www.gov.uk/income-tax-rates; HMRC Income Tax rates and allowances for current and previous tax years, https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past; Income Tax in Scotland, https://www.gov.uk/scottish-income-tax.
- National Insurance: Rates and thresholds for employers 2026 to 2027, https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027; NIM11002 (rounding), https://www.gov.uk/hmrc-internal-manuals/national-insurance-manual/nim11002.
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

Expected values come from the config through `fixtures/reference.ts`, an independent implementation for tests only, or from the cited published examples (`docs/worked-examples.md`).
