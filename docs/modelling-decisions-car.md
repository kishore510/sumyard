# Modelling decisions: car decision (slice 3)

How the car decision models finance and ownership where there is a choice. Format as `docs/modelling-decisions-compound.md`: each decision names the code that carries it out. F1 to F4 are the owner's, given at the start of slice 3a (21 October 2026). F5 onwards are engine decisions proposed in slice 3a on what the sources below verify; **the owner confirms them** (listed in `PHASE-BRIEF.md`, "Still with the owner").

What official sources say, and what could not be read, is in `docs/verification-log.md`, "Car finance (slice 3a)" (items CR-1 to CR-18). The short version: in 3a the statutory APR was **OPEN** (its sources were refused by the network), so the engine solves an **effective rate** under the definition HMRC publishes on www.gov.uk (CFM21180), and says that it is not the statutory APR. In 3a.1 (22 October 2026) the regulator's handbook (CONC App 1.2) and SI 2010/1011 were read: the APR's equation, time basis, included costs and display rounding are verified (CR-1 to CR-3), and `apr` (F15) computes it from cash flows the caller counts. Whether the APR assumes a PCP's optional final payment is paid, and whether purchase and option fees count, are still **OPEN** (CR-10).

No tax figure is involved. The only constants are calendar divisors (`src/lib/periods.ts`), input bounds (`src/lib/inputLimits.ts`) and the solver's precision (`src/lib/money.ts`), all outside the engine so its literal guard holds.

Code: `src/calculators/car-finance/calc.ts` and `types.ts`. Tests: the same folder. Summary: `src/calculators/car-finance/README.md`.

## Owner decisions (slice 3)

### F1. Options in v1

Keep the current car, buy outright, PCP, HP and a personal loan. Leasing (personal contract hire), dealer deposit contributions and part exchange as its own option are not in v1. 3a models the three finance agreements (PCP, HP, loan); 3b adds keep and buy outright.

### F2. A fixed horizon

Every option is costed over the same fixed horizon. A finance agreement's term is a marker within it (when payments stop, when a PCP's final payment or hand-back falls), not a mode that changes the horizon. 3a works over the agreement's own term; 3b places it on the horizon.

### F3. Residual value is an input

The car's value at a point is a user input with low, expected and high cases, never a modelled depreciation curve. 3a does not use it; 3b does (equity is value less the outstanding balance, F12).

### F4. VED is an input; EV tax and benefit in kind are out of scope

Vehicle excise duty is a user-entered annual amount in v1. The page may hint where to find it, but states no figure. EV tax rules and company car benefit in kind are out of scope. Nothing in 3a touches either.

## Engine decisions (slice 3a, proposed; owner to confirm)

### F5. Time grid and timing

- One period is a month, a twelfth of a year (`MONTHS_PER_YEAR`); no day counts.
- The agreement starts at month 0: the deposit, and any arrangement fee paid at the start (F10), fall there.
- Regular payments are made in arrears: the first one month after the start, the last at the end of the term.
- A final payment (a PCP's optional final payment, an HP balloon) and a purchase fee (HP's option to purchase fee, a PCP's purchase fee) fall with the last regular payment. Basis: VAT Notice 700, 8.4, "a small option to purchase fee, normally payable with the last instalment"; Revenue and Customs Brief 1 (2019), the option fee is "payable immediately after (effectively at the same time as) the balloon payment" (CR-7, CR-8). Payment dates in days are not modelled.

### F6. The rate a person enters

Pricing is either an annual interest rate with its basis, or the regular payment (F8 then finds the rate).

- Basis `'monthly'`: a nominal annual rate r, charged r / 12 each month.
- Basis `'annual'`: an effective annual rate r, so each month's rate is (1 + r)^(1/12) − 1, a root (irrational), held in fine fixed point as the compound engine's C2 and C9.

Which basis a lender's quoted rate uses is not stated on any page read (CR-1, CR-4), so the person chooses; the page (3c) explains both in words. Bounds: from nothing to `MAX_FINANCE_RATE` (F13).

### F7. The payment and the schedule

With A the balance financed (F10), B the final payment, n the term in months and i the monthly rate, v = 1 / (1 + i):

- The regular payment P = (A − B × v^n) × i / (1 − v^n); when i is nothing, P = (A − B) / n. It is computed in fine fixed point and rounded **once to the nearest penny** (`nearest`, halves away from zero).
- Each month: interest = the **opening** balance × i, rounded to the nearest penny; closing = opening + interest − payment. On the `'monthly'` basis i is rational and the product is rounded exactly (`mulRound` with an exact `Ratio`), so an exact half penny goes up; on the `'annual'` basis, or a solved rate, i is held to forty places (`FinePence`).
- **Priced by the rate**, the **last regular payment takes the rounding**: it is whatever brings the last closing balance to exactly B.
- **Priced by the payment**, every payment is the one given (it is the contract's figure), and the **last month's interest takes the rounding** instead: it is whatever brings the last closing balance to exactly B. It differs from the last opening balance × i by the accumulated rounding, a few pence at most. So total interest is exactly n × P + B − A, as HMRC's HP example states it (HP-1).
- Either way the schedule adds up to the penny: balance financed + total interest = total of monthly payments + B.
- The last closing balance is the final payment still owed (zero for a loan or an HP agreement without a balloon). It is paid at the end (PCP buy, HP) or settled by handing the car back (PCP hand back, F11).
- A rate-priced schedule whose rounded payment would leave the last payment below nothing (a balance only pennies above the final payment over a long term) is refused (`'result'`, `'not-payable'`).

No source read states how a lender rounds monthly interest or the payment (CR-1); this rounding is the decision. HMRC's finance-lease example (EIR-3) shows each year's split in whole pounds with the pound that makes the totals add up put in the last year; the engine, in pence, matches its first four years to the pound and its exact totals.

### F8. The effective rate (not the statutory APR)

HMRC's Corporate Finance Manual (CFM21180, CR-5) defines the effective interest rate as "the rate that exactly discounts the cash flows associated with the financial instrument through to maturity ... to the net carrying amount at initial recognition", and says it "will include fees and costs where these are integral to the loan" (CR-6). The engine solves that equation per month for the agreement's cash flows:

    credit received at the start = Σ (payment at month t) × (1 + i)^−t

- **Credit received**: the amount financed (the cash price less the deposit, or the loan amount), less an arrangement fee paid at the start (F10). A fee added to the balance is not credit received, so it raises the rate.
- **Payments**: every regular payment as made (the last one with its rounding), plus, at the last month, the final payment and the purchase fee (the PCP buy path; F11).
- The **annual effective rate** is (1 + i)^12 − 1: twelve equal months compound to a year, as in the compound engine's C2. Both are returned as `Ratio`s to fifteen decimal places; nothing is rounded for display in the engine.

The statutory APR (F15, verified in 3a.1) uses the same equation on an annual basis with a month a twelfth of a year, so on the same cash flows its unrounded value equals this annual effective rate. They can still differ: the APR counts only the charges its rules count (CR-2), its treatment of a PCP's optional final payment and of purchase and option fees is OPEN (CR-10), and it is shown rounded (CR-3). So this rate keeps its name and is never labelled "APR"; the result's assumptions say so in words.

### F9. How the rate is solved

Bisection on fine fixed point (`Factor`), deterministic:

- f(i) = present value of the payments at i − credit received. Every payment after the start is zero or more, so f falls as i rises.
- If f(0) = 0 the rate is nothing. If f(0) < 0 (payments below the credit) there is no rate of zero or more: refusal `'no-solution'`.
- Otherwise the root lies in (0, 1] a month: if f(1) > 0 (a rate above 100% a month would be needed) the refusal is `'no-solution'`.
- Each step halves [low, high] keeping f(low) > 0 ≥ f(high). It stops when high − low is at most `RATE_SOLVE_TOLERANCE` (10^-`RATE_SOLVE_DIGITS`, 10^-24, a month) and returns the midpoint, within half that of the true root. From a bracket of width one this takes about eighty steps; `RATE_SOLVE_MAX_STEPS` (200) is the bound, and reaching it is the refusal `'no-convergence'` (it cannot happen with these settings, but the type carries it).
- The present value is worked out by Horner's rule in `FinePence`, each product to the nearest unit of 10^-40. Round trip: discounting the payments at the solved rate gives the credit received within 10^-9 of a penny (`docs/money.md`, "Car finance (slice 3a)").

### F10. Fees

- **Arrangement fee** (a loan's arrangement fee, an HP or PCP documentation fee): either paid **at the start** (not financed; it reduces the credit received in F8) or **added to the balance** (financed; interest runs on it; F7's A includes it).
- **Purchase fee** (HP's option to purchase fee, a PCP's purchase fee): with the last regular payment (F5); in the buy path only.
- **Cost of credit** = total interest + arrangement fee + purchase fee. It is this engine's term; the statutory total charge for credit counts what CR-2 lists (broker fees known to the lender, compulsory ancillary services such as required insurance), which the engine does not model, and whether it counts a purchase fee is OPEN (CR-10).

### F11. HP, PCP and the loan at the end

- **Loan**: the person owns the car from the start (the loan pays for it); the agreement is cash. No final payment or purchase fee.
- **HP**: ownership passes at the end once the option to purchase fee is paid (CR-7). An HP balloon is allowed; it is not optional (CR-8). One path.
- **PCP**: two paths, both returned (CR-9):
  - **Buy**: pay the optional final payment and the purchase fee; own the car. The effective rate (F8) is on this path.
  - **Hand back**: pay neither; return the car; pay an excess mileage charge = (expected miles − allowed miles, if above nothing) × the charge per mile. Miles are whole miles over the whole agreement; the charge per mile is whole pence. Condition and damage charges are not modelled.
- Total cost of each path = deposit + arrangement fee + regular payments (+ final payment + purchase fee, or + excess mileage charge).

No page read states how a PCP's mileage excess is charged (CR-11); it is a contract term the person enters.

### F12. The outstanding balance

`outstandingBalance(result, month)` is the schedule's balance after that month's payment (month 0: the balance financed; the last month: the final payment still owed; beyond the term: nothing). 3b uses it for equity (value − balance) and negative equity. It is **not** a settlement figure: statutory early settlement (the rebate, any deferral) and voluntary termination are OPEN and not modelled (CR-12, CR-13).

### F13. Refusals and bounds

The engine never returns a wrong number. It refuses, naming each field:

- an amount that is not a safe whole number of pence, below nothing, or over `MAX_INPUT_AMOUNT`;
- a term that is not a whole number of months, below one, or over `MAX_FINANCE_TERM_MONTHS` (120, ten years);
- a rate that is not a `Ratio`, below nothing or over `MAX_FINANCE_RATE` (100% a year); a basis or a choice that is not one of the options;
- a deposit at or above the cash price (nothing to finance), a loan amount of nothing;
- a final payment above the balance financed;
- a payment that does not cover the balance with no interest (n × P + B below A), or one so high the rate would pass 100% a month (`'no-solution'`);
- miles not whole, below nothing or over `MAX_MILEAGE`; a charge per mile over `MAX_EXCESS_PER_MILE` (£10);
- a result that would pass the safe range of `Money` (`'result'`, `'too-large'`).

The bounds are conservative input bounds, not market figures, for the owner to confirm.

### F14. Flat rate

Left out. No page read defines a flat rate or relates one to an APR (CR-4). HMRC's bad debt relief examples (VBDR2420, VBDR2430) describe a one-year HP agreement with "interest of 20%" and total interest of £1,800 on £9,000; that is an example, not a definition, and is mirrored only as totals (`docs/worked-examples.md`, HP-1).

### F15. The statutory APR (slice 3a.1)

`apr(flows)` solves the equation in CONC App 1.2.6R (CR-1) for one drawdown and dated payments:

    drawdown = Σ (payment at month m) × (1 + X)^−(m / 12)

- **Time basis**: months from the first drawdown, a month a twelfth of a year (CONC App 1.2.6R(3)(b) to (e), "12 equal months"). Payment dates in days are not modelled (F5), so the days basis is never needed.
- **Method**: with 1 + X = (1 + i)^12 the equation is F8's monthly equation, so `apr` sums the payments by month, takes those at month 0 off the drawdown, solves for i with F9's bisection and returns X = (1 + i)^12 − 1 (`annualRate`). That is an exact rewriting, not an approximation; the only error is the solver's (10^-24 a month, so X is good to about 10^-20).
- **Which payments**: the caller's. The drawdown is the total amount of credit, the sum made available (the cash price less the deposit, or the loan amount; G3188). The payments are the repayments and the charges in the total charge for credit (CR-2): interest within the regular payments, a required arrangement fee (at month 0 if paid at the start, inside the payments if added to the balance), an HP balloon at its month (CR-10). The engine builds no agreement-level APR: whether a PCP's optional final payment and a purchase or option fee count is OPEN (CR-10), so the page shows an APR only for agreements without them until those close.
- **Display**: `display` is X to one decimal place of a percentage (`APR_DISPLAY_DIGITS`, the least the rule allows, CR-3), to the nearest, a following figure of five or more rounding up (`roundRatio`, mode `'nearest'`, which is that rule for a rate of nothing or more). It is rounded from the fifteen-place `annual`, so a rate that sits on a display half to fifteen places counts as on it and rounds up; the 40-place solver value of such a rate can fall a hair below the half (about 10^-24), which the rule would not mean to round down. `annual` keeps fifteen places for comparisons.
- **Refusals**: as F9 (`'no-solution'`, `'no-convergence'`): nothing borrowed, nothing repaid, month-0 charges at or above the drawdown, or less repaid than borrowed (a negative rate; CONC App 1.2 gives no rule for one). A month that is not whole, below nothing or over `MAX_FINANCE_TERM_MONTHS`, or an amount below nothing, throws `EngineInputError`.
- **Assumptions** (CONC App 1.2.5R, CR-16): every payment is made on its date (a). The others apply only "where necessary" (1.2.5A G) and cover what the engine does not model.

