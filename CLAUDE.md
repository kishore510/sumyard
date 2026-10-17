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
- Commands: `npm run dev`, `build` (typecheck, `vite build`, then `vitest.build.config.ts` scans `dist/`), `test`, `lint`, `format`, `typecheck`. Run `test`, `lint` and `typecheck` before every commit.
- Version bumps: `npm version <x.y.z> --no-git-tag-version`, so the lockfile matches.

## Architecture rules

- Each calculator is a pure function in `src/calculators/<name>/calc.ts`. No UI, storage, date-now or network imports. Inputs and tax config in, results out. Unit-tested.
- Tax rules (bands, allowances, NI, student loan thresholds, pension limits, HICBC, childcare limits) live only in `src/config/tax/<year>.ts`. Never hardcode a rate, threshold or allowance in logic, UI, tests or help text. After a Budget, the change is one config file.
- Every config leaf is `Sourced<T>`: `{ value, sourceUrl, verifiedOn }`. A test fails the build if either is missing. A value still marked `TODO_VERIFY` blocks any calculator using it from showing results.
- Money is never a float. Use the money type chosen in slice 0.5 and the documented rounding rules.
- Shared components live in `src/components/`: inputs, result cards, assumptions panel, verified badge, scenario bar, chart wrapper. Build a calculator page from these; do not make one-off copies.
- Scenarios store inputs only. Results are always recomputed.
- Every calculator page shows its assumptions and a "last verified" tax-year label, and the illustrative-not-advice disclaimer.

## Accuracy rules (most important)

- Never state a tax rate, threshold, allowance or rule from memory as fact, in code, tests, comments, docs or the UI. If a figure is needed and not in config, stop and flag it for verification against gov.uk/HMRC.
- Each calculator is cross-checked against an authoritative source or a worked example. Examples live in `docs/worked-examples.md` with source links and are mirrored as tests.
- List edge cases per calculator and give each a test (for example: personal allowance taper over the threshold, Scottish bands, daily vs monthly mortgage interest).
- If the maths or design looks wrong, say so and propose an alternative before building it.

## Privacy and data

- No backend, accounts, analytics, tracking or network requests. Fonts are self-hosted. CI scans the build for external URLs.
- All data stays on the device. localStorage keys are namespaced `sumyard:v1:...`, carry a schema version, and are listed in `src/lib/storageKeys.ts`, `docs/privacy.md` and About > Privacy. Imported JSON is untrusted: validate it.
- The build scan allows plain https gov.uk links and the exact inert strings in `scripts/checks/externalUrls.ts` (`INERT_URLS`). Adding an entry there is a privacy decision; flag it in the PR.
- Any new storage key needs a migration plan and an update to the privacy text.

## Design rules

- Mobile-first; equally good on phone and laptop. Check phone, tablet and laptop widths.
- Reuse Chalkline and Stickyard tokens and chrome. Do not invent tokens, fonts, spacing or components without flagging it.
- Light, dark and system themes. Every colour comes from a semantic token; charts read tokens and re-render on theme change.
- Accessibility baseline: WCAG AA contrast, visible focus, 44 px touch targets, `prefers-reduced-motion` respected, charts have a table fallback.

## Workflow

- Read `PHASE-BRIEF.md` first. Work only on the current slice; do not start later slices.
- Tests first for calculator and config work: a red commit, then a green one.
- One fresh session per part, at most per slice. Hand over through the PR description (what was done, what differs from the brief, what is next).
- Docs are part of the work. Every build session ends by updating the docs, before the final commit; a session is not done until the close-out checklist below is complete. A docs test fails CI if `PLAN.md`, `CHANGELOG.md` and `package.json` drift apart.
- Each change to tax values is its own PR, with the source for every changed value in `docs/verification-log.md`.
- Be concise and technical. Say what you changed and what you did not verify.

## Session close-out checklist (every build session, no exceptions)

1. `PHASE-BRIEF.md`: tick off what was done, record anything that differs from the brief, and write what the next session should pick up.
2. `PLAN.md`: update the slice's status row (Not started, In progress, Done with version, PR and date), the "Last updated" line, and the slice notes (what changed from the prompt, rollback or follow-up notes). Move new ideas to the Backlog and new unknowns to Open questions.
3. `CHANGELOG.md`: add a user-facing entry under `[Unreleased]` for anything a user can see or rely on; cut a version heading (and bump `package.json`) when a part is merged. Internal-only sessions need no changelog entry but still need steps 1 and 2.
4. `CLAUDE.md`: update only if a rule, command, stack decision or convention changed. Keep it short.
5. Tax and calculator docs: `docs/verification-log.md` for every config value touched, `docs/worked-examples.md` for new cross-checks, and the calculator's `README` (assumptions, sources, edge cases) and Help topic if behaviour changed.
6. In-app text: About > Privacy if a storage key was added or changed; credits regenerate from dependencies.
7. Run `test`, `lint`, `typecheck` and `build`; confirm the docs test passes. In the PR description say which docs were updated, what was not verified, and what comes next.
