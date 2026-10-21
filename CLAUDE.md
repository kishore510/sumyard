# CLAUDE.md: Sumyard

Personal UK finance calculators in one clean, ad-free web app, for the owner's own use. Static site, client-side only, hosted on GitHub Pages. Illustrative, not financial advice.

Keep this file short. Area detail goes in `docs/`. Current work is in `PHASE-BRIEF.md`; the roadmap and status are in `PLAN.md`.

## Stack

Decided in the slice 0 recon (see `PHASE-BRIEF.md` progress log): mirror Chalkline, at Chalkline's versions.

- Vite 8, React 19, TypeScript 7 strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `@/` = `src/`). Node pinned in `.nvmrc`.
- Tailwind CSS 4 over one tokens file, `src/styles/tokens.css` (raw palette, semantic layer, `@theme` mapping; see `docs/design-tokens.md`). `class-variance-authority`, `clsx`, `tailwind-merge`, Lucide icons. Inter self-hosted via `@fontsource-variable/inter`.
- Vitest (node; `// @vitest-environment happy-dom` per file for components). No browser-automation dependency.
- Biome for lint and format (`biome.json`). **Differs from Chalkline**, which has neither: typescript-eslint does not support TypeScript 7.
- GitHub Pages via `.github/workflows/deploy.yml` on push to `main`; `VITE_BASE=/<repo>/`. `ci.yml` on other branches and PRs.
- State: small stores on `useSyncExternalStore` (`src/lib/store.ts`); no Zustand or Zod yet. Add them only when a slice needs them.
- Commands: `npm run dev`, `build` (typecheck; `vite build`, which fails if `PLAN.md`, `CHANGELOG.md` and `package.json` drift; then `vitest.build.config.ts` scans `dist/`), `test`, `lint`, `format`, `typecheck`. When to run them: Workflow > Testing.
- Version bumps: `npm version <x.y.z> --no-git-tag-version`, so the lockfile matches.

## Architecture rules

- Each calculator is a pure function in `src/calculators/<name>/calc.ts`. No UI, storage, date-now or network imports. Inputs and tax config in, results out. Unit-tested.
- Each calculator registers in `src/calculators/index.ts` (`definition.ts`: defaults, hand-written `validateInputs`, `migrateInputs`, `summarise`; see `registry.ts`) and its page in `pages.tsx` (route `#/c/<id>`). Bump `inputsVersion` and migrate when its inputs change. Settings defaults (region) reach fresh inputs through the optional `applySettings`.
- Tax rules (bands, allowances, NI, student loan thresholds, pension limits, HICBC, childcare limits) live only in `src/config/tax/<year>.ts`. Never hardcode a rate, threshold or allowance in logic, UI, tests or help text. After a Budget, the change is one config file.
- Every config leaf is `Sourced<T>`: `{ status: 'todo' }` or `{ status: 'verified', value, sourceUrl, verifiedOn }`, with `sourceUrl` an `https://www.gov.uk/` page and `verifiedOn` `YYYY-MM-DD`. A malformed leaf is a type error and fails `src/config/tax/configs.test.ts`, as does any value outside a leaf. Fake configs live only in `src/config/tax/fixtures/` and only tests import them.
- Calculators get tax values only through `requireVerified(config, paths)` (`src/config/tax/sourced.ts`). On a refusal (any path unverified) they show no results, and say which values are unverified.
- Money is integer pence (`Money` in `src/lib/money.ts`). No float arithmetic on amounts outside `money.ts`: rates are exact `Ratio`s (`percent`, `ratio`), and products go through `mulRound` with an explicit rounding mode. Where a factor can be irrational (compound growth), use `FinePence`/`Factor` fixed point, rounded once at output (`docs/modelling-decisions-compound.md`, C9). Never assume a tax step's rounding: `docs/money.md` lists each step's mode once slice 1a verifies it. Display through `src/lib/format.ts`.
- Shared components live in `src/components/`: inputs (`inputs/`, parsing in `src/lib/parse.ts`), `ResultCard`/`StatRow`, `AssumptionsPanel`, `VerifiedBadge`, `RefusalNotice`, `ScenarioBar`, `Section`, `StickyResult`, `SplitBar`, `Chart/` (hand-rolled SVG, token colours, table fallback). Build a calculator page from these; do not make one-off copies.
- Calculator pages use `StickyResult` (results always in view) and `Section`: essentials visible, the rest in sections with live one-line summaries, open on load only when set, never stored (`docs/ui-patterns.md`).
- Scenarios store inputs only. Results are always recomputed. They live in `src/scenarios/` (store, export and import, backup); never write over a stored record the app can't read.
- Every calculator page shows its assumptions and a "last verified" tax-year label, and the illustrative-not-advice disclaimer.

## Accuracy rules (most important)

- Never state a tax rate, threshold, allowance or rule from memory as fact, in code, tests, comments, docs or the UI. If a figure is needed and not in config, stop and flag it for verification against gov.uk/HMRC.
- Each calculator is cross-checked against an authoritative source or a worked example. Examples live in `docs/worked-examples.md` with source links and are mirrored as tests.
- List edge cases per calculator and give each a test (for example: personal allowance taper over the threshold, Scottish bands, daily vs monthly mortgage interest).
- Where GOV.UK leaves a choice, the owner's decision in `docs/modelling-decisions.md` applies; a GOV.UK page that contradicts one wins (stop and report). Engine code holds no figure: `literals.test.ts` allows only 0, 1, 2 and 100.
- If the maths or design looks wrong, say so and propose an alternative before building it.

## Privacy and data

- No backend, accounts, analytics, tracking or network requests. Fonts are self-hosted. CI scans the build for external URLs.
- All data stays on the device. localStorage keys are namespaced `sumyard:v1:...`, carry a schema version, and are listed in `src/lib/storageKeys.ts`, `docs/privacy.md` and About > Privacy; a test fails if code and these lists disagree. Imported JSON is untrusted: check it with `src/lib/validate.ts` (no `__proto__`, `constructor` or `prototype` keys, size and depth limits), build fresh objects, render it only as text, and preview before writing.
- The build scan allows plain https gov.uk links and the exact inert strings in `scripts/checks/externalUrls.ts` (`INERT_URLS`, each pinned to a file type; stale entries fail the build). Adding an entry there is a privacy decision; flag it in the PR. Tax-config sources are `https://www.gov.uk/` pages only (they pass the scan as is); another host, such as legislation.gov.uk, needs the owner's decision first.
- App chrome text: Help (`content/help/*.md`) and What's new (`CHANGELOG.md`) describe only what exists, or mark it as coming.
- Any new storage key needs a migration plan and an update to the privacy text.

## Design rules

- Mobile-first; equally good on phone and laptop. Check phone, tablet and laptop widths.
- Reuse Chalkline and Stickyard tokens and chrome. Do not invent tokens, fonts, spacing or components without flagging it.
- Light, dark and system themes. Every colour comes from a semantic token; charts read tokens and re-render on theme change.
- Accessibility baseline: WCAG AA contrast, visible focus, 44 px touch targets, `prefers-reduced-motion` respected, charts have a table fallback.

## Workflow

- Read `PHASE-BRIEF.md` first (current part only). Work only on the current part; do not start later ones. Do not read `docs/history/` unless the task needs a past decision; grep it, don't read it whole. Read `PLAN.md` only for roadmap, phase order, a new calculator or the backlog.
- Pre-check: confirm the previous PR merged. Do not re-verify names and signatures; read a file only when about to edit it.
- Each rung gives a working result: stop at any part and something still works. Done means trusted for a real decision, on a phone and a laptop, in both themes.
- Tests first for calculator and config work: a red commit, then a green one.
- Testing: while building run only affected test files (`npx vitest run <path>`). Run the full `test`, `lint`, `typecheck` and `build` once before the final commit.
- Verification scaling: browser matrix (Chromium + axe) once per UI part, at 360 and 1280 px in light and dark, not every session. Mutation spot-checks: engine and tax logic only, not page or docs work.
- One fresh session per part, at most per slice. Hand over through the PR description (what was done, what differs from the brief, what is next).
- Context: use `/clear` between unrelated tasks; `/compact` if context passes about half.
- Each change to tax values is its own PR, with the source for every changed value in `docs/verification-log.md`; `src/config/tax/verification.test.ts` fails if the log's Values table and the config disagree. A new tax year's config also gets a changelog entry.
- Be concise and technical. Say what you changed and what you did not verify.

## Session close-out checklist

A docs test fails CI if `PLAN.md`, `CHANGELOG.md` and `package.json` drift apart.

- Every session: replace `PHASE-BRIEF.md` "Last session" (at most 5 lines; replace, don't append); a short `CHANGELOG.md` `[Unreleased]` entry if user-visible; the PR description carries the detail (what changed, what differs from the brief, what was not verified, what is next).
- Part or slice merge only: the `PLAN.md` Status cell and "Last updated"; version bump and changelog heading. New scope: add a row to `PLAN.md`. New unknowns: `docs/open-questions.md`; new ideas: `docs/backlog.md`.
- Only when touched: `docs/verification-log.md`, `docs/worked-examples.md`, the calculator `README`, Help, About > Privacy, `CLAUDE.md`.
- Progress detail goes in the PR and commit messages, never appended to `PHASE-BRIEF.md`.
