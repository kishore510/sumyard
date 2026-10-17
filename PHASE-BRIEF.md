# PHASE-BRIEF: Slice 0.5 Core plumbing

Status: In progress. Sessions C (0.3.0) and D (0.4.0) are done; the slice waits on the owner's manual checks of the deployed site (session D log below), then goes to Done. Slice 0.5 runs as two build sessions: **C** (money and tax config, 0.3.0) and **D** (scenarios, shared components, chart, backup and restore). Rewritten at the start of every slice. Roadmap and status live in `PLAN.md`. Slice 0 is Done (0.2.0, PR #2); its progress log is archived at the end of this file.

## Docs rule

Every build session ends by updating the docs: this file (progress and next session), `PLAN.md`, `CHANGELOG.md`, and `CLAUDE.md` if a rule or the stack changed. The full checklist is in `CLAUDE.md` ("Session close-out checklist"). A session is not finished until that is done.

## Goal

The plumbing every calculator needs, with no calculator and **no real tax figure**: a money type and formatting, a typed and sourced tax-config pipeline with a skeleton `2026-27` in which every value is unverified, a Tax data screen and a verified badge, a real tax-year default in Settings (session C); then versioned scenarios with export and import, shared inputs and result components, a token-aware chart, and backup and restore (session D).

## Session C: money and tax config (0.3.0)

### Scope

1. **Money** (`src/lib/money`): integer pence as a branded type. `fromPounds`, `fromPence`, `add`, `subtract`, `compare`, `min`, `max`, `mulRound(amount, factor, mode)` with explicit modes (nearest, down, up). No float arithmetic on amounts anywhere else; safe-integer guard on every operation. `docs/money.md` documents rounding and says the mode each tax step needs is verified in slice 1a, not assumed.
2. **Formatting** (`src/lib/format`): GBP in whole pounds or pence (the Settings value), percentages, a compact form for charts later. Locale en-GB.
3. **Schema** (`src/config/tax/schema.ts`): `TaxYearConfig` with the tax-year period; income tax bands and rates (rUK and Scotland); personal allowance, taper start and rate; NI (employee and employer); student loan plans 1, 2, 4, 5 and postgraduate; pension (annual allowance, taper thresholds and minimum, carry forward, MPAA); HICBC thresholds and Child Benefit rates; tax-free childcare and 30-hours limits; a typed, unused placeholder for dividend and savings allowances.
4. **Sourced values**: `Sourced<T>` = `{ status: 'todo' }` or `{ status: 'verified', value, sourceUrl, verifiedOn }`. A malformed verified leaf is a type error and a failing test. `isVerified`, and `requireVerified(config, paths)` returning the values or a typed refusal listing unverified paths.
5. **Registry** (`src/config/tax/index.ts`): `getTaxYear(id)`, `latestTaxYear()`, `listTaxYears()`. Skeleton `2026-27.ts`, every leaf `{ status: 'todo' }`: structure only, no rate, threshold, allowance or date.
6. **Fixtures**: fake configs (clearly marked, never imported by the app) prove the guard, the refusal path, the registry and schema coverage. A repo-level test fails if a real config file has a number-valued leaf without a verified source.
7. **Tax data screen** (`#/tax-data`): each tax year, each value group with a verified count, a source link and date per verified leaf, unverified groups flagged. Linked from About and the Help topic on tax data. Same sheet behaviour as the others.
8. **VerifiedBadge**: tax-year label and "Not yet verified" or "Last verified <date>", linking to Tax data.
9. **Settings**: a real default-tax-year selector from the registry, labelled "not yet verified" while the year has unverified groups. Settings schema version bumped, with a tested migration.
10. **Menu footnote**: "Changes are saved in this browser." until export exists (session D); the Help topic to match.

**URL-scan question:** report how the build scan treats gov.uk URLs inside JavaScript strings and propose the narrowest rule. Implement only if it adds no allowlist entry; otherwise stop and ask. Prove the behaviour with fixtures.

### Out of scope

Any real tax figure or date (code, tests, comments, Help, docs), scenarios, backup and restore, shared inputs, charts, calculators.

### Rules

Tests first (red, then green) for money, format, schema guards, registry, the settings migration and the screen's states. No new dependencies, no network requests, hand-written validation only. WCAG AA in both themes, focus handling, 44 px targets, reduced motion; check the Tax data sheet and Settings at 360, 768 and 1280 px in both themes and run axe on the new sheet. Storage-key changes keep the guard and `docs/privacy.md` in step.

### Acceptance

- Money, format, schema guards, registry, settings migration and the Tax data screen are tested, red commit before green.
- `2026-27.ts` holds no figure; the repo-level config test passes on it and fails on an unsourced number.
- The Tax data screen shows everything as unverified; Settings offers 2026 to 2027 labelled not yet verified.
- Lint, typecheck, test and build green; 0.3.0 with a changelog entry; docs updated.

## Session D: scenarios, shared components, chart, backup and restore (0.4.0)

Scope (from the session D prompt): calculator registry; pages at `#/c/<id>` with a decision on sheets over a page; scenarios under one key `sumyard:v1:scenarios` with hand-written validation and limits; save, update, save as new, load, rename, duplicate, delete with Undo and an unsaved-changes indicator; export (`sumyard-scenarios-YYYY-MM-DD.json`) and import with a preview (Add or Replace); backup, restore and clear all data in Settings; compare for 2 or 3 scenarios; shared inputs (`CurrencyInput`, `PercentInput`, `NumberInput`, `Select`, `Toggle`, `Segmented`) and results (`ResultCard`, `StatRow`, `AssumptionsPanel`, `ScenarioBar`, `RefusalNotice`, `VerifiedBadge`); a hand-rolled SVG chart; the Hello calculator; the Scenarios menu item, menu footnote and Help topics; Lighthouse recorded. Out of scope: any real calculator or tax figure, URL-scan changes, tour, shortcuts, Help search, service worker, URL-hash state.

### Acceptance

- Tests first (red `b3d4d53`, green `fcc5a23`) for the scenario store and migration, import validation, backup and restore, input parsing, chart scales and the registry. Done.
- No real tax figure, rate, threshold, allowance or date anywhere. Done (Hello's defaults are arbitrary demo values).
- No new dependency, no network request, no allowlist change. Done.
- WCAG AA, focus, reduced motion; new surfaces checked at 360, 768 and 1280 px in both themes with axe. Done in Chromium.
- 0.4.0 with a changelog entry; lint, typecheck, test and build green; docs updated. Done.
- Owner's manual checks on the deployed site (below). **Open**: slice 0.5 goes to Done after these.

## Progress log

Add one entry per session: date, what was done, what differs from the brief, what the next session should pick up, and which docs were updated.

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
