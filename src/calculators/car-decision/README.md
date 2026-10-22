# Car decision (slice 3c-1)

The car decision page (**3c-1, 0.19.0**) at `#/c/car-decision`, on the car ownership-cost engine (`../car-ownership/`, 3b) and the car finance engine (`../car-finance/`, 3a). Up to four options (keep, buy with cash, loan, HP, PCP buying or handing back) over one horizon, in low, expected and high cases for each car's end value. Uses no tax rules (`taxRules: 'none'`). Illustrative, not financial advice.

Decisions: F1 to F31 (the engines) and the page's F32 to F37 in `docs/modelling-decisions-car.md`; layout patterns U16 to U19 in `docs/ui-patterns.md`. The page holds no figure and does no arithmetic on money: every result is the engines'.

## Files

- `definition.ts`: the registry entry (inputs version 1). The stored inputs (every amount and rate empty to start: null; money in pence; rates as percentage text; miles per gallon and prices per unit as decimal text), field-by-field validation that builds a fresh object (hostile keys refused, bounds from `src/lib/inputLimits.ts`, one to `MAX_CAR_OPTIONS` options), `missingFields` (the boxes an option still needs), `toEngineOption` (a PCP's yearly allowance over the term to the nearest mile, as the engine counts the expected mileage), `calculate` (the engine's `compareOptions` with options missing inputs, held back while typing, or refused set apart, each with its reason), the words for each refusal, and the compare rows (per option by name: net cost per month of coverage, total net cost, coverage, equity at the horizon; and the case selected).
- `rates.ts`: which rate a card shows (F35): the engine's `apr()` for a loan and for HP with no option fee, else the effective rate labelled "Effective interest rate, not the lender's APR".
- `results.ts`: the card order (the engine's ranking: full coverage, then partial, then no results), the ordering rule and ties in words, the breakdown's parts, and the flip points for the two lowest options as sentences (F37).
- `CarDecisionPage.tsx`: the page (StickyResult, ScenarioBar, the horizon and case, shared assumptions, the option list with add, duplicate and remove with Undo, the flip points after the inputs settle). `OptionEditor.tsx`: one option's editor with sections and live summaries and the engine's cost per mile. `CarResults.tsx`: the order, "What changes the answer", the cards and the comparison table.
- Tests: `definition.test.ts`, `CarDecisionPage.test.tsx` (including 150 random inputs against the engine and the banned words), `crossChecks.test.ts` (with `docs/car-cross-checks.json`), `literals.test.ts`. `fixtures/inputs.ts` holds made-up page inputs (test-only).

## Edge cases and their tests

| Case | Test |
|---|---|
| Every amount and rate empty; shared assumptions missing; an option missing inputs | `definition.test.ts`; `CarDecisionPage.test.tsx` |
| A box typed invalid holds back only its option; a shared one holds back everything | `CarDecisionPage.test.tsx` |
| An option the engine refuses (deposit at the price, end value above the most for the price): its own refusal, by field, on its card and editor | both |
| A PCP handed back before the horizon: coverage flagged, listed after full coverage even when cheapest per month | `CarDecisionPage.test.tsx` |
| Ties stated; the order follows the engine's ranking in each case | `CarDecisionPage.test.tsx` |
| Negative equity flagged; no car (handed back) at the horizon | `CarDecisionPage.test.tsx` |
| The breakdown's parts add up to the net cost | `CarDecisionPage.test.tsx` |
| APR for a loan and HP with no option fee, to one fixed place; the effective-rate label for a PCP and HP with a fee | `CarDecisionPage.test.tsx` |
| Flip points: held fixed, as one driver, no crossing in range, fewer than two options | `CarDecisionPage.test.tsx` |
| Each fuel type's cost per mile from the engine; switching keeps the values | `CarDecisionPage.test.tsx` |
| Hostile keys, bad shapes, every bound at and beyond, zero to five options, migrate | `definition.test.ts` |
| No figure in the page's files; no "best", "recommended", "cheapest", "guaranteed", "winner", "optimal", "will be worth" or "you should" | `literals.test.ts`; `CarDecisionPage.test.tsx` |

Mutation spot-checks (3c-1), each made by hand, run against the folder's tests (166, later 167) and reverted: the low and high cases swapped on the cards (2 fail); coverage ignored in the ordering (survived at first: the ordering test's partial option was already dearest per month; a test with a partial option cheapest per month was added, then 1 fails); equity omitted from the card (6); a breakdown part dropped (1); the rate label chosen wrongly, a PCP shown as APR (1).

## Cross-checks

`docs/car-cross-checks.json` seeds six one-option cases (cash, a loan, HP, PCP buy, PCP hand back, keep) with every expected value null; they run as todo tests until the owner fills them from a spreadsheet or a real dealer quote for the payment, with the source and date. No value is invented.
