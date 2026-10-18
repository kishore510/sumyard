# Phase plan: Sumyard

Last updated: 18 October 2026 (slice 1b, 0.11.0: benefits taken from pay before or after tax, an optional tax code with a PAYE estimate, a Year / Month breakdown, inputs version 3; slice 1b In progress)

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
| Take-home pay | Shipped as the first part of 1b (session 1b-i, 0.9.0) at `#/c/optimiser`; percentages and itemised lists in 1b-i.1 (0.10.0); salary sacrifice benefits, tax code and PAYE estimate, monthly breakdown in 0.11.0; 1b-ii adds the optimiser to the same page | In progress |
| Mortgage overpayment | Check daily vs monthly interest handling per lender | Not started |
| Loan / APR | Verify the APR definition against official guidance | Not started |
| ISA vs pension vs mortgage | Builds on 1b and the overpayment calculator | Not started |
| Bonus and salary sacrifice | Largely an input mode of 1b; may fold into it | Not started |
| Fee impact | Builds on compound interest (slice 2) | Not started |
| Retirement / FIRE | Builds on slice 2 | Not started |
| EV vs petrol running cost | Builds on the car decision (slice 3) | Not started |
| Stamp duty | Needs per-nation rules (England, Scotland, Wales are separate taxes); verify | Not started |
| Child-related costs | Shares HICBC and childcare thresholds with 1a config | Not started |

## Order and principles

- Each rung gives a working result. Stop at any rung and still have something that works.
- Success criterion for the core: a calculator you trust enough to use for a real decision, on a phone and a laptop, in both themes.
- Mobile-first, equally good on phone and laptop. Light and dark themes with a toggle, matching Chalkline.
- Client-side only. No backend, accounts, analytics or tracking. Data stays on the device. Scenarios live in localStorage and export as JSON.
- Static site on GitHub Pages (same pattern as Chalkline and Stickyard).
- Visual identity shared with Chalkline and Stickyard: reuse their tokens and chrome, do not reinvent.
- Calculators are pure functions with no UI or storage imports, unit-tested, separate from the page.
- Tax rules live only in versioned per-tax-year config files. Never hardcode a rate, threshold or allowance in logic or UI. After a Budget, the change is one config file.
- No tax figure enters config from memory. Every value carries a source URL and a verified date, and a test fails the build without both.
- Every calculator shows its assumptions and a "last verified" tax-year label. Illustrative-not-advice is stated in the app.
- Every calculator is cross-checked against an authoritative source or worked example before it is Done. Edge cases are listed per calculator and each has a test.
- Floats are not acceptable for money. Rounding rules are documented per calculation.
- Tests first: a red commit, then a green one, for every engine slice.
- Each config change that adds or changes a tax year is its own slice or PR, with a changelog entry.
- Working setup: one fresh Claude Code session per part, at most per slice, handing over through the PR description. `CLAUDE.md` stays short; area detail goes in `docs/`. Stale status docs fail CI (a docs test that checks this file's "Last updated" line and statuses against `package.json` and `CHANGELOG.md`).
- All docs are updated at the end of every build session, not just every slice: `PHASE-BRIEF.md` (progress and next steps), this file (status row, "Last updated", slice notes), `CHANGELOG.md`, and `CLAUDE.md` if a rule changed, plus the verification log, worked examples, calculator README and Help topic when relevant. The full checklist is in `CLAUDE.md` ("Session close-out checklist").
- Estimate (first guess, to be revised after slice 0): about 3 to 4 Claude Code sessions for Phase 0 (this app has no backend, no realtime and no protocol, so it is much lighter than Stickyard) and 3 to 5 for the optimiser, plus about 20% for reruns.

## Repo files

| File | Purpose |
|---|---|
| `PLAN.md` | This file. The roadmap and status of every slice. |
| `PHASE-BRIEF.md` | Current slice only: scope, tasks, acceptance criteria. Rewritten at each slice start. |
| `CLAUDE.md` | Project rules for Claude Code (architecture, accuracy, testing, style). Kept short. |
| `CHANGELOG.md` | Keep-a-Changelog format. Also feeds the in-app What's new, so write entries for the user. |
| `content/help/*.md` | In-app Help topics. Calculator help comes from each calculator's `README`. |
| `docs/verification-log.md` | Every config value: source, date, who checked. |
| `docs/worked-examples.md` | Cross-check examples with source links, mirrored as tests. |

## Slice notes

### 0 Foundation
- Recon first, before writing anything: inspect Chalkline and Stickyard and report framework and build tool, language, CSS approach, token files, theme toggle implementation, font loading, deploy workflow, lint and format setup. Mirror Chalkline's stack unless there is a concrete reason not to; record the decision in `CLAUDE.md`.
- Inventory Chalkline's app-chrome components (Help panel, What's new, About, Settings, menu, toast with Undo, theme toggle) and report which can be lifted as is, which need generalising, and which are diagram-specific and must be dropped (gestures, shapes, layers, stencils). Reuse code and layout.
- Folder layout:
  ```
  src/
    calculators/<name>/   calc.ts, calc.test.ts, types.ts, page, README (assumptions + sources)
    config/tax/           2026-27.ts, index.ts (registry), schema.ts
    components/           shared UI
    lib/                  money, format, storage, scenarios, theme
    styles/               tokens, base
  content/help/
  docs/
  ```
- Scripts: `dev`, `build`, `test`, `lint`, `typecheck`. GitHub Pages workflow (build, test gate, deploy) with the correct base path for project-page hosting.
- Docs test: fails CI when this file or `CHANGELOG.md` is stale against `package.json`.
- Privacy hardening: fonts self-hosted and bundled (as Chalkline), no Google Fonts or CDN. CI scans the built output for external URLs and fails on any not on an allowlist (gov.uk links as plain anchors only, never fetched).
- Tokens as CSS custom properties with a semantic layer (`--bg`, `--surface`, `--text`, `--accent`, `--danger`) over the raw palette, so themes only swap the semantic layer. Flag any new token.
- Theme: system / light / dark, persisted, applied before first paint. Charts will read colours from tokens.
- Shell: header with menu button and theme toggle; main menu; slide-over panels (bottom sheet on phone, side panel on desktop) with back arrow, title and close, and a stack so Help > What's new > back works. Panels trap focus, close on Esc, restore focus. Hash-routed.
  - Help: a simple topic list from markdown in `content/help/` (Quick start, Scenarios and saving, How tax data and "last verified" work, Troubleshooting). No search yet.
  - What's new renders `CHANGELOG.md` at build time (version, date, "This version" badge, Added / Changed / Fixed). Build fails if the top version differs from `package.json`. "New" marker until opened.
  - About: version, build SHA, built timestamp, storage used, Copy details, privacy statement, credits generated from dependency licences, disclaimer.
  - Settings: theme and defaults (tax year, region, whole pounds vs pence).
- Toast with Undo, consistent empty, error and loading states, footer disclaimer, first-run acknowledgement stored locally.
- Accessibility baseline: WCAG AA contrast in both themes, visible focus rings, 44 px touch targets, `prefers-reduced-motion` respected.

- **Progress (17 October 2026).** Recon and build session A done (0.1.0: scaffold, tokens, fonts, theme with pre-paint script, CI and Pages workflows, guards for docs drift, external URLs and the pre-paint theme). Build session B done (0.2.0): menu, hash-routed sheet stack, Help, What's new, About, Settings, toast with Undo, shared states, footer disclaimer, first-run notice, storage-key guard, docs guard in the build, tighter URL allowlist. The acceptance criteria that can be checked before merge pass in local Chromium checks; the deployed site was then checked on a real phone by the owner. Details are in the `PHASE-BRIEF.md` progress log.
- **What changed from these notes:**
  - Lint and format use Biome, not ESLint and Prettier (Chalkline has neither, and typescript-eslint does not support TypeScript 7).
  - The URL allowlist also holds exact inert strings that are never fetched: XML namespaces and React's error-link prefix inside React DOM, and Tailwind's licence comment.
  - Tokens gained a raw-palette layer (`--sy-palette-*`), using Chalkline's values.
  - Session A was split from the shell work, so slice 0 runs as recon, session A and session B.
  - Session B: no Zustand or Zod (a small `useSyncExternalStore` store instead); `lastSeenVersion` is stored as `sumyard:v1:last-seen-version`; What's new is parsed at build time and injected, not bundled raw; the tax-year default is a labelled stub until 0.5; sheet parents are fixed (Help over topics, What's new and About).
- **Rollback.** Safe to roll back to 0.1.0: it reads only `sumyard:v1:theme` and ignores the three keys 0.2.0 adds (`settings`, `last-seen-version`, `acknowledged`). Losing any of them only resets a default or shows a marker or notice again.
- **Done (17 October 2026).** PR #2 merged and deployed; the owner ran the phone, Safari and VoiceOver checklist on the live site and it passed.
- **Follow-up.** Slice 0.5 replaces the Settings tax-year stub and makes the Scenarios menu item, its Help topic and the menu's "Export" footnote real.

### 0.5 Core plumbing
- **Progress (17 October 2026).** Runs as two sessions. **Session C done (0.3.0):** money type and formatting, `Sourced<T>` tax-config pipeline with the registry and a `2026-27` skeleton (every leaf unverified, no figure), Tax data screen, verified badge, Settings tax-year default with a settings migration, menu footnote trimmed. **Session D done (0.4.0):** calculator registry and pages at `#/c/<id>`, scenarios under `sumyard:v1:scenarios` (save, update, save as new, load, rename, duplicate, delete with Undo, unsaved-changes indicator), export and import with a preview (Add or Replace), backup and restore and clear all data in Settings, compare page, shared inputs and result components, hand-rolled SVG chart, Hello calculator placeholder. Lighthouse mobile recorded in `docs/performance.md`. Details in the `PHASE-BRIEF.md` progress log.
- **Done (17 October 2026).** PR #4 merged and deployed (Pages run 39053101048); the owner confirmed the manual checks on the deployed site (real phone, Safari, VoiceOver, a real file picker) at the start of slice 1a session E.
- **Session D decisions:**
  - **Sheets over a calculator page:** each sheet history entry remembers the page underneath (`page` in the entry's state), so the page stays put behind the sheet and Close, Esc or Back land on it. A deep-linked sheet closes to home. Sheet routes are unchanged; `#/scenarios`, `#/import` (under Scenarios) and `#/restore` (under Settings) are new.
  - **Compare is a page** (`#/c/<id>/compare`) for the width; on a phone the table scrolls sideways with the row labels sticky. The selection lasts for the visit (not in the URL).
  - **Chart: hand-rolled SVG** (open question closed): lines, bars, reference lines, markers, labelled axes, token colours through Tailwind `fill-*`/`stroke-*` classes, a text summary and a data-table fallback. It does not animate. Geometry constants (height, padding) live in the component, not as tokens.
  - **Scenario shape** follows the session D prompt: `{ id, calculatorId, taxYear, name, inputs, inputsVersion, createdAt, updatedAt }`; the schema version is on the stored record, not on each scenario (session C's handover had `schemaVersion` per scenario).
  - **Rollback safety:** stored scenarios this version can't use (another calculator, newer inputs) are kept and written back; a record it can't read (not JSON, a newer schema, hostile keys) is never written over until a restore or clear all data.
  - **Additions to session C's API (no change to existing functions):** `compareRatio`, `subtractRatio` in `money.ts`; `formatAmountInput`, `formatGBPDelta`, `formatPercentPointDelta` in `format.ts`; `removeKey` in `storage.ts`.
- **Rollback (0.4.0 to 0.3.0):** safe. 0.3.0 ignores `sumyard:v1:scenarios`, which stays in the browser; no other key changed.
- **Money decision:** integer pence as a branded `number` (safe-integer range, about £90 trillion), with exact integer `Ratio`s for rates and `mulRound` in BigInt with explicit `nearest` (halves away from zero), `down` (floor) and `up` (ceiling) modes. No decimal library. The mode each tax step needs is to be verified in 1a (`docs/money.md` has the table).
- **URL-scan outcome:** the scan already allows `https://www.gov.uk/` and `https://gov.uk/` URLs inside JavaScript strings (not where fetched), and rejects every other host, legislation.gov.uk included. No allowlist entry was added and the scan is unchanged. Config sources are held to the narrower `https://www.gov.uk/` rule by `isSourceUrl` and the config audit test, and rendered only as plain `noopener noreferrer` links. Fixture tests prove it; the build fails if fake fixtures reach `dist/`. Allowing legislation.gov.uk is an open question for the owner.
- **What changed from these notes (session C):**
  - `Sourced<T>` is a discriminated union, `{ status: 'todo' }` or `{ status: 'verified', value, sourceUrl, verifiedOn }`, rather than `{ value, sourceUrl, verifiedOn }` with a `TODO_VERIFY` marker. Calculators read values only through `requireVerified`.
  - Income tax bands are one sourced list per region (`{ name, from, rate }[]`), so no band count is assumed. Savings and dividends have a reserved slot with no values.
  - The Tax data sheet sits under About in the back stack (About links to it; Settings and the Help topic link to it too). Help Markdown gained `sheet:` links for this.
  - Settings record `sumyard:v1:settings` is schema 2 (adds `taxYear`), migrated from schema 1 through a new storage hook, `upgradeRecord`. No new storage key.
  - Help tips render as `role="note"` paragraphs, not `<aside>` (axe flagged the landmark inside the dialog).
- **Rollback.** 0.3.0 to 0.2.0 is safe. Once 0.3.0 has saved settings as schema 2, 0.2.0 reads them as another version and falls back to rest of UK and whole pounds; theme and the other keys are unaffected.
- **Follow-up for 1a:** confirm each group's shape against the sources (annual or per-period NI and student loan figures, whether the HICBC charge needs a step field, childcare minimum-earnings conditions), then verify values.
- Money: decide first between integer pence and a decimal library. Document rounding rules per calculation. `lib/money` and `lib/format` with tests.
- Tax config: typed `TaxYearConfig` covering income tax (rUK and Scotland), personal allowance and taper, NI (employee and employer), student loan plans and postgraduate, pension limits (annual allowance, taper, carry forward, MPAA), HICBC thresholds and Child Benefit rates, childcare eligibility thresholds. Every leaf is `Sourced<T>`: `{ value, sourceUrl, verifiedOn }`; a test fails the build if either is missing. Registry with `getTaxYear(id)` and `latestTaxYear()`. `2026-27.ts` is a skeleton with every value `TODO_VERIFY`; a calculator that touches one refuses to show results.
- Tax data screen: each loaded tax year, each value group with source URL and verified date, `TODO_VERIFY` flagged. Linked from About and from each calculator's verified badge.
- Storage: namespaced keys (`sumyard:v1:...`), schema version on every record, migration hook, try/catch with graceful fallback. About > Privacy lists every key.
- Scenarios: `{ id, calculatorId, taxYear, name, inputs, createdAt, schemaVersion }`, inputs only (results are recomputed). Save, load, rename, delete (with Undo), duplicate. Export to JSON; import with validation, clear errors and a preview. Imported data is untrusted. Compare view for 2 or 3 scenarios of one calculator, with deltas.
- Settings gains backup and restore of everything as one JSON, and clear all data (prompting an export first).
- Shared components: `CurrencyInput`, `PercentInput`, `NumberInput`, `Select`, `Toggle`, `Segmented` (inline validation, `inputmode`), `ResultCard`, `StatRow`, `AssumptionsPanel`, `VerifiedBadge`, `ScenarioBar`, and a `Chart` wrapper (token-aware, accessible, data-table fallback).
- "Hello calculator" placeholder exercises registry, inputs, result card, scenarios and a chart in both themes; removed when 1b ships.
- Lighthouse on mobile recorded in `docs/`; checked on phone width, tablet and laptop in both themes.

### 1a Optimiser: config and engine
Gate: the config step must be finished and logged before any engine code is written.

- **Progress (17 October 2026).** Runs as two sessions. **Session E done (0.5.0, PR #5, merged and deployed 17 October 2026): config step done.** All 38 values in `2026-27.ts` verified from www.gov.uk pages read on 17 October 2026, one commit per group, each logged in `docs/verification-log.md` with the line it came from and a second source where one exists. Counts: tax year dates 2/2, personal allowance and taper 3/3, rUK bands 1/1, Scottish bands 1/1, employee NI 4/4, employer NI 2/2, student loans 10/10, pensions 8/8, Child Benefit and HICBC 5/5, childcare 2/2. Nothing left `todo`. Rounding guidance in `docs/money.md` (stated for NI, student loan deductions and the annual allowance taper; not stated for the rest). 23 published worked examples in `docs/worked-examples.md`. **Session F done (0.6.0, internal): core tax engine.** The owner confirmed the spot-check of the verified values and answered O1 to O9 as modelling decisions (`docs/modelling-decisions.md`: D1 to D7 for F, G1 to G4 recorded for G). `src/calculators/optimiser/`: `personalAllowance`, `incomeTax`, `employeeNI`, `studentLoan`, `takeHome`, `ModellingPolicy` and `TaxInputs`, pure and config-driven, tests first (red, then green). 12 published examples mirrored; property, edge-case and literal-guard tests; 72 HMRC cross-check cases pending in `docs/hmrc-cross-checks.json`. No UI, registry entry or new dependency. **Session G is split in two.** **G1 done (0.7.0, internal):** `pensionContribution` (salary sacrifice, net pay, relief at source), `adjustedNetIncome`, `hicbc`, `incomeTax` with the taper on ANI and the basic rate band extended for relief at source, `takeHome` with pension and Child Benefit inputs; the pension methods' effects, the ANI step order (G2) and the student loan base per method (O2, G6) read on GOV.UK and logged; tests first; no UI, registry entry, new dependency or tax value change. **G2 done (0.8.0, internal):** `annualAllowanceCheck` (threshold income and adjusted income, the taper, carry forward, the MPAA, counted, headroom, excess, warnings), `annualAllowanceCharge` (modelled: PTM056110 states the mechanics and the config holds the bands), `childcareCheck` (the income-limit cliff), `thresholdContributions` (exact pence, closed form) and `optimise()` (candidate points, never a single best); the GOV.UK lookups logged; tests first; no UI, registry entry, new dependency or tax value change. **The engine is complete; slice 1a is Done once the owner agrees.**
- **What changed from these notes (session E):**
  - Schema change: two new leaves, `pension.reliefAtSourceRate` and `childBenefit.hicbc.incomePerPercent`, so the engine never hardcodes the relief-at-source rate or the HICBC step. No `note` field was needed: every value is on www.gov.uk.
  - Bands are stored as income after allowances (as HMRC's tables state them), each rate applying above its `from` (the previous band's published upper limit). NI thresholds are the annual figures; weekly and monthly ones are logged, not stored (O1).
  - The personal allowance zero point is stated on GOV.UK but not stored; the engine works it out.
  - Childcare limits rest on one page each, worded "the current tax year"; the riskiest values are listed in PR #5 for the owner's spot-check.
  - The salary sacrifice NICs cap (from 6 April 2029) is logged as informational, not modelled. Budget check: no Budget after Budget 2025 on GOV.UK on 17 October 2026; Royal Assent of Finance Bill 2025-26 not confirmed on GOV.UK.
  - HMRC PDFs on assets.publishing.service.gov.uk (CA38, CA44, tax tables) could not be fetched from the build environment.
  - The Tax data screen shows bands as "20% above £…" on income after allowances.
- **Rollback (0.5.0 to 0.4.0):** safe. No storage key or record changed; 0.4.0 shows the year as not verified again.
- **What changed from these notes (session F):**
  - The engine is **annual** (D1): NI and student loans use the annual thresholds; results say payroll works per pay period. Monthly and weekly views are the annual figures divided evenly, labelled.
  - The taper takes an income figure as input (gross pay in `takeHome`); `adjustedNetIncome` moves to session G, so `incomeTax` takes `(income, region, config, policy)` rather than `(taxableIncome, region, config)`.
  - `ModellingPolicy.taperRounding` (`'exact'` default, `'wholePoundsDown'`) settles odd taper amounts (D4); the two differ by less than £1 of allowance.
  - `studentLoan` uses NI-able pay, checked against SL3 and CSLM16030 (D5); with several undergraduate plans, one repayment at the lowest threshold; the postgraduate loan on top.
  - No intermediate rounding (D3): `money.ts` gained `ExactPence` (exact fractions of a penny until output). `src/lib/periods.ts` holds the month and week divisors, outside the engine, so the engine's literal guard (only 0, 1, 2, 100) holds.
  - Two published income tax examples added to `docs/worked-examples.md` (IT-1, IT-2) to confirm marginal bands (D2), and the stated zero point (PA-1).
- **Rollback (0.6.0 to 0.5.0):** safe. Internal code only; no storage key, record, config value or screen changed.
- **Follow-up for session G (done in G1, except as noted):** the pension methods' effect on NI-able pay, taxable pay and the student loan figure (confirmed on GOV.UK: decisions G2, G6); the ANI step order (settled from GOV.UK: G2); Child Benefit weeks (G4: a policy field; the count stays OPEN); HICBC whole steps (G1); the owner's HMRC cross-checks (still pending).
- **What changed from these notes (session G1):**
  - Session G was split: G1 (pensions, ANI, HICBC, 0.7.0) and G2 (annual allowance, carry forward, childcare, `optimise()`, 0.8.0).
  - `incomeTax(income, region, config, policy, pension?)` takes gross pay and an optional pension and works out taxable pay and ANI itself, rather than `incomeTax(taxableIncome, region, config)`; existing callers are unchanged. `adjustedNetIncome(grossPay, pension, config)` and `hicbc(ani, children, config, policy)` as planned; `children` is `{ children, payments: 'claimed' | 'optedOut' }`.
  - `ModellingPolicy` gains `childBenefitWeeks` (required; default `CHILD_BENEFIT_WEEKS_PER_YEAR` in `src/lib/periods.ts`), so tests that built a policy now spread `DEFAULT_POLICY`.
  - Relief at source moves **every** band above the basic rate band up by the gross amount (not only the higher rate threshold), which matches GOV.UK's stated claim rates in both regions (for example relief on income taxed at the additional or top rate). The basic rate band is the band taxed at the relief-at-source rate; a config without exactly one such band stops with an error.
  - A gross pension contribution above gross pay is refused as an input (relief above earnings and the relief-at-source no-earnings allowance are not modelled; the allowance is not in the config).
  - The take-home views gain pension, HICBC, Child Benefit and net including Child Benefit; net excludes Child Benefit. ANI is exact (a gross-up can leave part of a penny), and the taper and HICBC steps use the exact figure.
  - The property "take-home never increases when gross increases" (these notes) is read as "never falls": it holds for rises of a hundred pounds or more without Child Benefit, not for a penny (a student loan repayment rounds down to whole pounds, so a penny more can add a pound) nor across a HICBC step (a cliff by design, G1). Also tested: take-home never rises by more than gross does.
  - `docs/hmrc-cross-checks.json` was not extended (it takes no pension inputs; expected values come only from HMRC's calculators).
- **Rollback (0.7.0 to 0.6.0):** safe. Internal code only; no storage key, record, config value or screen changed.
- **Follow-up for session G2 (done in G2):** `annualAllowanceCheck`, carry forward, the childcare income-limit cliff, `optimise()` and its sweep; Child Benefit weeks (G4) now sourced from HMRC's 2026 press release (52 weeks, the default).
- **What changed from these notes (session G2):**
  - **Adjusted income is not lowered by any employee contribution** (PTM057100: net pay is added back; salary sacrifice and relief at source come back through "pension input less member contributions"). Only threshold income can be brought under its limit, by net pay or relief at source, never by salary sacrifice. So the optimiser's annual allowance threshold point is on threshold income; adjusted income has none.
  - **The annual allowance charge is modelled**, not just warned about: PTM056110 states the steps and the config holds the bands (decision G11). PTM056120 also names the basic rate band extension for relief at source, which G1 could not find; decision G2 now has a GOV.UK source.
  - `annualAllowanceCheck(inputs, savings, config, policy)` takes the take-home inputs plus `PensionSavingsInput` (`employerContribution`, `carryForward` as `{ yearsAgo, amount }[]`, `moneyPurchaseAnnualAllowance` flag). Money purchase savings only; the MPAA applies for the whole year when flagged.
  - `optimise(inputs, config, policy, options?)`: `OptimiserInputs` extends `TaxInputs` with a required `pension` (the method to sweep and the current contribution), `savings` and `checkChildcare`. The step comes from `options` or `DEFAULT_SWEEP_STEP` in `src/lib/sweep.ts` (with `MAX_SWEEP_POINTS`), outside the engine.
  - Each point reports "spendable" (take-home with Child Benefit, less the annual allowance charge); net cost per pound is against no contribution, the marginal rate against the previous point. Childcare support is not valued, only flagged.
  - Threshold points are on the config's figures, so the HICBC full-charge point lands where the charge is still all of the Child Benefit under whole steps (G1); the charge first falls a penny lower. 1b should present this plainly.
  - PTM056510 and the MPAA guidance disagree on the alternative annual allowance (OPEN); it is not needed with money purchase savings only.
  - `takeHome`'s body moved to an internal `computeTakeHome` (behaviour unchanged) so `optimise()` reuses it.
  - `docs/hmrc-cross-checks.json` not extended: its expected values must come from HMRC's calculators.
- **Rollback (0.8.0 to 0.7.0):** safe. Internal code only; no storage key, record, config value or screen changed.
- **Follow-up for slice 1b:** see `PHASE-BRIEF.md` ("Next: slice 1b"). The owner: agree slice 1a Done; the HMRC cross-checks; the alternative annual allowance conflict only if defined benefit savings are ever modelled.

Config. All values must be looked up on gov.uk/HMRC and entered with source URL and date. Do not rely on memory or on this document.
- Personal allowance, taper start, taper rate, and the income at which it reaches zero.
- Income tax bands and rates: rUK and Scotland (including any starter or intermediate bands).
- Employee NI: primary threshold, upper earnings limit, main and additional rates. Employer NI: rate and secondary threshold (for the employer-saving display).
- Student loan plans 1, 2, 4, 5 and postgraduate: thresholds and rates.
- Pension: annual allowance, tapered annual allowance thresholds and minimum, carry forward rules and look-back, MPAA.
- High Income Child Benefit Charge: thresholds and taper mechanics; Child Benefit weekly rates.
- Tax-free childcare and 30-hours eligibility income limits.
- Any announced future change to salary-sacrifice NI treatment: check current status on gov.uk, do not assume.
- Check whether the autumn Budget has changed anything effective for 2026-27; add a new year file if so.
- Record everything in `docs/verification-log.md`. Collect at least 5 worked examples from HMRC/gov.uk calculators or published examples into `docs/worked-examples.md`.

Engine (pure functions, tests first: red commit, then green).
- `incomeTax(taxableIncome, region, config)` with personal allowance taper driven by adjusted net income.
- `employeeNI(niablePay, config)`.
- `studentLoan(plans, pay, config)`: confirm which pay figure each plan uses.
- `pensionContribution` with three methods and different tax, NI and adjusted-net-income effects: salary sacrifice (reduces NI-able pay and ANI), net pay arrangement (reduces taxable pay and ANI; NI unaffected), relief at source (net contribution grossed up by the provider; basic-rate band extended; higher-rate relief via ANI and self-assessment).
- `adjustedNetIncome(...)` shared by taper, HICBC and childcare eligibility. `hicbc(ani, children, config)`.
- `annualAllowanceCheck(...)` with warnings, not silent clamping.
- `optimise(inputs, config)`: sweeps contribution levels, returns the take-home curve, the marginal-rate curve, and the contribution that brings ANI to each relevant threshold (taper start, HICBC band end, childcare limit).
- Inputs: tax year, region, gross salary, bonus, employer pension contribution, employee contribution and method, existing sacrifice items, student loan plan(s), number of children and Child Benefit claimed, childcare costs (optional), other taxable income (optional, flagged as simplified), carry forward available (optional).
- Edge cases, each with a test:
  - Personal allowance taper: the effective marginal rate in the taper zone exceeds the headline higher rate; check against a worked example.
  - Scottish bands, including the interaction with the taper.
  - A bonus pushing ANI over a threshold; contribution timing against the bonus.
  - Net pay vs relief at source for non-taxpayers and for taper-zone earners.
  - Student loan: the pay figure used differs by pension method.
  - HICBC partial charge band and full clawback; claim vs opt-out.
  - Childcare eligibility cliff at the income limit.
  - Tapered annual allowance and carry forward.
  - Contribution larger than earnings; zero and negative inputs; very high earners beyond the taper end.
  - Tax-year boundary: only the selected year is modelled; say so.
- Property tests: take-home never increases when gross increases with pension unchanged; the sweep curve is continuous except at documented cliffs; tax is never negative.
- Worked examples encoded as tests with source links. Coverage target for `calculators/` set in `PHASE-BRIEF.md`.

### 1b Optimiser: UI

- **Progress (18 October 2026).** Runs as two sessions. **Session 1b-i done (0.9.0, user-visible):** the engine gains taxable benefits in kind and post-tax deductions (owner decisions B1 to B5, GOV.UK lookups in `docs/verification-log.md`, "Session 1b-i lookups"); the take-home page at `#/c/optimiser` (inputs, take-home for the year, month and week, a breakdown that adds up, warnings, refusal, assumptions, scenarios, Help topic); the Hello placeholder removed (its stored scenarios kept but hidden). **Session 1b-ii next:** `optimise()` on the page (take-home against contribution chart with cliffs and threshold markers, cost of £1 more pension, thresholds in words, the annual allowance and childcare panels, current against a chosen contribution in compare).
- **Part 1b-i.1 done (0.10.0, user-visible, 18 October 2026):** owner decisions B6 to B9 (`docs/modelling-decisions.md`). Employee and employer pension contributions as an amount or a percentage of pensionable pay (the salary or the person's own figure, the bonus only if included; nearest penny, a modelling decision); taxable benefits in kind and post-tax deductions as lists of named items, per month or per year (monthly times `MONTHS_PER_YEAR`); the resolved amounts shown on the page; input warnings (a percentage above all of pay, an item with no amount); inputs version 2 with a migration that gives identical results; compare shows the resolved totals, modes and item names. No engine, config or tax rule change. A shared `TextInput` (`src/components/inputs/`) for item names.
- **0.11.0 done (user-visible, 18 October 2026):** owner decisions B10 to B16 (`docs/modelling-decisions.md`, B4 superseded), GOV.UK lookups in `docs/verification-log.md` ("Session 0.11.0 lookups"). Benefit items with a value, an amount taken from pay and how (before tax and NI: taxed on the greater of the value and the salary given up, which comes off pay before tax, NI and student loan; after tax: the value less the contribution); an optional tax code with a PAYE estimate (level monthly pay, cumulative) beside the year's liability and the difference, and a notice for codes not modelled; a Year / Month breakdown that adds up in both views; inputs version 3 with migrations from versions 1 and 2 giving identical results. One config leaf added in its own commits: `paye.codeUnit` (www.gov.uk/employee-tax-codes). Engine: `TaxInputs.benefits`, `benefitTaxable`, `benefitTotals`, `TakeHomeResult.payrollPay`; new `paye.ts` (`parseTaxCode`, `paye`, `payeEstimate`) and `breakdown.ts`.
- **What changed from the 0.11.0 prompt:**
  - `paye(code, pay, config)` takes no `ModellingPolicy`: no policy choice applies to it (the taper is in the code). The difference from the liability comes from `payeEstimate(code, takeHomeResult, config)`.
  - "Taxable pay" for PAYE is pay through payroll (`payrollPay`): gross less salary given up and net pay contributions, without benefits in kind (they count only through the code).
  - The code's allowance needed a config value (the multiplier); it went in as `paye.codeUnit`, logged as a standing rule (the page does not tie it to a tax year), for the owner to confirm.
  - A C prefix uses the England, Wales and Northern Ireland bands, as GOV.UK's Income Tax in Wales page gives the same 2026 to 2027 rates; no separate Welsh leaf.
  - Exempt benefits are warned about whenever salary is given up (the engine cannot tell an item's kind from its name).
  - An item cannot both give up salary and make good (EIM44120's combined example is not representable).
  - The inputs version is derived from the list of migrations, because the literal guard covers `definition.ts`.
  - The month view's PAYE row shows the first month; the card says when months differ by a penny.
- **Rollback (0.11.0):** revert the PR. Scenarios saved at inputs version 3 would be refused as newer and kept but hidden; versions 1 and 2 untouched until re-saved. Reverting also removes `paye.codeUnit` from the config and its log row together. No storage key changed.
- **What changed from the 1b-i.1 prompt:**
  - A version 1 amount of nothing migrates to an empty list, not one item of nothing (which would only add a warning).
  - A negative item amount is an input error (as everywhere on the page), so the warning covers an item with no amount only; it applies to both lists.
  - Pensionable pay is shown only when a contribution is a percentage; "include the bonus" adds the bonus to the person's own figure too.
  - The percentage input accepts up to `MAX_PERCENT_INPUT` (ten times pay) so the warning above all of pay can show; more is an input error.
  - The page test's no-figures check now matches "per cent" or "percent" as a word, so names like `PercentInput` pass; the literal guard is unchanged.
- **Rollback (1b-i.1):** revert the 0.10.0 PR. Scenarios saved at inputs version 2 would then be refused as newer ("saved by a newer version") and kept but hidden; version 1 scenarios are untouched until re-saved. No storage key changed.
- **What changed from these notes (1b-i):**
  - The page is titled "Take-home pay" for now; it keeps the id `optimiser` so 1b-ii adds the sweep to the same page and scenarios carry over (inputs version 1).
  - Two inputs not in these notes: taxable benefits in kind (taxable pay and ANI only; Class 1A, so not NI or student loan) and post-tax deductions (take-home only). No tax code input.
  - The employer saving on salary sacrifice, the minimum-wage floor and the Class 1A amount are not shown: the config has no Class 1A rate and the owner put employer-side figures out of scope. The assumptions say so.
  - Input bounds live in `src/lib/inputLimits.ts`, so the literal guard also covers `definition.ts`.
  - The registry gains an optional `applySettings` (the Settings region on a fresh start).
- **Rollback:** revert the 0.9.0 PR. Stored scenarios for `optimiser` would then be kept but hidden, as Hello's are now; no storage key changed.
- **Follow-up for 1b-ii:** the owner confirms the benefit value from an annual statement (built as entered); the payslip check; whether a benefit taken through salary sacrifice (the salary amount rule) or a benefit that attracts Class 1 needs its own input.
- Single page: inputs collapsible on mobile, a sticky results summary, charts below.
- Outputs: take-home (annual, monthly, weekly) for current vs optimised; breakdown of income tax, NI, student loan, pension, HICBC; effective marginal rate by income (taper zone highlighted); take-home vs pension contribution curve with the optimum and threshold markers; "cost of £1 more pension" table; employer saving on salary sacrifice shown separately and labelled employer-side; warnings panel (annual allowance, tapered allowance, minimum-wage floor on sacrifice, eligibility cliffs).
- Scenario compare: current vs optimised vs user-defined.
- Assumptions panel always visible and expandable, tax-year and last-verified badge, disclaimer. A Help topic from the calculator's `README`. Both themes verified, chart colours token-driven.
- Acceptance for Phase 1 overall: every config value sourced and dated; verification log complete; all worked examples pass; rUK and Scotland, all three pension methods, HICBC and childcare cliffs handled; scenarios save, export, import and compare; assumptions, disclaimer and verified label shown; `CHANGELOG.md` updated; deployed.
- Out of scope for Phase 1: self-employed, dividend and savings income, rental income, capital gains, Welsh-specific variations beyond what config supports, multi-year projections, employer-specific scheme rules.

### 2 Compound interest
- Contribution frequency and timing (start or end of period), compounding frequency, inflation-adjusted view, fee drag, optional tax-wrapper note.
- Yearly table and chart; scenario compare. Cross-check against a published formula and a spreadsheet example.

### 3 Car decision
- Total cost of ownership over a horizon for keep vs PCP vs HP vs loan: finance cost, depreciation, fuel or energy, insurance, tax, maintenance, residual value.
- Handles balloon payment, deposit, APR vs flat rate, negative equity. Verify finance maths against the official APR definition.

## Open questions

- Tax-config sources beyond www.gov.uk: allow `https://www.legislation.gov.uk/` (exact prefix, `.js` only) if a value is only published there? Widens the URL allowlist, so the owner decides. Not needed for 2026-27 (session E found every value on www.gov.uk).
- Slice 1a engine questions: O1 to O9 answered by the owner's decisions and sessions G1 and G2's GOV.UK lookups (`docs/modelling-decisions.md`). **Child Benefit weeks (O8, G4):** HMRC's press release of 31 March 2026 gives the 2026 to 2027 yearly amounts, each 52 times the weekly rate, matching the default; PAYE130030's method could still be read as 53 for the charge. The owner confirms or sets another count.
- Relief at source as a band extension (G2): now stated on GOV.UK (PTM056120, found in G2).
- Slice 1a is Done (marked in 1b-i at the owner's request); the 72 HMRC cross-checks in `docs/hmrc-cross-checks.json` are still pending.
- Taxable benefits in kind: the owner has not yet confirmed the value from an annual statement (decision B1); a payslip check over the year will show any mismatch.
- Percentage contributions round to the nearest penny (B6, a modelling decision: GOV.UK states no rule). If the owner's payslip shows a scheme rounding another way, change the one mode in `pageInputs.ts`.
- PAYE tables (O10, O11): Tables A (free pay per code) and Tables B to D (per-period rounding) are PDFs this environment cannot fetch. The estimate uses the HTML guidance's code times ten and rounds tax to date to the nearest penny (D3). The owner reads the tables, or allows the build environment to fetch assets.publishing.service.gov.uk, to confirm or correct.
- `paye.codeUnit` is a standing rule not tied to a tax year on its page (logged as such); the owner confirms it is acceptable as a verified leaf.
- A C (Welsh) code uses the England, Wales and Northern Ireland bands while GOV.UK gives the same Welsh rates; a year where they differ needs a Welsh band leaf first.
- The owner's payslip check (manual, B15): the PAYE estimate, the salary sacrifice benefit treatment and the monthly breakdown against a real payslip.
- The alternative annual allowance for 2023-24 onwards: PTM056510 says £30,000, the MPAA guidance and Pension schemes rates say £50,000. Not used (money purchase savings only); matters only if defined benefit savings are modelled.
- HMRC cross-checks: 72 cases in `docs/hmrc-cross-checks.json` wait for the owner's figures from HMRC's calculators.
- URL-hash state sharing (a shareable link of inputs, local only): in or out.
- Coverage target for pure calculator code.
- Sumyard name and domain availability.
- Which calculator after Phase 1: take-home pay now ships with 1b; compound interest is the likely next.

## Backlog (no slot yet)

- First-run tour (about four steps), skippable, replayable from Help.
- Keyboard shortcuts (desktop only) and a shortcuts reference.
- Help search (hand-rolled index vs a small library such as MiniSearch).
- Service worker for offline use (adds cache-invalidation risk when tax config changes; version the cache by app version if adopted).
- Print or PDF export of a results page.
- A sensitivity view (what if salary, bonus or contribution moves by 5 or 10 percent).
- Self-employed and dividend income in the optimiser.
- Multi-year projections across a tax-year change.
- Benefits in kind beyond a single net value: a benefit through salary sacrifice (the salary amount rule), benefits that attract Class 1, and the employer's Class 1A shown as an employer-side figure (needs a config leaf and the owner's decision).
- Welsh rate variations beyond what the config supports.
- Spreadsheet (CSV) export of a calculator's tables.
- Phone-specific polish if the first phone audit shows gaps.
- A Sumyard logo and favicon (the header uses a text wordmark; the favicon is empty).
- Remember the compare selection across visits (it lasts for the visit now).
- A "Discard changes" action on a loaded scenario (today: load it again).
- Chart tooltips on hover or tap (values are in the summary and the data table now).
- A per-pay-period payroll view (monthly thresholds, bonus months) beside the annual model, if payslip matching is wanted (D1).
- Add Zustand and Zod if a later slice's state or import validation outgrows the small store and hand-written checks.
- A later tax year that includes April 2029: model the salary sacrifice NICs cap (logged as informational in session E).
- HMRC cross-check cases with pension contributions, once the owner has HMRC calculator figures to fill them.
- Child Benefit for part of a year (a child born or turning the age limit mid-year), and which partner pays the charge.
- Employer pension contributions on top of a salary sacrifice, and the employer's NI saving (slice 1b shows it employer-side).
- Show the source page's title next to "Source: GOV.UK" on Tax data, so identical link texts are told apart by sight (they differ only in their accessible names today).
