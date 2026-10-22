# PHASE-BRIEF: Car decision results redesign

Status: slices 1b (take-home and optimiser), 2 (compound interest) and 3 (car decision) are built; each stays In progress in `PLAN.md` until the owner's checks below. The **pension compare redesign** (1b-iii) is Done (0.21.0, PR #27). The **car results redesign** (3d-1, 0.22.0) is built, from the owner's use of the car page, and awaits merge. Status per part lives only in `PLAN.md`. Finished part scopes are in `docs/history/phase-brief-archive.md`.

## Docs rule

Close out every session with the tiered checklist in `CLAUDE.md` ("Session close-out checklist").

## Part 3d-1: car decision results redesign (0.22.0)

### Goal

On the car decision page (`#/c/car-decision`), the results answer "which has the lowest net cost, by how much, and why" before any detail; the detail stays, below. Decisions U29 to U33 (`docs/ui-patterns.md`).

### Scope

- `narrative.ts` (pure, from `compareOptions`): `verdict`, `switchCosts`, `largestCost`, `bottomLine`, `scenarioTable`, `moneyFlows`.
- `CarAnswer.tsx`: the verdict and switch cost, the bottom line and the low/expected/high table first in the results column; the phone bar carries the verdict; one polite announcement after settle.
- Cards: "Average cost per month owned", the largest part, money in and out; plain-English value labels; the effective rate's fees.

### Out of scope

Any engine, config, storage or inputs-version change (the monthly penny drift is logged in `docs/open-questions.md`, not fixed); other calculators.

## Still with the owner

Confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input. Slice 2: fill `docs/compound-cross-checks.json` (eight cases, with source and date); confirm the C8 rate bounds and the starting years (`DEFAULT_PROJECTION_YEARS`).

Slice 3a: confirm decisions F5 to F14 and the bounds (`src/calculators/car-finance/README.md`); confirm F15 (one decimal place, the drawdown, an added fee as a charge) and settle CR-10 (a PCP's optional final payment, purchase and option fees in the APR) from a source before any page shows an APR for PCP or HP with an option fee; decide whether the hand-back path should also take condition charges. Slice 3b: confirm F24 to F31 (`src/calculators/car-ownership/README.md`); F18's two readings and the bounds were confirmed at the start of 3c-1; confirm litres per gallon from legislation.gov.uk (CO-1). Slice 3c-1: fill `docs/car-cross-checks.json` (six cases: a spreadsheet, or a real dealer quote for the payment; source and date) and `docs/compound-cross-checks.json`; spot-check the litres per gallon line in a fuel cost per mile; confirm the page decisions F32 to F37 (`DEFAULT_HORIZON_MONTHS` = 48 accepted at the start of 3c-2); check the page on a real phone. Slice 3c-2: confirm the page decisions F38 to F42 (optional boxes read as nothing, the chart, the selected month, the sensitivity's shifts, any pair); whether to move the flip search and the sensitivity to a worker (one flip search is a 250 to 430 ms task after the inputs settle, `docs/performance.md`); check the chart and its selection on a real phone and with a screen reader.

Car results redesign (3d-1): confirm U29 to U33, the verdict's wording and the per-month gap (the total difference over the horizon, rounded once); decide the monthly penny drift proposal (`docs/open-questions.md`); check the page on a real phone and with a screen reader.

Compare redesign (1b-iii): confirm U24's maximum (the engine's, pay-bounded) and U25's chart measure (net cost per pound, an average from no contribution); check the page on a real phone, with Safari and with a screen reader.

## Last session

- 22 October 2026, part 3d-1 (0.22.0, user-visible): pre-check passed (PR #27 merged; names as the brief). `narrative.ts` and `CarAnswer.tsx`: verdict, switch cost, bottom line, low/expected/high table first; cards renamed, largest part, money in and out; labels; the effective rate's fees. Tests red then green; four mutation spot-checks caught.
- Differs from the brief: the low/expected/high table reads the one comparison's three rankings, as you type, not reruns after SETTLE_MS (U32); the monthly and final payments are read from the finance engine's schedule and end path, tested to add up to the timeline; the owner fixture's running costs are made up (the brief gave none) to reproduce its totals.
- Not verified: a real phone, Safari, Firefox, a screen reader, the deployed site. Browser matrix: Chromium at 360, 768, 1024 and 1280 px, light and dark, axe, two pages (the owner's, four options), 16 runs clean.

## Next

- The owner's checks above, then propose the next slice: **mortgage overpayment** (`PLAN.md`), its brief and decisions first (daily versus monthly interest per lender).
- CR-10 (car finance): settle from a source whether a PCP's optional final payment and option fees count in the APR, before any card shows an APR for them.

Full history (progress logs, finished part scopes, slice archives): `docs/history/` (grep it, don't read it whole).
