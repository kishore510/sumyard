# Car ownership (slice 3b)

The car ownership-cost engine (**3b, 0.18.0**). The car decision page (`../car-decision/`, 3c-1, 0.19.0) is built on it. It costs up to four options (keep, buy outright, loan, HP, PCP buy or PCP hand back) over one fixed horizon in low, expected and high cases for the car's value, and finds the flip points between two of them. Built on the car finance engine (`../car-finance/`). Illustrative, not financial advice; no tax.

Decisions: F16 to F23 (the owner's O1 to O8), F24 to F31 (proposed) F43 to F52 (3e, finance still owed on a kept car, from the owner's brief) and F53 to F56 (3d-2: the search past a tie, the fuel price threshold, the cost bridge) in `docs/modelling-decisions-car.md`. Sources: `docs/verification-log.md`, "Car ownership (slice 3b)" (CO-1: litres per gallon). Rounding and precision: `docs/money.md`, "Car ownership (slice 3b)".

**Net cost** at a month = cash out − equity (value less what is still owed) + the opportunity cost of cash; keep counts its value as a sale forgone at the start, so keeping a car and buying the same car for its value cost the same (F18). The headline is **net cost per month of coverage**; a PCP handed back before the horizon covers only its term, is flagged and is never ranked against full coverage (F19). Results mean "lowest net cost under these assumptions", never "best" (F23).

## Files

- `types.ts`: `Car`, `FuelCost`, `RunningCosts`, `Acquisition`, `CarOption`, `Shared`, `ValueCurve`, `TimelineMonth`, `MonthPoint`, `Breakdown`, `CaseResult`, `OwnershipResult`, `Comparison`, `Flip` (with a `level` band, F53), `FlipPoints`, `Bridge` and the refusal shapes.
- `calc.ts`: the pure engine.
  - `valueCurve(start, end, horizonMonths)`: V0 q^m with q = (VH / V0)^(1/H), the ends exact, and the fitted yearly change (F17).
  - `costPerMile(fuel)`: exact pence per mile from miles per gallon and a price per litre, miles per kWh and a home/public blend, or a cost per mile (F21).
  - `futureValueOfFlows(flows, annualRate, atMonth)`: dated outflows compounded at (1 + s)^(1/12) a month, in fine fixed point (F18).
  - Keep takes an optional `existingFinance { settlement, monthlyPayment, paymentsLeft, finalPayment }` (3e, F43 to F50): 3a's `hirePurchase` priced by the payment (the settlement as the amount, no deposit or fees, the final payment as the balloon) implies the rate and gives the schedule and balance; the sale given up is the value less the settlement (below nothing with negative equity now); 3a's refusals are named by these fields. Absent, every result is bit-identical to the engine before 3e.
  - `ownershipCost(option, shared)`: the monthly timeline, coverage, and per value case the months (cash out, value, balance, equity, opportunity cost, net cost), the breakdown, the net cost and the net cost per month of coverage; or a typed refusal.
  - `compareOptions(options, shared)`: every option and, per value case, the full-coverage ranking with ties and the partial-coverage list (F27).
  - `flipPoints([a, b], shared, valueCase)`: the horizon value of each (closed form), the savings return and the annual mileage (grid scan and bisection) at which the two are equal per month of coverage, or "no crossing in range" (F22, F29). From a strict order a tie on the way is carried past to the first value with the other option lower; a band of ties between is `level: { from, to }` (F53, 3d-2).
  - `fuelPriceFlip([a, b], shared, valueCase)`: option a's fuel or energy cost per mile, in exact pence, at which the two are equal per month of coverage, everything else as entered: a's fuel as a direct cost per mile, searched as the savings return (F54). `pencePerLitreFor(pencePerMile, milesPerGallon)`: F21's conversion turned round.
  - `costBridge(first, second, valueCase)`: for two full-coverage results, the difference in average cost per month owned split by breakdown part, exact and to the penny, the shown parts adding up to the shown total; null otherwise (F55).
- Constants live outside the folder: bounds in `src/lib/inputLimits.ts` (F30), `LITRES_PER_GALLON` in `src/lib/units.ts` (CO-1), `MONTHS_PER_YEAR` in `src/lib/periods.ts`, `FLIP_RATE_DIGITS`, `FLIP_RATE_DENOMINATOR` and `FLIP_SCAN_STEPS` in `src/lib/money.ts`.

## Proposed bounds (F30, for the owner to confirm)

| Input | Bound |
|---|---|
| Options | 1 to 4 |
| Horizon | 1 to 240 months |
| Horizon value | nothing to 1.5 × the starting value (zero depreciation and a modest rise allowed) |
| Annual mileage | whole miles, nothing to 100,000 |
| Savings return (after tax) | nothing to 20% a year |
| Yearly increase (running costs, fuel price) | −50% to +50% |
| Miles per gallon; miles per kWh | above nothing to 1,000; above nothing to 20 |
| Price per litre, per kWh, cost per mile | nothing to 1,000 pence |
| Running costs | nothing to £10m a year |

Finance inputs keep the 3a bounds (F13). A loan above the car's price is refused.

## Assumptions

Listed in each result's `assumptions` (no figures): one horizon for every option; net cost as above; the value curve is an illustrative constant yearly change; running costs and fuel monthly, each rising once a year by its own change; the savings return is after tax, applied monthly as its equivalent; pounds of the day; no tax, VED rules, benefit in kind, replacement car, early settlement or part exchange. Per kind: keep's forgone sale (with finance still owed: the value less the settlement, the payments as entered, only their interest a cost, the implied rate not the lender's APR, early settlement charges not modelled); cash paid at the start; finance through the 3a engine with the balance owed at the horizon taken off the value; PCP hand back settles the final payment, pays any excess mileage, and the months after are not covered. The comparison adds the ordering rule and that flip points are found on a grid.

## Sources and cross-checks

- No published worked example of a car's ownership cost was looked for or found; the hand-checkable cases OWN-1 to OWN-5 (`docs/worked-examples.md`) are mirrored in `calc.test.ts`.
- `reference.test.ts`: 300 seeded cases, fifty each of keep, cash, loan, HP, PCP buy and PCP hand back, against `fixtures/reference.ts` (exact fractions; the finance schedule from 3a, which has its own reference). Every whole-penny figure agrees exactly; a value or opportunity cost rounded from an irrational number is compared unless within 10^-12 of a half penny.
- `existing.test.ts` (3e): the brief's fixtures (a) to (f) (zero interest; payments below the settlement refused; settlement above the value; the term ending inside the horizon; the horizon ending inside the term with a final payment owed; a case with interest by own arithmetic, the implied rate discounting the payments back to the settlement in exact fractions, and the balance against the exact amortisation), the refusals by field, and 120 seeded cases against the reference (the cash flows and the sale given up by own arithmetic) with the properties: net cost at month 0 is nothing, the breakdown adds up, at a zero return net cost less running costs = depreciation + paid − settlement + balance owed, a higher settlement with the same payments lowers the implied rate. `compareOptions` and `flipPoints` with the new option.
- `unchanged.test.ts` (3e): without existing finance, one option (240 seeded cases of every kind), a comparison (40 groups) and flip points (6 pairs) equal `fixtures/before3e.ts`, a frozen copy of the engine before 3e. Since 3d-2, a search the old engine stopped at a tie is checked to carry on to the other option lower instead (one of the six pairs).
- `properties.test.ts`: `futureValueOfFlows` equals the compound engine's `project()` within a penny for level monthly payments (60 cases).

## Edge cases and their tests

| Case | Test |
|---|---|
| Cash, no running costs, no return: net cost = price − end value; keep = cash of the same car | `calc.test.ts`; `properties.test.ts` |
| Value curve: exact ends, a quarter over two years, level, rising, to nothing, worth nothing, one month | `calc.test.ts` |
| Running costs and fuel by year; zero mileage | `calc.test.ts` |
| Horizon inside the term (with and without interest), equal to the term, beyond it | `calc.test.ts` |
| Negative equity | `calc.test.ts` |
| PCP buy; PCP hand back before, at and after the horizon; net cost independent of the value at hand-back | `calc.test.ts` |
| Zero depreciation | `calc.test.ts`; `properties.test.ts` |
| The largest inputs everywhere (no overflow; a sum past the safe range would be the `too-large` refusal) | `calc.test.ts` |
| Refusals by field and option; finance problems passed through; one to four options | `calc.test.ts`; `flip.test.ts` |
| Ranking, ties, partial coverage apart | `calc.test.ts` |
| Breakdown adds up; coverage within the horizon; monotone in end value, savings return and horizon | `properties.test.ts` |
| Flip points: closed form at the penny, out of range, hand back (no dependence), identical options, savings return and mileage either side, seeded pairs | `flip.test.ts` |
| Past a tie: the savings return, mileage and fuel price crossings name the option actually lower above them, the band's ends level; seeded pairs of every kind with keep owing finance (3d-2) | `threshold.test.ts` |
| Fuel price threshold: either side by recosting, the averages within a penny, the yearly fuel price change held, price per litre turned round, no miles, no crossing, refusals (3d-2) | `threshold.test.ts` |
| Cost bridge: parts are per-month differences, add up exactly (exact and shown), nothing against itself, sign flips with the pair, null for partial coverage, equity handed back, keep owing finance; 40 seeded groups (3d-2) | `bridge.test.ts` |
| No figure in the engine; no "best", "recommended" or "should" | `literals.test.ts`; `calc.test.ts` |
| Finance still owed on a kept car: zero interest, negative equity now, term inside and beyond the horizon, the final payment, interest against own arithmetic, refusals by field (3e) | `existing.test.ts` |
| Without existing finance, identical to the engine before 3e | `unchanged.test.ts` |

Mutation spot-checks (slice 3b), each made by hand in `calc.ts`, run, and reverted (of 1,625 tests): the value curve fitted to the wrong end (301 fail); the opportunity cost omitted (241); a hand back treated as covering the horizon (28); the equity sign flipped (765); the general increase applied to fuel (238); keep's forgone sale omitted (293); the flip search's equity not net of the balance (3).

Mutation spot-checks (3e), each made by a script in `calc.ts`, run against `existing.test.ts` (513 tests) and reverted: the sale given up as the value instead of the value less the settlement (369 fail); the principal counted as a cost in the breakdown (243); the final payment dropped (41); equity ignoring the balance (246); the implied rate not used, a zero rate instead (135); coverage ending with the payments (156). All caught.

Mutation spot-checks (3d-2), each made by a script in `calc.ts`, run against `bridge.test.ts`, `threshold.test.ts`, `flip.test.ts` and the page's `results.test.ts` (97 tests) and reverted: the bridge omits a part (35 fail); the bridge uses totals, not per month owned (42); the flip search stops at the first tie again (12); the fuel flip ignores the yearly fuel price change (9); the bridge's sign swapped (44). All caught.
