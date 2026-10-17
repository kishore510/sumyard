# PHASE-BRIEF: Slice 1a Optimiser: config and engine

Status: In progress. Session E is done (0.5.0, PR #5, merged and deployed): the config step is finished and logged. Session F is done (0.6.0, internal: the core tax engine for take-home pay without pension): the owner spot-checked the verified values and answered the engine questions as modelling decisions (`docs/modelling-decisions.md`). Session G is split into G1 (pensions, adjusted net income, HICBC; 0.7.0, internal) and G2 (annual allowance, carry forward, childcare check, `optimise()`; 0.8.0). G1 is in progress. Slice 1a runs as two build sessions: **E** (verify and populate the 2026-27 tax config, docs only around it, no engine code, 0.5.0) and **F** (the pure engine, tests first, after the owner answers session E's open questions). Rewritten at the start of every slice. Roadmap and status live in `PLAN.md`. Slice 0.5 is Done (0.4.0, PR #4, 17 October 2026); its progress log is archived at the end of this file, above slice 0's.

## Docs rule

Every build session ends by updating the docs: this file (progress and next session), `PLAN.md`, `CHANGELOG.md`, and `CLAUDE.md` if a rule or the stack changed. The full checklist is in `CLAUDE.md` ("Session close-out checklist"). A session is not finished until that is done.

## Goal

A tax config for 2026 to 2027 in which every value Sumyard holds was read on a www.gov.uk page in a build session and logged with its source, then a pure engine (income tax with the personal allowance taper, NI, student loans, three pension methods, HICBC, annual allowance, `optimise()`) built tests first on top of it. Gate (from `PLAN.md`): the config step is finished and logged before any engine code is written.

## Session E: verify and populate the 2026-27 config (0.5.0)

### Scope

1. Replace `{ status: 'todo' }` in `src/config/tax/2026-27.ts`, group by group, only with values read on a www.gov.uk page in this session; everything else stays `todo` and is reported.
2. Groups: tax year dates; personal allowance and taper (and whether the zero point is stated); income tax bands for England, Wales and Northern Ireland and for Scotland, noting whether each page states bands on taxable income or income after allowances; employee and employer NI (category A assumed); student loan plans 1, 2, 4, 5 and postgraduate; pensions (annual allowance, taper, carry forward, MPAA, relief-at-source rate); Child Benefit rates and HICBC mechanics; Tax-Free Childcare and 30 hours income limits; the announced salary sacrifice change (informational, not modelled); a Budget check.
3. `docs/verification-log.md`: one row per value (path, value, page title, URL, date read, quote, second source, status, notes), OPEN questions first.
4. `docs/money.md`: what GOV.UK and HMRC say about rounding for each step; "not stated" where silent.
5. `docs/worked-examples.md`: examples GOV.UK publishes (inputs, published result, URL), not computed.
6. Tests: every verified leaf has a www.gov.uk URL and a past date; each group's verified count matches the log.
7. Tax data screen checked in Chromium at 360 and 1280 px, light and dark, with axe.

### Rules

- Source rules: values only from pages fetched in the session; `sourceUrl` an exact `https://www.gov.uk/` page; `verifiedOn` the date read; check the tax year on every page; two sources where two pages cover a value; conflicts and ambiguity stay `todo` or OPEN. No URL-scan change.
- No calculation logic; no real figure in code comments, Help text or tests (tests use the fake fixtures).
- One commit per group. No new dependency, no runtime network request.

### Out of scope

Engine code, UI work beyond fixing layout problems on the Tax data screen, URL-allowlist changes, any other tax year.

## Session F: the core tax engine (0.6.0)

Pre-check (17 October 2026): PR #5 merged; its Pages deploy (run 39060296115) succeeded; the owner confirmed the spot-check of the verified values.

### Scope

Pure, unit-tested take-home pay functions with **no pension**, in `src/calculators/optimiser/`: no UI, no registry entry, no new dependency. Every figure comes from the verified config through `requireVerified`; a refusal is returned as the typed `Refusal`.

- `personalAllowance(income, config, policy)`: the published taper, driven by an income figure passed in (adjusted net income is session G).
- `incomeTax(income, region, config, policy)`: marginal bands for rUK or Scotland, the taper, a per-band breakdown.
- `employeeNI(niablePay, config)`: main and additional rates, annual thresholds.
- `studentLoan(plans, pay, config)`: plans and the postgraduate loan, on NI-able pay.
- `takeHome(inputs, config, policy)`: gross, tax, NI, student loan, net; annual, monthly and weekly views; an assumptions list.
- `ModellingPolicy` (`taperRounding: 'exact' | 'wholePoundsDown'`, default `'exact'`) and `TaxInputs`.

Owner's modelling decisions 1 to 7 are recorded in `docs/modelling-decisions.md`, with the decisions already taken for session G.

### Tests (red commit, then green)

Published gov.uk examples that concern these functions (not those marked "do not mirror"), each citing its URL; property tests (tax never negative, tax and NI never fall as gross rises, take-home never negative, zero in gives zero, taper-zone marginal rate above the band rate, from an independent formula); edge cases (each threshold and a penny either side, beyond the taper's zero point, Scotland against rUK, each student loan plan alone and with the postgraduate loan, zero and negative inputs, the safe-integer guard); a literal guard on the engine source (only 0, 1, 2 and 100); a cross-check harness, `docs/hmrc-cross-checks.json`, with input cases derived from the config and `null` expected results (`it.todo` until the owner fills them from HMRC's calculators).

### Out of scope

Session G's work (pension methods, adjusted net income, HICBC, annual allowance, childcare check, `optimise()`); the UI, the registry and the Tax data screen; any tax value change.

## Session G, split into G1 and G2

Session G is split in two. **G1** (0.7.0, internal): pension contributions, adjusted net income and the High Income Child Benefit Charge, with `takeHome` extended. **G2** (0.8.0): `annualAllowanceCheck`, carry forward, the childcare check and `optimise()` with its sweep.

### Session G1: pensions, adjusted net income, HICBC (0.7.0)

Pre-check (17 October 2026): PR #6 merged; its Pages deploy (run 39062754954) succeeded.

Owner decisions for G1 (recorded in `docs/modelling-decisions.md`): G4 resolved as a `ModellingPolicy` field for Child Benefit weeks, defaulting to `src/lib/periods.ts`, listed in the assumptions (a GOV.UK page that states the count wins); taper rounding stays `'exact'` by default; G2 (the ANI step order) and O2 (the student loan base per pension method) are GOV.UK lookups, not owner choices, and stop and stay OPEN if GOV.UK is silent or conflicts.

Scope: pure functions in `src/calculators/optimiser/`, no UI, registry entry or new dependency; every figure through `requireVerified`, a typed refusal otherwise.

1. `pensionContribution`: salary sacrifice (NI-able pay, taxable pay and ANI), net pay (taxable pay and ANI; NI unaffected), relief at source (net contribution grossed up at `reliefAtSourceRate`, basic rate band extended, higher-rate relief through ANI). Each effect checked on GOV.UK first and logged.
2. `adjustedNetIncome`, shared by the taper, HICBC and later the childcare check; `incomeTax`'s taper input becomes ANI.
3. The student loan base under each pension method, per the lookup.
4. `hicbc(ani, children, config, policy)`: partial band, full clawback, claimed or opted out, whole steps (G1), weeks from the policy.
5. `takeHome` with pension and Child Benefit inputs; the breakdown shows tax, NI, loan, pension and HICBC; assumptions gain the method, weeks and rounding.

Tests first (red, then green): published GOV.UK examples, properties, edge cases, the reference implementation extended independently, the literal guard, mutation spot-checks.

Out of scope: the annual allowance, carry forward, childcare, `optimise()` (G2, 0.8.0); any UI; any tax value change; any year other than 2026-27.

## Progress log

Add one entry per session: date, what was done, what differs from the brief, what the next session should pick up, and which docs were updated.

- **17 October 2026, build session F (core tax engine). Version 0.6.0.**
  - Pre-check: PR #5 merged; its Pages deploy (run 39060296115) succeeded; the owner confirmed the spot-check of the verified values (recorded in `docs/verification-log.md`).
  - Done (tests first: red `05a8c7e`, green `61e1cbf`):
    - [x] `src/calculators/optimiser/`: `personalAllowance`, `incomeTax` (marginal bands, rUK or Scotland, per-band breakdown), `employeeNI`, `studentLoan`, `takeHome` (annual, monthly and weekly views, assumptions list), `ModellingPolicy` with `DEFAULT_POLICY`, `TaxInputs`. Pure; every figure through `requireVerified`, typed refusal otherwise. No UI, registry entry or new dependency.
    - [x] Owner's decisions D1 to D7 applied and recorded in `docs/modelling-decisions.md`, with G1 to G4 recorded for session G; each OPEN question in the log points to its decision.
    - [x] Decision 5 checked before coding: SL3 2026 to 2027 and CSLM16030 base deductions on the gross pay used for the employer's secondary Class 1 NICs; NIM01001 describes Class 1 as one charge on the employment's earnings with primary and secondary elements. For employment income with no pension that is NI-able pay, so it matches; the pension-method question stays for session G. Plans combine as the GOV.UK guide states (one repayment at the lowest plan threshold; the postgraduate loan on top).
    - [x] Decision 2 confirmed against two published examples, added to `docs/worked-examples.md` (IT-1 tax on dividends 2026 to 2027, IT-2 pension tax relief 2024 to 2025) with the stated zero point (PA-1).
    - [x] Tests: 12 published examples mirrored, each citing its page (NI-1, SL-1, 2, 3, 5, 6, 7, 8, 9, IT-1, IT-2, PA-1); property tests (seeded, no dependency); edge cases at every threshold a penny either side, past the zero point, Scotland against rUK, each plan alone and with the postgraduate loan, negative, unsafe and very large inputs; an independent reference (`fixtures/reference.ts`); the literal guard (`literals.test.ts`); the cross-check harness with **72 pending cases** (`docs/hmrc-cross-checks.json`, `it.todo`). Mutation spot-checks (non-marginal bands, nearest-pound loans) fail the suite.
    - [x] `docs/money.md` "Decided rounding"; `money.ts` gains `ExactPence` (tested); `src/lib/periods.ts` for the month and week divisors.
  - Differences from the brief and prompt:
    - `ExactPence` added to `money.ts`: decision 3 (no intermediate rounding) needs fractions of a penny under the exact taper, and calculators may do arithmetic only through `money.ts`.
    - Month and week divisors live in `src/lib/periods.ts`, not the engine, so the literal guard (0, 1, 2, 100 only) holds; they are calendar divisors, not tax figures.
    - The literal guard also rejects figure-like text (pounds, percentages, decimals, numbers of three digits or more other than 100) in the engine's comments and strings; assumption strings hold no digits at all.
    - The personal allowance's `reduction` is reported as the full allowance less the rounded allowance, so the two always add up.
    - The cross-check file adds a `tolerancePence` (0) for HMRC calculators that show whole pounds, and requires a source page and date once a case is filled.
    - `'wholePoundsDown'` rounds the taper **reduction** down to a whole pound (the allowance up), mirroring PTM057100's annual allowance rule; GOV.UK states none for the personal allowance.
  - Not verified: HMRC's own calculators (the 72 cases are the owner's); per-pay-period payroll; anything behind assets.publishing.service.gov.uk; legislation.
  - Next (session G): pensions (salary sacrifice, net pay, relief at source as a band extension plus an ANI reduction, G2), `adjustedNetIncome`, `hicbc` (whole steps, G1), `annualAllowanceCheck`, the childcare cliff (G3), `optimise()`. Confirm on GOV.UK how each pension method changes NI-able pay, taxable pay and the student loan figure (D5). OPEN for the owner or GOV.UK: the ANI step order for salary sacrifice and net pay (G2); Child Benefit weeks (G4). Fill the HMRC cross-checks when possible.
  - Docs updated: `PHASE-BRIEF.md`, `PLAN.md`, `CHANGELOG.md` (0.6.0, internal), `CLAUDE.md` (modelling decisions, engine literal guard), new `docs/modelling-decisions.md`, new `docs/hmrc-cross-checks.json`, `docs/verification-log.md` (spot-check, answers to O1 to O9), `docs/money.md` (decided rounding, exact pence), `docs/worked-examples.md` (IT-1, IT-2, PA-1, what is mirrored, the harness), `docs/README.md`, new `src/calculators/optimiser/README.md`, `src/calculators/README.md`, `src/lib/README.md`. No Help topic or privacy text: nothing user-visible or stored changed.

- **17 October 2026, build session E (verify and populate the 2026-27 config). Version 0.5.0, PR #5.**
  - Pre-check: PR #4 merged; its Pages deploy (run 39053101048) succeeded; the owner confirmed the session D checklist, so slice 0.5 is Done (0.4.0, PR #4). www.gov.uk pages fetch from the build environment (raw HTML read directly, not through a summariser). PDFs on assets.publishing.service.gov.uk are refused by the environment's proxy (403).
  - Done (tests first: red `e8b7d9a`, green `6ab603f`; then one commit per group):
    - [x] Every group verified: tax year dates 2/2, personal allowance and taper 3/3, rUK bands 1/1, Scottish bands 1/1, employee NI 4/4, employer NI 2/2, student loans 10/10, pensions 8/8, Child Benefit and HICBC 5/5, childcare 2/2. **38 of 38 verified; nothing left todo.** Each value has a row in `docs/verification-log.md` (page title, URL, date read, the line it came from, second source, notes).
    - [x] Tax year checked on every page. Values come from pages that name 2026 to 2027 except: the relief-at-source rate (the GOV.UK guide states no year; resting on PTM044220 and the HMRC rates page), the taper reduction rate (PTM057100, "2023-24 onwards"), and the two childcare limits ("the current tax year", one page each). All listed for the owner's spot-check.
    - [x] Two sources wherever two GOV.UK pages give the value; no conflicts. One printing difference logged: HMRC's rates page shows the top band as "Over £125,141" where three other pages say over or above £125,140.
    - [x] OPEN questions O1 to O9 at the top of the log (NI per period or annual; student loan pay figure; band boundaries; HICBC partial £200 and rounding; taper rounding; income tax rounding; childcare conditions; Child Benefit weeks; higher-rate relief and ANI order).
    - [x] Salary sacrifice change (NICs on more than £2,000 a year from 6 April 2029): logged as informational, not modelled. Budget check: no Budget after Budget 2025 on GOV.UK; Budget 2025's 2026 to 2027 figures match; Royal Assent of Finance Bill 2025-26 not confirmed on GOV.UK.
    - [x] `docs/money.md`: rounding stated for NI (NIM11002), student loan deductions (SL3 2026 to 2027) and the annual allowance taper (PTM057100); not stated for income tax, the personal allowance taper, annual student loan repayments, HICBC and the relief-at-source gross-up. No mode chosen.
    - [x] `docs/worked-examples.md`: 23 published examples, tagged by year and whether to mirror; two inconsistent as published (PAYE14015's HICBC example, the student loan cap example). No published numeric example for the personal allowance taper.
    - [x] Tests: `verification.test.ts` (verified leaves cite www.gov.uk and a past date; the log's Values table matches the config, per row and per group); a guard against figures in year-file comments; Tax data, Settings, badge and Hello tests follow the config's real state, with the Hello refusal moved to a fake registry.
    - [x] Tax data in Chromium at 360 and 1280 px, light and dark: no horizontal scroll or overflow, 44 px source links, axe 0 violations, no external requests. Fixed: bands now read "20% above £…" on income after allowances.
  - Differences from the brief and prompt:
    - **Schema change:** two new leaves, `pension.reliefAtSourceRate` and `childBenefit.hicbc.incomePerPercent`, so the engine never hardcodes either. No `note` field was added: no value needed a non-GOV.UK source.
    - The skeleton-only tests in `configs.test.ts` were replaced (they asserted every leaf todo). The other sourcing guards are unchanged. The year-file glob in `configs.test.ts` no longer picks up the test files beside it, which had run `sourced.test.ts` and `index.test.ts` twice (977 tests now against 1,010 at 0.4.0: `configs.test.ts` alone ran 72 with the duplicates and runs 33 now; no test was removed apart from the two skeleton ones).
    - The log's Values table has the prompt's columns; "Checked by" is a line above the table.
    - A separate formatting commit (`b9b4798`) fixed a line-length issue in the schema commit.
    - Nothing was taken from memory: figures in search queries were used only to find pages, and every value was read on the page cited.
  - Not verified: anything behind assets.publishing.service.gov.uk (CA38, CA44, tax tables); legislation; Royal Assent of Finance Bill 2025-26; whether a 2026 Budget is scheduled; 768 px and real devices.
  - Next (session F): the owner answers O1 to O9 and spot-checks the riskiest values (Scottish bands, the taper, student loan thresholds, HICBC, the annual allowance taper) and agrees rounding modes; then the pure engine, tests first, mirroring the agreed worked examples. Remove the Hello calculator when the first real calculator ships.
  - Docs updated: `PHASE-BRIEF.md`, `PLAN.md`, `CHANGELOG.md` (0.5.0), `CLAUDE.md` (verification test), `docs/verification-log.md`, `docs/money.md`, new `docs/worked-examples.md`, `docs/performance.md`, `docs/README.md`, `src/config/tax/README.md`, `src/calculators/hello/README.md`, Help topics (tax data, Troubleshooting).

## Archive: slice 0.5 progress log

Slice 0.5 Core plumbing, Done (0.4.0, PR #4, 17 October 2026). The owner confirmed the session D manual checklist on the deployed site at the start of slice 1a session E. Kept as written at the time.

- **17 October 2026, build session D (scenarios, shared components, chart, backup and restore). Version 0.4.0.**
  - Pre-check: PR #3 merged; its Pages deploy (run 39034251400) succeeded. No conflict with this log, except that the prompt's scenario shape replaces session C's suggested per-scenario `schemaVersion` (see differences).
  - Done (tests first: red `b3d4d53`, green `fcc5a23`, then `5e0998e` for layout fixes found in the browser):
    - [x] 1 Registry (`src/calculators/registry.ts`, app list in `index.ts`, pages in `pages.tsx`): `{ id, name, summary, placeholder?, inputsVersion, defaultInputs, validateInputs, migrateInputs, summarise }`; `readInputs` migrates and validates; unknown calculators and newer inputs are refused with a message.
    - [x] 2 Routing: `#/c/<id>` and `#/c/<id>/compare` (`src/pages/route.ts`); the home page lists registered calculators. **Sheets over a page:** each sheet history entry records the page underneath, so the page stays rendered behind the sheet and Close, Esc and Back land on it; a deep-linked sheet closes to home. `close(to)` opens another page after closing (Scenarios > Open). New sheets: `#/scenarios`, `#/import` (parent Scenarios), `#/restore` (parent Settings). Title focus on page change.
    - [x] 3 Storage (`src/scenarios/store.ts`, `scenario.ts`): one versioned record; fresh objects; `__proto__`, `constructor` and `prototype` refused (`src/lib/validate.ts`); caps: 80-character names, 200 scenarios, 20,000 characters of inputs, 1,000,000 characters stored. Storage blocked or full: kept in memory, `persist: 'failed'`, a notice with Export. Key in the guard, `docs/privacy.md` and About; storage used includes it.
    - [x] 4 Operations: save, save changes, save as new, start new, load, rename, duplicate, delete with Undo (`src/scenarios/actions.ts`); "Unsaved changes" / "Saved" / "Not saved yet"; a scenario for a tax year not in the registry loads with a visible warning and uses the default year.
    - [x] 5 Export and import (`exchange.ts`): the envelope, file name from the local date; file input only; preview with counts, names (text only), skipped with reasons, duplicates in the file, conflicts (same id or same name); Add (new ids, exact duplicates skipped) or Replace (with an export offered first).
    - [x] 6 Backup and restore (`backup.ts`, Settings): kind `backup` with scenarios, settings, theme and acknowledgement, not `lastSeenVersion`; restore validates, previews, offers an export, then replaces; clear all data with a confirmation, an export prompt and "can’t be undone". The acknowledgement moved to `src/settings/acknowledged.ts` so restore and clear can set it.
    - [x] 7 Compare: a page; 2 or 3 scenarios; inputs and results with deltas from the first (money via `formatGBPDelta`, rates in percentage points, counts, text Same/Different); on 360 px the table scrolls sideways with sticky row labels; refused results say so.
    - [x] 8 Inputs (`src/components/inputs/`): parsing in `src/lib/parse.ts` (empty, negative, Unicode minus, commas, £, too many decimals, leading zeros, safe-integer guard, min/max); labels, hints and errors tied with `aria-describedby`; 44 px.
    - [x] 9 Results: `ResultCard`, `StatRow`, `AssumptionsPanel`, `ScenarioBar` (with `ScenarioList` and `StorageNotice`), `RefusalNotice`, plus `InlineNotice` in `states.tsx`.
    - [x] 10 Chart (`src/components/Chart/`): lines, bars, reference lines, markers, labelled axes, token colours, re-render on theme change, title and summary for screen readers, data table, from 280 px wide, no animation. Tests for ticks, empty and single-point data, negatives and large ranges.
    - [x] 11 Hello calculator (`src/calculators/hello/`): amount × percentage with `mulRound`, a series of up to 10 steps, labelled as a placeholder; "Show the tax year’s dates" calls `requireVerified` and shows the refusal on the skeleton.
    - [x] 12 Menu Scenarios enabled; footnote restored; Help topics rewritten.
    - [x] 13 Lighthouse mobile (12.8.2, scratch install): 99 / 100 / 100 / 91 on home and Hello; the SEO miss is `robots.txt` under `vite preview` only. Recorded in `docs/performance.md`.
    - [x] Chromium checks (Playwright and axe-core 4.10, scratch script): 305 checks, all passing, at 360, 768 and 1280 px in light and dark, plus storage full, clear all data and reduced motion. axe found 0 violations on every new surface (`docs/performance.md` lists them).
  - Differences from the brief and prompt:
    - Scenario shape is the prompt's (`inputsVersion`, `updatedAt`, schema version on the record), not session C's handover (`schemaVersion` per scenario).
    - Scenarios this version can't use are **kept and written back**, not dropped, and a record it can't read is **never written over** ("blocked") until restore or clear. Not in the prompt; it makes rollback safe.
    - Import refuses a whole file for hostile keys, a wrong kind or a newer export version; a bad scenario inside a good file is skipped with a reason. A backup chosen for Import (or the reverse) is refused with a pointer to the right place.
    - Replace (import) keeps the scenarios this version can't show; restore and clear remove them (the restore preview says how many).
    - Hello's inputs include a tax-year select, a reference-line toggle, a chart-style segmented control and the tax-year-dates toggle, so every shared input is exercised. The series has 2 to 10 steps (default 10).
    - The page-level disclaimer sits in the assumptions panel; the footer shows it on every page.
    - Additions to session C files, no change to existing functions: `compareRatio`, `subtractRatio` (money), `formatAmountInput`, `formatGBPDelta`, `formatPercentPointDelta` (format), `removeKey` (storage), `readSettingsValue` (settings), `clearSeen` (What's new).
    - Chart geometry (height 240, padding) is constants in the component, not tokens. No token added.
  - Not verified: a real phone, Safari, Firefox, a screen reader, the deployed site, a real file picker on mobile, Windows high contrast, very large imports on a slow phone.
  - Owner's manual checklist (deployed site):
    1. On a phone (Safari, and Chrome on Android if you have one), open the Hello calculator from the home page. Type `£1,234.56` into Amount: no error. Type `1.234`: the error shows under the box.
    2. Save a scenario, change the percentage ("Unsaved changes" shows), Save changes. Save as new. Delete one and press Undo.
    3. Export: the file `sumyard-scenarios-<date>.json` downloads. Delete a scenario, then Import the file with the phone's file picker: the preview lists it; choose Add.
    4. Compare two scenarios: the table scrolls sideways and the row names stay in view.
    5. Settings > Export a backup, change the theme, Restore from a backup: the preview shows, then your theme comes back.
    6. Turn on "Show the tax year’s dates": the "not verified" notice replaces the results; its link opens Tax data, and closing returns to the calculator.
    7. VoiceOver: the chart reads its title and summary; an input error is read with the field; the Delete toast says Undo is available.
  - Next: the owner runs the checklist, then sets slice 0.5 to Done (0.4.0, the PR number, the date). Then **slice 1a** (config and engine): verify and fill `2026-27` from GOV.UK and HMRC with sources in `docs/verification-log.md`, collect worked examples, fill the rounding table in `docs/money.md`, then the pure engine, tests first. Notes for 1a and 1b:
    - A new calculator is a registry entry (`src/calculators/<name>/definition.ts`: defaults, `validateInputs` building a fresh object, `migrateInputs`, `summarise`), a page in `pages.tsx`, and `requireVerified` inside `calc.ts`; build the page from the shared components (see the Hello page).
    - Money inputs are `Money` (pence); percentages are stored as canonical text and read with `percentRatio`.
    - Bump a calculator's `inputsVersion` and handle the old shape in `migrateInputs` whenever its inputs change after release.
    - Remove the Hello calculator (its folder, the registry entry, the page entry, Help mentions) when the first real calculator ships. Its scenarios are then kept but hidden (rollback-safe), not shown.
    - Owner decision still open: legislation.gov.uk sources.
  - Docs updated: `PHASE-BRIEF.md`, `PLAN.md`, `CHANGELOG.md` (0.4.0), `CLAUDE.md` (registry, scenarios, shared components, untrusted JSON rule), `docs/privacy.md` (new key, files, migration and rollback), new `docs/performance.md`, `docs/README.md`, `src/lib/README.md`, `src/calculators/README.md`, new `src/calculators/hello/README.md`, the Help topics, About > Privacy text. `docs/design-tokens.md` unchanged: no token added.

- **17 October 2026, build session C (money and tax config). Version 0.3.0.**
  - Pre-check: PR #2 merged, Pages deploy for it succeeded; the owner confirmed the session B manual checklist, so slice 0 is Done (0.2.0, PR #2, 17 October 2026).
  - Done (tests first: red `421253b`, green `a525056`):
    - [x] 1 Money (`src/lib/money.ts`): branded integer pence; `fromPounds` (safe whole pounds, or a digits string with at most two decimals; no parsing or rounding), `fromPence`, `toPence`, `add`, `subtract`, `compare`, `min`, `max`, `mulRound(amount, Ratio, mode)` in BigInt with `nearest` (halves away from zero), `down` (floor), `up` (ceiling), and `roundToPounds`. Every operation checks inputs and result and throws `MoneyError` past the safe-integer range. Rates are `Ratio`s (`ratio`, `percent("7.5")`). `docs/money.md` documents it, with the per-step rounding table left for 1a.
    - [x] 2 Formatting (`src/lib/format.ts`): `formatGBP(amount, 'pounds' | 'pence')` (the Settings value), `formatGBPCompact` for charts, `formatPercent`, `formatIsoDate`; en-GB, all from integer pence in BigInt.
    - [x] 3 Schema (`src/config/tax/schema.ts`): `TaxYearConfig` with every area in the brief; income tax bands as a sourced list per region; a reserved `savingsAndDividends` slot. `TAX_GROUPS` gives the screen's ten groups and a label and kind per leaf; leaf paths and value types are derived from the type.
    - [x] 4 Sourced values (`sourced.ts`): `Sourced<T>` union with `SourceUrl` (`https://www.gov.uk/${string}`) and `IsoDate`; `isSourceUrl`, `isVerified` (a malformed leaf counts as unverified), `requireVerified(config, paths)` returning typed values or `{ ok: false, taxYear, unverified }`. Twelve `@ts-expect-error` cases prove the type errors (malformed leaves and unknown paths).
    - [x] 5 Registry (`index.ts`): `createRegistry`, `getTaxYear`, `latestTaxYear` (from ids, never today's date), `listTaxYears` (newest first), `taxYearLabel`. Skeleton `2026-27.ts`: every leaf `TODO`, no number literal apart from its id.
    - [x] 6 Fixtures and guards: `fixtures/fakeTaxYears.ts` (years 2096-97 to 2098-99, fake values, marker `sumyard-fake-fixture`). `audit.ts` plus `configs.test.ts`: every real year file is registered and audits clean; 22 fault cases fail it (bare numbers, todo with a value, missing or non-GOV.UK source, bad date, wrong value kind, unknown or missing leaf), plus a future date and a legislation.gov.uk source. Only tests import the fixtures, and the build fails if the marker reaches `dist/`.
    - [x] 7 Tax data screen (`#/tax-data`, `TaxDataPage.tsx`): each year with its badge and count, each group as a disclosure with "Not yet verified (0 of n verified)", "x of n verified. Some not yet verified" or "All n verified" (icon and words, not colour alone); each verified leaf shows its value, "Verified <date>" and a "Source: GOV.UK" link (`target="_blank" rel="noopener noreferrer"`). Empty state for no years. Linked from About, Settings and the Help topic.
    - [x] 8 `VerifiedBadge`: "<year> tax year · Not yet verified" or "· Last verified <date>" (the most recent check, once every value is verified); a link to Tax data, or plain on the Tax data screen.
    - [x] 9 Settings: real tax-year choice ("2026 to 2027 (not yet verified)"), a hint that unverified years show no results, and a "See tax data" link. Settings record schema 2 with `taxYear`; schema 1 migrates on read through the new `upgradeRecord` hook in `src/lib/storage.ts`. Reset covers the tax year.
    - [x] 10 Menu footnote "Changes are saved in this browser."; Help topics updated (tax data topic rewritten; Quick start, Scenarios and saving, Troubleshooting adjusted).
    - [x] URL-scan question answered (below); no allowlist change.
    - [x] Checked in Chromium (Playwright and axe-core 4.10, scratch script, not committed): 267 checks at 360, 768 and 1280 px in light and dark, plus reduced motion at 360. Tax data deep link, title focus, ten groups all unverified, keyboard-opened disclosure, focus trap, Esc to About, then Help, then close; About link and back arrow; focus back on the menu button; Settings option, schema 2 saved, link to Tax data; Help topic link; menu footnote; 44 px targets; no horizontal scroll; only owned keys; no external requests; no console errors; reduced-motion sheet animation 0 s; a schema 1 record migrating in the real app. axe found 0 violations on Tax data (closed and open), About, Settings and the tax data Help topic in every combination, after one fix (below).
  - **URL-scan finding:** `scripts/checks/externalUrls.ts` scans every URL in every text file in `dist/`, JavaScript strings included. `https://www.gov.uk/...` and `https://gov.uk/...` pass anywhere except a fetch context; all other hosts fail, including `www.legislation.gov.uk` and `assets.publishing.service.gov.uk`; no `INERT_URLS` entry concerns gov.uk. So GOV.UK sources need **no new allowlist entry**, and the scan is unchanged. The narrowest rule is enforced on the config side instead (a minified bundle can't show where a string came from): `isSourceUrl` accepts only `https://www.gov.uk/` pages without credentials, port or quote-like characters; the `SourceUrl` type and the audit test enforce it; sources render only from verified leaves as plain anchors. Fixture tests prove a verified leaf and its anchor pass the scan and legislation.gov.uk fails. **Owner decision pending:** allowing legislation.gov.uk would need an exact `https://www.legislation.gov.uk/` prefix rule (`.js` only), mirrored in `isSourceUrl`. Not done.
  - Differences from the brief:
    - `Sourced<T>` uses `status: 'todo'` instead of the `TODO_VERIFY` marker in `PLAN.md`; the audit rejects a leftover `TODO_VERIFY`.
    - Bands are one sourced list per region, so the schema assumes no number of bands. The NI, HICBC and childcare groups hold only what the brief names (annual amounts; HICBC as the two thresholds); 1a may reshape them once the sources are read.
    - The fixtures' `fakeYear` uses a small `mapLeaves` helper exported from `sourced.ts`.
    - `fromPounds` is strict (no commas or `£`); input parsing is for session D's `CurrencyInput`. `roundToPounds` and `toPence` were added beyond the listed API.
    - Tax data sits under About in the back stack. Help Markdown gained `sheet:` links (`sheet:tax-data`, `settings`, `about`, `whats-new`) so the Help topic can link to it.
    - The tax-year choice is a one-option `Choice` (same component as region and amounts).
    - **Fix outside the brief:** axe flagged `landmark-complementary-is-top-level` on Help topics with a `>` tip (an `<aside>` inside the dialog). Tips now render as `<p role="note">`. Session B's axe run likely used a topic without a tip.
    - One red test was wrong (`percent("0")` expected 0 / 1; the rule is n / 100); corrected in the green commit.
  - Not verified: a real phone, Safari and Firefox, a screen reader, the deployed URL, Windows high contrast; verified leaves (values, links and dates) rendered only in happy-dom tests, since no real config has one; rounding modes for tax steps (by design, 1a).
  - Next (session D): versioned scenarios (`{ id, calculatorId, taxYear, name, inputs, createdAt, schemaVersion }`) with save, load, rename, delete with Undo, duplicate, JSON export and validated import with preview; backup and restore and clear all data in Settings; shared inputs (`CurrencyInput` parsing typed amounts into `Money`, `PercentInput` into a `Ratio`, and the rest) and result components; the token-aware `Chart` with table fallback (use `formatGBPCompact` for axes); the Hello calculator, which should call `requireVerified` and show the refusal state, with `VerifiedBadge`. When export exists, restore the menu footnote's "Export to keep a copy" and the Help wording. New storage keys must pass the storage-key guard and go in `docs/privacy.md`. Owner: decide on legislation.gov.uk sources before 1a.
  - Docs updated: `PHASE-BRIEF.md`, `PLAN.md`, `CHANGELOG.md` (0.3.0), `CLAUDE.md` (Sourced shape, `requireVerified`, money rule, tax-source rule), new `docs/money.md` and `docs/verification-log.md`, `docs/privacy.md` (settings schema 2, migration hook, rollback, tax-source URLs), `docs/README.md`, `src/lib/README.md`, `src/config/tax/README.md`, `content/help/README.md`, the Help topics. `docs/design-tokens.md` unchanged: no token added.

## Archive: slice 0 progress log

Slice 0 Foundation, Done (0.2.0, PR #2, 17 October 2026). The owner ran the session B manual checklist on the deployed site and it passed. Kept as written at the time.

- **17 October 2026, session 1 (recon), run at the start of build session A.** No recon report existed when build session A started (the log was empty and there were no PRs), so the owner chose "recon, then build" in the same session. Inspected `kishore510/chalkline` at `093e8d1` (0.31.0) and `kishore510/stickyard` (0.43.0).
  1. **Stack (Chalkline).** Vite 8 + React 19 + TypeScript 7 (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `@/` alias). Tailwind CSS 4 via `@tailwindcss/vite`, with shadcn-style primitives (`class-variance-authority`, `clsx`, `tailwind-merge`) and `lucide-react` icons. Zustand for state, Zod for schemas. Vitest 4 (node by default; `happy-dom` per file for component tests). Node pinned in `.nvmrc` (20.20.2). **No ESLint and no Prettier** in Chalkline or Stickyard: verification is `tsc --noEmit`, `vitest run` and `vite build`.
  2. **Tokens.** One file, `src/styles/tokens.css`: `--cl-*` custom properties in `:root, [data-theme='light']` and `[data-theme='dark']` blocks, theme-independent tokens (touch target 44 px, focus ring, motion durations and easing, layout sizes) in a plain `:root`, durations zeroed under `prefers-reduced-motion`. A Tailwind `@theme inline` block maps the tokens to utilities and resets the default palette (`--color-*: initial`), so only token-backed colours exist. Type scale, radii (8/10/12 px), spacing base and breakpoints live in an `@theme` block. `tokens.test.ts` checks WCAG contrast pairs in both themes, that both themes define the same tokens, and that no file outside `tokens.css` hard-codes a colour or px value. There is **no raw-palette layer**: each theme block sets the semantic tokens directly to hex.
  3. **Theme toggle.** `src/lib/theme.ts` (pure: `parsePreference`, `resolveTheme`, `nextPreference` cycling system > light > dark, `storedPreference`). `src/hooks/useTheme.ts` applies `data-theme` on `<html>` and follows the OS through `useSyncExternalStore` on `matchMedia`. `src/components/ThemeToggle.tsx` is one ghost icon button (Lucide `Monitor` / `Sun` / `Moon`, aria-label "<Theme> (tap to change)"). Flash avoided with an inline classic `<script>` in the `<head>` of `index.html` that reads storage and sets `data-theme` before paint. A test only checks that the script mentions the same keys.
  4. **Fonts.** Self-hosted through `@fontsource-variable/*` (Inter for the UI via `@import` in `index.css`; four more faces for diagram labels). Vite bundles the woff2 files. No CDN.
  5. **Deploy.** `.github/workflows/deploy.yml`: on push to `main` (plus manual dispatch), `npm ci`, `tsc --noEmit`, `npm test`, `npm run build` with `VITE_BASE=/${{ github.event.repository.name }}/`, `upload-pages-artifact` then `deploy-pages`. `vite.config.ts` reads `base` from `VITE_BASE` (default `/`). `ci.yml` runs the same checks on every other branch and on PRs. Build info (version, SHA, date, credits) is injected through Vite `define`.
  6. **Lint and CI.** As in 1 and 5: typecheck, test and build only, with no linter or formatter.
  7. **App chrome inventory** (Chalkline paths under `src/`):
     - Main menu `editor/FileMenu.tsx`: generalise (its items are diagram file actions).
     - Help `help/HelpSheet.tsx`, `HelpEntry.tsx`, `topics.ts`, `markdown.ts`, `Markdown.tsx`, `helpStore.ts`: generalise. Topics come from `src/help/topics/*.md` with front matter; Sumyard wants `content/help/`. Search is out of scope for slice 0.
     - What's new `help/changelog.ts` (parser plus tests), `help/whatsNew.ts` (last-seen marker): lift as is, changing only the storage key.
     - About lives in Help: `version.ts`, `build/buildInfo.ts` (commit, date, credits from licences), `help/credits.ts`: lift, dropping the diagram schema line.
     - Settings `settings/SettingsSheet.tsx`, `settingsStore.ts`, `schema.ts`, `Choice.tsx`: generalise (theme stays; diagram, AI and backup sections go).
     - Toast with Undo `editor/UndoToast.tsx`: lift and generalise (it is wired to diagram history).
     - Panels, focus and primitives `components/ui/{button,dialog,panel,segmented,input}.tsx`, `useFocusTrap.ts`, `useSheetFocus.ts`, `lib/focusTrap.ts`, `hooks/useMediaQuery.ts`: lift as is. Chalkline has no generic panel stack or hash router; session B builds those.
     - Errors and empty states `errors/*`, `components/EmptyState.tsx`: lift.
     - Drop as diagram-specific: canvas, shapes, stencils, layers, search, AI, export, onboarding tour, and the `--cl-node-*`, `--cl-swatch-*`, grid, guide and palette tokens.
  **Recommendation.** Mirror Chalkline: Vite, React, TypeScript 7 strict, Tailwind 4 over one tokens file, Lucide, Inter through Fontsource, Vitest with happy-dom, the same `.nvmrc`, and the same CI and deploy workflows with `VITE_BASE`. Zustand and Zod wait until they are needed (session B or 0.5). Three differences: (a) **add ESLint and Prettier**, because Sumyard's brief requires `lint` and format while Chalkline has neither; (b) **add a raw-palette layer under the semantic tokens**, because the brief asks for themes to swap only the semantic layer (the values stay Chalkline's); (c) **namespaced, versioned storage keys** (`sumyard:v1:...`) instead of `chalkline.*`.
- **17 October 2026, build session A (scaffold, tokens, theme, CI guards). Version 0.1.0.**
  - Done:
    - [x] Scaffold at Chalkline's versions: Vite 8, React 19, TypeScript 7 strict, Tailwind 4, Vitest 4, `.nvmrc` 20.20.2. Scripts `dev`, `build`, `test`, `lint`, `format`, `typecheck`. Folder layout from `PLAN.md`; empty folders have a README.
    - [x] `package.json` 0.1.0; `CHANGELOG.md` (Keep a Changelog) with `[Unreleased]` and a 0.1.0 entry.
    - [x] Tokens: `src/styles/tokens.css`, adapted from Chalkline with a raw palette (`--sy-palette-*`) under the semantic layer (`--sy-bg`, `--sy-surface`, `--sy-text`, `--sy-accent`, `--sy-danger`, ...). Themes swap only the semantic layer, and a test checks that. Every value is a Chalkline value. Contrast pairs tested in both themes. Details and the token list are in `docs/design-tokens.md`.
    - [x] Fonts: Inter bundled via `@fontsource-variable/inter`, as Chalkline. No CDN.
    - [x] Theme: system / light / dark under `sumyard:v1:theme` as `{ schemaVersion: 1, theme }`. An inline pre-paint script in `index.html` sets `data-theme` before paint, and `useTheme` follows OS changes and other tabs. Toggle and icons lifted from Chalkline (`Monitor` / `Sun` / `Moon`, cycling System > Light > Dark).
    - [x] Placeholder home: app name, purpose line, "Calculators coming" card, an on-device note and the illustrative-not-advice disclaimer, plus a temporary header with the toggle.
    - [x] Workflows `ci.yml` and `deploy.yml` mirror Chalkline, plus a lint step; `VITE_BASE=/<repo>/`.
    - [x] Guards, each tests-first (red commit `a940e06`, then green `acb8cfb`):
      - 8a `scripts/checks/docs.ts`: `PLAN.md` "Last updated" and statuses, `CHANGELOG.md`, `package.json` and the lockfile in step.
      - 8b `scripts/checks/externalUrls.ts`, run on `dist/` by `npm run build` through `vitest.build.config.ts`.
      - 8c `src/lib/theme.test.ts` runs the real `index.html` script against a fake browser for every stored and OS combination, checks it agrees with `theme.ts`, and checks it is inline, blocking and first in `<head>`. The same check runs on `dist/index.html`.
    - [x] `src/lib/storageKeys.ts` (as Chalkline's) and `docs/privacy.md`; a test fails if a key is missing from the doc.
    - [x] `CLAUDE.md` Stack section filled in.
    - [x] Checked in Chromium at 360, 768 and 1280 px in light and dark: no horizontal scroll, 44 × 44 toggle, Inter loaded, only same-origin requests, visible focus ring in the focus colour, transitions 0 s under reduced motion. A stored theme beats the OS and is set before `<body>` exists.
  - Differences from the brief and prompt:
    - Recon and build ran in the same session because no recon report existed (owner's choice).
    - **Biome instead of ESLint and Prettier.** Chalkline has no linter. typescript-eslint supports TypeScript only below 6.1 and Chalkline uses 7. Biome is one native dependency with no TypeScript peer.
    - **The URL allowlist has a second, exact-match list of inert strings** (`INERT_URLS`) besides gov.uk links: four XML namespace identifiers and React's error-decoder prefix (both inside React DOM), plus Tailwind's licence comment. None is fetched. Without the list, the guard fails on React and Tailwind themselves. Any other URL fails, and gov.uk fails where the browser would fetch it.
    - Token prefix `--sy-` (not bare `--bg`), matching Chalkline's `--cl-` convention. One new token layer (the palette); no new semantic token, colour or font. No logo: the header uses a text wordmark until a mark is designed.
    - `npm install` hit an npm 10 resolver crash (`edgesOut`); the lockfile was seeded from Chalkline's, then pruned. `npm ci` works.
    - Build info (version, SHA, credits) was not lifted yet; it belongs with About in session B.
    - Deploy needs the PR merged to `main`, and Pages set to "GitHub Actions" in the repo settings (it cannot be enabled from CI).
  - Next (session B): the app chrome as in Scope: top bar with menu, sheets with stack, hash routing, focus trap, Help (from `content/help/*.md`), What's new, About, Settings, toast with Undo, footer disclaimer and first-run acknowledgement. Notes:
    - Lift from Chalkline the files listed in the recon. Move the theme into Settings, either keeping `sumyard:v1:theme` or migrating it, and update `docs/privacy.md` and `src/lib/storageKeys.ts`.
    - Chalkline's `collectCredits` puts package homepage URLs into the bundle, which guard 8b will reject. Either keep the URLs out of the bundle (name and licence only) or decide explicitly to allow them.
    - What's new must fail the build when `CHANGELOG.md`'s top version differs from `package.json` (8a already checks this in tests).
    - Copy back from Chalkline any chrome sizes needed (sheet heights, help and settings widths, toast duration, badge dot).
    - Run the 360 / 768 / 1280 check on the deployed URL from a real phone.
  - Docs updated: `PHASE-BRIEF.md`, `PLAN.md`, `CHANGELOG.md`, `CLAUDE.md`, and the new `docs/design-tokens.md`, `docs/privacy.md` and `docs/README.md`.

- **17 October 2026, build session B (app chrome). Version 0.2.0.**
  - Done (tests first: red `821e663`, green `ad458b6`):
    - [x] Header with the menu button and the existing theme toggle. Main menu (from Chalkline's FileMenu): Settings, Help and what's new (with a **New** marker while this version is unseen), About Sumyard, and Scenarios as a disabled item marked "Coming soon". Footnote "Changes are saved in this browser. Export to keep a copy." Arrow keys, Home, End, Esc and Tab follow the WAI-ARIA menu-button pattern.
    - [x] Sheets: one hash-routed panel stack (`src/sheets/route.ts`): `#/help`, `#/help/<topic>`, `#/whats-new`, `#/about`, `#/settings`. Bottom sheet on phones, side panel from `md` (768 px). Back arrow when there is a parent, title and close. Browser Back, the back arrow and Esc step back or close. Focus is trapped (Chalkline's `trapFocus`), the app behind is `inert`, the title takes focus on each page, and focus returns to the opener (or the menu button after a deep link). Deep links open the right page. Pages load lazily, with a loading state.
    - [x] Help from `content/help/*.md` (front matter: title, order, summary): Quick start, Scenarios and saving, How tax data and "last verified" work, Troubleshooting. Text describes only what exists or marks it as coming; a test rejects money amounts and percentages. A More section links to What's new, Settings and About. No search.
    - [x] What's new from `CHANGELOG.md`, parsed at build time (Chalkline's parser) and injected as data: version, date, "This version" badge, Added / Changed / Fixed. "New" marker until opened, under `sumyard:v1:last-seen-version`. The docs guard now also requires What's new to parse the changelog, and `vite build` runs it, so a top version that differs from `package.json` fails the build (checked by bumping the version locally).
    - [x] About: version, build (short SHA), built time, storage used (only `sumyard:` keys), Copy details (version, build, browser), privacy statement with every storage key, disclaimer, and credits from `scripts/build/credits.ts` (name, version, licence; no URLs).
    - [x] Settings: theme (the toggle's store), region default (rest of UK / Scotland), whole pounds or pence, under `sumyard:v1:settings` with a schema version. Tax year is a labelled placeholder with a code comment pointing at slice 0.5. "Reset settings to defaults" (theme too) shows a toast with Undo.
    - [x] Toast with Undo: one store (`src/toast/toastStore.ts`), auto-dismiss after `--sy-toast-duration`, paused while hovered or focused, one polite live region outside the app root. On the page it floats at the bottom under the menu; with a sheet open it is the sheet's footer strip, so it covers nothing and Undo is inside the focus trap.
    - [x] Shared empty, error and loading states (`src/components/states.tsx`), used for Help with no topics, an unknown topic, What's new with no releases, a sheet page that throws, and the sheet loading.
    - [x] Footer disclaimer on the page, and a first-run "Before you start" notice under the top bar (not a dialog). "Got it" stores `sumyard:v1:acknowledged`.
    - [x] Storage-key guard (`scripts/checks/storageKeys.ts`): keys used in code (literals and `STORAGE_KEYS.x`), `src/lib/storageKeys.ts`, `docs/privacy.md` and About > Privacy must agree. It also fails on keys outside `sumyard:v1:`, and on sessionStorage, IndexedDB or cookies.
    - [x] URL allowlist tightened, not widened: each `INERT_URLS` entry is pinned to `.js` or `.css`, and the build fails if an entry is no longer in `dist/`. No entry added. Documented in `docs/privacy.md`.
    - [x] Checked in Chromium (Playwright, scratch script, not committed) at 360, 768 and 1280 px in light and dark, 289 checks, all passing: no horizontal scroll; bottom sheet versus side panel geometry; menu inside the viewport; focus trap, Esc, back arrow, browser Back and focus restore; deep link; every visible control at least 44 × 44; toast announced, inside the sheet without overlapping content, never covering menu items, auto-dismissing, and Undo restoring settings and theme; first-run notice persisting; only the four owned keys written; no external requests; no console errors. axe-core 4.10 (WCAG 2.0/2.1 A and AA, plus best practice) found 0 violations on the home page, menu, Help, a topic, What's new, About and Settings in every combination. Under reduced motion the sheet animation is 0 s.
  - Differences from the brief and prompt:
    - **No Zustand or Zod.** Stores are a small `useSyncExternalStore` helper (`src/lib/store.ts`), the pattern `useTheme` already used. No new runtime dependency, so credits and the URL allowlist are unchanged.
    - **`lastSeenVersion` is stored as `sumyard:v1:last-seen-version`**: the existing key-format test allows only lower-case kebab-case. The code name stays `lastSeenVersion`.
    - **Sheet parents are fixed:** topics, What's new and About sit under Help, and Settings has no parent. A deep link therefore has the same back arrow as a page reached by tapping.
    - **What's new is injected, not bundled raw:** `CHANGELOG.md`'s intro links to keepachangelog.com, which the URL scan would reject. Only the parsed releases reach the build.
    - **"Reset settings to defaults" also resets the theme to System**, so Undo restores both.
    - **The sheet body is a focusable, labelled region** so pages without controls can be scrolled by keyboard (axe `scrollable-region-focusable`). Biome's `noNoninteractiveTabindex` is suppressed there with that reason.
    - **Safe-area helpers became Tailwind `@utility` classes**, so `md:` variants work on them. Added an empty inline favicon (`data:,`) to stop a 404 for `/favicon.ico` (there is still no logo).
    - Six chrome tokens copied back from Chalkline (listed in `docs/design-tokens.md`). None invented.
    - The menu footnote says "Export to keep a copy" as the prompt specified, though export arrives with scenarios in 0.5; the Help topic says export is coming.
  - Not verified: a real phone, Safari and Firefox, a screen reader, the deployed URL (needs merge), and Windows high-contrast mode.
  - Owner's manual checklist (phone, Safari, screen reader):
    1. On the phone, open the live URL in Safari (and Chrome on Android if you have one). The first-run notice shows; "Got it" hides it and it stays hidden after a reload.
    2. Menu > Help and what's new: the sheet slides up from the bottom, the page shows above it, and it scrolls without the page behind moving. Open What's new, use the back arrow, then swipe or press Back: the sheet steps back, then closes.
    3. Settings > Dark, then Reset settings to defaults: the Undo strip appears at the foot of the sheet and does not hide anything; Undo brings Dark back.
    4. Rotate the phone and try with large text (iOS Text Size at its largest): nothing is cut off, and the top-bar buttons still fit.
    5. VoiceOver (iOS or macOS): the menu button reads "Menu, new: what's changed", the sheet reads as a dialog with its title, and the reset toast is announced.
    6. Bookmark `#/help/troubleshooting`, open it from the bookmark, and close: you land on the home page.
  - Next: the owner runs the checklist on the deployed site, then sets slice 0 to Done in `PLAN.md` (0.2.0, the PR number, the date). Then slice 0.5 (core plumbing): money type, `Sourced<T>` tax config with the registry, which unlocks the Settings tax-year default (replace the `data-stub="tax-year"` placeholder in `src/sheets/SettingsPage.tsx`), versioned scenarios with export and import (the Scenarios menu item, the menu footnote and the "Scenarios and saving" Help topic then describe something real), backup and restore in Settings, and the shared input and result components. New storage keys from 0.5 must pass the storage-key guard.
  - Docs updated: `PHASE-BRIEF.md`, `PLAN.md`, `CHANGELOG.md` (0.2.0), `CLAUDE.md` (state stores, build docs guard, storage-key guard, allowlist pinning, chrome text rule), `docs/privacy.md` (four keys, records, migrations, allowlist), `docs/design-tokens.md` (six chrome tokens), `docs/README.md`, `content/help/README.md`, `src/lib/README.md`.
