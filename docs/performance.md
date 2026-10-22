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

## Browser checks (slice 1b session 1b-i, 0.9.0)

The same scratch Playwright and axe-core 4.10 setup against `vite preview`, at 360, 768 and 1280 px in light and dark (system theme), on home and the take-home page in six states: empty, filled (every input, assumptions open), the take-home-below-nothing warning, the pension-above-pay notice, an invalid input, and the open scenario list after a save. 42 runs. axe (WCAG 2.0/2.1 A and AA, best practice) found no violations; no horizontal page scroll; no external requests; no console errors; every visible control at least 44 px tall (the only smaller element is ScenarioBar's hidden file input). One fix came out of it: the personal allowance taper assumption was listed twice. Bundle (gzip): the take-home page about 7 KB, which replaces the Hello page.

Not checked: a real phone, Safari, Firefox, a screen reader, the deployed site.

## Browser checks (slice 1b part 1b-i.1, 0.10.0)

The same scratch Playwright and axe-core 4.10 setup against `vite preview`, on the take-home page at 360, 768 and 1280 px in light and dark (system theme), in five states: empty; filled (both contributions as percentages, own pensionable pay with the bonus, three benefit items and two deductions with 80-character unbroken names, children, assumptions open); warnings (a percentage above all of pay, an item with no amount and a long name, the contribution-above-pay notice); an invalid over-long name; a full list of ten items. 30 runs. axe (WCAG 2.0/2.1 A and AA, best practice) found no violations; no horizontal page scroll and nothing wider than the viewport; no external requests; no console errors; every visible control at least 44 px tall. One fix came out of it: an item's legend showed its name, and an 80-character name wrapped over the fieldset border at 360 px, so legends are now numbered ("Benefit 1") and the name stays in its box and the Remove button's label. Bundle (gzip): the take-home page about 8 KB (from about 7 KB).

Not checked: a real phone, Safari, Firefox, a screen reader, the deployed site.

## Browser checks (slice 1b, 0.11.0)

The same scratch Playwright and axe-core 4.10 setup against `vite preview`, on the take-home page at 360, 768 and 1280 px in light and dark (system theme), in five states: empty; filled by year (an 80-character unbroken benefit name taken before tax, an after-tax benefit, a deduction, children, a Scottish code with "Where you live" in England so the region warning shows, the PAYE card, assumptions open); filled by month (the Month view with the PAYE month row); a code not modelled (an emergency code's notice); text that is not a code (the error and no results). 30 runs. axe (WCAG 2.0/2.1 A and AA, best practice) found no violations; no horizontal page scroll and nothing wider than the viewport; no external requests; no console errors; every visible control at least 44 px tall. No fixes were needed.

Not checked: a real phone, Safari, Firefox, a screen reader, the deployed site.

## Browser checks (slice 1b, 0.12.0: take-home page redesign)

The same scratch Playwright and axe-core 4.10 setup against `vite preview`, on the take-home page at 360, 768, 1024 and 1280 px in light and dark (the theme set in storage), empty and filled (every section set, an 80-character unbroken benefit name, a deduction, two children, a supported tax code), with the split bar's table and the assumptions open, plus: the phone bar scrolled (collapsed) and tapped (expanded); a scroll from the top in 3 px steps (the bar changes state exactly once, no flicker); 70 Tabs from Salary with no focused element under the sticky bar; the wide results column sticky with the headline in view after scrolling; Section by Enter and Space, Add moving focus to the new name, Remove then Undo by keyboard (focus returns to the restored item's Edit); reduced motion (no transition or animation on the page's sections, bar or split bar); 200% text at 360 px in both themes. 96 checks passed; axe (WCAG 2.0/2.1 A and AA, best practice) found no violations in 29 runs; no horizontal page scroll; no external requests; no console errors; every visible control at least 44 px tall. Fixes that came out of it: the Add buttons and an item's Edit and Remove wrap at 200% text; the split bar's table no longer widens the page at 200% text; an item's name keeps a minimum width so its buttons wrap below it on a phone.

## Lighthouse (mobile), 0.12.0, 18 October 2026

Lighthouse 12.8.2, mobile form factor, headless Chromium 1194, against `vite preview` on this machine, the take-home page (`#/c/optimiser`), against the 0.11.1 build (`origin/main`) measured the same way.

| Build | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| 0.11.1 | 93 | 100 | 100 | 91 | 1.9 s | 2.0 s | 30 ms | 0.137 |
| 0.12.0 | 92 | 100 | 100 | 91 | 1.9 s | 2.1 s | 10 ms | 0.137 |

- The layout shift is the same before and after: the footer shows under the page's loading state and is pushed off-screen when the lazily loaded page arrives (in the Backlog).
- SEO: "robots.txt is not valid", as before (`vite preview` serves the app's HTML there).
- Label-in-name (best practice): the Section buttons were named by their title only; they are now named by their visible text. The one left is VerifiedBadge's link (unchanged, in the Backlog).
- Bundle (gzip): the take-home page about 14.5 KB (from about 10.2 KB); CSS about 7.4 KB.

Not checked: a real phone, Safari (it has no scroll anchoring, so the bar's collapse moves the content; the hysteresis still prevents flicker), Firefox, a screen reader, the deployed site.

## Browser checks and Lighthouse (mobile), part 1b-ii-a, 21 October 2026

The same scratch Playwright and axe-core 4.10 setup against `vite preview`, on the take-home page at 360 and 1280 px in light and dark (system colour scheme), empty and filled (salary and bonus, a percentage contribution, two children, carry forward for one year, the childcare check on and the money purchase toggle on and off, the chart's table and the assumptions open). 8 runs. axe (WCAG 2.0/2.1 A and AA, best practice) found no violations; no horizontal page scroll and nothing wider than the viewport; the chart fits at 360 px, takes the theme and uses token colours; no external requests; no console errors; every visible control at least 44 px tall. Fixes that came out of it: the numeric x axis ran past the data to a rounded end (it now ends at the most modelled contribution, with ticks inside it); the chart's text summary repeated the marker list on screen, so with markers it is for screen readers only.

Lighthouse 12.8.2, mobile form factor, headless Chromium 1194, `#/c/optimiser`:

| Build | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| 0.12.0 | 92 | 100 | 100 | 91 | 1.9 s | 2.1 s | 10 ms | 0.137 |
| 1b-ii-a | 97 | 100 | 100 | 91 | 2.0 s | 2.2 s | 0 ms | 0 |

- CLS: the loading state now holds the screen's height (`PageLoadingState`), so the footer starts below the fold.
- Label-in-name and robots.txt as before (VerifiedBadge's link, in the Backlog; `vite preview` serves HTML for robots.txt).
- Bundle (gzip): the take-home page about 20 KB (from about 14.5 KB): `optimise()`, the chart and the new section.
- The sweep for £150,000 of pay (302 points) takes about 20 ms in Node; the page caps the sweep at 400 points (`pageSweepStep`).

Not checked: 768 px, a real phone, Safari, Firefox, a screen reader, the deployed site.

## Browser checks, part 1b-ii-b, 21 October 2026

The same scratch Playwright and axe-core 4.10 setup against `vite preview`, on the take-home page at 360 and 1280 px in light and dark (system colour scheme), filled (salary, a contribution, two children, the childcare check on) in four states: as loaded, Month, Full range, and a chosen contribution with the cards below the chart. 16 runs. axe (WCAG 2.0/2.1 A and AA, best practice) found no violations; no horizontal page scroll; no external requests; no console errors; every visible control in the chart section at least 44 px tall (Segmented's visually hidden radios aside; their labels are the targets). Fix that came out of it: the zoomed chart at 360 px had one x tick; the shared `Chart` now asks for more until at least two round ticks fall inside the range (`ticksWithin`). Lighthouse not re-run.

## Browser checks (slice 2, part 2b, 0.16.0)

The same scratch Playwright (1.56) and axe-core 4.10 setup against `vite preview`, on the compound interest page at 360, 768, 1024 and 1280 px in light and dark (system theme). Five states each: empty; filled (every section set, assumptions and the chart's table open); today's money; the too-large refusal; an invalid input. Then, at 360 and 1280 in both themes, two scenarios saved and the list open, and compare. Also 200% text at 360 px in both themes. 290 checks passed and none failed. axe (WCAG 2.0/2.1 A and AA, best practice) found no violations, with no horizontal page scroll, no external requests, no console errors, and every visible control at least 44 px tall. Saved scenarios have no `taxYear`, and compare shows the brief's rows and no tax year. At 360 px the yearly table is 458 px wide in a 326 px region; after scrolling it 150 px, the year column stays at the region's left edge.

Fixes that came out of it (first run, 10 failures, all at 360 px):
- The shared Chart's data table scrolled in a region that could not be focused (axe scrollable-region-focusable). It is now a focusable section named by the chart's title.
- The phone bar and the headline card were both regions named "Final balance" (landmark-unique). The card is now titled by the years.

Compute time for a 100-year projection with weekly contributions and daily compounding (the slowest case: 5,200 steps, with and without the fee), from the input event to the rendered page with all 100 rows: 27 to 33 ms in headless Chromium on this machine (six runs). The engine alone takes about 30 ms in Node. Bundle (gzip): the compound interest page about 4 KB. The definition and engine are in the main script, which is about 122 KB.

Not checked: a real phone, Safari, Firefox, a screen reader, the deployed site.

## Lighthouse (mobile), 0.16.0, 21 October 2026

Lighthouse 12.8.2, mobile form factor, headless Chromium 1194, against `vite preview` on this machine, `#/c/compound-interest` with its default inputs.

| Page | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| Compound interest | 97 | 100 | 100 | 91 | 2.0 s | 2.2 s | 10 ms | 0 |

SEO's one failure is robots.txt, as before (`vite preview` answers it with the app's HTML).


## Browser checks and Lighthouse (mobile), part 3c-1, 22 October 2026

The same scratch Playwright (1.56) and axe-core 4.10 setup against `vite preview`, on the car decision page at 360, 768, 1024 and 1280 px in light and dark (system colour scheme). Five states each: empty (as the page starts); filled (four options: keep, a loan with an 80-character unbroken name, HP with an option fee and electric charging, a PCP handed back before the horizon; every section, the assumptions and every card's split-bar table open; the flip points shown); negative equity; an option the engine refuses plus one missing inputs; a box typed invalid. Plus, filled: Tab from the top reaches every card, the card row and the comparison table; at 360 px the card row scrolls sideways inside itself; 200% text at 360 px in both themes. 188 checks passed and none failed: axe (WCAG 2.0/2.1 A and AA, best practice) found no violations; no horizontal page scroll; no external requests; no console errors; every visible control at least 44 px tall (Segmented's visually hidden radios aside; their labels are the targets).

Fixes that came out of it (first runs):
- At 360 px the filled page scrolled sideways by 612 px: the screen-reader-only captions of the split-bar tables in cards off to the side were positioned against the page, not the card row. The row, the cards and the table region are now `relative` (U16).
- From 768 px the sticky results column (the order and the flip points, nothing focusable) could scroll without being reachable by keyboard (axe scrollable-region-focusable). It now has a "Go to the cards" button.
- At 1280 px a split bar's table in a narrow card scrolled sideways in a region that couldn't be focused. `SplitBar`'s table now scrolls in a focusable group.

Compute time with four options (keep, a loan, HP, a PCP bought at the end) and a 240-month horizon, all three end-value cases (`compareOptions` costs every case at once): from the Load click to the cards rendered, 203 to 249 ms in headless Chromium on this machine (three runs), with one long task of 128 to 177 ms. The engine alone takes about 50 ms in Node. The flip points for the two lowest options run once the inputs settle (`SETTLE_MS`): one long task of 273 to 296 ms; in Node one pair takes 350 to 430 ms. Bundle (gzip): the car decision page about 12 KB; the definitions and engines are in the main script, which is about 133 KB.

Lighthouse 12.8.2, mobile form factor, headless Chromium 1194, `#/c/car-decision` as it loads (every amount empty; Lighthouse loads the page, so the four-option horizon is timed above instead):

| Page | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| Car decision | 96 | 100 | 100 | 91 | 2.1 s | 2.3 s | 50 ms | 0 |

SEO's one failure is robots.txt, as before (`vite preview` answers it with the app's HTML).

Not checked: a real phone, Safari, Firefox, a screen reader, the deployed site.
