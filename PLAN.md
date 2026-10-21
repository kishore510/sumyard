# Phase plan: Sumyard

Last updated: 21 October 2026 (1b-ii-b Done, 0.14.0; slice 1b built, owner checks open)

Sumyard is a set of personal UK finance calculators in one clean, ad-free web app, for the owner's own use. Constraints: client-side only, a static site on GitHub Pages, UK rules from versioned per-tax-year config, illustrative not advice.

Rules for this file: add a row when scope is added; update the Status cell when a part merges; nothing else goes here.

## Status at a glance

| Item | Scope | Status |
|---|---|---|
| 0 Foundation | Recon of Chalkline and Stickyard; repo, TypeScript strict, lint, tests, CI, Pages deploy, app chrome | Done (0.2.0, PR #2, 17 October 2026) |
| 0.5 Core plumbing | Money, `Sourced<T>` config pipeline, Tax data screen, versioned scenario storage, shared inputs | Done (0.4.0, PR #4, 17 October 2026) |
| 1a Optimiser: config and engine | Verified `2026-27` config, verification log, worked examples, the pure tax engine and `optimise()` | Done (0.8.0, PR #8, 17 October 2026) |
| 1b Optimiser: UI | The £100k+ page on the 1a engine, built in the parts below | In progress |
| 1b-i Take-home page | First usable calculator at `#/c/optimiser`: benefits in kind, post-tax deductions | Done (0.9.0, PR #10, 18 October 2026) |
| 1b-i.1 Percentages and lists | Pension as a percentage, itemised benefits and deductions, monthly entry | Done (0.10.0, PR #11, 18 October 2026) |
| 0.11.0 Salary sacrifice and PAYE | Benefits through salary sacrifice, tax code and PAYE estimate, monthly breakdown | Done (0.11.0, PR #12, 18 October 2026) |
| 0.11.1 Fix | PAYE estimate includes benefits in kind in its pay | Done (0.11.1, PR #13, 18 October 2026) |
| 0.12.0 Page redesign | Sections, sticky result, split bar, payslip net pay (UI only) | Done (0.12.0, PR #14, 18 October 2026) |
| 1b-ii-a Optimiser sweep and chart | `optimise()` from page inputs, take-home against contribution chart with markers and cliffs, table fallback, load layout-shift fix | Done (0.13.0, PR #16, 21 October 2026) |
| 1b-ii-b Reading the result | Cost of £1 more pension, thresholds in words, warnings, childcare eligibility, compare, Help and assumptions | Done (0.14.0, PR #17, 21 October 2026) |
| 2 Compound interest | Regular contributions, compounding, inflation-adjusted view, fee drag, yearly table and chart | Not started |
| 3 Car decision | Keep vs PCP vs HP vs loan: finance, depreciation, running costs, tax, residual value | Not started |
| Take-home pay | Shipped inside 1b (1b-i to 0.12.0) at `#/c/optimiser`; 1b-ii added the optimiser to the same page | Done (0.14.0, PR #17, 21 October 2026) |
| Mortgage overpayment | Check daily vs monthly interest handling per lender | Not started |
| Loan / APR | Verify the APR definition against official guidance | Not started |
| ISA vs pension vs mortgage | Builds on 1b and the overpayment calculator | Not started |
| Bonus and salary sacrifice | Largely an input mode of 1b; may fold into it | Not started |
| Fee impact | Builds on compound interest (slice 2) | Not started |
| Retirement / FIRE | Builds on slice 2 | Not started |
| EV vs petrol running cost | Builds on the car decision (slice 3) | Not started |
| Stamp duty | Needs per-nation rules (England, Scotland, Wales are separate taxes); verify | Not started |
| Child-related costs | Shares HICBC and childcare thresholds with 1a config | Not started |

## Pointers

- Current work: `PHASE-BRIEF.md`. Rules: `CLAUDE.md`.
- Open questions: `docs/open-questions.md`. Backlog: `docs/backlog.md`.
- History (slice notes, principles, progress logs): `docs/history/`.
