# Modelling decisions

How Sumyard applies the published tax rules where GOV.UK leaves a choice, or where Sumyard simplifies on purpose. The decisions are the owner's, given at the start of slice 1a session F (17 October 2026) in answer to the OPEN questions in `docs/verification-log.md`. Each names the questions it answers and the code that carries it out. A GOV.UK page that contradicts a decision wins: the session that finds one stops and reports it.

The compound interest decisions (C1 to C9, slice 2) are in `docs/modelling-decisions-compound.md`.

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

**Relief at source (owner's choice):** modelled as a basic rate band extension by the grossed-up contribution, plus a reduction in adjusted net income by the same grossed-up amount, rather than as a separate Self Assessment claim. The extension moves the start of every band above the basic rate band up by the grossed-up amount (the basic rate band is the band taxed at the relief-at-source rate, which PTM044220 calls "the relevant rate": the basic rate, or the Scottish basic rate for a Scottish taxpayer). G1 found no GOV.UK page that names the band extension; **G2 found one**: PTM056120 (https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm056120) says the basic rate limit and the higher rate limit (and, for a Scottish taxpayer, the Scottish basic rate limit and every limit above it) are "increased by the gross amount of any: contribution paid using RAS". Tests check that it gives the higher-rate relief the GOV.UK guide states ("20% up to the amount of any income you have paid 40% tax on", and the Scottish rates), worked out independently as the band's rate less the relief-at-source rate on the income taxed at that rate, highest band first.

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

The optimiser models the income-limit cliff only (expected adjusted net income over the limit in the config). The minimum earnings condition and the England-only scope of Free Childcare for Working Parents are listed assumptions, not modelled. Settled in G2 as G12.

### G4. Child Benefit weeks (answers O8)

**Resolved by the owner at the start of G1:** the number of weeks of Child Benefit in the year is a `ModellingPolicy` field, `childBenefitWeeks`, whose default comes from `src/lib/periods.ts` (`CHILD_BENEFIT_WEEKS_PER_YEAR`, the same calendar divisor as the weekly view), not a literal in the engine, and is listed in the assumptions. If a www.gov.uk page states the count for the year, that wins and is logged.

G1 found no page that states the count for 2026 to 2027. PAYE130030 states the PAYE service's method: entitlement from the Monday on or after the start (the tax year's start if no date is held) to "the Sunday following the ‘End’ date" (or the end date if it is a Sunday), and "The number of full weeks" between them, times each child's weekly rate. 6 April 2026 and 5 April 2027 are both Mondays, so the method reads two ways for a full year: 52 full weeks if the period stops at 5 April 2027, or 53 if the end moves to the Sunday after it. **Still OPEN for the owner:** which count to use; the default stays `periods.ts` until then.

### G5. Taper rounding default (session G1)

The owner confirmed that `ModellingPolicy.taperRounding` stays `'exact'` by default (D4).

### G6. The student loan base under each pension method (answers O2; a GOV.UK lookup, settled in G1)

The deduction tables (SL3 2026 to 2027) and the employers' guidance (Student loan and postgraduate loan repayment guidance for employers) give the base as "the same gross pay amount that you would use to work out your employer’s secondary Class 1 National Insurance contributions". The NI treatment of each method then gives the base (G2's table): salary sacrifice lowers it by the amount sacrificed (NICs "payable only on the reduced salary", NIM02331); net pay leaves it unchanged ("For ... National Insurance contributions purposes do not deduct the pension contributions from the employee’s gross pay", CWG2 2026 to 2027); relief at source leaves it unchanged (contributions come out of net pay, CWG2). No GOV.UK page read states the student loan base for each pension method in one place; the base follows from two stated rules, so it is logged as answered, with both quotes. `takeHome` passes NI-able pay to `studentLoan`, as in D5.

## Session G2 (annual allowance, carry forward, childcare, `optimise()`)

The owner's decisions for G2 were given at the start of the session (17 October 2026); the GOV.UK lookups were read that day, with exact lines in `docs/verification-log.md`, "Session G2 lookups". Code: `src/calculators/optimiser/calc.ts` (each decision names its function). A GOV.UK page that contradicts one of these wins, and is reported.

### G4 (update in G2). Child Benefit weeks

The owner kept `ModellingPolicy.childBenefitWeeks` (default from `src/lib/periods.ts`) and asked for one more search of www.gov.uk. G2 found HMRC's press release "Millions of families in line for Child Benefit rate increase" (31 March 2026): "From 6 April, claimants will receive £27.05 per week - or £1,406.60 a year - for the eldest or only child and £17.90 per week - or £930.80 a year - for each additional child". Each annual figure is exactly 52 times its weekly rate, so the page gives the year's amounts for 2026 to 2027 on a 52-week basis, the same as the default. It does not print the word "weeks" or a count, so this is logged as the count implied by the published annual amounts. The default stays 52 and now has a source; `published.test.ts` mirrors the two annual figures (CB-1). If the owner reads PAYE130030's method as 53 weeks for the charge, the policy field still allows it.

### G7. Threshold income and adjusted income (GOV.UK lookup)

The tapered annual allowance applies only if threshold income is over the config's threshold income limit **and** adjusted income is over the adjusted income limit (PTM057100, "Who the tapered annual allowance applies to"; the tapered annual allowance guidance: "It will not be reduced if your threshold income for the current tax year is £200,000 or less, no matter what your adjusted income is"). For employment income only, with the steps in PTM057100 and its worked example PTM057200:

| Measure | Built as (PTM057100) | Salary sacrifice | Net pay | Relief at source | Employer contributions |
|---|---|---|---|---|---|
| Net income (step 1 of both) | Taxable income before allowances | Less the amount sacrificed (not employment income) | Less the contribution | Unchanged | Not income |
| Threshold income | Net income + salary sacrificed (arrangements after 8 July 2015) − gross relief at source contributions | Added back: no change from gross pay | Pay less the contribution | Pay less the gross contribution | Not included |
| Adjusted income | Net income + net pay contributions + (total pension input amount − member contributions) | Pay − sacrifice + sacrifice (employer input) = gross pay | Pay − c + c + (c − c) = gross pay | Pay + (gross − gross) = gross pay | Added (pension input less member contributions) |

So **no employee contribution, by any method, lowers adjusted income**; employer contributions (including a salary sacrifice) raise it above net income. Only threshold income can be brought under its limit, by net pay or relief at source, never by salary sacrifice (the assumption is that any sacrifice was agreed after 8 July 2015). Lump sum death benefits, other income and defined benefit pension input amounts are out of scope. Code: `annualAllowanceCheck`.

### G8. What counts toward the annual allowance (GOV.UK lookup)

All the optimiser's pension savings are money purchase (defined contribution). The pension input amount is "the total of contributions paid into the arrangement" (PTM053200): the member's relievable contributions **gross**, including the basic rate relief the scheme claims (relief at source), and "any contribution paid in respect of the member by an employer" (a salary sacrifice is an employer contribution, EIM42780). So counted = the gross employee contribution (relief at source grossed up, to the nearest penny as it reaches the pot) + the salary sacrificed + other employer contributions (an input). Contributions above earnings still count (PTM053200), though the engine refuses them as inputs (G1). Defined benefit savings are not modelled.

### G9. Carry forward (GOV.UK lookup; unused amounts are user inputs)

- Look-back: `pension.carryForward.yearsBack` from the config. An unused amount entered for a year further back is ignored, with a warning.
- Order: "The annual allowance for the current tax year of £60,000 is used first. The unused annual allowance from the previous tax years is then used, beginning with available unused annual allowance from the earliest tax year first" (PTM055100, 2023-24 onwards). With the taper, unused allowance is "added to the individual’s tapered annual allowance" (PTM057100).
- The unused amounts for earlier years are inputs (`{ yearsAgo, amount }`), not config; the engine does not check each year's own allowance or the membership condition (PTM055100: a member of a registered pension scheme at some point in that year). Both are listed assumptions.
- The result shows what is used from each year and what is left; the earliest year's remainder is lost next year (PTM055100 example 9; the MPAA guidance: "You cannot carry forward ... the amount of unused allowance from the earliest of the 3 previous tax years included in the calculation").

### G10. Money purchase annual allowance (GOV.UK lookup)

A flag says the money purchase annual allowance applies for the whole year (flexible access in an earlier tax year; first access part-way through this year is not modelled). With money purchase savings only, the amount charged is the higher of the default chargeable amount (total savings less the annual allowance, tapered if it applies, less carry forward) and the alternative chargeable amount (money purchase savings over the MPAA; other savings, here nothing, against the alternative annual allowance) (the MPAA guidance, "Check if you need to pay tax"; PTM057100, "Interaction with the money purchase annual allowance"). Carry forward cannot be added to the MPAA ("You cannot use unused allowances from previous tax years to reduce the amount you’ve gone above the money purchase annual allowance by"; PTM055100). So the binding limit is the lower of the MPAA and the default route's available allowance; carry forward is used only when the default route binds (or ties). The alternative annual allowance itself is not needed with money purchase savings only; PTM056510 and the MPAA guidance disagree on its 2023-24-onwards figure (logged, OPEN, not used).

### G11. The annual allowance charge (GOV.UK states the mechanics; the config holds the figures)

The owner's rule: report the excess with a warning; model the charge only if GOV.UK states the mechanics and the config holds the figures. Both hold. PTM056110 gives the steps: take reduced net income (taxable income after allowances), add the excess on top, and tax the excess at the rates of the bands it falls in; the basic and higher rate limits are increased by gross relief at source contributions (PTM056120, which also names the **basic rate band extension** that G1 could not find on GOV.UK); for a Scottish taxpayer "the lowest possible rate ... is the Scottish basic rate; the Scottish starter rate does not apply". So the engine stacks the excess on the exact taxable income, using the same band starts as income tax (after any relief at source extension), and taxes any part below the basic rate band at the basic rate. Each band's slice is rounded to the nearest penny (D3; no rounding stated). The charge does not change adjusted net income, the personal allowance or take-home: it is reported beside them, and `optimise()` subtracts it in "spendable". Scheme Pays, and who pays, are not modelled. Code: `annualAllowanceCharge`, `annualAllowanceCheck`.

### G12. Childcare: the income-limit cliff (GOV.UK lookup; answers the rest of O7)

Both schemes: "You cannot claim if ... you or your partner’s expected adjusted net income ... is over £100,000 for the current tax year" (Tax-Free Childcare); "You will not be eligible if ... you or your partner’s expected adjusted net income ... is over £100,000" (Free Childcare for Working Parents). "Over" means an income at the limit is still eligible and a penny more is not, with no taper on either page: a cliff. The engine compares this person's exact adjusted net income with each config limit, reports eligibility on income, the headroom to the limit, or how far over it is. Not modelled, listed as assumptions: the partner's income; minimum expected earnings over the next 3 months; the child's age, living arrangements and immigration status; Universal Credit and childcare vouchers; England only for Free Childcare for Working Parents; the fostering route, whose wording ("under £100,000") differs from the main rule at exactly the limit. Code: `childcareCheck`.

### G13. `optimise()` returns candidate points, never a "best" (owner)

`optimise(inputs, config, policy, options?)` sweeps the contribution for the method given, from nothing to the most the engine allows (the gross amount equal to gross pay), in steps from `options.step` (default `DEFAULT_SWEEP_STEP` in `src/lib/sweep.ts`, outside the engine), and adds the current contribution and the threshold points (G14). It returns every point, with no claim that any one is optimal. Each point has: the contribution and the change from the current one; annual take-home, Child Benefit and take-home with it; the annual allowance charge and "spendable" (take-home with Child Benefit, less the charge); the pension (employee, employer, provider relief, total); adjusted net income and threshold income; the net cost per £1 of pension against no contribution; the marginal rate since the previous point (the share of each extra pound into the pension that did not come out of spendable income); the annual allowance position; childcare eligibility if asked; warnings; and why the point exists (sweep, current, maximum, or a threshold). Cliffs between neighbouring points are listed (HICBC steps, the childcare limit, the taper switching on or off at the threshold income limit, student loan whole pounds under salary sacrifice).

**Warnings, never silent clamping:** a contribution over the available allowance is kept, shown with its excess and the modelled charge; the engine never caps it.

### G14. Threshold contributions, solved exactly

For each threshold the smallest total contribution (and the extra over the current one) that brings the measure to the threshold or under it: the personal allowance taper start and its zero point (worked out from the allowance, taper start and taper rate), the HICBC threshold and full-charge point (with Child Benefit claimed), each childcare limit (if asked) on adjusted net income; the threshold income limit on threshold income. Solved in exact pence, in closed form (no float, no bisection): salary sacrifice and net pay lower the measure penny for penny; relief at source by the grossed-up amount, so the payment is the reduction times one less the relief-at-source rate, rounded up to a penny. Status: already met; reachable; or unreachable, because the gross amount would exceed gross pay, the counted savings would exceed the available allowance, or the method does not lower that measure (salary sacrifice and threshold income). A target at the HICBC full-charge point lands where the charge is still all of the Child Benefit under whole steps (G1); the charge first falls a penny below it. Code: `thresholdContributions`.

## Slice 1b, session 1b-i (benefits in kind, post-tax deductions, the first page)

The owner's decisions were given at the start of session 1b-i (17 October 2026). The GOV.UK lookups were read that day, with exact lines in `docs/verification-log.md`, "Session 1b-i lookups". Code: `src/calculators/optimiser/calc.ts` (engine) and `src/calculators/optimiser/definition.ts` and `OptimiserPage.tsx` (page). A GOV.UK page that contradicts one of these wins, and is reported.

### B1. Taxable benefits in kind (owner input; treatment from GOV.UK)

An optional annual input, `TaxInputs.taxableBenefits`, default zero: the net taxable value of benefits in kind for the year, as the employer works it out, after anything the employee pays towards them (for example employer-arranged medical cover). The engine does not value benefits.

| Measure | With a benefit | Source |
|---|---|---|
| Taxable pay | Plus the benefit | Tax on company benefits ("you pay tax on company benefits") |
| Adjusted net income (taper, HICBC, childcare) | Plus the benefit (step 1, "including any benefits you get from your job") | The ANI guidance |
| Threshold income and adjusted income (annual allowance) | Plus the benefit (both start from net income) | PTM057100 |
| Pension savings counted | Unchanged (a benefit is not a contribution) | PTM053200 (G8) |
| Employee NI-able pay | Unchanged | Tax on company benefits: National Insurance; NIM13090 |
| Student loan base | Unchanged (not in the employer's secondary Class 1 earnings) | CSLM16030; NIM13090; the employers' student loan guidance |
| Take-home | Unchanged in cash; it falls only by the extra tax | Follows from the above |

Class 1A is the employer's charge on the benefit (NIM13090, NIM13001). It is never taken from take-home and the page names it in the assumptions. Its rate is not in the config, so no amount is shown. A benefit that attracts Class 1 instead, such as the employee's own contract paid by the employer or a reimbursement, counts as earnings and is entered as salary. A benefit above gross pay is allowed with no warning, because no GOV.UK page read limits it. A pension contribution is still limited to gross pay (G1's refusal); relief on contributions above cash pay is not modelled. A benefit taken through salary sacrifice, which uses the salary amount rule, is not modelled.

**The owner has not confirmed the benefit's value from an annual statement.** It is built as specified; the payslip check will show any mismatch.

### B2. Post-tax deductions (owner)

An optional annual input, `TaxInputs.postTaxDeductions`, default zero: amounts taken from net pay with no tax effect (for example medical or dental cover the employee pays for). It reduces take-home only, and is shown as its own breakdown row. It changes no tax, NI, student loan, HICBC, adjusted net income or annual allowance figure.

### B3. Flexible-benefit cash (owner)

Flexible-benefit cash is entered as salary (in gross pay). There is no special handling.

### B4. No tax code (owner; superseded by B11 in 0.11.0)

There was no tax code input until 0.11.0 (B11). Tax is modelled on the year's liability (D1), however PAYE collects it: through the tax code, by payrolling the benefit, or through Self Assessment. PAYE deductions may differ slightly, and the assumptions say so.

### B5. The page's inputs (session 1b-i)

- Gross pay is the salary plus any bonus, as two Money inputs added together. The engine takes one `grossPay`.
- The employer pension contribution (other than a salary sacrifice) is stored with the inputs for 1b-ii's annual allowance display. It changes no take-home figure, so the page shows it only in the inputs and the pension summary.
- Region and tax year start from Settings. Each calculator page can override them.

## Slice 1b, part 1b-i.1 (percentages, itemised benefits and deductions, monthly entry)

The owner's decisions were given at the start of part 1b-i.1 (18 October 2026). They are about how the page collects inputs, not tax rules: the engine, the config and every tax rule are unchanged, and the engine still receives one annual total for each of the employee contribution, taxable benefits and post-tax deductions. Code: `src/calculators/optimiser/pageInputs.ts` (resolving the inputs), `definition.ts` (storage, validation, migration, summary) and `OptimiserPage.tsx`.

### B6. Pension contributions as an amount or a percentage of pensionable pay (owner)

- The employee and the employer contribution can each be entered as an amount for the year or as a percentage of pensionable pay. Each keeps both entries, so switching back and forth loses nothing; the mode says which one counts.
- **Pensionable pay** is the salary unless the person enters their own annual figure. The bonus is added only when the "include bonus" switch is on (it adds to whichever figure is used). It is used only for percentage contributions.
- A percentage is stored as its canonical text and read with `percentRatio` (`src/lib/parse.ts`). The amount is pensionable pay times the exact Ratio, through `mulRound` (`src/lib/money.ts`), rounded to the **nearest** penny (an exact half penny rounds up). GOV.UK states no rule for this: it is the scheme's or the employer's arithmetic, so this is a modelling decision, not a tax rule. A scheme that rounds differently can differ by a penny.
- The page shows the resolved amount for the year. A percentage above all of pensionable pay is accepted with a warning; a resolved employee contribution above pay shows the existing input notice (G1's refusal).

### B7. Itemised benefits in kind and post-tax deductions (owner)

- Taxable benefits in kind (B1) and post-tax deductions (B2) are each a list of up to `MAX_LIST_ITEMS` named items (`src/lib/inputLimits.ts`). An item has a name (text only, at most `MAX_ITEM_NAME_LENGTH` characters, shown only as text), an amount and a period: per month or per year. An empty list means nothing.
- The list's annual total goes to the engine as `taxableBenefits` or `postTaxDeductions`, so any mix of items with the same annual total gives the same results as one annual figure.
- An item with no amount is allowed, with a warning that it adds nothing. A negative amount is not accepted (an input error, as for every other amount on the page).

### B8. Monthly amounts (owner)

A monthly amount is multiplied by `MONTHS_PER_YEAR` from `src/lib/periods.ts` (a calendar divisor, not a tax figure), exactly (no rounding is needed). The assumptions say: "Monthly amounts are assumed level through the year."

### B9. Inputs version 2 and the migration (owner)

Inputs version 2 replaces version 1's single annual amounts. A version 1 scenario migrates with identical results: each pension contribution becomes amount mode with the same amount; a non-zero benefits or deductions amount becomes one item per year, named "Benefits in kind" or "Post-tax deductions"; a zero amount becomes an empty list (the prompt asked for one item each; an item of nothing would only add a warning). Pensionable pay starts as the salary, without the bonus. Inputs from a newer version are refused, as before.

## Slice 1b, 0.11.0 (benefits through salary sacrifice, tax code and PAYE estimate, monthly breakdown)

The owner's decisions were given at the start of the 0.11.0 session (18 October 2026). The GOV.UK lookups were read that day, with exact lines in `docs/verification-log.md`, "Session 0.11.0 lookups". Code: `src/calculators/optimiser/calc.ts` (benefits), `paye.ts` (tax codes and the PAYE estimate), `breakdown.ts` (the monthly breakdown), `definition.ts`, `pageInputs.ts` and `OptimiserPage.tsx`. A GOV.UK page that contradicts one of these wins, and is reported.

### B10. Benefit items: value, amount taken from pay, and how it is taken (owner; treatment from GOV.UK)

Each benefit in kind is an item with a name, a period (per month or per year, B8), **the value of the benefit**, **the amount taken from pay**, and **how it is taken**: before tax and National Insurance (salary sacrifice, an optional remuneration arrangement) or after tax (a contribution from net pay, which GOV.UK calls making good). An amount taken of nothing is an employer-paid benefit. Post-tax deductions with no benefit stay a separate list (B2). The engine takes the items as annual amounts (`TaxInputs.benefits`) and sums them per item:

| How taken | Taxable amount (added to taxable pay and adjusted net income) | Salary given up (off taxable pay, NI-able pay, the student loan base and take-home) | Paid from net pay (off take-home only) | Sources |
|---|---|---|---|---|
| Nothing taken | The value | Nothing | Nothing | B1 |
| Before tax and NI | The greater of the value and the salary given up (the "relevant amount") | The amount taken | Nothing | 480 Appendix 12; EIM44120; Salary sacrifice for employers |
| After tax | The value less the amount taken, never below nothing | Nothing | The amount taken | EIM21119; NIM15201 |

- **The value** is the benefit's value under the normal rules, ignoring anything paid towards it, as the employer works it out (EIM44120: "do not account for any amount made good"). The engine does not value benefits.
- **Salary given up** is not earnings for Class 1 (NIM02330: "NICs will be due only on the £33,000 cash"), so it lowers employee NI-able pay and, through the employer's secondary Class 1 earnings, the student loan base (G6). The benefit itself is Class 1A, the employer's (NIM02330, B1); no amount is shown. It is not added back to threshold income for the annual allowance (PTM057100 adds back only salary sacrificed for pension provision) and it is not pension savings.
- **Exemptions are not modelled.** The general rule applies to every item. GOV.UK names benefits that keep their exemption through salary sacrifice (pension contributions and pensions advice, workplace nurseries and older childcare vouchers and employer-contracted childcare, cycles and cyclist's safety equipment) and low-emission cars that keep the normal valuation; an otherwise exempt benefit through salary sacrifice is taxed on the salary given up. The page warns whenever an item is taken before tax, and tells people to enter pension contributions in the pension inputs.
- **Making good in time:** a contribution counts only if made by the date EIM21119 gives after the tax year; the assumptions say it is assumed made in time. An item that both gives up salary and makes good (EIM44120's example) is not modelled: an item is one or the other.
- Arrangements made before the optional remuneration rules began, and their transitional protection, are not modelled (EIM44030).
- Salary given up for benefits and pension together may not exceed gross pay: the engine refuses it (as G1 refuses a pension above pay). The National Minimum Wage floor on a sacrifice is not modelled.

### B11. Tax code (owner; supersedes B4)

The tax code is optional. **The annual liability stays the headline figure** (D1). With a supported code, a second view shows the PAYE estimate for the year, the annual liability's income tax, and the difference (the estimate less the liability). A difference is described in words: HMRC may refund or collect it later, through a tax code change or after the year ends (by letter, or through Self Assessment for someone who files a return); no figure is given for how.

### B12. Which codes are modelled (owner; shapes from GOV.UK)

- **Supported:** a number followed by a suffix letter L, M, N or T, with an optional S (Scottish rates) or C (Welsh rates) prefix, as GOV.UK's tax code pages define them. The number has no leading zero. Input is read without regard to case or spaces.
- **Not modelled, with a notice and no estimate:** K codes (with or without S or C), BR, D0, D1 and the other D codes (with S or C), 0T (with S or C), NT, and emergency codes (a code followed by W1, M1, X or NONCUM). Anything else is not a tax code and is an input error.
- **The code's allowance** is the number times the config's `paye.codeUnit` ("You usually multiply the number in the tax code by 10", Understanding your employees' tax codes). The suffix letter changes nothing in the arithmetic: M and N mean Marriage Allowance and T means other calculations, all already inside the number.
- **The regime:** no prefix, the config's England, Wales and Northern Ireland bands; S, the Scottish bands; C, the same England, Wales and Northern Ireland bands, because GOV.UK's Income Tax in Wales page gives the same rates and bands for 2026 to 2027. A year whose Welsh rates differ needs its own config leaf first. When the prefix and "Where you live" disagree, the page says so.

### B13. The PAYE estimate (owner: level monthly pay; method from GOV.UK)

- **Level monthly pay** for the whole year, on the cumulative basis (PAYE11090), one employment. The assumptions say so.
- **Pay PAYE taxes:** superseded by B17 (0.11.1) for benefits in kind. Gross pay less salary given up (for pension or benefits) and net pay contributions. ~~Benefits in kind are not in it (not payrolled; the code carries them)~~, relief at source is not in it (its extra relief is claimed separately), and the taper and the High Income Child Benefit Charge count only as far as the code carries them.
- **Month n** of `MONTHS_PER_YEAR` (`src/lib/periods.ts`): pay to date is n twelfths of the year's pay; free pay to date is n twelfths of the code's allowance (PAYE70025: "free pay for Month 1 is 1/12, Month 2 is 2/12 and so on"); taxable pay to date is pay to date less free pay to date, never below nothing (PAYE70025); each band's start is n twelfths of the year's (PAYE11090: "a proportion of any allowances and bands of tax rates for the pay period ... on a rolling basis up to each pay day"). Tax to date is the bands' rates on taxable pay to date.
- **Rounding (not read; decision D3 applies):** Tables B to D, which give the rounding employers use for taxable pay and tax in each period, are a PDF this environment cannot fetch (OPEN O11). So tax to date is exact and rounded once to the nearest penny; each month's tax is the rounded tax to date less the previous month's, so the months add up to the year exactly. Payroll can differ by pennies or pounds from this.
- **The code's exact free pay** comes from Tables A, also a PDF not read (OPEN O10). The estimate uses the number times `paye.codeUnit`, as the HTML guidance states; whether Tables A's figure is exactly that was not checked.
- The estimate is never below nothing; a code over pay gives nothing.

### B14. The monthly breakdown (owner)

Every breakdown row can be shown per month: each annual figure divided by `MONTHS_PER_YEAR` from `src/lib/periods.ts`, to the nearest penny (D3). Take-home per month is gross pay per month less the other rounded rows, so the month table adds up; any penny difference from annual take-home divided by the months is stated beside it. With a supported tax code, the month view also shows PAYE income tax per month alongside (not in the sum). These are even divisions of the year, not payslips (D1).

### B15. The owner's payslip is a manual check (owner)

The owner checks the page against their own payslip by hand. No tax figure from it goes into tests, code or docs.

### B16. Inputs version 3 and the migration (owner)

Inputs version 3 changes each benefit item to `{ name, period, value, taken, payment }` (`payment`: `beforeTax` or `afterTax`) and adds `taxCode` (canonical text, empty for none). A version 2 benefit item migrates to the same name and period with `value` = its amount, `taken` = nothing and `payment` = `beforeTax` (with nothing taken, either way gives the same result); post-tax deductions stay in their own list unchanged; the tax code starts empty. A version 1 scenario migrates through version 2. Results are identical. Inputs from a newer version are refused, as before.

## 0.11.1 (fix: benefits in kind in PAYE's pay)

### B17. PAYE taxes the year's taxable pay, benefits included (owner; supersedes part of B13)

Given by the owner on 18 October 2026, after a payslip check (B15) showed the PAYE estimate below the year's liability by the benefits taxed at the marginal rate. PAYE's pay (`TakeHomeResult.payrollPay`) is the same measure as the annual income tax's taxable pay: gross pay, less salary given up for pension or benefits and net pay contributions, plus the full taxable amount of every benefit (B1, B10), as if the employer payrolls them, spread evenly over the months. Relief at source is still not in it. A code that also takes the benefits off the allowance (benefits not payrolled) counts them twice; the assumptions and Help say so. Whether the owner's employer payrolls each benefit, and HMRC's payrolling rules themselves, were not read on GOV.UK in this fix.

## Household budget (0.25.0)

Owner decisions given in the session brief on 23 October 2026. The calculator uses no tax rules (`taxRules: 'none'`): no tax, National Insurance, ISA or pension rule, and no tax year. Engine: `src/calculators/budget/calc.ts`.

### BD1. Kinds (owner)

Every outgoing is one of four fixed kinds: **spending**; **joint** (a transfer to a joint account); **debt** (a card or loan payment); **savings** (cash, an ISA, a fixed saver, stocks and shares: what it is goes in the line's name, not its kind). No other categories.

### BD2. Lines and periods (owner)

A line is `{ name, amount, period, kind }`, `period` weekly, monthly, quarterly or yearly. A line's yearly amount is its amount times the whole number of periods in a year from `PERIODS_PER_YEAR` (`src/lib/periods.ts`; a weekly year is exactly that many weeks), so the yearly figure is exact and canonical. Every month figure (each line, each kind total, income, outgoings, what is left) is its own yearly figure divided by `MONTHS_PER_YEAR` with `mulRound`, to the nearest penny (halves away from zero). Totals come from the yearly totals, never from adding rounded month figures, so the month rows can differ from their month total by a penny or two; the page says so beside the total, as the take-home breakdown does (B14).

### BD3. Income (owner)

Income is **Your pay** (after tax, entered a month or a year) plus any extra income lines, each with its own period. Every share is of total income for the year and is labelled "of your income".

### BD4. Blank amounts (owner)

A blank amount is nothing, with no warning: the named lines are a template. A negative or unreadable amount is an input error and the page shows no results until it is fixed.

### BD5. Never cap or hide (owner)

What is left may be below nothing: it is shown as it is, with a warning, never capped at nothing. With no income, every share is "n/a" (`null` in the engine), never a division by nothing.

### BD6. Double counting (owner)

Beside debt lines and in the assumptions: enter a card payment or the spending on that card, not both. A transfer to a joint account counts as an outgoing from this account; what is spent from the joint account is not entered again.

### BD7. What if (owner)

What-if sliders overlay the inputs on the page only, never stored or saved. While a what-if differs from the inputs, the results show the inputs and the what-if side by side with the change. **Reset what-ifs** drops them; **Apply** writes them into the inputs, with Undo.

### BD8. Savings rate (session, flagged for the owner)

The savings rate is the savings kind's yearly total over yearly income. What is left over is not counted as saved, since nothing says where it goes; the page shows it as its own share.

### BD9. Bounds (session)

Each amount is from nothing up to `MAX_INPUT_AMOUNT`; each list (extra income, outgoings) holds at most `MAX_BUDGET_LINES` (`src/lib/inputLimits.ts`). Within these every sum is a safe whole number of pence; the engine refuses anything outside them, by field, rather than throw, and refuses a result past the safe range the same way.

## Mortgage overpayment (session M0)

Proposed in session M0 and **confirmed by the owner on 23 October 2026**, with changes to MO6 and MO9 and the shared helpers (MO15); built as the engine in M1 (0.26.0) and the page in M2 (0.27.0), which adds MO16 (allowance alignment). The calculator uses no tax rules (`taxRules: 'none'`). Sources and what could not be found: `docs/verification-log.md`, "Mortgage overpayment (session M0)" (MR-1 to MR-10). MR-1, MR-2 and MR-4 stay **OPEN** until the owner's statement is added (`docs/mortgage-cross-checks.json`); the decisions below stand in for them and are named in the result's assumptions. Rounding: `docs/money.md`, "Mortgage overpayment (session M0)". Engine: `src/calculators/mortgage/calc.ts` (M1); how each decision is carried out, and M1's readings of MO7 (allowance years of twelve payment dates) and MO8 (the last month's order), are in its `README.md`.

### MO1. What v1 models (owner)

One repayment or interest-only mortgage from a start date: the balance owed now, the term left in whole months, a fixed rate to a fixed-rate end, then a reversion rate to the end of the term. A fixed-rate end of nothing means the reversion rate from the start. The reversion rate is the person's guess and is said to be one. Monthly payments in arrears, one a month on the same day as the start date (a shorter month's last day where that day does not exist). The payment changing when a fixed rate ends is described on GOV.UK (MR-7); how the new payment is worked out is MO4.

### MO2. Repayment and interest-only (owner, from MR-5)

Repayment: a level payment that clears the balance by the end of the term, from the shared amortising payment (MO15) with no final payment. Interest-only: the payment is the month's interest and the capital is owed at the end, as MoneyHelper's calculator describes it (MR-5). Part-and-part is out of v1.

### MO3. Interest method and day count (owner; MR-1 OPEN, MR-10 as proposed)

A policy field `interestMethod: 'daily' | 'monthly'`, default `'monthly'`, named in the assumptions. No reachable source states how lenders work out interest (MR-1).

- `'monthly'`: each month's interest is the opening balance times a twelfth of the annual rate (MR-5's "converted into a monthly rate"; a twelfth, as car finance's `'monthly'` basis, F6).
- `'daily'`: interest accrues each day on that day's balance at the annual rate over the day basis, and is added to the balance on each payment date. A second policy field `dayCount: 'actual/365' | 'actual/actual'`, default `'actual/365'` (every day a 365th of the rate; `'actual/actual'`: a 366th in a leap year), named in the assumptions (MR-10). Needs real calendar months, so the start date (MO1) matters only here.

### MO4. When the fixed rate ends (owner; MR-7 describes, no rule found)

On the first payment date after the fixed-rate end, a repayment mortgage's payment is recalculated with the shared amortising payment on the balance then and the months left (MO5), at the reversion rate; an interest-only payment becomes the interest at the reversion rate.

### MO5. What an overpayment does (owner, as proposed; MR-9 not found)

The person chooses `effect: 'reduce-term' | 'reduce-payment'`, default `'reduce-term'`, named in the assumptions.

- `'reduce-term'`: the payment stays as it is and the balance is cleared sooner. At the fixed-rate end (MO4) the new payment is worked out over the months the shortened schedule had left, not the contract's, so the time saved is kept.
- `'reduce-payment'`: from the next payment date the payment is recalculated on the lower balance over the contract's months left.
- Interest-only: an overpayment lowers the capital, so the interest and the amount owed at the end fall; `effect` does not apply and the page says so.

### MO6. Timing of an overpayment (owner; MR-2 OPEN)

A regular overpayment (an amount a month, from and to a month) and up to `MAX_LIST_ITEMS` lump sums (an amount at a month) are paid on payment dates only, with that month's payment. With either interest method the next month's interest is on the lower balance. An assumption says so: overpayments are taken on payment dates only, so daily and monthly interest differ only slightly, by their day counts, not by when an overpayment counts. An `'annual'` interest method and lump sums off payment dates are in `docs/backlog.md`.

### MO7. Early repayment charge and penalty-free allowance (owner, as proposed; MR-3 described, MR-4 OPEN)

Contract inputs, never config, with no default figure: an ERC as a percentage of the amount overpaid above the allowance, an ERC end month (default the fixed-rate end; it can differ), and a penalty-free allowance a year as a percentage of the balance at the start of each allowance year, or as an amount. Allowance years run from the start date. The engine never caps an overpayment to the allowance: it charges the ERC on the excess in each allowance year and shows it. The ERC is paid from the person's pocket on the day, not added to the balance. Unused allowance does not carry over. Each of these is named in the assumptions.

### MO8. Overpayments past the balance (owner)

An overpayment never takes the balance below nothing: the engine uses only what clears it after that month's interest and payment, reports the part not used, and charges any ERC on the part used. A lump sum in the final month clears what is left, and that month's payment shrinks to the remainder. Once the balance is nothing, later payments and overpayments are nothing.

### MO9. Interest saved and its guaranteed return (owner)

Interest saved is the interest without overpayments less the interest with them, over the whole term (the reversion rate assumed to the end) and up to the fixed-rate end (which does not rest on that guess). Beside it, the **effective guaranteed return**, one for each rate period (fixed, then reversion): what a pound overpaid earns by not being charged interest, as an effective annual rate. With `'monthly'` interest it is (1 + r/12)^12 − 1, the shared annual rate of a twelfth of r (MO15); with `'daily'` it is the twelve months from the start of the period compounded month by month, each month (1 + r × days ÷ day basis), in fixed point (C9). No blended percentage: when an ERC is paid, the page shows the **net saving in pounds** (interest saved less the ERC) and a **break-even point**, the first month from which the interest saved so far is at least the ERC paid so far (or that it never breaks even within the term). No savings comparison in v1: that is the ISA vs pension vs mortgage slice. No tax is modelled.

### MO10. Rounding per step (owner, as proposed; lenders' rounding not found)

Each step has one mode, recorded in `docs/money.md` and named in the assumptions, so a real statement can correct one line: payments to the nearest penny (F7); monthly interest to the nearest penny; daily interest kept exact through the month and rounded once to the nearest penny when charged; the last payment takes the rounding; the ERC to the nearest penny; the allowance rounded down.

### MO11. No tax rules (owner)

`taxRules: 'none'`: the page shows `NoTaxRulesBadge` in place of the verified badge, scenarios carry no tax year and `summarise` ignores the config, wired as for compound interest, the car decision and the budget (`registry.ts`, `session.ts`, `scenarios/`). No registry change is needed.

### MO12. Bounds and refusals (owner, as proposed)

The engine refuses, by field, rather than throw: a balance from a penny to `MAX_INPUT_AMOUNT`; a term in whole months from one to a new `MAX_MORTGAGE_TERM_MONTHS` = 480 (forty years) in `src/lib/inputLimits.ts`; rates from nothing to `MAX_FINANCE_RATE`; a fixed-rate end and an ERC end from nothing to the term; overpayments and lump sums from nothing to `MAX_INPUT_AMOUNT`, lump sums at months within the term; a start date that is a real date (`isIsoDate`). A term under a month is refused. A result past the safe range is refused as too large. The bounds are named in the assumptions.

### MO13. Results (owner)

The payment now and after the fixed-rate end; the balance at the fixed-rate end; total interest; the payoff month and the time saved; ERC paid; interest saved, over the whole term and to the fixed-rate end; with an ERC, the net saving and the break-even point (MO9); the effective guaranteed return per rate period; a yearly table and a balance chart with and without overpayments, with a table fallback. Results are always recomputed; scenarios store inputs only (inputs version 1, no new storage key).

### MO14. Out of v1 (owner)

Offset and savings comparisons, tax, part-and-part, payment holidays and underpayments, more than one product after the fixed rate, tracker and base-rate paths, product and exit fees, porting, the APRC, an `'annual'` interest method and lump sums off payment dates (both in `docs/backlog.md`), and borrowing an overpayment back.

### MO15. Shared schedule helpers, no import of car finance (owner)

The mortgage engine never imports `src/calculators/car-finance` (or another calculator). M1 starts with its own red then green commit pair that moves `monthlyRate`, `interestOn` and the schedule helpers (`monthlyFactor`, `regularPayment`, `annualRate`, the `MonthlyRate` type) into a shared module in `src/lib/`, with car finance calling it and no change in behaviour: every car finance, car ownership and car decision test passes unchanged. The mortgage engine then calls only `src/lib/`. Its `'monthly'` return (MO9) is the shared `annualRate` of a twelfth of the rate, not compound interest's `effectiveAnnualRate`.

### MO16. A mortgage already running: allowance used and the reset (owner, M2; numbered MO16 as MO15 is the shared helpers)

The charge (MO7) takes two more contract inputs: the allowance already used in the allowance year running at the start, and the payments until that year resets (nothing to twelve). The first allowance year covers those payments, with the amount used counted towards its allowance; the next starts after them, then every twelve payments, each fresh. Absent, nothing to the reset, or twelve with nothing used is a fresh year from the first payment, so M1's results are unchanged. Used above the allowance is accepted: no room is left, every overpayment until the reset is charged in full, and nothing already used is charged (it was paid before the start). A percentage allowance for the year in progress is worked out on the balance now, which is below that year's opening balance, so the room is never overstated (M2's reading; a statement can show the lender's figure). Named in the assumptions when the year is already running. Engine: `allowanceYearStarts` in `src/calculators/mortgage/calc.ts`; the reference lays the years out by listing their first months (`referenceCharges`).

## Next pound decision (session C0)

"Where does the next £X go?" at `#/c/next-pound`: a pension, a mortgage overpayment or an ISA, for the same sum of take-home. CP1 to CP10 were set in the owner's C0 brief and are **owner-confirmed, 23 October 2026**. The composer adds no tax rule of its own: it runs the verified engines (`optimise()`, the mortgage engine's `overpay()`, compound interest's `project()`) and reads a few new config leaves that C1 adds from the C0 lookups (`docs/verification-log.md`, "Next pound decision (session C0)", NP-1 to NP-12). Because it reads tax config it is **not** a `taxRules: 'none'` calculator: the page shows `VerifiedBadge` and refuses, naming the values, when any is unverified. Rounding: `docs/money.md`, "Next pound decision (session C0)". Readings this session added under CP3 to CP9 are marked **proposed, for the owner**; they do not change a confirmed decision.

### CP1. One lump sum, held to a horizon (owner)

One-off X of take-home pay, now, held to a horizon in whole years. No monthly amounts (`docs/backlog.md`).

- *Proposed, for the owner:* the horizon is whole years (the compound engine's unit), and the mortgage leg reads month 12 × years from the mortgage's own start. The page supplies an "as of" date for the access-age test (CP4); the engine never reads the clock.
- *C1 as built, for the owner (differs from the line above):* the overpayment goes in with the first payment, a month after the start date, so reading month 12 × years holds it one month less than the ISA, and the brief's check (break-even equal to the fixed period's `PeriodReturn.effective`) failed by about 0.2 points. C1 reads month 12 × years + 1 (capped at the term), so the overpayment is held whole years. The leg less X still equals `charge.netSaving` at or past the term.

### CP2. One measure: what X adds to net worth at the horizon (owner)

Each column is the change in net worth at the horizon from putting X there, after tax on withdrawal, in today's money first (an inflation input) and nominal beside it.

- *Proposed, for the owner:* every column spends exactly X now. What a leg cannot use (an overpayment past the balance, the pension's last pennies, CP3 and CP5) stays in that column as cash at its face value, with no growth (cash savings are out, CP10), and is shown. Today's money is the nominal value divided by one plus inflation to the power of the years, the same deflator for every leg (compound interest's real view uses it for the ISA and pension pots, C5).

### CP3. Pension leg: what X of take-home buys (owner)

The pension X buys comes from `optimise()` at the person's own pay, so the personal allowance taper, the HICBC, student loans and the pension method all flow through. An optional employer match is an input. Employer NI savings are not modelled.

- *Proposed, for the owner (a correction to the reading of "net cost per £1"):* `OptimiserPoint.netCostPerPound` is measured **against no contribution** (an average from nothing, G13), not from the current contribution. Multiplying X by it would be wrong for anyone already paying in. The composer instead finds the extra contribution E whose cost, spendable income at the current contribution less spendable income at the current contribution plus E, is the most that does not pass X; the pension added is the difference in `pension.total` between the two points. Spendable income is not monotone in the contribution (HICBC steps, the childcare cliff, penny effects, `docs/money.md`), so C1 searches the optimiser's sweep for the last point within X and refines between it and the next in whole pence. The leftover, X less that cost, is cash in this column (CP2).
- *Proposed:* the employer match is an amount the employer adds because of the extra contribution, entered by the person (default nothing). It joins the pot and counts towards the annual allowance (it is passed as extra `savings.employerContribution`), never towards spendable income.
- *Proposed:* under salary sacrifice or net pay, X is take-home given up this tax year rather than cash in hand; each column still leaves the person X poorer now.
- *Engine note for C1:* `optimise()` sweeps the whole range on every call and `pointAt` (`compare.ts`) calls it once per contribution. A refinement in whole pence may need a single-point evaluation exported from `optimiser/calc.ts` (no behaviour change, its own red then green pair) rather than a sweep per step. C1 decides with timings.

### CP4. Pension at the horizon (owner)

The pot at the horizon less the tax-free lump sum; the remainder taxed at a retirement tax rate the person sets, whose default comes from verified config (the basic rate), never a literal. If the horizon is before the access age: "not accessible at horizon", and no number.

- *Proposed, for the owner:* the pot grows at the same low, mid and high rates and the same fee as the ISA (CP6), through compound interest's `project()`: the same investments in a different wrapper. With the same growth and fee, the pension's value is the ISA's times one ratio at every rate, which the page can say once.
- *Proposed:* the tax-free part is the tax-free share (NP-2) of the pot, capped at the lump sum allowance still available (NP-6, NP-7). The person says whether their other pensions will use the allowance; default "no". The remainder, and anything above the cap, is taxed at the one retirement rate (NP-8, a simplification named in the assumptions: no personal allowance, bands or other income in retirement).
- *Proposed:* the default rate is the rate of the band named "Basic rate" in the person's region's `incomeTax.bands` (`requireVerified`); if no band has that name the default refuses and the person must enter a rate. The rate is for 2026 to 2027, applied to a withdrawal years away (an assumption says so).
- *Proposed:* the access age is the normal minimum pension age on the horizon date (NP-3 now, NP-5 from its date), from config, with an input for a scheme's later age. Accessible when the age now plus the horizon reaches it. No protected pension age, no benefits already taken (NP-1).

### CP5. Mortgage leg (owner)

The balance with and without the overpayment at the horizon, from the mortgage engine (`overpay()`), with the effect `'reduce-term'`, the ERC applied and the reversion rate after the fixed end. Labelled as the only guaranteed leg.

- *Proposed, for the owner:* the ERC is paid in cash and not added to the balance (MO7), so the overpayment O is the most whose O plus its ERC does not pass X; the rest is cash (CP2). The part of O past the balance is cash too (MO8, `MonthRow.unused`).
- *Proposed:* the leg is the baseline balance less the overpaying balance at the horizon, **plus** the payments the overpaying schedule no longer needs up to the horizon (each month's baseline payment less its overpaying payment, summed, at face value). This counts the payments freed after an early payoff, an interest-only mortgage's lower interest payments, and a different payment after the fixed-rate end. Overpayments and ERCs are not payments here. With the horizon at or past the term's end, the leg less X equals the mortgage engine's `charge.netSaving` (or `interestSaved` with no charge), a check C1 tests.
- *Proposed:* the mortgage starts at its own start date; the horizon is counted from there (CP1).

### CP6. ISA leg (owner)

Growth at low, mid and high rates, with the fee input reused from compound interest (`project()`). The default rates are labelled illustrative assumptions, not facts. An ISA allowance warning.

- *Proposed, for the owner:* the ISA is invested, not cash: no tax on growth or withdrawals (NP-10, NP-11). An assumption says that cash held in a stocks and shares ISA may be charged from 6 April 2027 (NP-4, OPEN). C1 proposes the three starting rates as named starting values in `src/lib/inputLimits.ts` (as `DEFAULT_PROJECTION_YEARS` is), not market figures, for the owner to set; they sit within compound interest's `GROWTH_RATE_BOUND`.
- *Proposed:* the allowance warning needs what is already paid into ISAs this tax year (an input, default nothing); it warns when that plus X passes the limit (NP-12). It warns; it does not cap.

### CP7. Output (owner)

Three columns (pension, mortgage, ISA), and the break-even ISA return that equals each alternative. Nothing is labelled "best" (G13).

- *Proposed, for the owner:* the break-even ISA return is the nominal growth rate, before the fee, at which the ISA leg equals the other leg, found by bisection on the compound engine (the ISA's value rises with its rate, so there is at most one). Against the pension, it is the rate matching the pension at the mid rate (the pension also moves with the rate, CP4). It is searched within compound interest's `GROWTH_RATE_BOUND`; outside it the page says "above the highest rate modelled" or "below the lowest", with no number. With the pension not accessible at the horizon, or with X of nothing, no break-even is shown.

### CP8. Warnings (owner)

The optimiser's warnings at the new contribution pass through (the annual allowance, the taper, carry forward, and the rest of `EngineWarning`), plus the ISA allowance (CP6) and the ERC (the mortgage engine's `over-allowance`).

- *Proposed:* also, the pension leg reaching the most the optimiser models (gross equal to gross pay) with X not used up, and an overpayment past the balance.

### CP9. One composer may import other calculators (owner)

This one composer, `src/calculators/next-pound/`, may import the public entry points of other engines. Every other calculator engine stays as it is.

- *Found in C0, for the owner:* the brief said every other engine imports only `src/lib/`. The code does not: `car-ownership/calc.ts` and `car-ownership/types.ts` already import `car-finance/calc.ts` and `car-finance/types.ts` (slice 3b), and `CLAUDE.md` had no such rule (it was MO15's, for the mortgage engine). `CLAUDE.md` now states the rule with both exceptions named. If the owner wants car ownership moved onto `src/lib/` too, that is a later part of its own.
- *Guard test spec for C1:* `src/calculators/engineImports.test.ts`. For each folder under `src/calculators/` with a `calc.ts`, follow every relative and `@/` import from `calc.ts`, transitively, skipping `*.test.ts`, `*.tsx` and `fixtures/`. Each file reached must be in that folder, `src/lib/` or `src/config/tax/` (not `fixtures/`), or be one of the allowed entry points: for `car-ownership`, `car-finance/calc.ts` and `car-finance/types.ts`; for `next-pound`, `optimiser/calc.ts`, `optimiser/types.ts`, `mortgage/calc.ts`, `mortgage/types.ts`, `compound-interest/calc.ts`, `compound-interest/types.ts` (plus a single-point export if CP3's engine note adds one). An allowed entry point is checked by its own folder's rule, not followed further from the composer. The test fails on a new cross-calculator import, on an allow-list entry no import uses, and on a page module (`definition.ts`, `*.tsx`) reached from an engine. Page folders without a `calc.ts` (such as `car-decision/`) are outside it.

### CP10. Out of scope (owner)

The Lifetime ISA, the State Pension, a partner, offset mortgages, cash savings, inheritance tax, monthly contributions.

### CP11. Config leaves for the next pound (owner, 23 October 2026; session C0.5)

The owner's answers to the questions C0 left OPEN (NP-1 to NP-4, `docs/verification-log.md`), applied in C0.5 (config and docs only).

- **NP-2, NP-3 (source tax year).** A current GOV.UK guide that names no tax year is accepted for a config value when two pages agree, and the leaf is logged for the owner's spot-check, as `pension.reliefAtSourceRate` was. With only one page the leaf stays `todo`. Applied: `pension.lumpSum.taxFreeShare` (three guides agree) and `pension.minimumAge.current` (three guides agree, with the 2021 impact note stating the law since 6 April 2010) are verified and marked SPOT-CHECK in the Values table.
- **NP-1 (people aged 55 or 56 when the age rises).** The transitional rules are not modelled; C1 shows a warning when the horizon or the person's age makes them relevant. Config holds the age now, the announced age and the date it applies from (`pension.minimumAge.current`, `.announced`, `.announcedFrom`): the schema already had a date leaf kind (`period.start`), so the date is a plain `Sourced<IsoDate>` and needed no schema change beyond the new leaves.
- **NP-4 (cash in an ISA from 6 April 2027).** Informational only: no config leaf, no engine logic. Logged as a row with its source type (a newsletter) and "not modelled".
