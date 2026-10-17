# Phase plan: Sumyard

Last updated: 17 October 2026 (slice 1a session F in progress: core tax engine, take-home pay without pension; the owner confirmed the spot-check of the 2026-27 values and answered the engine questions)

Draft roadmap. When a slice starts, rewrite its prompt against the real code (see the skeleton in PHASE-BRIEF.md). Do not treat these notes as final prompts.

Personal UK finance calculators in one clean, ad-free, client-only app, for own use. Illustrative, not financial advice.

Status values: Not started, In progress, Done (version, PR, date).

## Status at a glance

| Slice | Scope | Status |
|---|---|---|
| 0 Foundation | Recon of Chalkline and Stickyard (stack, tokens, theme toggle, chrome inventory). Repo, TypeScript strict, lint, tests, CI, GitHub Pages deploy, `CLAUDE.md`, `PHASE-BRIEF.md`, `CHANGELOG.md`. Tokens from Chalkline, light / dark / system theme, app shell (top bar, menu, Help / What's new / About / Settings sheets), toasts with Undo, disclaimer footer. Web only | Done (0.2.0, PR #2, 17 October 2026) |
| 0.5 Core plumbing | Money type and formatting, `Sourced<T>` tax config pipeline with a skeleton `2026-27`, Tax data screen, versioned scenario storage with JSON export and import, shared inputs and result components, token-aware chart, backup and restore, a "Hello calculator" placeholder that exercises all of it | Done (0.4.0, PR #4, 17 October 2026) |
| 1a Optimiser: config and engine | Verify and populate `2026-27` from gov.uk/HMRC, verification log, worked examples; then the pure engine (income tax with taper, NI, student loan, three pension methods, HICBC, annual allowance, `optimise()`). Tests first. No UI | In progress |
| 1b Optimiser: UI | The £100k+ page: inputs, current vs optimised take-home, marginal-rate and take-home-vs-contribution charts, cost of £1 more pension, warnings, scenario compare, assumptions, Help topic | Not started |
| 2 Compound interest | Regular contributions, frequency and timing, compounding, inflation-adjusted view, fee drag, yearly table and chart | Not started |
| 3 Car decision | Keep vs PCP vs HP vs loan: finance cost, depreciation, fuel/energy, insurance, tax, maintenance, residual value | Not started |
| Later | Calculators below, no slot yet | Parked |

### Later calculators (no slot yet)

| Calculator | Notes | Status |
|---|---|---|
| Take-home pay | Reuses the 1b engine; likely the first to pick up | Not started |
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

- **Progress (17 October 2026).** Runs as two sessions. **Session E done (0.5.0, PR #5, merged and deployed 17 October 2026): config step done.** All 38 values in `2026-27.ts` verified from www.gov.uk pages read on 17 October 2026, one commit per group, each logged in `docs/verification-log.md` with the line it came from and a second source where one exists. Counts: tax year dates 2/2, personal allowance and taper 3/3, rUK bands 1/1, Scottish bands 1/1, employee NI 4/4, employer NI 2/2, student loans 10/10, pensions 8/8, Child Benefit and HICBC 5/5, childcare 2/2. Nothing left `todo`. Rounding guidance in `docs/money.md` (stated for NI, student loan deductions and the annual allowance taper; not stated for the rest). 23 published worked examples in `docs/worked-examples.md`. **Session F (core tax engine, 0.6.0) in progress**: take-home pay without pension (income tax with the taper, employee NI, student loans), tests first. The owner confirmed the spot-check of the verified values and answered O1 to O9 as modelling decisions (`docs/modelling-decisions.md`). Session G then adds pensions, adjusted net income, HICBC, the annual allowance, the childcare check and `optimise()`.
- **What changed from these notes (session E):**
  - Schema change: two new leaves, `pension.reliefAtSourceRate` and `childBenefit.hicbc.incomePerPercent`, so the engine never hardcodes the relief-at-source rate or the HICBC step. No `note` field was needed: every value is on www.gov.uk.
  - Bands are stored as income after allowances (as HMRC's tables state them), each rate applying above its `from` (the previous band's published upper limit). NI thresholds are the annual figures; weekly and monthly ones are logged, not stored (O1).
  - The personal allowance zero point is stated on GOV.UK but not stored; the engine works it out.
  - Childcare limits rest on one page each, worded "the current tax year"; the riskiest values are listed in PR #5 for the owner's spot-check.
  - The salary sacrifice NICs cap (from 6 April 2029) is logged as informational, not modelled. Budget check: no Budget after Budget 2025 on GOV.UK on 17 October 2026; Royal Assent of Finance Bill 2025-26 not confirmed on GOV.UK.
  - HMRC PDFs on assets.publishing.service.gov.uk (CA38, CA44, tax tables) could not be fetched from the build environment.
  - The Tax data screen shows bands as "20% above £…" on income after allowances.
- **Rollback (0.5.0 to 0.4.0):** safe. No storage key or record changed; 0.4.0 shows the year as not verified again.
- **Follow-up for session F:** answers to O1 to O9; the rounding modes to use (`docs/money.md`); which worked examples to mirror; then the engine, tests first.

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
- Slice 1a engine questions O1 to O9 (`docs/verification-log.md`): NI per period or annual; the student loan pay figure; band boundaries; HICBC partial £200 and rounding; taper rounding; income tax rounding; childcare minimum earnings; Child Benefit weeks; higher-rate relief and ANI order.
- URL-hash state sharing (a shareable link of inputs, local only): in or out.
- Coverage target for pure calculator code.
- Sumyard name and domain availability.
- Which calculator after Phase 1: the likely candidates are take-home pay (reuses the 1b engine) and compound interest.

## Backlog (no slot yet)

- First-run tour (about four steps), skippable, replayable from Help.
- Keyboard shortcuts (desktop only) and a shortcuts reference.
- Help search (hand-rolled index vs a small library such as MiniSearch).
- Service worker for offline use (adds cache-invalidation risk when tax config changes; version the cache by app version if adopted).
- Print or PDF export of a results page.
- A sensitivity view (what if salary, bonus or contribution moves by 5 or 10 percent).
- Self-employed and dividend income in the optimiser.
- Multi-year projections across a tax-year change.
- Welsh rate variations beyond what the config supports.
- Spreadsheet (CSV) export of a calculator's tables.
- Phone-specific polish if the first phone audit shows gaps.
- A Sumyard logo and favicon (the header uses a text wordmark; the favicon is empty).
- Remember the compare selection across visits (it lasts for the visit now).
- A "Discard changes" action on a loaded scenario (today: load it again).
- Chart tooltips on hover or tap (values are in the summary and the data table now).
- Add Zustand and Zod if a later slice's state or import validation outgrows the small store and hand-written checks.
- A later tax year that includes April 2029: model the salary sacrifice NICs cap (logged as informational in session E).
- Show the source page's title next to "Source: GOV.UK" on Tax data, so identical link texts are told apart by sight (they differ only in their accessible names today).
