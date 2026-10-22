# Car ownership (slice 3b)

The car ownership-cost engine (**3b, 0.18.0**). The car decision page (`../car-decision/`, 3c-1, 0.19.0) is built on it. It costs up to four options (keep, buy outright, loan, HP, PCP buy or PCP hand back) over one fixed horizon in low, expected and high cases for the car's value, and finds the flip points between two of them. Built on the car finance engine (`../car-finance/`). Illustrative, not financial advice; no tax.

Decisions: F16 to F23 (the owner's O1 to O8) and F24 to F31 (proposed) in `docs/modelling-decisions-car.md`. Sources: `docs/verification-log.md`, "Car ownership (slice 3b)" (CO-1: litres per gallon). Rounding and precision: `docs/money.md`, "Car ownership (slice 3b)".

**Net cost** at a month = cash out − equity (value less what is still owed) + the opportunity cost of cash; keep counts its value as a sale forgone at the start, so keeping a car and buying the same car for its value cost the same (F18). The headline is **net cost per month of coverage**; a PCP handed back before the horizon covers only its term, is flagged and is never ranked against full coverage (F19). Results mean "lowest net cost under these assumptions", never "best" (F23).

## Files

- `types.ts`: `Car`, `FuelCost`, `RunningCosts`, `Acquisition`, `CarOption`, `Shared`, `ValueCurve`, `TimelineMonth`, `MonthPoint`, `Breakdown`, `CaseResult`, `OwnershipResult`, `Comparison`, `Flip`, `FlipPoints` and the refusal shapes.
- `calc.ts`: the pure engine.
  - `valueCurve(start, end, horizonMonths)`: V0 q^m with q = (VH / V0)^(1/H), the ends exact, and the fitted yearly change (F17).
  - `costPerMile(fuel)`: exact pence per mile from miles per gallon and a price per litre, miles per kWh and a home/public blend, or a cost per mile (F21).
  - `futureValueOfFlows(flows, annualRate, atMonth)`: dated outflows compounded at (1 + s)^(1/12) a month, in fine fixed point (F18).
  - `ownershipCost(option, shared)`: the monthly timeline, coverage, and per value case the months (cash out, value, balance, equity, opportunity cost, net cost), the breakdown, the net cost and the net cost per month of coverage; or a typed refusal.
  - `compareOptions(options, shared)`: every option and, per value case, the full-coverage ranking with ties and the partial-coverage list (F27).
  - `flipPoints([a, b], shared, valueCase)`: the horizon value of each (closed form), the savings return and the annual mileage (grid scan and bisection) at which the two are equal per month of coverage, or "no crossing in range" (F22, F29).
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

Listed in each result's `assumptions` (no figures): one horizon for every option; net cost as above; the value curve is an illustrative constant yearly change; running costs and fuel monthly, each rising once a year by its own change; the savings return is after tax, applied monthly as its equivalent; pounds of the day; no tax, VED rules, benefit in kind, replacement car, early settlement or part exchange. Per kind: keep's forgone sale; cash paid at the start; finance through the 3a engine with the balance owed at the horizon taken off the value; PCP hand back settles the final payment, pays any excess mileage, and the months after are not covered. The comparison adds the ordering rule and that flip points are found on a grid.

## Sources and cross-checks

- No published worked example of a car's ownership cost was looked for or found; the hand-checkable cases OWN-1 to OWN-5 (`docs/worked-examples.md`) are mirrored in `calc.test.ts`.
- `reference.test.ts`: 300 seeded cases, fifty each of keep, cash, loan, HP, PCP buy and PCP hand back, against `fixtures/reference.ts` (exact fractions; the finance schedule from 3a, which has its own reference). Every whole-penny figure agrees exactly; a value or opportunity cost rounded from an irrational number is compared unless within 10^-12 of a half penny.
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
| No figure in the engine; no "best", "recommended" or "should" | `literals.test.ts`; `calc.test.ts` |

Mutation spot-checks (slice 3b), each made by hand in `calc.ts`, run, and reverted (of 1,625 tests): the value curve fitted to the wrong end (301 fail); the opportunity cost omitted (241); a hand back treated as covering the horizon (28); the equity sign flipped (765); the general increase applied to fuel (238); keep's forgone sale omitted (293); the flip search's equity not net of the balance (3).
