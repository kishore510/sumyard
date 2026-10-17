# Hello calculator (placeholder)

**Placeholder: removed when the first real calculator ships.** It exists to exercise the shared plumbing: the registry, shared inputs and validation, result cards, the assumptions panel, the chart in both themes, scenarios (save, load, duplicate, delete with undo), export and import, compare, and the refusal notice.

- `calc.ts`: `calculateHello(inputs, config)`, pure. The amount times the percentage through `mulRound` with the chosen rounding mode, and a series of up to 10 steps that applies the percentage to the previous step, rounding each time.
- `definition.ts`: the registry entry: defaults, hand-written `validateInputs` (builds a fresh object), `migrateInputs` (none: inputs version 1), and `summarise` for compare.
- `HelloPage.tsx`: the page.

## Assumptions

- No tax logic and no tax figure. The default amount and percentage are arbitrary demonstration values.
- Amount: whole pence, from zero to one thousand million pounds. Percentage: -100 to 100, at most two decimals, stored as canonical text and read as an exact Ratio. Steps: 2 to 10. These limits keep every step inside the safe-integer range.
- "Show the tax year's dates" asks `requireVerified` for `period.start` and `period.end`. On the skeleton 2026-27 config they are unverified, so the page shows the refusal notice instead of results. That is the intended demonstration.

## Edge cases (each tested in `calc.test.ts`)

Rounding modes (nearest, down, up) at a half penny; a negative percentage (halves away from zero for nearest); the largest amount at the largest percentage stays safe; the refusal on the skeleton; dates shown for a fake verified year; every invalid input field.
