# Car decision (slices 3c-1, 3c-2 and 3d-1)

The car decision page (**3c-1, 0.19.0**; the chart, readout, sensitivity and any-pair flip points in **3c-2, 0.20.0**) at `#/c/car-decision`, on the car ownership-cost engine (`../car-ownership/`, 3b) and the car finance engine (`../car-finance/`, 3a). Up to four options (keep, buy with cash, loan, HP, PCP buying or handing back) over one horizon, in low, expected and high cases for each car's end value. Uses no tax rules (`taxRules: 'none'`). Illustrative, not financial advice.

The results answer first (**3d-1, 0.22.0**): a verdict sentence, the switch cost against keeping, the bottom line and the low, expected and high table, then the detail.

Decisions: F1 to F31 (the engines) and the page's F32 to F42 in `docs/modelling-decisions-car.md`; layout patterns U16 to U22 and U29 to U33 in `docs/ui-patterns.md`. The page holds no figure. Every result is the engines'; the only arithmetic (`narrative.ts`) is differences and sums of the engine's whole-penny amounts, and a total over the months owned rounded once to the nearest penny.

## Files

- `definition.ts`: the registry entry (inputs version 2). The stored inputs (every required amount and rate empty to start: null; the optional costs and fees, `OPTIONAL_FIELDS`, 0, which an empty box reads as (F38), with the migration from version 1; money in pence; rates as percentage text; miles per gallon and prices per unit as decimal text), field-by-field validation that builds a fresh object (hostile keys refused, bounds from `src/lib/inputLimits.ts`, one to `MAX_CAR_OPTIONS` options), `missingFields` (the boxes an option still needs), `toEngineOption` (a PCP's yearly allowance over the term to the nearest mile, as the engine counts the expected mileage), `calculate` (the engine's `compareOptions` with options missing inputs, held back while typing, or refused set apart, each with its reason), the words for each refusal, and the compare rows (per option by name: net cost per month of coverage, total net cost, coverage, equity at the horizon; and the case selected).
- `rates.ts`: which rate a card shows (F35): the engine's `apr()` for a loan and for HP with no option fee, else the effective rate labelled "Effective interest rate, not the lender's APR".
- `results.ts`: the card order (the engine's ranking: full coverage, then partial, then no results), the ordering rule and ties in words, the breakdown's parts, and the flip points for a pair as sentences: any two full-coverage options (`pairChoices`), the two lowest by default (F37, F42).
- `narrative.ts` (3d-1): the results in words from the engine's comparison: `verdict` (the lowest net cost from the full-coverage ranking, the gap a month and over the horizon to the next, the savings return used; or why there is none), `switchCosts` (against a Keep option), `largestCost` (the largest breakdown part), `bottomLine` (lowest net cost, running cost and depreciation per month owned, the cost of the alternative unless a switch line names the same pair), `scenarioTable` (each option in the three cases, whether the lowest changes) and `moneyFlows` (upfront cash from the timeline, the monthly and final payments from the finance engine's schedule and end path). `engineNames` maps names to engine indexes. `emptyRunningCosts`, `emptyRunningText` and `emptyCostsDiffer` (3d-1.1) list the optional running-cost boxes left empty, from the inputs.
- `chart.ts`: the crossover chart's months, lines (the engine's cumulative net cost per month in the case shown, stopping at the end of coverage) and markers (the horizon, finance terms, a hand-back), and the readout at a month (F39, F40).
- `sensitivity.ts`: one input moved by each of `SENSITIVITY_SHIFTS` percent (`shiftOption`), each change an `ownershipCost` rerun less the figure without it (`driverRow`), rows largest effect first (F41).
- `CarDecisionPage.tsx`: the page (StickyResult, ScenarioBar, the horizon and case, shared assumptions, the option list with add, duplicate and remove with Undo, the flip points after the inputs settle). `OptionEditor.tsx`: one option's editor with sections and live summaries and the engine's cost per mile. `CarAnswer.tsx` (3d-1): the verdict panel with the switch cost, the bottom line and the low, expected and high table, first in the results column. `CarResults.tsx`: the order, "What changes the answer" (with the pair picker and the note that thresholds are measured over the whole horizon), the cards (with the largest part and money in and out, 3d-1) and the comparison table. `CarViews.tsx`: the crossover chart with the selected month and the readout; the sensitivity section, worked out only while open, after the inputs settle, in steps (`useSensitivity`).
- Tests: `narrative.test.ts` (3d-1: the owner's page against hand-worked figures, ties, partial coverage, one option, no Keep option, zero savings return, the lowest changing between cases, 150 random cases against the engine, banned words), `definition.test.ts`, `CarDecisionPage.test.tsx` (including 150 random inputs against the engine and the banned words), `views.test.ts` (the chart data, the readout and the sensitivity against engine calls, with 100 random inputs), `crossChecks.test.ts` (with `docs/car-cross-checks.json`), `literals.test.ts`. `fixtures/inputs.ts` holds made-up page inputs (test-only).

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
| An empty optional box reads as nothing, with the same figures as 0 typed; a required one holds its option back, named on its card; a version 1 scenario loads with identical figures | `definition.test.ts`; `CarDecisionPage.test.tsx` |
| The chart's points are the engine's months; a line stops at the end of coverage with an end marker; markers for the horizon and finance terms; the case switch | `views.test.ts`; `CarDecisionPage.test.tsx` |
| The selected month by keyboard, tap and table row; the readout at it; a shorter horizon; never stored | `views.test.ts`; `CarDecisionPage.test.tsx` |
| Sensitivity: each shift moves only its input; cells equal engine reruns; a move past a bound has no figure; a savings return of nothing; sorted; only while open, after the inputs settle | `views.test.ts`; `CarDecisionPage.test.tsx` |
| Flip points for any pair; the same option twice; measured over the whole horizon | `CarDecisionPage.test.tsx` |
| Verdict: lowest by average cost per month owned, never a partial option; a tie; a partial option lower per month owned (no verdict); one option; one full; none full; zero savings return | `narrative.test.ts` |
| Switch cost only with a Keep option, partial left out; money flows add up to the timeline; scenario rows the engine's per case; the lowest changing between cases | `narrative.test.ts` |
| Running costs left empty (none, one option with gaps, the same gaps); the alternative only for a new pair; a flip into a tie; the side-by-side table reading as the cards (3d-1.1) | `narrative.test.ts`; `results.test.ts`; `CarDecisionPage.test.tsx` |
| The answer first in the results column, the phone bar's verdict, one polite announcement, the cards' new rows, the labels | `CarDecisionPage.test.tsx` |
| No figure in the page's files; no "best", "recommended", "cheapest", "cheaper", "guaranteed", "should", "winner", "optimal" or "will be worth" | `literals.test.ts`; `CarDecisionPage.test.tsx` |

Mutation spot-checks (3c-1), each made by hand, run against the folder's tests (166, later 167) and reverted: the low and high cases swapped on the cards (2 fail); coverage ignored in the ordering (survived at first: the ordering test's partial option was already dearest per month; a test with a partial option cheapest per month was added, then 1 fails); equity omitted from the card (6); a breakdown part dropped (1); the rate label chosen wrongly, a PCP shown as APR (1).

Mutation spot-checks (3c-2), each made by a script, run against the folder's tests (216) and reverted: the chart's series offset by one month (6 fail); coverage end ignored, the line carried on at its last value (4); the sensitivity's savings-return shift applied to the fuel price instead (2); the selected month ignored in the readout, always the horizon (4); an optional empty box read as blank (null) instead of 0 (3). All caught.

Mutation spot-checks (3d-1), each made by a script, run against `narrative.test.ts` and `CarDecisionPage.test.tsx` (93) and reverted: a partial option compared to the lowest on its total instead of per month owned (1 fail); partial-coverage options given a switch cost (1); a breakdown part dropped (2); the case ignored in the verdict, always the expected ranking (2). All caught.

Mutation spot-checks (3d-1.1), each made by a script, run against `narrative.test.ts` and `CarDecisionPage.test.tsx` (109) and reverted: a filled box read as empty (7 fail); the differ line shown when gaps match (4); an empty list given text (2); the coverage cell showing the total (1); the table's rate formatted apart from the card (1); the table back to `min-w-max` (1); the sticky column without its background (1). All caught.

## Cross-checks

`docs/car-cross-checks.json` seeds six one-option cases (cash, a loan, HP, PCP buy, PCP hand back, keep) with every expected value null; they run as todo tests until the owner fills them from a spreadsheet or a real dealer quote for the payment, with the source and date. No value is invented.
