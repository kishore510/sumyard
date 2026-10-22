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


## Owner decisions (slice 3b, 22 October 2026)

O1 to O8 of the 3b brief, numbered on from F15. Code: `src/calculators/car-ownership/` (`calc.ts`, `types.ts`); constants in `src/lib/inputLimits.ts`, `src/lib/units.ts` and `src/lib/money.ts`.

### F16. An option (O1)

An option is a **car** and an **acquisition**. The car: its price (buy, loan, HP, PCP) or current value (keep); its value at the horizon in low, expected and high cases; annual mileage; fuel type and its cost; running costs. The acquisition: keep, buy outright (cash), loan, HP or PCP, the last three through the 3a engine (`loan`, `hirePurchase`, `pcp`) with the car's price as the cash price. A PCP option chooses its end (buy or hand back); comparing both ends is two options. From one to four options (`MAX_CAR_OPTIONS`) on one horizon.

### F17. Value over time (O2)

Only the price or current value V0 and the three horizon values are inputs. Between them the value falls (or rises) by a constant yearly percentage fitted to hit the horizon value: V(m) = V0 × (VH / V0)^(m / H) at month m of a horizon of H months, which is a constant monthly factor q = (VH / V0)^(1/H), the yearly change q^12 − 1. It is an **illustrative shape**, not a depreciation model. V(0) = V0 and V(H) = VH exactly; months between are rounded to the penny. A horizon value of nothing gives nothing from month one; a car worth nothing stays worth nothing. Zero depreciation (VH = V0) and a rise are allowed up to VH ≤ V0 × `MAX_HORIZON_VALUE_RATIO` (three halves).

### F18. Net cost (O3)

Net cost at a month = cash out so far (deposit, payments, fees, running costs, any end payment) − the car's **equity** then (its value less what is still owed on it) + the opportunity cost of cash. With nothing owed, equity is the value, as O3 states; with a finance balance still owed (a horizon inside the term), subtracting the value alone would count the car as fully paid for, so the balance is added back. For **keep**, the current value counts as given up at month 0 (the sale forgone): it is not cash out, but it is in the net cost and in the opportunity cost ("the capital tied up in the car's current value"). So keeping a car worth V0 costs exactly what buying the same car for V0 in cash costs (the parity test).

**Opportunity cost**: every outflow (and keep's forgone sale) compounded forward to the month at the person's savings return, an **after-tax annual effective rate** they enter, less the outflows themselves: Σ c_k ((1 + s)^((m − k) / 12) − 1). `futureValueOfFlows` does this in fine fixed point by Horner's rule with the monthly factor (1 + s)^(1/12), rounded once to the penny. It does not call `project()` (finance payments stop at the term); a property test shows that for level monthly payments it equals `project()` within a penny.

### F19. Coverage (O4)

Each option reports `coverageMonths`, the months within the horizon it has a car: the horizon, except a PCP handed back before the horizon, which covers the term. No replacement car is modelled. Totals are taken at the end of coverage, and the headline is **net cost per month of coverage**, with the total beside it. An option with less coverage than the horizon is flagged (`fullCoverage: false`) and listed apart; it is never ranked against full coverage.

### F20. Equity (O5)

Equity at a month = value − `outstandingBalance` (3a, F12), so negative equity shows. When the term ends inside the horizon: HP and PCP buy pay the final payment and purchase fee and keep the car (nothing owed); PCP hand back returns the car, which settles the final payment, and pays the excess mileage charge (F11); after hand-back there is no car and no equity.

### F21. Running costs (O6)

Insurance, maintenance, VED and other: annual amounts the person enters for the first year (no tax figure, no VED rule), each rising by one general yearly increase. Fuel or energy: cost per mile × annual mileage, with its own yearly price change. `costPerMile` takes (a) miles per (imperial) gallon and a price per litre, with the litres in a gallon from `src/lib/units.ts` (verified, CO-1); (b) miles per kWh, a home share and home and public prices per kWh; or (c) a cost per mile. No tax rule for electric cars and no benefit in kind.

### F22. Flip points (O7)

For two options and one value case: the horizon value of either option, the savings return, and the annual mileage (set the same for both, as one driver) at which their net costs per month of coverage are equal. A typed "no crossing in range" when there is none in the search range. Reported as thresholds, never as a recommendation. Method: F29.

### F23. Language (O8)

Results say "lowest net cost under these assumptions", never "best", "recommended" or "should". The engine's assumption strings are checked for those words.

### Owner confirmation (slice 3c-1, 22 October 2026)

The owner confirmed, at the start of 3c-1:

- **F18** as read in 3b: net cost subtracts **equity** (the value less any balance still owed), not the value alone.
- **Keep** counts the current value as a **sale given up** at month 0: in the net cost and the opportunity cost, not in the cash out.
- **The mileage flip point** (F22, F29) sets the **same annual mileage for both options**, "as one driver".
- **The 3b bounds** (F30) as proposed.

### Owner confirmation (slice 3c-2, 22 October 2026)

The owner accepted, at the start of 3c-2, the starting horizon **`DEFAULT_HORIZON_MONTHS` = 48** (four years): a starting value for a fresh page, not a bound and not advice.

## Engine decisions (slice 3b, proposed; owner to confirm)

### F24. Time grid

Month 0 is the start: a cash price, a deposit, a fee paid at the start and keep's forgone sale fall there. Running costs and fuel are paid monthly in arrears, months 1 to the end of coverage. Finance payments follow 3a (F5); when the horizon ends inside the term, payments stop at the horizon and the balance is still owed (F18). A loan's amount may be below the price: the rest is paid in cash at month 0; a loan above the price is refused. A PCP's expected mileage is the annual mileage × term / 12, to the nearest whole mile.

### F25. Rounding

Each month's running cost and fuel cost is exact (`ExactPence`: annual amount × (1 + increase)^year / 12, year = whole years since the start) and rounded once to the nearest penny. The value at a month is rounded once to the nearest penny from fine fixed point; the horizon value is exact. The opportunity cost at a month is rounded once. Every total is a sum of those pennies, so the breakdown adds up to the net cost exactly.

### F26. Breakdown

At the end of coverage E, with V0 the starting value, V(E) the value then and B the balance (at hand-back, the final payment the car settles):

- **depreciation** = V0 − V(E) (negative if the value rose);
- **interest and fees** = acquisition outlay + forgone sale − V0 + B (interest, fees, purchase and option fees, the excess mileage charge; nothing for cash or keep);
- **equity handed back** = V(E) − B at a PCP hand-back (negative when the final payment was above the value), else nothing;
- **fuel, insurance, maintenance, VED, other**: the sums of the monthly amounts;
- **opportunity cost** (F18).

They add up to the net cost to the penny.

### F27. Comparison

`compareOptions` costs every option on the shared horizon and savings return. For each value case it ranks the full-coverage options by net cost per month of coverage (compared exactly, as net × the other's coverage) and states ties; partial-coverage options are listed apart, unranked. The order means "lowest net cost under these assumptions" (F23).

### F28. Refusals

As 3a: `{ ok: false, problems: [{ field, reason }] }`, with `option` (its index) on a problem in one option, 3a's finance problems passed through under the same option, and `'result'` / `'too-large'` when a sum would pass the safe range. Bounds: F30.

### F29. How flip points are found

- **Horizon value**: closed form. Net cost is linear in the option's horizon value VH: −1 per penny while the car is held at the horizon, 0 when it was handed back earlier (then there is no crossing unless the two are equal throughout). The crossing X solves (net(0) − X) / C = net_other / C_other exactly; it is returned to the nearest penny if it lies in [0, V0 × `MAX_HORIZON_VALUE_RATIO`].
- **Savings return** and **annual mileage**: a bounded, deterministic search. Each is scanned on a grid of `FLIP_SCAN_STEPS` equal steps over its range (savings return 0 to `MAX_SAVINGS_RETURN`, in steps of 10^−`FLIP_RATE_DIGITS`; mileage 0 to `MAX_ANNUAL_MILEAGE`, whole miles); at the first step where the order changes, bisection narrows it to two neighbouring values (10^−`FLIP_RATE_DIGITS` apart, or one mile) with different orders. The result is that pair and which option is lower each side. Crossings that come and go within one grid step can be missed; that is stated in the assumptions. A tie on the way is carried past to the first step where the other option is lower (F53, 3d-2).

### F30. Proposed bounds (for the owner)

| Input | Bound | Constant |
|---|---|---|
| Options | 1 to 4 | `MAX_CAR_OPTIONS` |
| Horizon | 1 to 240 months (20 years) | `MAX_HORIZON_MONTHS` |
| Horizon value | nothing to 1.5 × the starting value | `MAX_HORIZON_VALUE_RATIO` |
| Annual mileage | whole miles, nothing to 100,000 | `MAX_ANNUAL_MILEAGE` |
| Savings return (after tax) | nothing to 20% a year | `MAX_SAVINGS_RETURN` |
| Yearly increase (running costs, fuel price) | −50% to +50% | `PRICE_CHANGE_BOUND` |
| Miles per gallon | above nothing, to 1,000 | `MAX_MILES_PER_GALLON` |
| Miles per kWh | above nothing, to 20 | `MAX_MILES_PER_KWH` |
| Price per litre, per kWh, cost per mile | nothing to 1,000 pence | `MAX_PENCE_PER_UNIT` |
| Home charging share | nothing to all | (a share) |
| Running costs | nothing to `MAX_INPUT_AMOUNT` a year | `MAX_INPUT_AMOUNT` |

### F31. Not modelled

Replacement cars, early termination and settlement of a new agreement, part exchange, leasing, tax on savings beyond the after-tax rate entered, EV tax rules, benefit in kind, VED rules, insurance or servicing models, condition charges at hand-back. Finance still owed on a kept car is modelled from 3e (F43 to F52) from the lender's settlement figure; early-settlement charges and rights, handing back an existing PCP and a second agreement on the new car stay out.

## Page decisions (slice 3c-1, proposed; owner to confirm)

How the car decision page (`src/calculators/car-decision/`) uses the engines where the brief left a choice. No figure; no engine change.

### F32. Empty boxes and what an option needs

Every amount and rate starts empty (null in the stored inputs: not entered). Nothing is defaulted to a number. An option is costed only when every box it shows for its kind, fuel type and pricing is filled (`missingFields`); until then its card lists what it needs. An empty fee is not read as nothing: enter 0 for none. (Superseded for optional costs and fees by F38 in 3c-2.) The shared savings return and yearly increase are needed before any option is costed. The horizon starts at `DEFAULT_HORIZON_MONTHS` (a starting value, not a bound and not advice).

### F33. Shared and per-option yearly changes

The yearly increase in insurance, maintenance, VED and other costs is one shared assumption, passed to every option as the engine's `generalIncrease`. The fuel or energy price has its own yearly change per option (petrol and electricity prices need not move together).

### F34. A PCP's mileage allowance

Entered a year, as agreements quote it. Over the agreement it is the yearly allowance × term ÷ `MONTHS_PER_YEAR`, to the nearest whole mile: the rule the engine uses for the expected mileage (F24), so the two are counted alike. A PCP option always takes the final payment, purchase fee, allowance and excess charge, whichever end is chosen.

### F35. Which rate a card shows

One rule, in `rates.ts`: a loan, and HP with no option to purchase fee, show the statutory APR from `apr()` on the agreement's own payments (the drawdown is the amount financed; an arrangement fee paid at the start is a payment at month nothing; each monthly payment; an HP balloon at the end), shown to one decimal place (F15, CR-1 to CR-3, CR-10's HP balloon). A PCP (its final payment is optional) and HP with an option fee show the finance engine's effective rate labelled "Effective interest rate, not the lender's APR", while CR-10 is OPEN for them. Keep and cash show no rate.

### F36. Order, and options set apart

Cards follow `compareOptions`' ranking for the case shown: full-coverage options in order, ties stated, then partial-coverage options (never ordered against them), then options without results. An option missing inputs, one with a box being typed that isn't valid yet, or one the engine refuses is left out of the comparison, with its reason on its card; the rest are compared without it. A refusal with no option (a sum past the safe range) is traced by costing each option alone.

### F37. Flip points on the page

"What changes the answer" shows `flipPoints` for the two lowest full-coverage options in the case shown, as sentences that say what is held fixed; none when fewer than two options cover the horizon. One pair costs about 300 ms at four options and the longest horizon (`docs/performance.md`), so it is worked out once the inputs have settled (`SETTLE_MS`), not on every keystroke. More pairs are left to 3c-2 (F42).

## Page decisions (slice 3c-2, proposed; owner to confirm)

How the 3c-2 additions use the engines where the brief left a choice. No figure; no engine change.

### F38. Optional boxes read as nothing (inputs version 2)

The optional costs and fees (`OPTIONAL_FIELDS`: insurance, maintenance, VED, other, a deposit, an arrangement fee, an HP balloon, option and purchase fees, a PCP's excess charge per mile) are stored as amounts, never null: an empty box reads as nothing and is stored as 0, shown empty with a 0 placeholder and a hint that says so. Everything else an option needs is still required (the price or value, the three end values, the annual mileage, the fuel figures for its type, the yearly fuel price change, the loan amount, the term, the rate or payment, a PCP's final payment and mileage allowance), and its card lists each missing one on its own line. Inputs version 2; the migration from version 1 turns those fields' nulls into 0 and keeps every other field, so an option that was costed has the same figures and one that waited only for an optional fee is now costed as if 0 had been typed.

### F39. The crossover chart

x is the month, 0 to the horizon; y is each option's cumulative net cost (`MonthPoint.netCost`) in the case shown, straight from the engine's months. A line stops at the end of its coverage (a PCP handed back), marked "handed back at month N"; the horizon and each finance term that ends inside it are marked. A line keeps its style by its place in the editor (accent, contrast, neutral, then secondary for a fourth option; none is the danger colour, since no option is a warning; each style has its own colour token, dash and marker, and each line is named at its end). Lines that cross are not called an order; the cards' order is at the horizon (F27).

### F40. The selected month

One month for the page, the horizon until another is picked (a tap, the arrow keys, Home or End on the chart, or a row's button in its table); a month past a shorter horizon reads as the horizon. The readout shows each option's net cost so far, equity and cash out at that month from the engine's months; a car handed back shows the month it went back and no figures. Never stored (no new storage key, not in scenarios), reset by a load.

### F41. Sensitivity

For each costed option, one input at a time moved by each of `SENSITIVITY_SHIFTS` (−20, −10, +10 and +20 percent of its current value), every other input held at its current value: the end value in the case shown (to the nearest penny, `mulRound`), the savings return (exactly), the annual mileage (to the nearest whole mile; a PCP's expected mileage follows it, as in the flip search) and the fuel or energy price (every price its fuel type uses, exactly). Each cell is `ownershipCost` with the move less the engine's figure without it, in net cost per month of coverage; a move past a bound the engine refuses has no figure ("Outside the range"). Rows are sorted by the largest size of change in the row, largest first. Worked out only while its section is open, once the inputs settle, one input of one option per step (`docs/performance.md`).

### F42. Flip points for any pair

Any two options that cover the whole horizon with results, chosen by name (two Selects); the default is the two lowest in the engine's ordering (F37). The same option twice is not a pair. `flipPoints` measures at the end of coverage, so the page says the thresholds are measured over the whole horizon, whatever month the chart shows. Memoised by the pair and its engine inputs.


## Keeping a car with finance still owed (session 3e, owner's brief, 22 October 2026)

The owner's decisions for keeping the current car while finance on it is still owed, numbered on from F42. Engine: `src/calculators/car-ownership/` (`existingFinance` on the keep acquisition); page: `src/calculators/car-decision/`. No config change and no figure.

### F43. Inputs

A kept car takes a switch, "Still owe finance on it?", off by default. When on, four boxes: the **settlement figure** (the lender's quote to clear the agreement today), the **monthly payment**, **payments left** (whole months) and a **final payment** due at the end (default 0, not null: an empty box reads as nothing, as F38's optional boxes). The engine's keep acquisition takes an optional `existingFinance { settlement, monthlyPayment, paymentsLeft, finalPayment }`; absent means no finance, exactly as before.

### F44. The maths

With V0 the car's value now, S the settlement and equity_m = value_m − balance_m:

net cost at month m = payments to m (and the final payment once paid) + (V0 − S) − equity_m + opportunity cost.

The **sale given up is V0 − S** (the net proceeds of selling today and clearing the finance), not V0. At month 0 the balance is S, so equity is V0 − S and the net cost is zero. Each payment's principal lowers the balance by the same amount it adds to cash out, so the principal cancels: only the interest is a finance cost. The breakdown (F26) shows depreciation and **interest** (its `interestAndFees` part, here interest alone: payments + final payment paid − S + the balance still owed), and no principal line. Cash out at month 0 is nothing: nothing is paid upfront.

### F45. The implied rate

The rate is implied from the person's figures by 3a's solver, not a second one: the agreement goes to 3a's `hirePurchase` priced by the payment (cash price S, no deposit, no fees, the final payment as its balloon, the payments left as its term), so `solveRate` (F9) finds the monthly rate, `buildSchedule` (F7, the last month's interest taking the rounding) gives the amortising balance and `outstandingBalance` (F12) the balance at each month. The card labels it "Implied rate from your figures, not the lender's APR".

### F46. The end of the term

The final payment is paid with the last monthly payment at the end of the term and the car is kept. Handing back an existing PCP is out of scope (`docs/open-questions.md`).

### F47. Negative equity now

A settlement above the car's value today is allowed and flagged on the card. The sale given up, V0 − S, is then negative: selling today would cost money to clear the finance. It enters the net cost and the opportunity cost as any other flow at month 0, compounded at the savings return like the rest, so keeping counts the cash a sale would have needed as cash kept, earning the savings return.

### F48. The settlement figure

The settlement is the lender's figure, as quoted. Early-settlement charges and statutory early-termination rights are not modelled, and no rule about them is stated. The box's hint says to use the lender's current quote.

### F49. Timing

The first remaining payment is one month from today (as F5). If the term ends inside the horizon, the final payment is paid then and nothing is owed afterwards. If the horizon ends first, equity at the horizon is the value less the balance still owed; negative equity there shows, as F20.

### F50. Refusals

Typed, never a number (F28), each naming its field: the payments and final payment adding up to less than the settlement (a negative implied rate; field monthly payment); payments left of nothing (with or without a monthly payment), not whole or above `MAX_FINANCE_TERM_MONTHS`; any amount outside the existing bounds; and, from 3a's checks, a settlement of nothing or a final payment above the settlement. A payment too high for any rate the solver brackets is refused as 3a refuses it.

### F51. Inputs version 3

The page's inputs go to version 3 with five fields per option (the switch and the four boxes). Existing options migrate with the switch off, the three amounts empty and the final payment 0; their results are identical (a snapshot test through storage, as 1b-i.1). Version 1 migrates through version 2.

### F52. Running-cost rounding, accepted

The per-month rounding of running costs (`docs/open-questions.md`, about 40p over ten years) is accepted by the owner as it is; not changed.

## Thresholds and the cost bridge (session 3d-2, owner's brief, 22 October 2026)

The owner's decisions for the flip search past a tie, a fuel or energy price threshold and a bridge of the difference between two options, numbered on from F52. Engine: `src/calculators/car-ownership/calc.ts` (`flipPoints`, `fuelPriceFlip`, `pencePerLitreFor`, `costBridge`); page: `src/calculators/car-decision/`. No config change, no figure, no new tolerance constant.

### F53. A search carries on past a tie (closes OQ-flip-tie)

F29's bounded search (savings return, annual mileage, and F54's fuel price) changes how it treats a tie. With the order at the bottom of the range a strict one (one option lower), a step where the two are level is passed over: the scan carries on to the first step where the **other** option is lower. If the same option is lower again after a tie, that was a touch, not a crossing, and the scan carries on; if the other option is never lower in the range, the result is no crossing, that option lower throughout. At a crossing, two bisections narrow it: the first to neighbours where the other option becomes lower (`above`), the second, only when the value just below `above` is level, to neighbours where the first option stops being lower (`below`). The result names the option lower on each side, both strict, and, when the two are level between them, the band as `level: { from, to }` (the first and last values searched, the neighbours of `below` and `above`). Both ends of the band are level. Near a crossing the order is not settled: the penny-rounded totals are level or pennies apart either way, and can flicker between the three over the band and just outside it (bisection finds one edge on each side, not necessarily the outermost). So the page gives each value as "about", says the band in words ("from about P to about Q the two are level or pennies apart"), and never a single point; where P and Q show the same, it says "at about P". In a seeded check of 40 pairs over 240 months, 12 of the 21 savings-return crossings passed such a band; the old search stopped in every one.

A range that starts level is unchanged: the first step where one option is lower is the crossing, with the two level below it (`lowerBelow: 'tie'`), and no band. Two options level throughout are no crossing, level throughout. The search uses the same grid (`FLIP_SCAN_STEPS`, steps of 10^−`FLIP_RATE_DIGITS`, or whole miles); no tolerance is added. A crossing with no tie is reported exactly as before (the same `below`, `above` and orders, no `level`).

The horizon value (F29's closed form) has no such fault: it solves for the crossing exactly and names the other option below it and the subject above it, both strict; at the crossing itself, to the penny, the two can be level, and that is said as one point.

### F54. The fuel or energy price threshold

`fuelPriceFlip([first, second], shared, case)`: the first option's fuel or energy cost per mile at which the two average costs per month owned are equal at the end of coverage, everything else as entered (the second option untouched; the first option's mileage, yearly fuel price change, finance and running costs as entered). The first option's fuel is replaced by a direct cost per mile (the `per-mile` kind, whose pence per mile is F21's (c)) and the cost per mile is searched as F29 and F53 do, from nothing to `MAX_PENCE_PER_UNIT` pence per mile (what the page accepts for a direct cost per mile), in steps of 1 / `FLIP_RATE_DENOMINATOR` of a penny. The step is the rate search's own denominator, a billionth of a penny per mile, so no new constant: at any mileage the engine accepts, one step moves a month's fuel by far less than the penny it is rounded to. Same refusals as `flipPoints` (F28); "no crossing in range" as the other searches.

The page shows it in pence per mile always. For petrol or diesel it is also shown as a price per litre, through F21's conversion turned round: `pencePerLitreFor(pence per mile, miles per gallon)` = pence per mile × miles per gallon ÷ `LITRES_PER_GALLON`, exactly. For an option on a direct cost per mile, pence per mile only. For electric, pence per mile only, with a sentence saying it is the home and public charging together, the split held as entered. A first option driven no miles has no fuel cost to change: no crossing.

### F55. The cost bridge

`costBridge(first, second, case)` (two `OwnershipResult`s): for two options that both cover the whole horizon, the difference in average cost per month owned, first less second, split by the engine's breakdown parts (F26): interest and fees, depreciation, equity handed back, fuel or energy, insurance, maintenance, VED, other and opportunity cost. Equity handed back is a part too: a PCP handed back at the end of a term equal to the horizon covers the whole horizon and has it, and without it the parts would not add up. Null when either option covers less than the horizon (the page then hides the bridge and says why). Pure, on the engine's results, no config.

Each part's exact value is (first's part − second's part) ÷ the months owned, an `ExactPence`; the parts add up to the exact difference of the two averages, since each breakdown adds up to its net cost exactly (F26). Shown to the penny so the shown parts add up to the shown total exactly:

- the shown total is the exact difference rounded once to the nearest penny, halves away from nothing: the verdict's gap a month (the total difference over the horizon, rounded once), so it can differ by a penny from the two cards' rounded averages subtracted;
- each part is first cut to whole pence towards nothing; the pennies still needed to reach the shown total go one each to the parts with the largest remainders in that direction (by size, then by the parts' order); each shown part is within a penny of its exact value.

So the bridge of an option against itself is nothing in every part, and swapping the pair turns every exact and shown figure to its negative.

The page names the largest part by its shown size: "Most of the difference is X: £N a month." when it is on the same side as the total and more than half of it; otherwise "The largest part is X: £N a month", saying it is on the other side from the total or less than half of it. Tied largest parts are named together. Described, never explained: nothing says why a part differs.

### F56. The bridge's pair

The bridge uses the same pair as "What changes the answer" (F42): the same two choices, by default the two lowest in the engine's order; choosing either in one place changes both. Its own two Selects sit in the bridge's section (the pair Selects were below the cards; the bridge is with the results), labelled the same and saying the pair is shared.
