# PHASE-BRIEF: Slice 3 Car decision

Status: 3a (finance engine) Done (0.17.0, PR #21); 3a.1 (APR) Done (0.17.1, PR #22); 3b (cost-of-ownership engine) Done (0.18.0, PR #23); 3c-1 (the page) Done (0.19.0, PR #24); 3c-2 (chart, sensitivity, polish) built (0.20.0), In progress until it merges. Slices 1b and 2 are built and stay open in `PLAN.md` until the owner's checks below are done. Status per part lives only in `PLAN.md`. Finished part scopes are in `docs/history/phase-brief-archive.md`.

## Docs rule

Close out every session with the tiered checklist in `CLAUDE.md` ("Session close-out checklist").

## Goal

Compare what a car costs over a fixed horizon under five options: keep the current car, buy outright, PCP, HP or a personal loan. Finance maths first, then the cost of ownership, then the page. Illustrative, not advice. Owner decisions F1 to F4, engine decisions F5 onwards: `docs/modelling-decisions-car.md`.

## Part 3c-2: crossover chart, sensitivity, tap-to-pick, polish (0.20.0)

### Scope

- Pre-check: 3c-1 merged, CI green, Pages deployed; the owner's acceptance of `DEFAULT_HORIZON_MONTHS` = 48 recorded.
- Empty optional boxes: costs and fees read as nothing (0 placeholder, hint); required boxes still hold the option back, named one per line; inputs version 2 with a migration giving identical figures.
- Shared Chart: four line styles (a neutral one that is not the danger colour; the compound interest "Paid in" line uses it), end labels, a series ending early, pointer and keyboard selection of an x, the selected-position marker, the table row highlighted and selectable, the summary naming the position.
- The car page below the cards: the crossover chart (engine's cumulative net cost, the case shown, lines stopping at coverage end, horizon and term markers) with a tap-to-pick month and a readout; "What changes the answer" for any pair, measured over the whole horizon; a sensitivity Section (end value, savings return, mileage, fuel price at minus and plus ten and twenty percent, engine reruns, largest first, after the inputs settle); a "how to read this page" line; assumptions and Help.
- Tests first (red, then green), a property over 100 random inputs, banned words and the literal guard over the new files, mutation spot-checks; the browser matrix and Lighthouse, with compute times in `docs/performance.md`.

### Out of scope

Tax or VED config, EV tax rules, replacement cars, early termination, Monte Carlo or varying returns, a worker, any new calculator, any engine change.

## Still with the owner

Confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input. Slice 2: fill `docs/compound-cross-checks.json` (eight cases, with source and date); confirm the C8 rate bounds and the starting years (`DEFAULT_PROJECTION_YEARS`).

Slice 3a: confirm decisions F5 to F14 and the bounds (`src/calculators/car-finance/README.md`); confirm F15 (one decimal place, the drawdown, an added fee as a charge) and settle CR-10 (a PCP's optional final payment, purchase and option fees in the APR) from a source before any page shows an APR for PCP or HP with an option fee; decide whether the hand-back path should also take condition charges. Slice 3b: confirm F24 to F31 (`src/calculators/car-ownership/README.md`); F18's two readings and the bounds were confirmed at the start of 3c-1; confirm litres per gallon from legislation.gov.uk (CO-1). Slice 3c-1: fill `docs/car-cross-checks.json` (six cases: a spreadsheet, or a real dealer quote for the payment; source and date) and `docs/compound-cross-checks.json`; spot-check the litres per gallon line in a fuel cost per mile; confirm the page decisions F32 to F37 (`DEFAULT_HORIZON_MONTHS` = 48 accepted at the start of 3c-2); check the page on a real phone. Slice 3c-2: confirm the page decisions F38 to F42 (optional boxes read as nothing, the chart, the selected month, the sensitivity's shifts, any pair); whether to move the flip search and the sensitivity to a worker (one flip search is a 250 to 430 ms task after the inputs settle, `docs/performance.md`); check the chart and its selection on a real phone and with a screen reader.

## Last session

- 22 October 2026, part 3c-2 (0.20.0, user-visible): pre-check passed, `DEFAULT_HORIZON_MONTHS` = 48 recorded; optional boxes read as nothing (inputs version 2, migration); shared Chart with four line styles, end labels and position selection; the crossover chart with tap-to-pick readout, flip points for any pair, sensitivity on demand; tests red then green (100-input property); mutation spot-checks all caught; browser matrix 158 checks clean after three fixes.
- Differs from the brief: sensitivity is worked out only while its section is open (Lighthouse put 2.6 s of blocking time on it on a slow phone); the end value moves in the case shown only; a fourth option is drawn in the danger colour (the Chart's only fourth style); flip points are measured over the whole horizon (the engine's contract), said on the page.
- Not verified: a real phone, Safari, Firefox, a screen reader, the deployed site. Flip search still one task of up to about 430 ms after settling (a worker needs the owner's go-ahead). OPEN: CR-10 carries over.

## Next

- Merge 3c-2, then mark it Done in `PLAN.md`. Slice 3 is then built; it stays In progress until the owner's checks above (F5 to F15, F24 to F31, F32 to F42, the cross-checks, a real phone) are done.
- CR-10: settle from a source whether a PCP's optional final payment and purchase or option fees count in the APR, before any card shows an APR for them.
- Then propose the next slice: **mortgage overpayment** (`PLAN.md`), its brief and decisions first (daily versus monthly interest per lender).

Full history (progress logs, finished part scopes, slice archives): `docs/history/` (grep it, don't read it whole).
