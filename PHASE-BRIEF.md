# PHASE-BRIEF: Slice 1b Optimiser: UI

Status: Built, owner checks open. The take-home pay page at `#/c/optimiser` is live with the optimiser on it (1b-i to 0.12.0; the sweep and chart in 1b-ii-a, 0.13.0; reading the result in 1b-ii-b, 0.14.0). Status per part lives only in `PLAN.md`. Finished part scopes are in `docs/history/phase-brief-archive.md`.

## Docs rule

Close out every session with the tiered checklist in `CLAUDE.md` ("Session close-out checklist").

## Goal

The £100k+ optimiser page, built from shared components on the slice 1a engine: take-home now, then candidate pension contributions with their cliffs, thresholds, annual allowance and childcare position, never one called "the best".

## Next: slice 2 (compound interest)

All 1b parts are built (1b-ii-b, 0.14.0, is the last). Next is slice 2 from `PLAN.md` (regular contributions, compounding, inflation-adjusted view, fee drag, yearly table and chart). It needs its own brief before work starts: write it here first, from `PLAN.md` and `docs/backlog.md`. Slice 1b stays open in `PLAN.md` until the owner's checks below are done.

## Still with the owner

Confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input.

## Last session

- 21 October 2026, part 1b-ii-b (0.14.0, PR #17): Year / Month drives the optimiser chart, table and cards; Change vs now and a chosen point; zoom with Full range; cost of a pound more, thresholds in words, warnings across the sweep, childcare eligibility, compare now and chosen (`reading.ts`); compare rows show the version 4 inputs; Help topic "Pension contributions and the optimiser".
- Differs from the brief: the chosen point is a select of the points shown (no tapping the chart); thresholds are measured from now, not the chosen point; Chart's `rowNotes` became generic `columns`.
- Not verified: 768 px, a real phone, Safari, Firefox, a screen reader, the deployed site.
- Next: slice 2 (compound interest), brief first.

Full history (progress logs, finished part scopes, slice archives): `docs/history/` (grep it, don't read it whole).
