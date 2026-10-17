# PHASE-BRIEF: Slice 0 Foundation

Status: Not started. Rewritten at the start of every slice. Roadmap and status live in `PLAN.md`.

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

- (none yet)

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
