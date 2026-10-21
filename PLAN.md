# Phase plan: Sumyard

Last updated: 18 October 2026 (slice 1b, 0.12.0: the take-home page redesign, UI only; slice 1b In progress)

Draft roadmap. When a slice starts, rewrite its prompt against the real code (see the skeleton in PHASE-BRIEF.md). Do not treat these notes as final prompts.

Personal UK finance calculators in one clean, ad-free, client-only app, for own use. Illustrative, not financial advice.

Status values: Not started, In progress, Done (version, PR, date).

## Status at a glance

| Slice | Scope | Status |
|---|---|---|
| 0 Foundation | Recon of Chalkline and Stickyard (stack, tokens, theme toggle, chrome inventory). Repo, TypeScript strict, lint, tests, CI, GitHub Pages deploy, `CLAUDE.md`, `PHASE-BRIEF.md`, `CHANGELOG.md`. Tokens from Chalkline, light / dark / system theme, app shell (top bar, menu, Help / What's new / About / Settings sheets), toasts with Undo, disclaimer footer. Web only | Done (0.2.0, PR #2, 17 October 2026) |
| 0.5 Core plumbing | Money type and formatting, `Sourced<T>` tax config pipeline with a skeleton `2026-27`, Tax data screen, versioned scenario storage with JSON export and import, shared inputs and result components, token-aware chart, backup and restore, a "Hello calculator" placeholder that exercises all of it | Done (0.4.0, PR #4, 17 October 2026) |
| 1a Optimiser: config and engine | Verify and populate `2026-27` from gov.uk/HMRC, verification log, worked examples; then the pure engine (income tax with taper, NI, student loan, three pension methods, HICBC, annual allowance, `optimise()`). Tests first. No UI | Done (0.8.0, PR #8, 17 October 2026) |
| 1b Optimiser: UI | The £100k+ page: inputs, current vs optimised take-home, marginal-rate and take-home-vs-contribution charts, cost of £1 more pension, warnings, scenario compare, assumptions, Help topic | In progress |
| 2 Compound interest | Regular contributions, frequency and timing, compounding, inflation-adjusted view, fee drag, yearly table and chart | Not started |
| 3 Car decision | Keep vs PCP vs HP vs loan: finance cost, depreciation, fuel/energy, insurance, tax, maintenance, residual value | Not started |
| Later | Calculators below, no slot yet | Parked |

### Later calculators (no slot yet)

| Calculator | Notes | Status |
|---|---|---|
| Take-home pay | Shipped as the first part of 1b (session 1b-i, 0.9.0) at `#/c/optimiser`; percentages and itemised lists in 1b-i.1 (0.10.0); salary sacrifice benefits, tax code and PAYE estimate, monthly breakdown in 0.11.0; page redesign (sections, sticky result, split bar) in 0.12.0; 1b-ii adds the optimiser to the same page | In progress |
| Mortgage overpayment | Check daily vs monthly interest handling per lender | Not started |
| Loan / APR | Verify the APR definition against official guidance | Not started |
| ISA vs pension vs mortgage | Builds on 1b and the overpayment calculator | Not started |
| Bonus and salary sacrifice | Largely an input mode of 1b; may fold into it | Not started |
| Fee impact | Builds on compound interest (slice 2) | Not started |
| Retirement / FIRE | Builds on slice 2 | Not started |
| EV vs petrol running cost | Builds on the car decision (slice 3) | Not started |
| Stamp duty | Needs per-nation rules (England, Scotland, Wales are separate taxes); verify | Not started |
| Child-related costs | Shares HICBC and childcare thresholds with 1a config | Not started |

