# Performance and quality checks

Lighthouse and browser checks run against a local production build (`npm run build`, then `vite preview`). The tools are installed outside the project (in a scratch folder), so no dependency is added.

## Lighthouse (mobile), 0.4.0, 17 October 2026

Lighthouse 12.8.2, mobile form factor (its default throttling), headless Chromium 1194, against `vite preview` on this machine (not the deployed site).

| Page | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| Home (`/`) | 99 | 100 | 100 | 91 | 1.8 s | 1.8 s | 30 ms | 0 |
| Hello calculator (`#/c/hello`) | 99 | 100 | 100 | 91 | 1.7 s | 1.7 s | 10 ms | 0 |

- The one SEO audit that fails is "robots.txt is not valid": `vite preview` answers `/robots.txt` with the app's HTML. GitHub Pages returns a 404 there, which Lighthouse accepts. Not changed; a personal app needs no robots file.
- Bundle (gzip): main script about 101 KB, sheet pages 15 KB, the Hello page 8 KB, CSS 7 KB, plus the Inter font files.

## Browser checks (session D)

A Playwright and axe-core 4.10 script (scratch, not committed) ran 305 checks in Chromium at 360, 768 and 1280 px in light and dark, plus storage-full, clear-all-data and reduced-motion runs. All passed. axe (WCAG 2.0/2.1 A and AA, plus best practice) found no violations on: home, the Hello page (assumptions and data table open), an invalid input, the open ScenarioBar, the refusal notice, Settings with the clear-all confirmation, compare, the import preview (Add and Replace), the Scenarios sheet, the restore preview and the storage-full state.

Also checked: no horizontal page scroll, 44 px targets, the chart fits the screen and uses token colours, title focus on page change, Esc from a sheet returns to the calculator page, export file name and envelope, delete then Undo, import of an untrusted name rendered as text, unknown calculators skipped, the old-tax-year warning, About counting the scenarios key, only owned storage keys, no external requests and no console errors.

Not checked: a real phone, Safari, Firefox, a screen reader, the deployed site, a real file picker on mobile.

## Browser checks (slice 1a session E, 0.5.0)

The same scratch Playwright and axe-core 4.10 setup, against `vite preview`, on the Tax data sheet with real verified 2026-27 values and every group open, at 360 and 1280 px in light and dark. In every combination: 38 of 38 values verified, the badge reads "Last verified 17 October 2026", ten groups "All n verified", no horizontal page scroll, nothing wider than the sheet (long labels such as the childcare and HICBC ones wrap), every "Source: GOV.UK" link at least 44 px tall, no external requests, no console errors, and axe found no violations. One wording fix came out of it: bands now read "20% above £3,967.00" with "On income after allowances", not "from £3,967.00 at 20%".

Not checked: 768 px, a real phone, Safari, Firefox, a screen reader, the deployed site.
