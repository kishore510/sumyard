# Household budget

At `#/c/budget` (0.25.0). Income after tax and outgoings by kind: what is left, and the share of income each part takes, a month or a year, with what-if sliders. Uses no tax rules (`taxRules: 'none'`): no tax year, no config, no `requireVerified`. Decisions BD1 to BD9 in `docs/modelling-decisions.md`; page patterns U40 and U41 in `docs/ui-patterns.md`.

## Files

- `calc.ts`, `types.ts`: the pure engine, `budget(inputs)`: totals by kind, leftover (may be below nothing), shares of income as exact Ratios (null with no income), the savings rate, each line's year and month, the penny drift between rounded month rows and their totals, warnings and assumptions; a typed refusal by line for anything outside the input limits.
- `definition.ts`: inputs version 1 (`pay`, `payPeriod`, `income`, `outgoings`), the default template lines, validation (hostile keys, fresh objects, names tidied and cut), `toEngineInputs` (Your pay first), `withWhatIf`, section summaries, compare rows.
- `BudgetPage.tsx`: the page.

## Assumptions

- Amounts are after tax, as entered. A blank amount is nothing.
- A year is exact: a weekly amount times the weeks in a year (`PERIODS_PER_YEAR`), and so on. A month is each yearly figure divided by the months, to the nearest penny; totals come from the years, so month rows can differ from their total by a penny or two, and the page says so.
- Shares are of total yearly income. The savings rate is the savings kind over income; what is left is not counted as saved (BD8).
- A card payment and the spending on that card would count twice; a joint account transfer is an outgoing from this account.

## Edge cases and their tests

| Case | Test |
|---|---|
| Each period converts exactly (weekly 100 is 5,200 a year) | `calc.test.ts` period conversion |
| Month figure rounding, the round trip for whole-month amounts | `calc.test.ts` |
| Blank amounts, no income (shares n/a), negative leftover (not capped) | `calc.test.ts` blank, zero and negative |
| Penny drift stated | `calc.test.ts`, `BudgetPage.test.tsx` |
| Amounts past the limit, unsafe numbers, bad periods or kinds, too many lines (`MAX_BUDGET_LINES`) | `calc.test.ts` refusals, `definition.test.ts` |
| Kinds sum to outgoings, leftover = income − outgoings, shares sum to one, a spending line never raises leftover, order does not matter | `properties.test.ts` (seeded) |
| Hostile keys and bad shapes on import | `definition.test.ts` |
| What-ifs never stored; Apply with Undo | `definition.test.ts`, `BudgetPage.test.tsx` |
| Scenarios carry no tax year | `definition.test.ts` |

Mutation spot-checks (0.25.0): weekly counted as quarters fails 6 tests; yearly counted as months fails 6; a share over the wrong denominator fails 10; leftover capped at nothing fails 5.

## Cross-check

No tax rule, so no GOV.UK source: every figure is a sum of what is entered, checked by hand in the tests (for example 3,000 a month pay and 1,200 a year side work is 37,200 a year).
