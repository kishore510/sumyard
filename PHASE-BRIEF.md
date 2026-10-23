# PHASE-BRIEF: Household budget

Status: the household budget (0.25.0) is built in this session (section below). slices 1 (take-home pay and the pension optimiser), 2 (compound interest) and 3 (car decision) are **Done**: marked so by the owner on 23 October 2026 (`PLAN.md`). The last parts were 1b-iii (0.21.0, PR #27), 2b (0.16.0, PR #20) and 3d-2 (0.24.0, PR #31). The confirmations below stay open as follow-ups; they no longer hold a slice's status. Status per part lives only in `PLAN.md`. Finished part scopes are in `docs/history/phase-brief-archive.md`.

## Docs rule

Close out every session with the tiered checklist in `CLAUDE.md` ("Session close-out checklist").

## Part 3d-2: thresholds past a tie, the fuel price threshold and the cost bridge (0.24.0)

### Goal

On the car decision page, "What changes the answer" names the option lower on each side of every threshold (the search carries on past a tie) and adds the first option's fuel or energy price threshold; "Where the difference comes from", under the verdict, splits the pair's difference in average cost per month owned by part. Decisions F53 to F56 (`docs/modelling-decisions-car.md`), U38 and U39 (`docs/ui-patterns.md`).

### Scope

- Engine: `flipPoints`' search past a tie (closes OQ-flip-tie), `fuelPriceFlip`, `pencePerLitreFor`, `costBridge`; pure, no config.
- Page: the band and fuel sentences, the bridge section with its own pair Selects sharing the pair, `BridgeBar`, the sensitivity table on a phone; Help, assumptions, READMEs. No new inputs, no inputs-version, storage, scenario or compare change.

### Out of scope

A bridge for partial coverage or across the three cases; a joint price threshold for an electric and a petrol pair (`docs/open-questions.md`); any config change.

## Household budget (0.25.0)

Prioritised by the owner on 23 October 2026, ahead of the mortgage overpayment slice.

### Goal

`#/c/budget`: income after tax, outgoings by kind, what is left and how much goes where, a month or a year, with what-if sliders. No tax or ISA rules (`taxRules: 'none'`), "Uses no tax rules" in place of the badge. Decisions BD1 to BD9 (`docs/modelling-decisions.md`), U40 and U41 (`docs/ui-patterns.md`).

### Scope

Engine (`budget/calc.ts`, tests first), `definition.ts` (inputs version 1), the page, the shared `SliderInput`, scenarios, compare, Help topic `budget`, README, `MAX_BUDGET_LINES`. No new storage key.

### Out of scope

Tax or ISA rules, interest or projections, importing from the take-home calculator, categories beyond BD1, charts beyond SplitBar, per-pay-period payroll, changes to other calculators.

### Progress log

- Pre-check: PR #33 merged and its Pages deploy succeeded. The no-tax-year path already existed (`taxRules: 'none'`, from compound interest); no registry change was needed, only a budget test of it. The brief's version 0.13.0 was taken (1b-ii-a), so this is 0.25.0.
- Engine red then green; mutation spot-checks all caught. Definition, `SliderInput` and page red then green. Browser matrix: 226 checks, two layout fixes (`docs/performance.md`).
- Owner to confirm: BD8 (savings rate excludes what is left over), BD9 (`MAX_BUDGET_LINES` = 40 per list), the template lines' periods (Fixed saver monthly), the shared `Field` label now wrapping anywhere.

## Still with the owner (follow-ups; slices 1 to 3 are Done)

Confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input. Slice 2: fill `docs/compound-cross-checks.json` (eight cases, with source and date); confirm the C8 rate bounds and the starting years (`DEFAULT_PROJECTION_YEARS`).

Slice 3a: confirm decisions F5 to F14 and the bounds (`src/calculators/car-finance/README.md`); confirm F15 (one decimal place, the drawdown, an added fee as a charge) and settle CR-10 (a PCP's optional final payment, purchase and option fees in the APR) from a source before any page shows an APR for PCP or HP with an option fee; decide whether the hand-back path should also take condition charges. Slice 3b: confirm F24 to F31 (`src/calculators/car-ownership/README.md`); F18's two readings and the bounds were confirmed at the start of 3c-1; confirm litres per gallon from legislation.gov.uk (CO-1). Slice 3c-1: fill `docs/car-cross-checks.json` (six cases: a spreadsheet, or a real dealer quote for the payment; source and date) and `docs/compound-cross-checks.json`; spot-check the litres per gallon line in a fuel cost per mile; confirm the page decisions F32 to F37 (`DEFAULT_HORIZON_MONTHS` = 48 accepted at the start of 3c-2); check the page on a real phone. Slice 3c-2: confirm the page decisions F38 to F42 (optional boxes read as nothing, the chart, the selected month, the sensitivity's shifts, any pair); whether to move the flip search and the sensitivity to a worker (one flip search is a 250 to 430 ms task after the inputs settle, `docs/performance.md`); check the chart and its selection on a real phone and with a screen reader.

Car results redesign (3d-1): confirm U29 to U33, the verdict's wording and the per-month gap (the total difference over the horizon, rounded once); decide OQ-flip-tie (the monthly penny drift was accepted as it is in 3e, F52) (`docs/open-questions.md`); confirm U34 to U36; check the page on a real phone and with a screen reader.

Finance on a kept car (3e): confirm F43 to F52 as built (the refusal of a final payment above the settlement and of no payments left even with no monthly payment, F50; the implied rate through `hirePurchase`, F45); check the page against a real lender statement and settlement quote; on a real phone and with a screen reader.

Thresholds and the cost bridge (3d-2): confirm F53 to F56 as built (the band said as "about", level or pennies apart; equity handed back as a bridge part; "Most of the difference" only past half and on the total's side; the bridge in pence whatever Settings shows; the bridge's own Selects sharing the pair); check the bridge on a real phone and with a screen reader.

Compare redesign (1b-iii): confirm U24's maximum (the engine's, pay-bounded) and U25's chart measure (net cost per pound, an average from no contribution); check the page on a real phone, with Safari and with a screen reader.

## Last session

- 23 October 2026: household budget (0.25.0, PR #34): engine, page, `SliderInput`, Help, scenarios and compare; browser matrix passed after two wrap fixes.
- Not verified: a real phone, Safari, Firefox, a screen reader, the deployed site by hand.

## Next

- Owner: confirm the budget items in its progress log above.
- Propose the next slice: **mortgage overpayment** (`PLAN.md`), its brief and decisions first (daily versus monthly interest per lender). The owner's follow-up checks above can be done alongside.
- CR-10 (car finance): settle from a source whether a PCP's optional final payment and option fees count in the APR, before any card shows an APR for them.

Full history (progress logs, finished part scopes, slice archives): `docs/history/` (grep it, don't read it whole).
