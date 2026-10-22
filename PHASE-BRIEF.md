# PHASE-BRIEF: Take-home pension compare redesign

Status: slices 1b (take-home and optimiser), 2 (compound interest) and 3 (car decision) are built; each stays In progress in `PLAN.md` until the owner's checks below. The **pension compare redesign** (1b-iii) is Done (0.21.0, PR #27), from the owner's use of the optimiser on a phone. Status per part lives only in `PLAN.md`. Finished part scopes are in `docs/history/phase-brief-archive.md`.

## Docs rule

Close out every session with the tiered checklist in `CLAUDE.md` ("Session close-out checklist").

## Part 1b-iii: pension compare redesign (0.21.0)

### Goal

On the take-home page (`#/c/optimiser`), one clear answer near the top: choose a contribution and see the change in your contribution, the total paid into your pension and your take-home, a month and a year, with the % change. Plain, non-judgemental words; warnings never hidden (G13). Decisions U23 to U28 (`docs/ui-patterns.md`).

### Scope

- `compareContributions` (`src/calculators/optimiser/compare.ts`): two engine points, arithmetic only (`docs/money.md`, "Pension compare").
- `ContributionPicker`: typed amount or percentage, a native slider to the engine's maximum (pay-bounded, owner's choice), pills (now, thresholds ahead, maximum), a clamp message; opens on the nearest threshold ahead.
- `ChangeSummary`: the sentence (also in the sticky bar) and three Now / New / Change cards with % change and pts.
- The cost chart (the engine's net cost per pound, an average from no contribution, owner's choice), milestones, warnings at the target in full and the rest counted in a Section, detail Sections; spendable only where it differs.

### Out of scope

Pot projection, growth, age or inflation; any config, tax rule or engine change; new storage keys; other calculators.

## Still with the owner

Confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input. Slice 2: fill `docs/compound-cross-checks.json` (eight cases, with source and date); confirm the C8 rate bounds and the starting years (`DEFAULT_PROJECTION_YEARS`).

Slice 3a: confirm decisions F5 to F14 and the bounds (`src/calculators/car-finance/README.md`); confirm F15 (one decimal place, the drawdown, an added fee as a charge) and settle CR-10 (a PCP's optional final payment, purchase and option fees in the APR) from a source before any page shows an APR for PCP or HP with an option fee; decide whether the hand-back path should also take condition charges. Slice 3b: confirm F24 to F31 (`src/calculators/car-ownership/README.md`); F18's two readings and the bounds were confirmed at the start of 3c-1; confirm litres per gallon from legislation.gov.uk (CO-1). Slice 3c-1: fill `docs/car-cross-checks.json` (six cases: a spreadsheet, or a real dealer quote for the payment; source and date) and `docs/compound-cross-checks.json`; spot-check the litres per gallon line in a fuel cost per mile; confirm the page decisions F32 to F37 (`DEFAULT_HORIZON_MONTHS` = 48 accepted at the start of 3c-2); check the page on a real phone. Slice 3c-2: confirm the page decisions F38 to F42 (optional boxes read as nothing, the chart, the selected month, the sensitivity's shifts, any pair); whether to move the flip search and the sensitivity to a worker (one flip search is a 250 to 430 ms task after the inputs settle, `docs/performance.md`); check the chart and its selection on a real phone and with a screen reader.

Compare redesign (1b-iii): confirm U24's maximum (the engine's, pay-bounded) and U25's chart measure (net cost per pound, an average from no contribution); check the page on a real phone, with Safari and with a screen reader.

## Last session

- 22 October 2026, part 1b-iii (0.21.0, user-visible): pre-check passed (PR #26 merged, Pages deploy green; this file had moved on to slice 3, not 1b-ii). `compareContributions`, the picker, the change summary, the cost chart, milestones and warnings replace the dropdown, the zoomed chart and the compare block. Tests red then green; three mutation spot-checks caught.
- Differs from the brief: the slider's top is the engine's maximum, not the allowance headroom; the chart is labelled as an average from no contribution; the Year / Month choice no longer drives the chart; decisions numbered U23 onwards (U10 to U22 were taken).
- Not verified: a real phone, Safari, Firefox, a screen reader, the deployed site. Browser matrix: Chromium at 360, 768, 1024 and 1280 px, light and dark, nine states, 72 runs.

## Next

- The owner's checks above, then propose the next slice: **mortgage overpayment** (`PLAN.md`), its brief and decisions first (daily versus monthly interest per lender).
- CR-10 (car finance): settle from a source whether a PCP's optional final payment and option fees count in the APR, before any card shows an APR for them.

Full history (progress logs, finished part scopes, slice archives): `docs/history/` (grep it, don't read it whole).
