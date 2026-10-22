# PHASE-BRIEF: Keep a car with finance still owed

Status: slices 1b (take-home and optimiser), 2 (compound interest) and 3 (car decision) are built; each stays In progress in `PLAN.md` until the owner's checks below. The **pension compare redesign** (1b-iii) is Done (0.21.0, PR #27). The **car results redesign** (3d-1) is Done (0.22.0, PR #28), from the owner's use of the car page. **Keeping a car with finance still owed** (3e) is Done (0.23.0). Status per part lives only in `PLAN.md`. Finished part scopes are in `docs/history/phase-brief-archive.md`.

## Docs rule

Close out every session with the tiered checklist in `CLAUDE.md` ("Session close-out checklist").

## Part 3e: keep the current car with finance still owed (0.23.0)

### Goal

On the car decision page, a kept car can carry finance still owed: the lender's settlement figure, the monthly payment, the payments left and any final payment. Its net cost counts the sale given up as the value less the settlement, only the interest as a finance cost, and the rate implied from the figures by 3a's solver. Decisions F43 to F52 (`docs/modelling-decisions-car.md`), U37 (`docs/ui-patterns.md`).

### Scope

- Engine: an optional `existingFinance` on the keep acquisition (through 3a's `hirePurchase` priced by the payment); without it, every result bit-identical.
- Page: the switch and four boxes in the Keep option's Finance section; inputs version 3; the card's implied rate, payments left, final payment and negative equity now; compare rows; Help and assumptions.

### Out of scope

Early-settlement charges and rights, handing back an existing PCP, a second agreement on the new car (`docs/open-questions.md`); any config change.

## Still with the owner

Confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input. Slice 2: fill `docs/compound-cross-checks.json` (eight cases, with source and date); confirm the C8 rate bounds and the starting years (`DEFAULT_PROJECTION_YEARS`).

Slice 3a: confirm decisions F5 to F14 and the bounds (`src/calculators/car-finance/README.md`); confirm F15 (one decimal place, the drawdown, an added fee as a charge) and settle CR-10 (a PCP's optional final payment, purchase and option fees in the APR) from a source before any page shows an APR for PCP or HP with an option fee; decide whether the hand-back path should also take condition charges. Slice 3b: confirm F24 to F31 (`src/calculators/car-ownership/README.md`); F18's two readings and the bounds were confirmed at the start of 3c-1; confirm litres per gallon from legislation.gov.uk (CO-1). Slice 3c-1: fill `docs/car-cross-checks.json` (six cases: a spreadsheet, or a real dealer quote for the payment; source and date) and `docs/compound-cross-checks.json`; spot-check the litres per gallon line in a fuel cost per mile; confirm the page decisions F32 to F37 (`DEFAULT_HORIZON_MONTHS` = 48 accepted at the start of 3c-2); check the page on a real phone. Slice 3c-2: confirm the page decisions F38 to F42 (optional boxes read as nothing, the chart, the selected month, the sensitivity's shifts, any pair); whether to move the flip search and the sensitivity to a worker (one flip search is a 250 to 430 ms task after the inputs settle, `docs/performance.md`); check the chart and its selection on a real phone and with a screen reader.

Car results redesign (3d-1): confirm U29 to U33, the verdict's wording and the per-month gap (the total difference over the horizon, rounded once); decide OQ-flip-tie (the monthly penny drift was accepted as it is in 3e, F52) (`docs/open-questions.md`); confirm U34 to U36; check the page on a real phone and with a screen reader.

Finance on a kept car (3e): confirm F43 to F52 as built (the refusal of a final payment above the settlement and of no payments left even with no monthly payment, F50; the implied rate through `hirePurchase`, F45); check the page against a real lender statement and settlement quote; on a real phone and with a screen reader.

Compare redesign (1b-iii): confirm U24's maximum (the engine's, pay-bounded) and U25's chart measure (net cost per pound, an average from no contribution); check the page on a real phone, with Safari and with a screen reader.

## Last session

- 22 October 2026, 3e (0.23.0, user-visible): pre-check passed (PR #29 merged as 134232c; names as the brief). Decisions F43 to F52 first; engine tests red then green (no config change); page tests red then green; inputs version 3.
- The rate is implied through 3a's `hirePurchase` priced by the payment (`solveRate`, `buildSchedule`, `outstandingBalance`); no second solver. Without existing finance every result equals a frozen copy of the engine before 3e (286 checks).
- Differs from the brief: no payments left is refused even with no monthly payment; a final payment above the settlement and a settlement of nothing are refused (3a's checks). Mutants: 6 of 6 caught. Matrix: Chromium + axe 4.10, 360/768/1024/1280, light and dark, 192 checks clean.
- Not verified: a real phone, Safari, Firefox, a screen reader, the deployed site, a real lender statement.

## Next

- The owner's checks above, then propose the next slice: **mortgage overpayment** (`PLAN.md`), its brief and decisions first (daily versus monthly interest per lender).
- CR-10 (car finance): settle from a source whether a PCP's optional final payment and option fees count in the APR, before any card shows an APR for them.

Full history (progress logs, finished part scopes, slice archives): `docs/history/` (grep it, don't read it whole).
