# Modelling decisions

How Sumyard applies the published tax rules where GOV.UK leaves a choice, or where Sumyard simplifies on purpose. The decisions are the owner's, given at the start of slice 1a session F (17 October 2026) in answer to the OPEN questions in `docs/verification-log.md`. Each names the questions it answers and the code that carries it out. A GOV.UK page that contradicts a decision wins: the session that finds one stops and reports it.

Figures are not repeated here. They live in `src/config/tax/<year>.ts`, with sources in `docs/verification-log.md`.

## Core tax engine (session F)

Code: `src/calculators/optimiser/calc.ts`. Tests: the same folder. User-facing summary: `src/calculators/optimiser/README.md`.

### D1. Annual model (answers O1)

National Insurance is worked out per year from the annual thresholds in the config. Payroll works per pay period, with weekly or monthly thresholds and rounding in each period, so monthly payslips, and months with a large bonus, can differ from a twelfth of the annual figure. The README and every result's assumptions list say so. Student loans follow the same annual model (D5).

### D2. Marginal bands (answers O3)

A band's rate applies to taxable income (income after allowances) above the band's start, up to the next band's start. The config stores each start as the previous band's published upper limit, so pence between a printed upper limit and the next printed lower limit (whole pounds) take the higher rate. Confirmed against two published examples, mirrored in `published.test.ts`:

- IT-1 (`docs/worked-examples.md`), Tax on dividends, https://www.gov.uk/tax-on-dividends, 2026 to 2027: wages after the Personal Allowance are taxed in the basic rate band alone.
- IT-2, Tax on your private pension contributions: Tax relief, https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief, 2024 to 2025: the amount the page says you paid higher rate tax on is only the income above the higher rate’s start. HMRC's rates page shows the same allowance and bands for 2024 to 2025 as for 2026 to 2027, so the test uses the 2026-27 config.

### D3. Rounding (answers O6, and settles the steps `docs/money.md` lists as not stated)

- Where `docs/money.md` gives a stated rule, it is used: National Insurance to the nearest penny (NIM11002); student loan repayments rounded down to a whole pound (SL3 2026 to 2027).
- Everywhere else: no intermediate rounding. Amounts stay exact, fractions of a penny included (`ExactPence` in `src/lib/money.ts`), and each output component is rounded once to the nearest penny (`mulRound` or `roundExact`, `nearest`). In the engine the components are: each band's taxable income and tax, the personal allowance and taxable income shown, each NI rate's contribution, and each monthly or weekly figure.
- Totals are sums of the rounded components, so a breakdown always adds up to its total.

### D4. Personal allowance taper (answers O5)

The published rule: the allowance falls by the taper rate on the income over the taper start, never below nothing. How an odd pound or a penny of excess is settled is a named option, `ModellingPolicy.taperRounding`:

- `exact` (the default): the reduction is exactly the taper rate times the excess, fractions of a penny kept until output (D3).
- `wholePoundsDown`: the reduction is rounded down to a whole pound. This mirrors the rounding PTM057100 states for the annual allowance taper; GOV.UK states none for the personal allowance.

The two differ by less than £1 of allowance; `calc.test.ts` checks this. In session F the taper takes an income figure as input (gross pay in `takeHome`); session G passes adjusted net income.

### D5. Student loans: what pay, and how plans combine (answers O2)

- **Base:** NI-able pay. Checked in session F against GOV.UK before coding: HMRC's 2026 to 2027 deduction tables (SL3) say "The figure to use is the same gross pay amount that you would use to calculate your employer’s secondary Class 1 National Insurance contributions", and CSLM16030 says "the earnings figure as would be calculated for employer’s secondary Class 1 NICs. (Not income liable to tax)". NIM01001 describes Class 1 as one earnings-related charge with a primary (employee) and a secondary (employer) element, payable on the employment's earnings. With employment income only and no pension or benefits in kind (session F's scope) that figure is gross pay, so the decision matches. `studentLoan` takes the pay figure as a parameter and `takeHome` passes NI-able pay. Whether a pension method changes the figure (salary sacrifice, net pay, relief at source) is session G's to confirm on GOV.UK.
- **Combining plans** (Repaying your student loan: How much you repay, https://www.gov.uk/repaying-your-student-loan/what-you-pay): with more than one plan type and no postgraduate loan, you repay the plan rate on income over the lowest threshold of the plan types you have, as a single repayment ("You’ll only have a single repayment taken each time you get paid"); with a postgraduate loan, you repay its rate over its threshold as well as the plan rate over the lowest plan threshold (the page's "If you’re on more than one plan type" sections; examples SL-3 and SL-5). The engine takes one undergraduate repayment at the lowest threshold of the plans held, using that plan's rate from the config, and the postgraduate repayment on top; each is rounded down to a whole pound on its own (as in SL3's and the guide's examples). How a repayment is split between plans is not modelled.
- Annual (D1): the year's pay against the yearly threshold. PAYE deducts per pay period with a refund if the year's income is under the threshold (GOV.UK guide); results say so.

### D6. Region and income types

rUK (England, Wales and Northern Ireland) or Scotland bands from the config. Employment income only. Savings, dividends, property and self-employment income, benefits in kind and other income types are out of scope; the README says so. The Personal Allowance is the standard one (no Marriage Allowance, Blind Person's Allowance or tax code adjustments). National Insurance is category A, employee only.

### D7. Estimates with assumptions

Every result is an estimate (`estimate: true`) and carries `assumptions`, plain-language strings with no figures, that the UI shows beside it. A refusal (any value needed unverified) carries no result.

## Session G (recorded in F, settled in G1)

Session G is split into G1 (pension methods, adjusted net income, HICBC; 0.7.0) and G2 (annual allowance, carry forward, childcare check, `optimise()`; 0.8.0). These decisions were recorded in session F; the owner settled G2's lookup and G4 at the start of session G1 (17 October 2026), and G1 read the GOV.UK pages below that day. The quotes are in `docs/verification-log.md`, "Session G1 lookups". A GOV.UK page that contradicts one of these wins, and is reported.

### G1. HICBC whole steps (answers O4)

The charge counts whole steps only: one percentage point of the Child Benefit for each complete step of income over the threshold (the config's `childBenefit.hicbc.incomePerPercent`), following the GOV.UK guide's wording (one percentage point "for every" step "you earn over" the threshold, High Income Child Benefit Charge, https://www.gov.uk/child-benefit-tax-charge) rather than PAYE14015's 2024 to 2025 example, which is inconsistent as published (`docs/worked-examples.md`, HICBC-1). A part step adds nothing. The charge in pounds is rounded once at output to the nearest penny (D3), unless a GOV.UK page states another rule. Above the full-charge point (`childBenefit.hicbc.fullChargeAt`) the charge is the whole Child Benefit. Opted out of payments: no Child Benefit and no charge (the GOV.UK guide: "opt out of getting payments and not pay the tax charge"). Code: `hicbc` in `calc.ts`. G1 found no GOV.UK rounding rule; PAYE14015's older example (HICBC-2) prints whole pounds, which is noted, not followed.

### G2. Pension methods and adjusted net income (answers O9)

**Relief at source (owner's choice):** modelled as a basic rate band extension by the grossed-up contribution, plus a reduction in adjusted net income by the same grossed-up amount, rather than as a separate Self Assessment claim. The extension moves the start of every band above the basic rate band up by the grossed-up amount (the basic rate band is the band taxed at the relief-at-source rate, which PTM044220 calls "the relevant rate": the basic rate, or the Scottish basic rate for a Scottish taxpayer). G1 found no GOV.UK page that names the band extension; tests check that it gives the higher-rate relief the GOV.UK guide states ("20% up to the amount of any income you have paid 40% tax on", and the Scottish rates), worked out independently as the band's rate less the relief-at-source rate on the income taxed at that rate, highest band first.

**The ANI step order (a GOV.UK lookup, settled in G1, not an owner choice).** Personal Allowances: adjusted net income (https://www.gov.uk/guidance/adjusted-net-income) starts from taxable income (step 1, "money you earn from employment") and takes the grossed-up relief at source contribution off at step 3 ("for every £1 of pension contribution you made, take £1.25"). Salary sacrifice and the net pay arrangement never reach step 1 as income: a successful sacrifice "is not taxable" and the employer's contribution "is not taxable on the employee" (EIM42780); under net pay the employer deducts the contribution "from the ‘gross pay’" and operates PAYE "on the net amount" (PTM044230; CWG2 2026 to 2027: "PAYE purposes deduct the pension contributions from the employee’s gross pay"). So:

- adjusted net income = gross pay − salary sacrificed − net pay contributions − the grossed-up relief at source contribution;
- every step is a subtraction, so the order does not change the result.

The three methods (GOV.UK, logged in G1):

| Method | Taxable pay | NI-able pay | Adjusted net income | Pension pot gets | Sources |
|---|---|---|---|---|---|
| Salary sacrifice | Less the amount sacrificed | Less the amount sacrificed | Less the amount sacrificed | The amount sacrificed, as an employer contribution | EIM42780; NIM02330; NIM02331; Salary sacrifice for employers |
| Net pay arrangement | Less the contribution | Unchanged | Less the contribution | The contribution | PTM044230; CWG2 2026 to 2027, 2.1 |
| Relief at source | Unchanged (basic rate band extended by the gross amount) | Unchanged | Less the gross amount | The net contribution grossed up at the relief-at-source rate | PTM044220; CWG2 2026 to 2027, 2.1; Tax on your private pension contributions: Tax relief; the ANI guidance, step 3 |

Code: `pensionContribution`, `adjustedNetIncome`, `incomeTax`, `takeHome`.

### G3. Childcare (answers O7)

The optimiser models the income-limit cliff only (expected adjusted net income over the limit in the config). The minimum earnings condition and the England-only scope of Free Childcare for Working Parents are listed assumptions, not modelled. Session G2.

### G4. Child Benefit weeks (answers O8)

**Resolved by the owner at the start of G1:** the number of weeks of Child Benefit in the year is a `ModellingPolicy` field, `childBenefitWeeks`, whose default comes from `src/lib/periods.ts` (`CHILD_BENEFIT_WEEKS_PER_YEAR`, the same calendar divisor as the weekly view), not a literal in the engine, and is listed in the assumptions. If a www.gov.uk page states the count for the year, that wins and is logged.

G1 found no page that states the count for 2026 to 2027. PAYE130030 states the PAYE service's method: entitlement from the Monday on or after the start (the tax year's start if no date is held) to "the Sunday following the ‘End’ date" (or the end date if it is a Sunday), and "The number of full weeks" between them, times each child's weekly rate. 6 April 2026 and 5 April 2027 are both Mondays, so the method reads two ways for a full year: 52 full weeks if the period stops at 5 April 2027, or 53 if the end moves to the Sunday after it. **Still OPEN for the owner:** which count to use; the default stays `periods.ts` until then.

### G5. Taper rounding default (session G1)

The owner confirmed that `ModellingPolicy.taperRounding` stays `'exact'` by default (D4).

### G6. The student loan base under each pension method (answers O2; a GOV.UK lookup, settled in G1)

The deduction tables (SL3 2026 to 2027) and the employers' guidance (Student loan and postgraduate loan repayment guidance for employers) give the base as "the same gross pay amount that you would use to work out your employer’s secondary Class 1 National Insurance contributions". The NI treatment of each method then gives the base (G2's table): salary sacrifice lowers it by the amount sacrificed (NICs "payable only on the reduced salary", NIM02331); net pay leaves it unchanged ("For ... National Insurance contributions purposes do not deduct the pension contributions from the employee’s gross pay", CWG2 2026 to 2027); relief at source leaves it unchanged (contributions come out of net pay, CWG2). No GOV.UK page read states the student loan base for each pension method in one place; the base follows from two stated rules, so it is logged as answered, with both quotes. `takeHome` passes NI-able pay to `studentLoan`, as in D5.
