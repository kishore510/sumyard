# PHASE-BRIEF: Slice 3 Car decision

Status: 3a (finance engine) Done (0.17.0, PR #21); 3a.1 (APR) Done (0.17.1, PR #22); 3b (cost-of-ownership engine) Done (0.18.0, PR #23); 3c-1 (the page) Done (0.19.0, PR #24); 3c-2 next, its brief first. Slices 1b and 2 are built and stay open in `PLAN.md` until the owner's checks below are done. Status per part lives only in `PLAN.md`. Finished part scopes are in `docs/history/phase-brief-archive.md`.

## Docs rule

Close out every session with the tiered checklist in `CLAUDE.md` ("Session close-out checklist").

## Goal

Compare what a car costs over a fixed horizon under five options: keep the current car, buy outright, PCP, HP or a personal loan. Finance maths first, then the cost of ownership, then the page. Illustrative, not advice. Owner decisions F1 to F4, engine decisions F5 onwards: `docs/modelling-decisions-car.md`.

## Part 3c-1: the car decision page (0.19.0)

### Scope

- Pre-check: 3b merged and deployed; the owner's confirmation of F18 (equity), keep as a sale given up, the mileage flip (one driver) and the 3b bounds recorded in `docs/modelling-decisions-car.md`.
- `src/calculators/car-decision/` (`definition.ts`, `rates.ts`, `results.ts`, `CarDecisionPage.tsx`, `OptionEditor.tsx`, `CarResults.tsx`, tests, `fixtures/`, `README.md`) at `#/c/car-decision`, inputs version 1, no tax rules: every amount and rate empty to start; the horizon (box and slider, months or years) and the Low / Expected / High case always visible; savings return (after tax) and the yearly cost increase in a section; up to four options (add, duplicate, remove with Undo), each with the car, finance (loan, HP, PCP) and running costs with fuel in sections with live summaries and the engine's cost per mile.
- Results: cards ordered by the engine's ranking (full coverage first, partial apart, ties stated), each with net cost per month of coverage and the total, coverage, equity at the horizon (negative flagged), cash out, opportunity cost and the breakdown; "What changes the answer" (flip points as sentences); the APR where verified, else the effective-rate label; the comparison table; refusals and missing inputs per option. Scenarios and compare. Help, assumptions.
- Tests first (red, then green), a property over 150 random inputs, banned words, the literal guard, mutation spot-checks. `docs/car-cross-checks.json` pending (six cases, all null).

### Out of scope

3c-2 (below), tax or VED config, EV tax rules, replacement cars, early termination, any engine change.

## Part 3c-2: crossover chart, sensitivity, polish

The cumulative net cost chart over the horizon with crossover points (shared Chart, table fallback; tapping it to pick a point), the sensitivity view (residual value, mileage, rate), flip points for more than the two lowest options if the owner wants them, polish.

## Still with the owner

Confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input. Slice 2: fill `docs/compound-cross-checks.json` (eight cases, with source and date); confirm the C8 rate bounds and the starting years (`DEFAULT_PROJECTION_YEARS`).

Slice 3a: confirm decisions F5 to F14 and the bounds (`src/calculators/car-finance/README.md`); confirm F15 (one decimal place, the drawdown, an added fee as a charge) and settle CR-10 (a PCP's optional final payment, purchase and option fees in the APR) from a source before any page shows an APR for PCP or HP with an option fee; decide whether the hand-back path should also take condition charges. Slice 3b: confirm F24 to F31 (`src/calculators/car-ownership/README.md`); F18's two readings and the bounds were confirmed at the start of 3c-1; confirm litres per gallon from legislation.gov.uk (CO-1). Slice 3c-1: fill `docs/car-cross-checks.json` (six cases: a spreadsheet, or a real dealer quote for the payment; source and date) and `docs/compound-cross-checks.json`; spot-check the litres per gallon line in a fuel cost per mile; confirm the page decisions F32 to F37 and `DEFAULT_HORIZON_MONTHS`; check the page on a real phone.

## Last session

- 22 October 2026, part 3c-1 (0.19.0, PR #24, user-visible): owner's F18, keep, mileage flip and 3b bounds recorded; the car decision page at `#/c/car-decision` (definition, rates, results, page, editor, cards, table, Help); tests red then green; 150-input property; mutation spot-checks all caught (one test added after "coverage ignored in ordering" survived); browser matrix (360, 768, 1024, 1280; light and dark; axe) clean after three fixes; Lighthouse mobile 96/100/100/91.
- Differs from the brief: every field shown must be filled for an option to be costed (no empty-as-nothing); a PCP's mileage allowance is entered a year; flip points are for the two lowest options only, worked out once inputs settle (one pair costs about 300 ms at four options and 240 months); HP with no option fee shows the APR (F15), as a loan does; the rate rule lives in the page's `rates.ts` (the engines carry no labels); shared component extensions (allowEmpty, DecimalInput, SplitBar and RefusalNotice, ResultCard, StatRow, useItemKeys).
- Not verified: a real phone, Safari, Firefox, a screen reader, the deployed site; no cross-check value filled (all six pending). OPEN: CR-10 carries over.
- Next: 3c-2 (crossover chart, sensitivity, polish), its brief first.

Full history (progress logs, finished part scopes, slice archives): `docs/history/` (grep it, don't read it whole).
