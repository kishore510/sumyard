# Compound interest (slice 2)

The engine for the compound interest calculator. **2a (0.15.0): engine only**, no page, registry entry or Help yet (2b). Illustrative, not financial advice; no tax and no tax wrappers.

Decisions: C1 to C9 in `docs/modelling-decisions-compound.md`. Rounding and precision: `docs/money.md`, "Compound interest (slice 2a)".

## Files

- `types.ts`: `CompoundInputs` (C1), `YearRow`, `Projection`, `Views`, `CompoundResult`, `CompoundOutcome` and the refusal reasons.
- `calc.ts`: the pure engine.
  - `effectiveAnnualRate(growthRate, compounding)`: (1 + r/m)^m − 1 (C2).
  - `periodRate(growthRate, compounding, contributionFrequency)`: the equivalent effective rate per contribution period, (1 + r/m)^(m/p) − 1 (C2).
  - `realRate(nominalEffective, inflation)`: the Fisher relation (C5).
  - `project(inputs)`: yearly rows (opening, contributions, growth, fees, closing, and the cumulative contributions, growth and fees), nominal and real, with and without the fee; the effective rates before and after fees, the period rate, the real rate, fee drag and assumptions. Or a typed refusal (C8).
  - `futureValue(inputs)`: the nominal closing balance with the fee (throws `EngineInputError` where `project` refuses).
  - `feeDrag(withFee, noFee)`: closing without the fee less closing with it, nominal and real.
  - `checkInputs(inputs)`: every problem, by field.
- Constants live outside the folder: calendar divisors in `src/lib/periods.ts` (`PERIODS_PER_YEAR`, C7), bounds in `src/lib/inputLimits.ts` (`MAX_PROJECTION_YEARS`, the rate bounds, C8), fixed point in `src/lib/money.ts` (C9).

## Assumptions

Listed in the result's `assumptions` (no figures): a steady nominal rate; the equivalent effective rate where frequencies differ; start-of-period contributions earn that period's growth; the fee is a percentage of the balance after each compounding period's growth; contributions rise once a year; real values by the Fisher relation; a year is a whole number of periods (a weekly year is 52 weeks); no tax, wrapper, flat fee or contribution charge; rounded only for output, with rows that add up.

## Sources and cross-checks

- Published: the Green Book (2026), Table 8 (GB-1, GB-2 in `docs/worked-examples.md`): nominal growth, a deflator and discount factors, and the rule against adding rates. Mirrored in `published.test.ts`.
- No published worked example of regular contributions was found on the pages this environment could read (MoneyHelper was refused by the network policy). `reference.test.ts` checks 300 seeded cases against `fixtures/reference.ts`, the closed-form lump sum and annuity (due and immediate) formulas in exact rational arithmetic.

## Edge cases and their tests

| Case | Test |
|---|---|
| One year, one period, no contributions | `calc.test.ts`, one year, one period |
| Start against end of period | `calc.test.ts`; `properties.test.ts` |
| Fee after growth (annual and monthly); an end-of-period contribution pays no fee | `calc.test.ts` |
| Monthly compounding with monthly contributions against the closed form | `calc.test.ts`; `properties.test.ts` |
| Weekly contributions with monthly compounding (a root); annual with monthly; monthly with annual; weekly with daily | `properties.test.ts` |
| Zero rate, negative rate, fee larger than growth | `calc.test.ts`; `properties.test.ts` |
| Contribution increase with and without growth | `calc.test.ts` |
| Real view: positive inflation, Fisher not subtraction | `calc.test.ts`; `published.test.ts`; `properties.test.ts` |
| 100-year horizon, weekly with daily compounding | `calc.test.ts` |
| Huge amounts each side of the safe-integer guard | `calc.test.ts` |
| Zero, negative, part or too many years; rates beyond bounds; bad frequencies; bad amounts | `calc.test.ts`, refusals |
| Rows add up to totals in every view | `properties.test.ts` |
| No figure in the engine | `literals.test.ts` |

Mutation spot-checks (slice 2a), each made by hand in `calc.ts`, run, and reverted: timing flipped (309 of 358 tests fail), fee charged before growth (2 fail), the nominal rate used as the effective rate (254 fail), Fisher replaced by subtraction in the real rate (2 fail) and in the real values (305 fail).
