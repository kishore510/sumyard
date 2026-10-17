# PHASE-BRIEF: Slice 0 Foundation

Status: In progress. Session 1 (recon) and build session A are done; build session B (app chrome) is next. Rewritten at the start of every slice. Roadmap and status live in `PLAN.md`.

## Docs rule

Every build session ends by updating the docs: this file (progress and next session), `PLAN.md`, `CHANGELOG.md`, and `CLAUDE.md` if a rule or the stack changed. The full checklist is in `CLAUDE.md` ("Session close-out checklist"). A session is not finished until that is done.

## Goal

A deployed, empty Sumyard shell on GitHub Pages with the Chalkline design language, light / dark / system themes, and the app chrome (menu, Help, What's new, About, Settings). No calculators and no tax data yet (those arrive in slice 0.5 and Phase 1).

## Session 1: recon only (no code written)

Do this first, in its own session, and report back before any build work.

1. Inspect the Chalkline repo (and Stickyard where useful) and report:
   - framework and build tool, language, CSS approach, test runner
   - design token files (colour, type scale, spacing, radii, shadows, motion) and how light/dark is applied
   - the theme toggle implementation, including how the flash of wrong theme is avoided
   - font loading (self-hosted? which fonts?)
   - the GitHub Pages deploy workflow and base-path handling
   - lint, format and CI setup
2. Inventory the app-chrome components: main menu, Help panel (search, Quick start card, topics, More), What's new (rendered from the changelog), About (version, build, storage used, Copy details, privacy, credits), Settings, toast with Undo, panel stack and focus handling. For each, say: lift as is, generalise, or drop (diagram-specific).
3. Recommend the stack for Sumyard (default: mirror Chalkline) and list any reason to differ.
4. Do not write or change any code except the docs: add the recon report to this file's progress log and update `PLAN.md` ("Last updated" and the slice 0 row to In progress). Output a short report.

## Sessions 2 onwards: build (after the recon report is agreed)

### Scope

- Repo scaffold and folder layout as in `PLAN.md` slice 0 notes. TypeScript strict, lint, format, tests, `typecheck`, `build`.
- `CLAUDE.md` stack section filled in from the recon.
- GitHub Actions: lint, typecheck, test, build, deploy to GitHub Pages with the correct base path.
- Docs test: fails CI if `PLAN.md` or `CHANGELOG.md` is stale against `package.json`.
- Privacy CI check: scan the built output for external URLs; allowlist only plain gov.uk anchors.
- Tokens reused from Chalkline (one tokens file, semantic layer over raw palette). Flag any token that has to be added.
- Theme: system / light / dark, persisted, applied before first paint, no flash.
- Shell: header with menu button and theme toggle; main menu; sheets (bottom sheet on phone, side panel on desktop) with back arrow, title, close and a stack; hash routing; focus trap, Esc to close, focus restored.
  - Help: simple topic list from `content/help/*.md` (Quick start, Scenarios and saving, How tax data and "last verified" work, Troubleshooting). No search.
  - What's new: rendered from `CHANGELOG.md` at build time with a "This version" badge; "New" marker until opened; build fails if the top version differs from `package.json`.
  - About: version, build SHA, built timestamp, storage used, Copy details, privacy statement, credits generated from dependency licences, disclaimer.
  - Settings: theme, and defaults (tax year, region, whole pounds vs pence). Backup and restore comes in 0.5.
- Toast with Undo; empty, error and loading states; footer disclaimer and a first-run acknowledgement stored locally.
- Fonts self-hosted and bundled.
- First `CHANGELOG.md` entry (0.1.0) and `package.json` version 0.1.0.

### Out of scope

Money type, tax config, scenarios, calculators, charts, first-run tour, keyboard shortcuts, Help search, service worker. Any of these needed for the shell stays a stub with a note.

### Acceptance

- Deployed to GitHub Pages and reachable on a phone.
- Theme toggle works, persists, shows no flash on load, and matches Chalkline's look and behaviour in both themes.
- Menu, Help, What's new, About and Settings work on phone and desktop, in both themes, with the back stack, Esc and focus handling.
- About's version matches `package.json` and the top `CHANGELOG.md` entry; CI enforces it.
- The built output contains no external network requests (CI enforces it).
- WCAG AA contrast in both themes, visible focus, 44 px touch targets, reduced motion respected.
- Lint, typecheck, tests and build are green in CI.
- `PLAN.md` slice 0 row updated, `CHANGELOG.md` entry added.

## Progress log

Add one entry per session: date, what was done, what differs from the brief, what the next session should pick up, and which docs were updated.

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

## Claude Code prompt: session 1 (recon)

```
Read CLAUDE.md and PHASE-BRIEF.md in the Sumyard repo (create the repo
folder and these two files first if they don't exist yet; the owner will
supply them).

This is a recon session. Do not write or change any code (docs only,
as below).

Inspect the Chalkline repo (and Stickyard where it helps) and report:
1. Framework, build tool, language, CSS approach, test runner.
2. Design tokens: where they live, the full list (colour, type, spacing,
   radii, shadows, motion), and how light/dark is applied.
3. Theme toggle: implementation, persistence, and how the flash of the
   wrong theme is avoided.
4. Font loading: self-hosted or not, which fonts.
5. GitHub Pages deploy workflow and base-path handling.
6. Lint, format, CI setup.
7. App-chrome components: main menu, Help panel (search, Quick start,
   topics, More), What's new (from the changelog), About (version, build,
   storage used, Copy details, privacy, credits), Settings, toast with
   Undo, panel stack and focus handling. For each: lift as is,
   generalise, or drop (diagram-specific), with file paths.

Then recommend the stack for Sumyard (default: mirror Chalkline) and list
any reason to differ. Keep the report short and structured. Do not start
building. At the end, follow the session close-out checklist in
CLAUDE.md: record the report in the PHASE-BRIEF.md progress log and
update PLAN.md (Last updated, slice 0 status).
```
