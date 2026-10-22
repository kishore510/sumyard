# Phase brief archive

Archive, not for routine reading. Moved verbatim from `PHASE-BRIEF.md` on 21 October 2026: the slice 1b status line, the scopes of finished parts, the 1b-ii notes as written, every progress log, and the slice 1a, 0.5 and 0 archives. Grep it for a past decision; do not read it whole.

## Slice 1b status line (as of 0.12.0)

Status: In progress. **Session 1b-i is done (0.9.0, user-visible):** the first usable calculator, take-home pay at `#/c/optimiser`, with taxable benefits in kind and post-tax deductions in the engine, and the Hello placeholder removed. **Part 1b-i.1 is done (0.10.0, user-visible):** pension contributions as a percentage of pensionable pay, and benefits in kind and post-tax deductions as lists of named items per month or per year (inputs version 2). **Part 0.11.0 is done (user-visible):** benefits taken from pay before or after tax, an optional tax code with a PAYE estimate, a Year / Month breakdown (inputs version 3). **0.12.0 is done (user-visible, UI only):** the take-home page redesign (sections with summaries, a sticky result, a split bar, payslip net pay with a code). **Next:** session 1b-ii (the optimiser itself on the same page), starting from inputs version 3. Slice 1a is Done (0.8.0, PR #8), with the HMRC cross-checks still pending. Rewritten at the start of every slice; roadmap and status live in `PLAN.md`. Slice 1a's brief and progress log are archived below, above slice 0.5's and slice 0's.

## Session 1b-i: first usable calculator, with benefits and deductions (0.9.0)

### Scope

- Part A (engine, tests first): two optional `TaxInputs` fields, `taxableBenefits` and `postTaxDeductions`, after GOV.UK lookups on how a benefit in kind enters taxable pay, ANI, NI, the student loan base, the HICBC, the annual allowance and childcare (decisions B1 to B5).
- Part B (page, tests first): `definition.ts` and `OptimiserPage.tsx` at `#/c/optimiser`, calling `takeHome` only; remove Hello; a Help topic; a `CLAUDE.md` changelog rule.

### Out of scope

Charts, candidate points, threshold markers, annual allowance and childcare displays, tax codes, per-period payroll, any config change, any other tax year.

## Part 1b-i.1: percentages, itemised benefits and deductions, monthly entry (0.10.0)

### Scope

Page and definition only (no engine, config or tax rule change), tests first: contribution mode (amount or percentage of pensionable pay) for the employee and employer; an optional pensionable pay with a bonus switch; benefits in kind and post-tax deductions as lists of up to `MAX_LIST_ITEMS` named items, per month or per year; resolved amounts shown; input warnings; inputs version 2 with a migration giving identical results; compare and summarise; assumptions and Help. Owner decisions B6 to B9.

### Out of scope

Charts, candidate points, the optimiser, per-pay-period payroll, tax codes, any engine or config change, salary sacrifice for benefits, any other year.

## Part 0.11.0: benefits through salary sacrifice, tax code and PAYE estimate, monthly breakdown (0.11.0)

### Scope

GOV.UK lookups first (how a salary-sacrifice benefit is taxed, NI and the student loan on the sacrificed cash, contributions after tax, tax codes and cumulative PAYE), logged with exact wording; any value needed and not in config added as a sourced leaf in its own commits. Engine (tests first): benefit items in `TaxInputs`, `paye` for level monthly pay with a typed refusal for codes not modelled. Page (tests first): the item fields, a tax code box and PAYE card, a Year / Month breakdown, inputs version 3 with migrations, compare, assumptions and Help. Owner decisions B10 to B16.

### Out of scope

Charts, the optimiser, per-pay-period payroll beyond level pay, exempt benefits, K codes, other tax years.

## Part 0.12.0: take-home page redesign (UI only)

### Scope

A reusable `Section` and `StickyResult` in `src/components/`; the page rebuilt from them ("Your pay" always visible, five sections with live summaries, open on load when set, never stored; results first and sticky); a split bar of where gross pay goes; estimated payslip net pay beside take-home after the year-end adjustment with a supported code; compact item cards with Undo; one settled announcement; scroll padding, safe areas, no horizontal scroll at 360 px. Decisions U1 to U9 in `docs/ui-patterns.md`.

### Out of scope

Engine, config, tax rules, new inputs, the optimiser and its charts (1b-ii), persisted layout state, any other calculator, a logo.

## Next: session 1b-ii (the optimiser on the page)

What 1b-ii picks up, on the same page and inputs (version 3 since 0.11.0; the 0.12.0 layout: put the optimiser's inputs in a new `Section` and its results in the `StickyResult` results column, with the chart below the split bar; add a migration to `MIGRATIONS` in `definition.ts` only if the stored shape changes; the version follows). `optimise()` already sweeps from cash pay after salary given up for benefits.

- `optimise(inputs, config, policy, options?)` from the page inputs: `toTaxInputs` plus `pension` (the method and the resolved current contribution, from `resolveInputs`), `savings` (the resolved `employerContribution`, carry forward and the MPAA flag as new inputs) and `checkChildcare`. A sweep over contributions is in amounts; a contribution entered as a percentage can be shown as a percentage of pensionable pay beside it.
- The take-home (or spendable) against contribution chart from `points`, markers for `current`, `maximum` and each threshold, `cliffs` drawn as labelled jumps, a table fallback (the shared `Chart`).
- "Cost of £1 more pension" from `netCostPerPound` and `marginalRate`, labelled with what each is measured against.
- Thresholds in words from `thresholds` ("already under", "contribute £X more", "out of reach" with the reason); the HICBC full-charge point said plainly (the charge first falls a penny below it).
- Warnings from each point (annual allowance, taper, carry forward, childcare), never hidden, never a cap; childcare as eligibility only, with what isn't checked.
- No point labelled "best". Compare: the current contribution against a chosen one.
- **Still with the owner:** confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input.

## Progress log

Add one entry per session: date, what was done, what differs from the brief, what the next session should pick up, and which docs were updated.

- **18 October 2026, part 0.12.0 (take-home page redesign). Version 0.12.0, user-visible, UI only.**
  - Pre-check: PR #13 merged (3de8c1d on main); its Pages deploy (run 39121031476) succeeded. Names confirmed in the code: `OptimiserPage.tsx`, `definition.ts` (`resolveInputs`, `calculateTakeHome`, `calculatePaye`, `inputsVersion` from the migrations), `breakdown.ts`, the shared components (`ResultCard`/`StatRow`, `Segmented`, `ScenarioBar`, `AssumptionsPanel`, `VerifiedBadge`, `Chart`). They match the prompt, except: the top bar is not sticky, and `Chart` has no stacked bar (both below).
  - Done (red `d55b1d7`, green `be60bb9`, then the close-out):
    - [x] Decisions U1 to U9 in a new UI note, `docs/ui-patterns.md`.
    - [x] `Section` (native button in a heading, `aria-expanded`, `aria-controls`, touch target, live summary, no motion, panel kept mounted), `StickyResult` (phone bar collapsing with hysteresis past its own height, tap to expand; two columns from `md`, results sticky; `--sy-sticky-offset` for `scroll-padding-top`; one polite announcement after `SETTLE_MS`), `SplitBar` (a small component, as `Chart` has no stacked bar).
    - [x] The page: "Your pay"; the five sections (`sections.ts`: set or not, field to section, summaries from `resolveInputs`); results: headline for the period, split bar (`results.ts` `splitSegments`), breakdown, PAYE card; payslip net pay (`payslipNet`) only with a supported code; item cards edited in place, Remove with Undo (`toastStore` gains `blocked`).
    - [x] Tests: the components; `sections.test.ts`; `results.test.ts` (the parts add up to gross pay on 300 random cases); 25 new page tests; `pageResults.snapshot.test.ts` (engine outputs, PAYE, month view and compare summary for seven inputs, written before the redesign, unchanged after). Every earlier page test passes unchanged; one new page test changed between red and green (section ids carry the `opt-section-` prefix). Literal and storage-key guards unchanged; no new storage key.
    - [x] Chromium (vite preview) at 360, 768, 1024 and 1280 px, light and dark, with axe: 96 checks, 29 axe runs clean. Fixes from them: Add and item buttons wrap at 200% text; the split bar's table no longer widens the page; item names keep a minimum width beside their buttons. Lighthouse mobile in `docs/performance.md`.
    - [x] `test` (1,585 passed, 72 todo), `lint`, `typecheck`, `build` pass.
  - Differences from the prompt (also in `PLAN.md`): the phone bar sits under the page title, as the top bar doesn't stick; one Year / Month choice for the page; `SplitBar` instead of `Chart`; payslip net pay swaps income tax only (the Child Benefit charge and relief at source stay in: an open question); per-keystroke live regions beside inputs removed; Section buttons named by their visible text.
  - Not verified: a real phone, Safari (no scroll anchoring there, so the collapse shift is not compensated; the hysteresis still prevents flicker), Firefox, a screen reader, the deployed site.
  - Next: session 1b-ii (above).
  - Docs updated: `PHASE-BRIEF.md`, `PLAN.md`, `CHANGELOG.md` (0.12.0), `CLAUDE.md` (pages use `Section` and `StickyResult`; the new shared components), `docs/ui-patterns.md` (new), `docs/README.md`, `docs/performance.md`, `src/calculators/optimiser/README.md`, Help (`take-home-pay`). `docs/design-tokens.md` unchanged: no token added. About > Privacy unchanged: no storage key changed. No config value touched.

- **18 October 2026, fix 0.11.1 (benefits in kind in the PAYE estimate's pay). User-visible.**
  - Bug: for an owner's case with a salary sacrifice pension and benefit items (part sacrificed), `paye()` received taxable pay without the benefits (`payrollPay`, B13), while the annual income tax used taxable pay with them; the estimate ran below the liability by the benefits at the higher rate.
  - Done: [x] red test (`paye.test.ts`: PAYE's pay equals `incomeTax.taxablePay`, gross less sacrificed pension and sacrificed benefit cash plus the benefits' full taxable value, with a code; and a 100-case property across pension methods and benefit mixes); [x] green: `payrollPay` is `effect.taxablePay`; reference fixture, `sacrifice.test.ts` (payroll pay expectations and the cash room two properties use) and the double-counting code test updated; [x] decision B17; assumptions and Help text; [x] `test`, `lint`, `typecheck`, `build` pass.
  - Not verified: GOV.UK's payrolling benefits guidance (not read in this fix); whether a given employer payrolls each benefit; Tables A and B to D still unread (O10, O11); the owner's payslip beyond the one taxable pay figure (manual, B15).
  - Next: session 1b-ii (above).
  - Docs updated: `PHASE-BRIEF.md`, `PLAN.md`, `CHANGELOG.md` (0.11.1), `docs/modelling-decisions.md` (B17, B13 marked), `src/calculators/optimiser/README.md`, Help (`take-home-pay`). `CLAUDE.md` unchanged. No config value or storage key touched.

- **18 October 2026, build part 0.11.0 (benefits through salary sacrifice, tax code and PAYE estimate, monthly breakdown). Version 0.11.0, user-visible.**
  - Pre-check: PR #11 merged; its Pages deploy (run 39104318284) succeeded. Names and signatures confirmed in the code: `TaxInputs` (`taxableBenefits`, `postTaxDeductions` as single annual figures), `takeHome(inputs, config, policy)`, the page's `ListItem` lists (`taxableBenefits`, `postTaxDeductions`), inputs version 2, `MONTHS_PER_YEAR`, `inputLimits.ts`. They match the prompt, except that the tax code needed a config value (below).
  - Done (decisions and lookups `101cba2`; config red `1cce4b8`, green `214769a`; engine red `2f0f54a`, green `c9b141f`; page red `6456262`, green `fd6a165`; then the close-out):
    - [x] GOV.UK lookups through the content API, logged with exact lines ("Session 0.11.0 lookups"): 480 Appendix 12, EIM44120 and Salary sacrifice for employers (the greater of value and salary given up; exemptions), NIM02330 (Class 1 only on the cash; Class 1A on the benefit), the student loan base (as G6), EIM21119 and NIM15201 (making good), the tax code pages, Understanding your employees' tax codes (code times ten), PAYE11015, PAYE11090, PAYE70025 (cumulative basis, free pay n twelfths), Income Tax in Wales (2026 to 2027 rates the same as rUK), the page on paying too much or too little. Tables A and Tables B to D are PDFs the network refuses: **OPEN** O10 (exact free pay) and O11 (per-period rounding); decision D3 rounding used, no guess coded.
    - [x] Config: `paye.codeUnit` in a new "PAYE tax codes" group, its own red and green commits, with a log row (a standing rule, not tied to a tax year: for the owner to confirm).
    - [x] Decisions B10 to B16 in `docs/modelling-decisions.md`; B4 marked superseded.
    - [x] Engine: `TaxInputs.benefits`, `benefitTaxable`, `benefitTotals`; salary given up comes off pay before every step (tax, NI, loan, ANI, the annual allowance measures, `optimise()`'s sweep and solver) and is refused above pay; contributions after tax off take-home; breakdown rows for both; `payrollPay`; a warning when salary is given up; `paye.ts` (`parseTaxCode`, `paye`, `payeEstimate`).
    - [x] Engine tests: `sacrifice.test.ts`, `paye.test.ts`, `published.test.ts` (BEN-1 to BEN-4, TC-1 to TC-3), `fixtures/reference.ts` extended independently (items, cash pay, payroll pay, its own cumulative PAYE). Literal guard passes. Mutation spot-checks: benefit dropped from taxable pay (10 fail); salary given up left in NI-able pay (3); code number mis-converted (7).
    - [x] Page: benefit items (value, taken, how, per month or year) with each item's taxable amount and the totals; tax code box; PAYE card and notices; region warning; Year / Month breakdown (`breakdown.ts`) adding up in both views with the penny note; inputs version 3 with migrations from 1 and 2 (identical results); compare rows; assumptions; Help. A generic item list replaces the single one. Mutation spot-check: migrated items given their amount as salary given up (12 fail).
    - [x] Chromium (vite preview) at 360, 768 and 1280 px, light and dark, five states including the Month view and an 80-character name at 360 px (30 runs): axe found no violations; no horizontal scroll; no external requests; no console errors; controls at least 44 px.
    - [x] `test` (1,480 passed, 72 todo), `lint`, `typecheck`, `build` pass.
  - Differences from the prompt (also in `PLAN.md`): `paye(code, pay, config)` takes no policy, and `payeEstimate` gives the difference; PAYE's pay is pay through payroll without benefits; the code multiplier went into config as `paye.codeUnit`; a C code uses the rUK bands (the same Welsh rates for 2026 to 2027); the exemption warning shows whenever salary is given up; an item cannot both give up salary and make good; the inputs version is derived from the migrations list (literal guard); the Month view's PAYE row shows the first month.
  - Not verified: Tables A and B to D (the free pay and rounding payroll uses); the owner's payslip (manual, B15); real devices, Safari, Firefox, a screen reader; the deployed site.
  - Next: session 1b-ii (above).
  - Docs updated: `PHASE-BRIEF.md`, `PLAN.md`, `CHANGELOG.md` (0.11.0), `docs/modelling-decisions.md` (B10 to B16), `docs/verification-log.md` (lookups, O10, O11, the `paye.codeUnit` row), `docs/worked-examples.md`, `docs/performance.md`, `src/calculators/optimiser/README.md`, `src/lib/README.md`, Help (`take-home-pay`). `CLAUDE.md` unchanged (no rule changed). About > Privacy unchanged: no storage key changed.

- **18 October 2026, build part 1b-i.1 (percentages, itemised benefits and deductions, monthly entry). Version 0.10.0, user-visible.**
  - Pre-check: PR #10 merged; its Pages deploy (run 39098710380) succeeded. Names and signatures confirmed in the code: `OptimiserPageInputs` (version 1: single `employeeContribution`, `employerContribution`, `taxableBenefits`, `postTaxDeductions` amounts), `toTaxInputs`, `calculateTakeHome`, `MONTHS_PER_YEAR` (`src/lib/periods.ts`), `MAX_INPUT_AMOUNT` and `MAX_CHILDREN` (`inputLimits.ts`), `parsePercentText`, `percentRatio` and `isCanonicalPercent` (`parse.ts`), `PercentInput`, `mulRound`. They match the prompt. An earlier prompt for 0.11.0 assumed this part had run; it was stopped at its pre-check with no changes.
  - Done (decisions `a8cf88b`; red `c4b97e4`; green `b79efd5`; then the close-out):
    - [x] Owner decisions B6 to B9 in `docs/modelling-decisions.md`.
    - [x] `pageInputs.ts`: pensionable pay, contributions resolved to the nearest penny through `mulRound`, monthly items times `MONTHS_PER_YEAR`, list totals.
    - [x] `definition.ts`: inputs version 2; `validateInputs` builds fresh objects (contributions, pensionable pay, items with names tidied by `cleanText`), rejects hostile keys, over-long names, bad modes, percentages and periods, and too many items; the version 1 migration; `resolveInputs`, `inputWarnings`; summarise with resolved totals, modes, the percentage as a ratio row and item names as text.
    - [x] Page: mode switch (Segmented) per contribution with `PercentInput` and the resolved amount; pensionable pay (own figure, bonus switch) when a percentage is used; two item lists (numbered fieldsets with name, amount, per month or per year, Remove; Add disabled at the limit with the reason; each item's annual amount and the running total); input warnings above the results; three new assumptions. Fields that leave the page (a mode switch, a removed item) clear their invalid state. A shared `TextInput` for names.
    - [x] Tests (`pageInputs.test.ts`, `definition.test.ts`, `OptimiserPage.test.tsx`, `inputs.test.tsx`): the prompt's list, including a nearest-versus-down rounding case, a version 1 scenario loading with identical take-home through storage, and the any-mix-of-items property (150 random cases). Literal guard unchanged and passing (it now also scans `pageInputs.ts`). Mutation spot-checks: rounding down (2 fail), the bonus always included (5), month and year swapped (17).
    - [x] Chromium (vite preview) at 360, 768 and 1280 px, light and dark, five states including 80-character names at 360 px and a full list (30 runs): axe found no violations; no horizontal scroll; no external requests; no console errors; controls at least 44 px. One fix: item legends are numbered instead of showing the name.
    - [x] `test` (1,322 passed, 72 todo), `lint`, `typecheck`, `build` pass.
  - Differences from the prompt (also in `PLAN.md`): a version 1 zero migrates to an empty list; a negative item amount is an input error, so the warning is for an item with no amount, in both lists; pensionable pay shows only with a percentage and the bonus switch applies to the own figure too; percentages accepted up to ten times pay (`MAX_PERCENT_INPUT`) so the over-all-of-pay warning can show; the page test's no-figures regex matches "per cent" as a word only; `ImportPage.test.tsx` uses the current inputs version for its example.
  - Not verified: the rounding against a real scheme's payslip; real devices, Safari, Firefox, a screen reader; the deployed site.
  - Next: the owner's 0.11.0 prompt or 1b-ii (above).
  - Docs updated: `PHASE-BRIEF.md`, `PLAN.md`, `CHANGELOG.md` (0.10.0), `docs/modelling-decisions.md` (B6 to B9), `docs/performance.md`, `src/calculators/optimiser/README.md`, `src/lib/README.md`, Help (`take-home-pay`). `CLAUDE.md` unchanged (no rule changed). About > Privacy unchanged: no storage key changed. No config value touched, so no verification log or worked example change.

- **18 October 2026, build session 1b-i (take-home page, benefits in kind, post-tax deductions). Version 0.9.0, user-visible.**
  - Pre-check: PR #8 merged. Its own Pages deploy (run 39079146654) failed on a test timeout; PR #9 fixed it and its deploy (run 39079341182) succeeded. Names and signatures confirmed in the code: `takeHome(inputs, config, policy)`, `TaxInputs { grossPay, region, studentLoans, pension?, childBenefit? }`, `ModellingPolicy { taperRounding, childBenefitWeeks }`, `DEFAULT_POLICY`, `requireVerified(config, paths)`, `createCalculatorRegistry`, `defineCalculator`, `sessionFor`, and the shared components the prompt names. No existing field covered either new input. `TaxInputs` has no bonus or employer contribution: the page adds bonus to salary for `grossPay`; the employer contribution lives in `OptimiserInputs.savings` (1b-ii) and is stored by the page now.
  - Done (docs and lookups `4a8dc25`; engine red `a282c1a`, green `d7ad53d`; page red `cd5eb94`, green `26599f8`):
    - [x] GOV.UK lookups, logged with exact lines ("Session 1b-i lookups"): Tax on company benefits (tax, value, NI), the ANI guidance step 1 ("including any benefits you get from your job"), PTM057100 (net income), NIM13090 and NIM13001 (Class 1A, never with Class 1), the medical benefits pages (which NI applies, the value, the salary sacrifice rule), CSLM16030 and the employers' student loan guidance (the base is secondary Class 1 earnings). None silent or conflicting; nothing OPEN.
    - [x] Decisions B1 to B5 in `docs/modelling-decisions.md`.
    - [x] Engine: benefits into taxable pay and ANI (so tax, the taper, HICBC, childcare, both annual allowance measures and the threshold solver), not NI-able pay or the student loan base; deductions off take-home only, their own view row; a `takeHomeBelowNothing` warning, never a cap; assumptions without figures.
    - [x] Engine tests (`benefits.test.ts`): per method; the reference on 300 random cases; benefits never lowering tax; deductions changing nothing but take-home, which falls by exactly the deduction; the taper start and the HICBC threshold and first step a penny either side, moved by a benefit; above gross pay; the annual allowance; threshold contributions and childcare; optimise(); inputs. No GOV.UK page read prints a numeric example with a benefit, so none is mirrored. `fixtures/reference.ts` extended independently. Literal guard passes. Mutation spot-checks: the benefit left out of ANI (5 fail); deductions off taxable pay (5 fail).
    - [x] Page: inputs (tax year and region from Settings, salary, bonus, pension method and employee contribution, employer contribution, benefits, deductions, each student loan plan, children, Child Benefit claimed or opted out); take-home for the year, month and week with the engine's labels and a note that payslips may differ; a breakdown that adds up; Child Benefit, pension going in, benefits and ANI alongside; warnings, input problem, refusal; assumptions (the engine's and the page's); scenarios.
    - [x] Page tests: definition (defaults, region from Settings, fresh object, hostile keys and bad shapes field by field, newer version refused, mapping, summarise); page (results, breakdown matching the engine and adding up, monthly and weekly, benefits and deductions, each method, warnings, input problem, invalid input, hints without figures, assumptions, save and load, no tax figure in page code); refusal on a fake year.
    - [x] Hello removed: folder, registry, page entry, home page text, Quick start. Registry, Import, route and Help tests updated: the registry now lists only the optimiser and a stored Hello scenario is kept but hidden (tested); Import and route tests only swap the example id; Help expects the new topic.
    - [x] Chromium (vite preview), 360, 768 and 1280 px, light and dark: home and the page empty, filled, warning, input problem, invalid input and the open scenario list (42 runs). axe (WCAG 2.0/2.1 A and AA, best practice) found no violations; no horizontal scroll; no external requests; no console errors; every visible control at least 44 px tall except ScenarioBar's hidden file input. One fix: the taper assumption showed twice.
    - [x] `test`, `lint`, `typecheck`, `build` pass.
  - Differences from the brief and prompt:
    - The page is titled "Take-home pay"; the id stays `optimiser`.
    - Input bounds moved to `src/lib/inputLimits.ts`: the engine's literal guard scans every non-test file in the folder, so `definition.ts` is held to it too.
    - A benefit that attracts Class 1 (the employee's own contract paid by the employer, or a reimbursement) is earnings: the help text says to enter it as salary. A benefit through salary sacrifice (the salary amount rule) is not modelled.
    - The Class 1A amount is not shown (no config leaf; employer-side costs out of scope); the assumptions name it.
    - Engine assumption strings hold no digits, so "Class 1A" appears only in the page's own assumptions.
    - A pension contribution above salary plus bonus shows a notice instead of results (the engine refuses it, decision G1).
  - Not verified: the benefit value against the owner's annual statement; payslips; HMRC's calculators; legislation; real devices.
  - Next: session 1b-ii (above).
  - Docs updated: `PHASE-BRIEF.md` (rewritten for slice 1b), `PLAN.md`, `CHANGELOG.md` (0.9.0), `CLAUDE.md` (changelog entry rule; `applySettings`; the Hello rule removed), `docs/modelling-decisions.md` (B1 to B5), `docs/verification-log.md` (Session 1b-i lookups), `docs/worked-examples.md`, `docs/performance.md`, `src/calculators/optimiser/README.md`, `src/calculators/README.md`, `src/lib/README.md`, Help (`take-home-pay`, Quick start). About > Privacy unchanged: no storage key changed.

## Archive: slice 1a brief and progress log

### Goal

A tax config for 2026 to 2027 in which every value Sumyard holds was read on a www.gov.uk page in a build session and logged with its source, then a pure engine (income tax with the personal allowance taper, NI, student loans, three pension methods, HICBC, annual allowance, `optimise()`) built tests first on top of it. Gate (from `PLAN.md`): the config step is finished and logged before any engine code is written.

### Session E: verify and populate the 2026-27 config (0.5.0)

#### Scope

1. Replace `{ status: 'todo' }` in `src/config/tax/2026-27.ts`, group by group, only with values read on a www.gov.uk page in this session; everything else stays `todo` and is reported.
2. Groups: tax year dates; personal allowance and taper (and whether the zero point is stated); income tax bands for England, Wales and Northern Ireland and for Scotland, noting whether each page states bands on taxable income or income after allowances; employee and employer NI (category A assumed); student loan plans 1, 2, 4, 5 and postgraduate; pensions (annual allowance, taper, carry forward, MPAA, relief-at-source rate); Child Benefit rates and HICBC mechanics; Tax-Free Childcare and 30 hours income limits; the announced salary sacrifice change (informational, not modelled); a Budget check.
3. `docs/verification-log.md`: one row per value (path, value, page title, URL, date read, quote, second source, status, notes), OPEN questions first.
4. `docs/money.md`: what GOV.UK and HMRC say about rounding for each step; "not stated" where silent.
5. `docs/worked-examples.md`: examples GOV.UK publishes (inputs, published result, URL), not computed.
6. Tests: every verified leaf has a www.gov.uk URL and a past date; each group's verified count matches the log.
7. Tax data screen checked in Chromium at 360 and 1280 px, light and dark, with axe.

#### Rules

- Source rules: values only from pages fetched in the session; `sourceUrl` an exact `https://www.gov.uk/` page; `verifiedOn` the date read; check the tax year on every page; two sources where two pages cover a value; conflicts and ambiguity stay `todo` or OPEN. No URL-scan change.
- No calculation logic; no real figure in code comments, Help text or tests (tests use the fake fixtures).
- One commit per group. No new dependency, no runtime network request.

#### Out of scope

Engine code, UI work beyond fixing layout problems on the Tax data screen, URL-allowlist changes, any other tax year.

### Session F: the core tax engine (0.6.0)

Pre-check (17 October 2026): PR #5 merged; its Pages deploy (run 39060296115) succeeded; the owner confirmed the spot-check of the verified values.

#### Scope

Pure, unit-tested take-home pay functions with **no pension**, in `src/calculators/optimiser/`: no UI, no registry entry, no new dependency. Every figure comes from the verified config through `requireVerified`; a refusal is returned as the typed `Refusal`.

- `personalAllowance(income, config, policy)`: the published taper, driven by an income figure passed in (adjusted net income is session G).
- `incomeTax(income, region, config, policy)`: marginal bands for rUK or Scotland, the taper, a per-band breakdown.
- `employeeNI(niablePay, config)`: main and additional rates, annual thresholds.
- `studentLoan(plans, pay, config)`: plans and the postgraduate loan, on NI-able pay.
- `takeHome(inputs, config, policy)`: gross, tax, NI, student loan, net; annual, monthly and weekly views; an assumptions list.
- `ModellingPolicy` (`taperRounding: 'exact' | 'wholePoundsDown'`, default `'exact'`) and `TaxInputs`.

Owner's modelling decisions 1 to 7 are recorded in `docs/modelling-decisions.md`, with the decisions already taken for session G.

#### Tests (red commit, then green)

Published gov.uk examples that concern these functions (not those marked "do not mirror"), each citing its URL; property tests (tax never negative, tax and NI never fall as gross rises, take-home never negative, zero in gives zero, taper-zone marginal rate above the band rate, from an independent formula); edge cases (each threshold and a penny either side, beyond the taper's zero point, Scotland against rUK, each student loan plan alone and with the postgraduate loan, zero and negative inputs, the safe-integer guard); a literal guard on the engine source (only 0, 1, 2 and 100); a cross-check harness, `docs/hmrc-cross-checks.json`, with input cases derived from the config and `null` expected results (`it.todo` until the owner fills them from HMRC's calculators).

#### Out of scope

Session G's work (pension methods, adjusted net income, HICBC, annual allowance, childcare check, `optimise()`); the UI, the registry and the Tax data screen; any tax value change.

### Session G, split into G1 and G2

Session G is split in two. **G1** (0.7.0, internal): pension contributions, adjusted net income and the High Income Child Benefit Charge, with `takeHome` extended. **G2** (0.8.0): `annualAllowanceCheck`, carry forward, the childcare check and `optimise()` with its sweep.

#### Session G1: pensions, adjusted net income, HICBC (0.7.0)

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

#### Session G2: annual allowance, carry forward, childcare, `optimise()` (0.8.0)

Done (see the progress log). Pure functions in `src/calculators/optimiser/`, tests first, no UI.

Pre-check (17 October 2026): PR #7 merged; its Pages deploy (run 39076987400) succeeded. Names and signatures confirmed in the code: `pensionContribution(pension, grossPay, config)`, `adjustedNetIncome(grossPay, pension, config)`, `hicbc(ani, children, config, policy)`, `takeHome(inputs, config, policy)`, `ModellingPolicy { taperRounding, childBenefitWeeks }`, `TaxInputs { grossPay, region, studentLoans, pension?, childBenefit? }`, `ExactPence` in `money.ts`. They match the prompt.

Owner decisions for G2 (recorded in `docs/modelling-decisions.md`, G4 update and G7 to G14): Child Benefit weeks stays a policy field (one more GOV.UK search); `optimise()` returns candidate points, never a single best; warnings, never silent clamping; the annual allowance charge only if GOV.UK states the mechanics and the config holds the figures.

1. `annualAllowanceCheck`: the annual allowance, the taper (threshold income and adjusted income, the reduction rounded down to a pound as PTM057100 states, the minimum), the MPAA; warnings, not silent clamping. Read on GOV.UK first how threshold income and adjusted income treat each pension method (PTM057200's AA-4 adds net pay contributions back for adjusted income) and log it.
2. Carry forward over `pension.carryForward.yearsBack` years, from an input of unused allowance (only 2026-27 is modelled).
3. The childcare income-limit cliff (G3) on `adjustedNetIncome`, with the minimum earnings condition and the England-only scope listed as assumptions.
4. `optimise(inputs, config, policy)`: sweep contribution levels on `takeHome`; the take-home and marginal-rate curves; the contribution that brings ANI to each threshold (taper start, HICBC full-charge point and threshold, childcare limit); the cliffs the sweep crosses (HICBC whole steps, student loan whole pounds) documented.
5. Owner inputs before or during G2: Child Benefit weeks (G4); the HMRC cross-checks.

### Next: slice 1b (the optimiser page)

Rewrite this brief for 1b at its start, against the real code. What 1b picks up from the engine:

- **Entry points:** `optimise(inputs, config, policy, options?)` for the page; `takeHome`, `annualAllowanceCheck`, `childcareCheck` and `thresholdContributions` for the breakdowns. Inputs are `OptimiserInputs` (take-home inputs, a required `pension` with the method and current contribution, `savings` with employer contributions, carry forward and the MPAA flag, `checkChildcare`). Every result has `assumptions` (no figures) to show beside it; a `Refusal` shows the unverified values instead.
- **How to present candidate points (decision G13): never as "the best".** Suggested:
  - The take-home (or spendable) against contribution chart from `points`, with markers for `current`, `maximum` and each threshold point, and the `cliffs` drawn as visible jumps with a label (HICBC step, childcare limit, taper switching off, student loan whole pounds), not smoothed over. A table fallback of the same points.
  - A "cost of £1 more pension" table from `netCostPerPound` and `marginalRate`, labelled as against no contribution and since the previous point.
  - A threshold list from `thresholds`: each one's status in words ("already under", "contribute £X more", "out of reach: over the annual allowance / over your pay / this method does not lower it"). The HICBC full-charge point: say plainly that under whole steps the charge only starts to fall a penny below it.
  - Warnings from each point's `warnings` in a panel (over the allowance with the estimated charge, tapered allowance, carry forward used or out of time, childcare over the limit), never hidden and never a cap.
  - Childcare: eligibility only (the support is not valued); say what is not checked (partner, minimum earnings, England only for 30 hours).
- **Still with the owner:** agree slice 1a Done; the HMRC cross-checks (`docs/hmrc-cross-checks.json`, 72 pending; no pension or annual allowance cases yet); confirm 52 Child Benefit weeks.
- **Not modelled (list in the page's assumptions):** defined benefit savings, first flexible access part-way through the year, Scheme Pays, the partner's income for HICBC and childcare, employer NI savings, the salary sacrifice change from April 2029, contribution timing within the year.

### Progress log

Add one entry per session: date, what was done, what differs from the brief, what the next session should pick up, and which docs were updated.

- **18 October 2026, build part 1b-i.1 (percentages, itemised benefits and deductions, monthly entry). Version 0.10.0, user-visible.**
  - Pre-check: PR #10 merged; its Pages deploy (run 39098710380) succeeded. Names and signatures confirmed in the code: `OptimiserPageInputs` (version 1: single `employeeContribution`, `employerContribution`, `taxableBenefits`, `postTaxDeductions` amounts), `toTaxInputs`, `calculateTakeHome`, `MONTHS_PER_YEAR` (`src/lib/periods.ts`), `MAX_INPUT_AMOUNT` and `MAX_CHILDREN` (`inputLimits.ts`), `parsePercentText`, `percentRatio` and `isCanonicalPercent` (`parse.ts`), `PercentInput`, `mulRound`. They match the prompt. An earlier prompt for 0.11.0 assumed this part had run; it was stopped at its pre-check with no changes.
  - Done (decisions `a8cf88b`; red `c4b97e4`; green `b79efd5`; then the close-out):
    - [x] Owner decisions B6 to B9 in `docs/modelling-decisions.md`.
    - [x] `pageInputs.ts`: pensionable pay, contributions resolved to the nearest penny through `mulRound`, monthly items times `MONTHS_PER_YEAR`, list totals.
    - [x] `definition.ts`: inputs version 2; `validateInputs` builds fresh objects (contributions, pensionable pay, items with names tidied by `cleanText`), rejects hostile keys, over-long names, bad modes, percentages and periods, and too many items; the version 1 migration; `resolveInputs`, `inputWarnings`; summarise with resolved totals, modes, the percentage as a ratio row and item names as text.
    - [x] Page: mode switch (Segmented) per contribution with `PercentInput` and the resolved amount; pensionable pay (own figure, bonus switch) when a percentage is used; two item lists (numbered fieldsets with name, amount, per month or per year, Remove; Add disabled at the limit with the reason; each item's annual amount and the running total); input warnings above the results; three new assumptions. Fields that leave the page (a mode switch, a removed item) clear their invalid state. A shared `TextInput` for names.
    - [x] Tests (`pageInputs.test.ts`, `definition.test.ts`, `OptimiserPage.test.tsx`, `inputs.test.tsx`): the prompt's list, including a nearest-versus-down rounding case, a version 1 scenario loading with identical take-home through storage, and the any-mix-of-items property (150 random cases). Literal guard unchanged and passing (it now also scans `pageInputs.ts`). Mutation spot-checks: rounding down (2 fail), the bonus always included (5), month and year swapped (17).
    - [x] Chromium (vite preview) at 360, 768 and 1280 px, light and dark, five states including 80-character names at 360 px and a full list (30 runs): axe found no violations; no horizontal scroll; no external requests; no console errors; controls at least 44 px. One fix: item legends are numbered instead of showing the name.
    - [x] `test` (1,322 passed, 72 todo), `lint`, `typecheck`, `build` pass.
  - Differences from the prompt (also in `PLAN.md`): a version 1 zero migrates to an empty list; a negative item amount is an input error, so the warning is for an item with no amount, in both lists; pensionable pay shows only with a percentage and the bonus switch applies to the own figure too; percentages accepted up to ten times pay (`MAX_PERCENT_INPUT`) so the over-all-of-pay warning can show; the page test's no-figures regex matches "per cent" as a word only; `ImportPage.test.tsx` uses the current inputs version for its example.
  - Not verified: the rounding against a real scheme's payslip; real devices, Safari, Firefox, a screen reader; the deployed site.
  - Next: the owner's 0.11.0 prompt or 1b-ii (above).
  - Docs updated: `PHASE-BRIEF.md`, `PLAN.md`, `CHANGELOG.md` (0.10.0), `docs/modelling-decisions.md` (B6 to B9), `docs/performance.md`, `src/calculators/optimiser/README.md`, `src/lib/README.md`, Help (`take-home-pay`). `CLAUDE.md` unchanged (no rule changed). About > Privacy unchanged: no storage key changed. No config value touched, so no verification log or worked example change.

- **17 October 2026, build session G2 (annual allowance, carry forward, childcare, `optimise()`). Version 0.8.0, internal.**
  - Pre-check: PR #7 merged; its Pages deploy (run 39076987400) succeeded. Names and signatures confirmed in the code (listed under "Session G2" above); they match the prompt.
  - Done (docs and lookups `d4a2ca6`; tests first: red `2fb77d2`, green `f313108`):
    - [x] GOV.UK lookups, logged with exact lines in `docs/verification-log.md` ("Session G2 lookups"): threshold income and adjusted income (PTM057100, PTM057200, the tapered annual allowance guidance), what counts (PTM053200, the annual allowance guide), carry forward (PTM055100, the unused allowance guidance), the MPAA (the MPAA guidance, PTM055100, PTM057100, PTM056510), the charge (PTM056110, PTM056120, PTM056130), childcare (both eligibility pages), Child Benefit for the year (HMRC press release, 31 March 2026).
    - [x] Owner decisions and lookups recorded (`docs/modelling-decisions.md`): G4 update, G7 to G14.
    - [x] `annualAllowanceCheck`, `annualAllowanceCharge`, `childcareCheck`, `thresholdContributions`, `optimise`; types in `types.ts`; `DEFAULT_SWEEP_STEP` and `MAX_SWEEP_POINTS` in `src/lib/sweep.ts`.
    - [x] Tests: published AA-1 to AA-3, AA-4a, AA-4b (PTM057200), CF-1 (PTM055100), AAC-1 (PTM056110), AAC-2, AAC-3 (PTM056130), CB-1 (press release), CC-3 (Tax-Free Childcare), each citing its page; properties (headroom plus counted equals the allowance, the engine against the reference on random inputs, spendable never rising away from flagged cliffs, tax never negative, threshold points a penny either side); edge cases (the taper at both limits, its floor and beyond; carry forward unused, partly and fully used, out of time, with the taper; the MPAA; contributions above earnings; zero and negative inputs; Scotland vs rUK; each method; zero children and opt-out; a bonus over the HICBC threshold). `fixtures/reference.ts` extended independently (its threshold search walks whole pence). Literal guard passes. Mutation spot-checks: the taper without its adjusted income test (4 fail), the reduction rounded to nearest (4) or up (5), carry forward most recent first (2), childcare ineligible at the limit (6), the solver rounding down (3) or not grossing up (1), the charge at the starter rate (2), HICBC steps not flagged (1), the MPAA ignored (4).
    - [x] `test` (1,216 passed, 72 todo), `lint`, `typecheck`, `build` pass.
  - Differences from the brief and prompt:
    - **Adjusted income cannot be lowered by an employee contribution under any method** (PTM057100); only threshold income can, by net pay or relief at source. The prompt's "taper start, taper end" thresholds are read as the personal allowance taper on ANI; the annual allowance threshold point is on threshold income, and adjusted income has none.
    - **The annual allowance charge is modelled** (the owner's condition holds: PTM056110 states the steps; the config holds the bands). PTM056120 names the basic rate band extension G1 could not find.
    - **Child Benefit weeks:** no page prints a count, but HMRC's 31 March 2026 press release gives 2026 to 2027 yearly amounts equal to 52 weeks of the weekly rates; logged, mirrored (CB-1); the default stands.
    - Childcare eligibility uses the exact ANI, so a quarter penny over the limit is over though it shows as the limit.
    - `takeHome`'s body moved into an internal `computeTakeHome` (behaviour unchanged) so `optimise()` reuses it without asking for the config again.
    - "Contribution timing against the bonus": the annual model (D1) has no timing within the year; it is an assumption on every `optimise()` result, and the bonus case is tested on annual figures.
    - Alternative annual allowance: PTM056510 and the MPAA guidance disagree (OPEN); not used with money purchase savings only.
    - Spendable can rise by a penny between points a penny apart from rounding of each component; no test sweep hits it, but 1b should not promise strict monotonicity.
    - `docs/hmrc-cross-checks.json` not extended (expected values must come from HMRC).
  - Not verified: HMRC's calculators (the annual allowance calculator and cross-checks); legislation; PDFs on assets.publishing.service.gov.uk; the membership condition for carry forward and each earlier year's allowance (inputs).
  - Next: slice 1b (above). Owner: agree slice 1a Done; HMRC cross-checks; confirm 52 Child Benefit weeks.
  - Docs updated: `PHASE-BRIEF.md`, `PLAN.md`, `CHANGELOG.md` (0.8.0, internal), `docs/modelling-decisions.md` (G4 update, G7 to G14), `docs/verification-log.md` (Session G2 lookups; O7, O8; G1's "not found"), `docs/worked-examples.md`, `docs/money.md`, `docs/README.md`, `src/calculators/optimiser/README.md`, `src/lib/README.md`. `CLAUDE.md` unchanged: no rule changed. No Help topic or privacy text: nothing user-visible or stored changed.

- **17 October 2026, build session G1 (pensions, adjusted net income, HICBC). Version 0.7.0, internal.**
  - Pre-check: PR #6 merged; its Pages deploy (run 39062754954) succeeded. Names and signatures confirmed in the code before designing: `personalAllowance(income, config, policy)`, `incomeTax(income, region, config, policy)`, `employeeNI(niablePay, config)`, `studentLoan(plans, pay, config)`, `takeHome(inputs, config, policy)`, `ModellingPolicy { taperRounding }`, `TaxInputs { grossPay, region, studentLoans }`, `ExactPence` in `money.ts`. They match the prompt.
  - Done (docs `2fcd567`; tests first: red `c5aee46`, green `ded2871`):
    - [x] GOV.UK lookups, logged with exact lines in `docs/verification-log.md` ("Session G1 lookups"): salary sacrifice (EIM42780, NIM02330, NIM02331, the employers' guide), net pay (PTM044230, CWG2 2026 to 2027), relief at source (PTM044220, CWG2, the pension tax relief guide), ANI (the ANI guidance, the HICBC guide), the student loan base (SL3, the employers' student loan guidance), Child Benefit weeks (PAYE130030).
    - [x] G2 (ANI step order) settled from GOV.UK: salary sacrifice and net pay never count as taxable pay (step 1); relief at source comes off grossed up at step 3; every step subtracts, so order does not change ANI. O2 settled from GOV.UK (G6): the student loan base is the employer's secondary NIC pay, lowered by salary sacrifice only.
    - [x] Owner decisions recorded (`docs/modelling-decisions.md`): G4 weeks as `ModellingPolicy.childBenefitWeeks` with the default from `src/lib/periods.ts`; G5 taper rounding stays `'exact'`.
    - [x] `pensionContribution`, `adjustedNetIncome`, `hicbc`; `incomeTax` with an optional pension (taper on ANI, bands above the basic rate band moved up for relief at source); `takeHome` with `pension` and `childBenefit` inputs, views with pension, HICBC, Child Benefit and net including it, assumptions naming the method, weeks and rounding. `money.ts` gains `wholeSteps`.
    - [x] Tests: published examples PEN-1, PEN-2, PEN-3, ANI-3, PR-1, HICBC-3 (each citing its page); properties (tax and NI never negative; take-home rising by no more than gross, and never falling for rises of a hundred pounds or more without Child Benefit; HICBC never above Child Benefit; salary sacrifice never costing more than the amount sacrificed; the band extension equal to GOV.UK's claim rates; relief at source never behind net pay for the same amount in; engine against reference); edge cases (the taper start, HICBC threshold, a step and the full-charge point, each a penny either side; net pay against relief at source for a non-taxpayer and a taper-zone earner; Scotland's starter rate and Scotland against rUK with relief at source; contributions above earnings; zero and negative inputs; opt-out; zero children; exact ANI a quarter penny under a step). `fixtures/reference.ts` extended independently. Literal guard passes. Mutation spot-checks (no gross-up: 19 fail; no ANI reduction: 9; salary sacrifice leaving NI-able pay: 5; part HICBC steps counted: 7).
    - [x] `test` (1,119 passed, 72 todo), `lint`, `typecheck`, `build` pass.
  - Differences from the brief and prompt:
    - **Child Benefit weeks stay OPEN (G4):** no page states the count; PAYE130030's method reads as 52 or 53 full weeks for 2026 to 2027 (both ends are Mondays). The default is `periods.ts` (52); the owner decides.
    - **Relief at source moves every band above the basic rate band**, not only the basic rate limit, so the additional and Scottish top rates get the relief GOV.UK states. No GOV.UK page read names the band extension (the owner's G2 choice); tests check it against the stated claim rates. The basic rate band is the band at the relief-at-source rate; a config without exactly one stops with an error.
    - **A gross contribution above gross pay is refused** (`EngineInputError`) for every method: relief above earnings and the relief-at-source no-earnings allowance (not in the config) are not modelled.
    - `incomeTax` takes gross pay plus an optional pension rather than an ANI argument, so it cannot be handed an ANI that disagrees with the pension. `personalAllowance` still takes the income (ANI) directly.
    - `ModellingPolicy.childBenefitWeeks` is required, so existing tests that built a policy now spread `DEFAULT_POLICY` (the only change to F's tests).
    - The take-home property in the prompt ("never rises when gross rises") is read as "never falls": it fails at a penny (student loans round down to whole pounds) and across a HICBC step (a cliff by design), so it is tested for rises of a hundred pounds or more without Child Benefit, plus "never rises by more than gross".
    - HICBC-2 (PAYE14015, 2023 to 2024 rule) prints whole pounds; G1 keeps the nearest penny (decision G1) and does not mirror it.
    - `docs/hmrc-cross-checks.json` not extended: it takes no pension inputs and its expected values must come from HMRC.
  - Not verified: HMRC's calculators (cross-checks still pending); a GOV.UK page naming the band extension; the Child Benefit week count; legislation; anything behind assets.publishing.service.gov.uk; Self Assessment's own figures for higher-rate relief.
  - Next (session G2): see "Session G2" above. Owner: Child Benefit weeks (52 or 53 for 2026 to 2027); the HMRC cross-checks.
  - Docs updated: `PHASE-BRIEF.md` (G split, G1 scope and log, G2 handover), `PLAN.md`, `CHANGELOG.md` (0.7.0, internal), `docs/modelling-decisions.md` (G1 to G6), `docs/verification-log.md` (Session G1 lookups; O2, O8, O9), `docs/worked-examples.md` (PEN-1 to PEN-3, ANI-3, HICBC-3; PR-1 mirrored), `docs/money.md` (ANI, gross-up, HICBC rounding), `docs/README.md`, `src/calculators/optimiser/README.md`, `src/lib/README.md`. `CLAUDE.md` unchanged: no rule changed. No Help topic or privacy text: nothing user-visible or stored changed.

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


## Archive: slice 1b part scopes (1b-ii-a, 1b-ii-b)

### Part 1b-ii-a (the optimiser sweep and chart)

On the same page and inputs (version 3 since 0.11.0), in the 0.12.0 layout. Add a migration to `MIGRATIONS` in `definition.ts` only if the stored shape changes; the version follows. `optimise()` already sweeps from cash pay after salary given up for benefits.

### Scope

- A new `Section` for the optimiser's inputs; its results in the `StickyResult` results column, with the chart below the split bar.
- `optimise(inputs, config, policy, options?)` from the page inputs: `toTaxInputs` plus `pension` (the method and the resolved current contribution, from `resolveInputs`), `savings` (the resolved `employerContribution`, carry forward and the MPAA flag as new inputs) and `checkChildcare`. A sweep over contributions is in amounts; a contribution entered as a percentage can be shown as a percentage of pensionable pay beside it.
- The take-home (or spendable) against contribution chart from `points`, markers for `current`, `maximum` and each threshold, `cliffs` drawn as labelled jumps, a table fallback (the shared `Chart`).
- The layout-shift fix (backlog): reserve the page's height while a calculator page loads, so the footer is not pushed off-screen when the page arrives (Lighthouse CLS 0.137 on the take-home page).

### Out of scope

- Everything in 1b-ii-b below.
- No point labelled "best".

### Part 1b-ii-b (reading the result)

### Scope

- "Cost of £1 more pension" from `netCostPerPound` and `marginalRate`, labelled with what each is measured against.
- Thresholds in words from `thresholds` ("already under", "contribute £X more", "out of reach" with the reason); the HICBC full-charge point said plainly (the charge first falls a penny below it).
- Warnings from each point (annual allowance, taper, carry forward, childcare), never hidden, never a cap; childcare as eligibility only, with what isn't checked.
- Compare: the current contribution against a chosen one. No point labelled "best".
- Help and assumptions for the optimiser.

### Out of scope

- Slice 2 and later calculators.

## Archive: slice 1b brief header (as of 0.14.0)

Moved verbatim from `PHASE-BRIEF.md` on 21 October 2026, when slice 2 became the current work.

Status: Built, owner checks open. The take-home pay page at `#/c/optimiser` is live with the optimiser on it (1b-i to 0.12.0; the sweep and chart in 1b-ii-a, 0.13.0; reading the result in 1b-ii-b, 0.14.0). Status per part lives only in `PLAN.md`. Finished part scopes are in `docs/history/phase-brief-archive.md`.

### Goal

The £100k+ optimiser page, built from shared components on the slice 1a engine: take-home now, then candidate pension contributions with their cliffs, thresholds, annual allowance and childcare position, never one called "the best".

### Next: slice 2 (compound interest)

All 1b parts are built (1b-ii-b, 0.14.0, is the last). Next is slice 2 from `PLAN.md` (regular contributions, compounding, inflation-adjusted view, fee drag, yearly table and chart). It needs its own brief before work starts: write it here first, from `PLAN.md` and `docs/backlog.md`. Slice 1b stays open in `PLAN.md` until the owner's checks below are done.

## Archive: last-session entry, part 1b-ii-b

Moved verbatim from `PHASE-BRIEF.md` on 21 October 2026, replaced by slice 2a's.

- 21 October 2026, part 1b-ii-b (0.14.0, PR #17): Year / Month drives the optimiser chart, table and cards; Change vs now and a chosen point; zoom with Full range; cost of a pound more, thresholds in words, warnings across the sweep, childcare eligibility, compare now and chosen (`reading.ts`); compare rows show the version 4 inputs; Help topic "Pension contributions and the optimiser".
- Differs from the brief: the chosen point is a select of the points shown (no tapping the chart); thresholds are measured from now, not the chosen point; Chart's `rowNotes` became generic `columns`.
- Not verified: 768 px, a real phone, Safari, Firefox, a screen reader, the deployed site.
- Next: slice 2 (compound interest), brief first.

## Archive: last-session entry, part 2a

Moved verbatim from `PHASE-BRIEF.md` on 21 October 2026, replaced by part 2b's.

- 21 October 2026, part 2a (0.15.0, PR #19, internal): the compound interest engine (`src/calculators/compound-interest/`): effective and equivalent period rates, yearly rows with and without the fee, nominal and real (Fisher), fee drag, typed refusals; `FinePence` / `Factor` fixed point in `money.ts`; decisions C1 to C9 (`docs/modelling-decisions-compound.md`); published examples GB-1, GB-2 (Green Book Table 8); 300-case closed-form reference; mutation spot-checks all caught.
- Differs from the brief: C9 added (fixed point, not `ExactPence`: C2's equivalent rate can be irrational); the literal guard's scanner moved to `src/calculators/fixtures/literalGuard.ts`, shared with the optimiser; no MoneyHelper example (network policy refused it), so the closed-form reference carries the annuity checks.
- Not verified: any external calculator's figures for regular contributions; the deployed site; no UI to check in a browser.
- Next: 2b (the page), its brief first.

## Archive: slice 2 brief (as of 0.16.0)

Moved verbatim from `PHASE-BRIEF.md` on 21 October 2026, when slice 3 became the current work.

Status: 2a (engine) Done (0.15.0, PR #19); 2b (page) Done (0.16.0, PR #20). Slice 2 stays open in `PLAN.md` until the owner fills the compound cross-checks. Slice 1b is built (to 0.14.0) and stays open in `PLAN.md` until the owner's checks below are done. Status per part lives only in `PLAN.md`. Finished part scopes are in `docs/history/phase-brief-archive.md`.

### Goal

A compound interest calculator: a lump sum and regular contributions, compounding, an annual contribution increase, a percentage fee, and inflation, with a yearly table and chart in nominal and real terms and the fee drag. Illustrative, no tax and no tax wrappers. Decisions C1 to C9: `docs/modelling-decisions-compound.md`.

### Part 2a: the engine (0.15.0, internal, no UI)

#### Scope

- `src/calculators/compound-interest/` (`calc.ts`, `types.ts`, tests, `fixtures/`, `README.md`): pure `effectiveAnnualRate`, `periodRate` (C2), `realRate` (Fisher, C5), `futureValue`, `project` (per-year rows: opening, contributions, growth, fees, closing, cumulative contributions, growth and fees; nominal and real; with and without the fee) and `feeDrag`; a result with `assumptions` (no figures in the strings); typed refusals (C8).
- Fixed-point `FinePence` and `Factor` in `src/lib/money.ts` (C9); calendar divisors in `src/lib/periods.ts` (C7); input bounds in `src/lib/inputLimits.ts` (C8).
- Tests first (red, then green): hand-checkable cases; published examples (`docs/worked-examples.md`); an independent closed-form reference in exact rational arithmetic on 300 seeded random cases; properties; edge cases; a literal guard like the optimiser's (only 0, 1, 2 and 100).
- Mutation spot-checks (timing flipped, fee before growth, nominal used as effective, Fisher replaced by subtraction) must fail the suite.

#### Out of scope

The page, chart, registry entry, scenarios, compare and Help (2b); flat fees; tax wrappers; sequence-of-returns or Monte Carlo; any tax config change.

### Part 2b: the page (0.16.0)

#### Scope

- `#/c/compound-interest` on the 2a engine: `definition.ts` (inputs version 1, `taxRules: 'none'`), `results.ts`, `CompoundPage.tsx`, built from `Section` and `StickyResult` (`docs/ui-patterns.md`).
- Inputs: "Your savings" always visible; "Growth and costs" (with the effective annual rate shown); "Over time".
- Results: the final balance with a Nominal / Today's money switch and a not-a-forecast caveat; paid in, growth, fees; fee drag; rates; the shared Chart; the engine's yearly rows as a table.
- Refusals through `RefusalNotice`. Scenarios carry no tax year (registry `taxRules`), shown as "Uses no tax rules". Compare rows. Assumptions and a Help topic.
- `docs/compound-cross-checks.json`: seeded cases, expected values null (todo tests).
- Tests first: definition, page, 150 random inputs against the engine, banned words; mutation spot-checks.

#### Out of scope

Flat fees, tax wrappers, Monte Carlo or varying returns, withdrawals, any engine or tax config change.

## Archive: last-session entry, part 2b

Moved verbatim from `PHASE-BRIEF.md` on 21 October 2026, replaced by part 3a's.

- 21 October 2026, part 2b (0.16.0, PR #20): the compound interest page at `#/c/compound-interest` (definition, results, page, Help topic, compare rows); scenarios with no tax year (registry `taxRules: 'none'`); `RefusalNotice` and compare show an engine input refusal; the Chart's data table is a focusable scroll region; `docs/compound-cross-checks.json` seeded.
- Differs from the brief: the pre-check found RefusalNotice and scenarios tax-only, so (owner's call) registry and RefusalNotice changes came first, each red then green; PLAN 2a was already Done, so no first commit; the literal guard now also covers `definition.ts`, `results.ts` and the page; `DEFAULT_PROJECTION_YEARS` added to `inputLimits.ts`.
- Not verified: a real phone, Safari, Firefox, a screen reader, the deployed site; no external cross-check yet.
- Owner checks: fill `docs/compound-cross-checks.json` (spreadsheet FV or a reputable calculator, with source and date); confirm the C8 rate bounds and the starting years.
- Next: slice 3 (car decision), its brief first.

## Archive: part 3a scope (as of 0.17.1)

Moved from `PHASE-BRIEF.md` on 22 October 2026.

### Part 3a: finance engine (0.17.0, internal, no UI)

#### Scope

- Step 1 (gate, before any engine code): this brief and the `PLAN.md` rows; owner decisions in `docs/modelling-decisions-car.md`; the APR definition and the PCP and HP conventions verified from official sources and logged in `docs/verification-log.md` ("Car finance (slice 3a)"), anything unreachable marked OPEN; published worked examples in `docs/worked-examples.md`.
- `src/calculators/car-finance/` (`calc.ts`, `types.ts`, tests, `fixtures/`, `README.md`): the amortising payment and schedule (pennies that add up); a rate solver for a cash-flow series (documented method, tolerance and bound, a typed refusal); loan, HP and PCP (hand back or buy at the end, mileage excess); the outstanding balance at any month for 3b. Pure, config-free, money through `money.ts` (`FinePence` / `Factor` where a root or solve needs them). Assumptions carry no figures; refusals name the field; bounds in `src/lib/inputLimits.ts`.
- Tests first (red, then green): hand-checkable cases; published examples; an exact-fraction reference on 300 seeded cases; a rate round trip on 300 cases; properties; edge cases; the literal guard. Mutation spot-checks (interest on the closing balance, fee left out of the rate, balloon left out of the final payment, time basis changed) must fail the suite.

#### Out of scope

Ownership costs, fuel, depreciation, the page, registry entry, scenarios, Chart changes, any tax or VED config, early termination or settlement rebates, a flat rate (no definition verified).

## Archive: last-session entry, part 3a.1

- 22 October 2026, part 3a.1 (0.17.1, PR #22, internal): CONC App 1.2 and SI 2010/1011 read (the SI is revoked, CR-15); CR-1 to CR-3 verified, CR-10 partly (HP balloon), CR-15 to CR-18 added; `apr(flows)` (F15) with `roundRatio`/`APR_DISPLAY_DIGITS`; tests red then green; mutation spot-checks all caught (one equivalent mutant).
- Differs from the brief: no published APR example exists on either source (CR-17), so APR-1 to APR-4 are hand-checkable; no agreement-level APR (CR-10 still OPEN); the effective-rate assumption text no longer says the APR rules could not be verified.
- Not verified: CR-10 for PCP and purchase/option fees; what the 18/12/2025 change to CONC App 1.2.6R was (CR-18); CR-12, CR-13 (statutes not read); no UI to check.
- Next: 3b (cost-of-ownership engine), its brief and decisions first.

## Archive: part 3b scope (as of 0.18.0)

### Scope

- Step 1 (gate, before any engine code): this brief and the `PLAN.md` rows; owner decisions O1 to O8 as F16 to F23 and engine decisions F24 to F31 in `docs/modelling-decisions-car.md`; proposed bounds in `src/lib/inputLimits.ts` (F30); the litres in a gallon verified and logged (`docs/verification-log.md`, CO-1) in `src/lib/units.ts`.
- `src/calculators/car-ownership/` (`calc.ts`, `types.ts`, tests, `fixtures/`, `README.md`): `valueCurve`, `costPerMile`, `futureValueOfFlows`, the monthly cash-flow timeline per option, `ownershipCost` (per value case: totals, per-month cumulative net cost and equity, the breakdown, coverage, net cost per month of coverage), `compareOptions` (one horizon, coverage flags, ordering with ties) and `flipPoints`. Pure, no tax figure, money through `money.ts`, assumptions with no figures, typed refusals by field, overflow refused.
- Tests first (red, then green): hand-checkable cases; keep versus buy parity; the breakdown adds up; an exact-fraction reference on 300 seeded cases (loan, HP, PCP buy, PCP hand back, cash, keep); properties; edge cases; the literal guard. Mutation spot-checks (value curve fitted to the wrong end, opportunity cost omitted, hand back treated as covering the horizon, equity sign flipped, the general increase applied to fuel) must fail the suite.

### Out of scope

The page, registry entry, scenarios, Chart changes, tax or VED config, EV tax rules, replacement cars, early termination, any change to the 3a engine (unless a failing test proves a bug: then stop and report).

## Archive: last-session entry, part 3b

- 22 October 2026, part 3b (0.18.0, PR #23, internal): brief and decisions F16 to F31 (owner O1 to O8 as F16 to F23); bounds in `inputLimits.ts`; litres per gallon verified (CO-1, `units.ts`); the engine in `src/calculators/car-ownership/` (value curve, cost per mile, future value of flows, ownership cost, comparison, flip points); tests red then green; 300-case exact reference; mutation spot-checks all caught.
- Differs from the brief: O3 read as minus equity (value less any balance owed) and keep's value counted as a sale forgone (F18); totals at the end of coverage; litres per gallon from legislation.gov.uk (no GOV.UK page defines it); flips on mileage set both options' mileage; no overflow reachable within the bounds, so that test checks the largest inputs.
- Not verified: no published ownership-cost example (hand-checkable OWN-1 to OWN-6 instead); nothing in a browser (no UI). OPEN: CR-10 (APR for PCP and fees) carries over.
- Next: 3c-1 (the page), its brief first.
