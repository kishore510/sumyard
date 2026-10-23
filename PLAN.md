# Phase plan: Sumyard

Last updated: 23 October 2026 (slices 1 take-home pay and optimiser, 2 compound interest and 3 car decision marked Done by the owner; owner confirmations still open are listed in `PHASE-BRIEF.md`; 3d-2 Done, 0.24.0)

Sumyard is a set of personal UK finance calculators in one clean, ad-free web app, for the owner's own use. Constraints: client-side only, a static site on GitHub Pages, UK rules from versioned per-tax-year config, illustrative not advice.

Rules for this file: add a row when scope is added; update the Status cell when a part merges; nothing else goes here.

## Status at a glance

| Item | Scope | Status |
|---|---|---|
| 0 Foundation | Recon of Chalkline and Stickyard; repo, TypeScript strict, lint, tests, CI, Pages deploy, app chrome | Done (0.2.0, PR #2, 17 October 2026) |
| 0.5 Core plumbing | Money, `Sourced<T>` config pipeline, Tax data screen, versioned scenario storage, shared inputs | Done (0.4.0, PR #4, 17 October 2026) |
| 1a Optimiser: config and engine | Verified `2026-27` config, verification log, worked examples, the pure tax engine and `optimise()` | Done (0.8.0, PR #8, 17 October 2026) |
| 1b Optimiser: UI | The £100k+ page on the 1a engine, built in the parts below | Done (0.21.0, PR #27, 22 October 2026) |
| 1b-i Take-home page | First usable calculator at `#/c/optimiser`: benefits in kind, post-tax deductions | Done (0.9.0, PR #10, 18 October 2026) |
| 1b-i.1 Percentages and lists | Pension as a percentage, itemised benefits and deductions, monthly entry | Done (0.10.0, PR #11, 18 October 2026) |
| 0.11.0 Salary sacrifice and PAYE | Benefits through salary sacrifice, tax code and PAYE estimate, monthly breakdown | Done (0.11.0, PR #12, 18 October 2026) |
| 0.11.1 Fix | PAYE estimate includes benefits in kind in its pay | Done (0.11.1, PR #13, 18 October 2026) |
| 0.12.0 Page redesign | Sections, sticky result, split bar, payslip net pay (UI only) | Done (0.12.0, PR #14, 18 October 2026) |
| 1b-ii-a Optimiser sweep and chart | `optimise()` from page inputs, take-home against contribution chart with markers and cliffs, table fallback, load layout-shift fix | Done (0.13.0, PR #16, 21 October 2026) |
| 1b-ii-b Reading the result | Cost of £1 more pension, thresholds in words, warnings, childcare eligibility, compare, Help and assumptions | Done (0.14.0, PR #17, 21 October 2026) |
| 1b-iii Pension compare redesign | Contribution picker (typed amount, slider, pills), now against a target a month and a year with % change and pts, cost-of-£1 chart over the whole range, milestones, warnings at the target, detail in sections (UI and one pure function; no tax or config change) | Done (0.21.0, PR #27, 22 October 2026) |
| 2 Compound interest | Regular contributions, compounding, inflation-adjusted view, fee drag, yearly table and chart | Done (0.16.0, PR #20, 21 October 2026) |
| 2a Compound interest engine | Pure engine: effective and equivalent rates, yearly projection with and without the fee, real view, fee drag, refusals (internal, no UI) | Done (0.15.0, PR #19, 21 October 2026) |
| 2b Compound interest page | The page on the 2a engine: inputs, yearly table and chart, nominal and real, fee drag, scenarios, compare, Help | Done (0.16.0, PR #20, 21 October 2026) |
| 3 Car decision | Keep vs buy outright vs PCP vs HP vs loan over a fixed horizon: finance, depreciation, running costs, VED as an input, residual value | Done (0.24.0, PR #31, 22 October 2026) |
| 3a Car finance engine | Amortising payment and schedule, rate solver, loan, HP and PCP, outstanding balance; APR conventions verified first (internal, no UI) | Done (0.17.0, PR #21, 21 October 2026) |
| 3a.1 APR verification | Statutory APR read from CONC App 1.2 and SI 2010/1011 (CR-1 to CR-3 verified, CR-10 partly); `apr` from dated cash flows (internal, no UI) | Done (0.17.1, PR #22, 22 October 2026) |
| 3b Cost-of-ownership engine | Up to four options (keep, cash, loan, HP, PCP buy or hand back) on one horizon: value curve and low/expected/high cases, running costs and fuel incl. electric, equity, opportunity cost, coverage, net cost per month of coverage, comparison and flip points (internal, no UI) | Done (0.18.0, PR #23, 22 October 2026) |
| 3c-1 Car decision page | The page on 3a and 3b at `#/c/car-decision`: shared horizon and end-value case, option editor (up to four, sections), one card per option (net cost per month of coverage and total, coverage, equity, cash out, breakdown), order and flip points in words, APR or effective-rate label, comparison table, scenarios, compare, Help | Done (0.19.0, PR #24, 22 October 2026) |
| 3c-2 Car crossover and sensitivity | Cumulative net cost chart with crossovers and tap-to-pick month readout (shared Chart: four line styles, selection, table fallback), sensitivity per option, flip points for any pair, empty optional boxes read as nothing (inputs version 2), browser matrix, polish | Done (0.20.0, PR #25, 22 October 2026) |
| 3c-3 Fifth chart style | A fourth non-danger line style in the shared Chart (Chalkline's teal swatch, its own dash and triangle marker); the car page's four options drawn without the danger colour; a guard that no chart series uses it unless it is a genuine warning | Done (0.20.1, PR #26, 22 October 2026) |
| 3d-1 Car results redesign | Answer first: verdict sentence (lowest net cost, gap a month and over the horizon, savings return used), switch cost against keeping, bottom line, low/expected/high table; cards renamed "Average cost per month owned" with the largest part and money in and out; plain-English labels (UI and pure derived functions; no engine, config, storage or inputs-version change) | Done (0.22.0, PR #28, 22 October 2026) |
| 3d-1.1 Car page fixes | Empty running costs listed on each card, and under the verdict when options differ; flip sentence for a crossing into a tie (engine gap logged, OQ-flip-tie); side-by-side table readable at 360 px and matching the cards; cards top-aligned; Option header on one line; alternative row only for a new pair; legend without "(line)"; monthly penny drift logged again with the exact-twelfths proposal (UI and pure derived functions; no engine, config, storage or inputs-version change) | Done (0.22.1, PR #29, 22 October 2026) |
| 3e Keep a car with finance still owed | Keep option: "still owe finance on it?" switch, settlement figure, monthly payment, payments left, final payment; sale given up = value − settlement; only interest a finance cost; rate implied by 3a's solver, labelled not the lender's APR; negative equity now flagged; inputs version 3 with identical migrated results; early settlement charges, hand-back of an existing PCP and a second agreement stay out | Done (0.23.0, PR #30, 22 October 2026) |
| 3d-2 Car thresholds and cost bridge | Flip search carries on past a tie and names the option lower on each side, a level band in words (closes OQ-flip-tie); the first option's fuel or energy price threshold (pence per mile, a price per litre for petrol or diesel); "Where the difference comes from" under the verdict, the pair's difference in average cost per month owned split by part (shared `BridgeBar`, table fallback); sensitivity table readable at 360 px (engine and page; no config, storage or inputs-version change) | Done (0.24.0, PR #31, 22 October 2026) |
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
