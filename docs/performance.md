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

## Browser checks, compute time and Lighthouse (mobile), part 3c-2, 22 October 2026

The same scratch Playwright (1.56) and axe-core 4.10 setup against `vite preview`, on the car decision page at 360, 768, 1024 and 1280 px in light and dark (system colour scheme). Two states each: empty (as the page starts) and filled (a saved scenario of four options loaded: keep, a loan with an 80-character unbroken name, HP with an option fee and electric charging, a PCP handed back at month 36; a 240-month horizon; every section, the sensitivity section, the chart's table and the assumptions open). Filled, at each width and theme: the chart has four lines; on the chart, Home, two Right arrows and End give months 0, 2 and 240, the readout follows, and the slider's focus is visible; a tap mid-chart picks a middle month; choosing another flip pair gives that pair's sentences; then at 360 px the page at 200% text. 158 checks passed and none failed: axe (WCAG 2.0/2.1 A and AA, best practice) found no violations; no horizontal page scroll; no external requests; no console errors; every visible control at least 44 px tall (Segmented's visually hidden radios aside).

Fixes that came out of it (first runs):
- At 360 and 768 px the filled page scrolled sideways by about 500 px: the flip pair Selects took the width of the 80-character option name and the flip sentences didn't wrap it. The picker's grid items may now shrink and the section wraps long words; the Chart's legend wraps a long series name too.
- axe landmark-unique: the readout's blocks and the sensitivity tables were regions named by the option alone, as its card is. The readout is a plain list; each sensitivity table is named "<option>: sensitivity".
- Lighthouse (below) put about 2.6 s of blocking time on the sensitivity after a load on a slowed CPU, so it now runs only while its section is open (U21).

**Compute time** with four options (keep, a loan over 60 months, HP with an option fee, a PCP over 36 months) and a 240-month horizon.

| Work | Node (three runs) | Chromium, headless, on this machine (eight runs) |
|---|---|---|
| The page's results (`compareOptions`, all three cases), Load click to cards | 38 to 70 ms | 181 to 275 ms, with one long task of 106 to 172 ms |
| Sensitivity, all four options (64 engine reruns) | 610 to 960 ms in all; 120 to 280 ms an option | one step per option and input: 16 steps of under 50 ms up to 74 ms each; about 0.9 to 1.2 s of work spread after `SETTLE_MS` |
| Flip points, the default pair | about 1.0 to 1.1 s; another pair about 190 to 210 ms | one task of 244 to 428 ms after `SETTLE_MS` |

Both exceed 300 ms an update, so neither runs on the typing path: both wait for the inputs to settle (`SETTLE_MS`), both are memoised by their engine inputs (and the pair), the sensitivity runs in steps and only while its section is open, and the flip search for a pair already seen is shown at once. The flip search can't be split without an engine change, so it is still one task of up to about 430 ms after the inputs settle; moving it (and the sensitivity) to a worker is in the backlog, for the owner to decide. Bundle (gzip): the car decision page about 16 KB (from about 12 KB); the main script about 133 KB.

Lighthouse 12.8.2, mobile form factor, headless Chromium 1194 (Chrome 141), `vite preview`:

| Run | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| Navigation, `#/c/car-decision` as it loads (empty) | 96 | 100 | 100 | 91 | 2.1 s | 2.4 s | 20 ms | 0 |
| Timespan: load the four-option, 240-month scenario (to the flip points shown) | 49 | n/a | 100 | n/a | n/a | n/a | 2,010 ms | 0.013 |
| Timespan: open the sensitivity section (to every row shown) | 48 | n/a | 100 | n/a | n/a | n/a | 2,587 ms | 0 |
| Snapshot of the filled page | n/a | 100 | 100 | 80 | n/a | n/a | n/a | n/a |

The timespans run with Lighthouse's mobile CPU slowdown, so the blocking time is the cards, the flip search and the sensitivity steps on a slow phone: one load of a four-option, 240-month scenario, and one opening of the sensitivity. SEO's failures are robots.txt, as before, and the snapshot's DOM size (the chart's 241-row table with a button per row and four sensitivity tables; in the backlog).

Not checked: a real phone, Safari, Firefox, a screen reader, the deployed site.

## Browser checks, slice 3c-3 (0.20.1), 22 October 2026

Scratch Playwright (1.56) and axe-core 4.10 against `vite preview`, on the car decision page at 360 and 1280 px in light and dark (system colour scheme), with a saved scenario of four options loaded (keep, a loan, HP, a PCP handed back at month 36; 48 months). At each width and theme: four lines with four distinct computed stroke colours, dashes and end labels, none the danger colour; each line at least 3:1 on the chart's surface (the teal line 5.47:1 light, 8.06:1 dark); Home and two Right arrows give month 2 with the triangle marker selected; no horizontal page scroll; axe (WCAG 2.0/2.1 A and AA, best practice) found no violations; no external requests; no console errors. 68 checks passed and none failed. No compute change.

## Browser checks and compute time, part 1b-iii (0.21.0), 22 October 2026

Scratch Playwright (1.56) and axe-core 4.10 against `vite preview`, on the take-home page at 360, 768, 1024 and 1280 px in light and dark (system colour scheme), in nine states: the default target (pay, two children, a contribution: the nearest threshold ahead), a lowered target, the target at Maximum, no threshold ahead, the breakdown in Month and in Year, 200% root text, an 80-character unbroken benefit name, and percentage mode. Every detail Section opened before checking. 72 runs: axe (WCAG 2.0/2.1 A and AA, best practice) found no violations; no horizontal page scroll; every visible picker, pill, chart and Section button at least 44 px tall; no external requests from the page; no console errors. At 200% text the split bar's and the chart's tables are wider than their space and scroll sideways in their own keyboard-focusable regions (as before); the compare cards wrap. One fix came out of it: at 360 px the cards' four columns broke amounts mid-number, so each row's label is now on its own line above Now, New and Change.

Compute: a new target runs `optimise()` once more at the page's step (`pointAt`), about 9 ms in Node for £150,000 of pay; the sweep itself is unchanged and no longer reruns on the Year / Month switch.


## Browser checks and compute time, part 3d-2 (0.24.0), 22 October 2026

Scratch Playwright (1.56) and axe-core 4.10 against `vite preview`, on the car decision page at 360, 768, 1024 and 1280 px in light and dark (system colour scheme). Empty, then a saved scenario of four options loaded (keep with finance still owed, a loan with an 80-character unbroken name, HP on an electric car with an option fee, a PCP bought at the end; long names; a 240-month horizon), with the fuel threshold shown, a new pair chosen in the bridge's Selects, the sensitivity worked out and every disclosure open. Checked at each width and theme: axe (WCAG 2.0/2.1 A and AA, best practice), no horizontal page scroll, every visible control at least 44 px tall (visually hidden inputs aside), the bridge drawn with no element past its section, Tab from the top reaching the bridge's First option then Second option then its "Show as a table" (focus visible), Enter opening it and Tab reaching the table's region, a pair chosen in the bridge moving "What changes the answer" too, every sensitivity figure able to scroll fully into view beside the sticky column, no external requests, no console errors. 120 checks passed and none failed.

Found and fixed: with Settings showing whole pounds, the bridge's parts were each rounded to the pound and need not add up; they are now shown in pence always (U38).

Compute, the same scenario at 1280 px, three runs from the Load click: the default pair's flip search one long task of 863 to 1,036 ms after `SETTLE_MS` (this scenario is heavier than 3c-2's: the kept car's finance and 240 months), then the fuel or energy price threshold a separate task of 237 to 282 ms. In Node, over 40 seeded pairs at 240 months, the search past a tie costs the same as before (683 ms against 669 ms a pair on average) and the fuel threshold about 370 ms. Both are in the worker item of `docs/backlog.md`.

## Household budget (0.25.0)

Scratch Playwright (1.56) and axe-core 4.10 against `vite preview`, on `#/c/budget` at 360, 768, 1024 and 1280 px in light and dark (system colour scheme), in five states: empty; filled (every section open, an extra income line, an 80-character unbroken line name, a weekly and a yearly line, the split bar's table and the assumptions open); negative leftover; what-ifs active (a slider moved and a box typed); an invalid amount. Plus at 360 px, filled: 200% text; Remove by keyboard (focus to the section's Add) then Undo (focus to the restored line's name); the sticky bar collapses on scroll. 226 checks passed and none failed: axe (WCAG 2.0/2.1 A and AA, best practice) found no violations; no horizontal page scroll; every visible control at least 44 px tall (visually hidden radios aside); no external requests; no console errors. Fixes that came out of it: a long unbroken name widened the page through its what-if slider's label (the shared `Field` label now wraps anywhere), and Reset and Apply now wrap at 200% text.

Bundle (gzip): the budget page about 7 KB. The engine is a few additions per line; every input change reruns it with no noticeable cost. Lighthouse not run.

## Mortgage overpayment (0.27.0)

Scratch Playwright (1.56) and axe-core 4.10 against `vite preview`, on `#/c/mortgage` at 360, 768 and 1280 px in light and dark (system colour scheme), in five states: empty (the boxes the results need listed); filled (start date, balance, term, a fixed rate to its end and a rate after it, a monthly overpayment, a lump sum, an early repayment charge with allowance already used and payments to the reset, a what-if typed, every disclosure open); daily interest over 39 years with no fixed rate (the drift warning); a lump sum dated before the start (refused by field); an invalid balance. 30 runs, none failing: axe (WCAG 2.0/2.1 A and AA, best practice) found no violations; no horizontal page scroll; every visible control at least 44 px tall (visually hidden radios aside); no external requests; no console errors; "best" nowhere on the page. Fixes that came out of it (looking at the 1280 and 360 px screenshots): a regular overpayment stopping at the payoff raised the capped-at-the-balance warning on every shortened schedule (it now warns about lump sums not needed only); interest saved was shown twice in the answer card.

Lighthouse 12.8.2, mobile form factor, headless Chromium 1194, against `vite preview`, `#/c/mortgage` as it loads (empty: Lighthouse can't fill the boxes):

| Page | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| `#/c/mortgage` | 94 | 100 | 100 | 91 | 2.2 s | 2.6 s | 50 ms | 0 |

SEO's one failure is the `vite preview` robots.txt answer, as before. Bundle (gzip): the mortgage page about 8 KB. The engine runs two schedules of up to 480 months per change (a third with a what-if); no noticeable cost while typing. CLS of a filled page (results appearing as the last box is typed) not measured.

## Browser checks, C0.5 config values (0.28.0), 23 October 2026

A scratch Playwright and axe-core 4.10 script against `vite preview`, on the Tax data sheet with every group open, at 360 and 1280 px in light and dark (system colour scheme). 4 runs. In each: 45 of 45 values verified, the badge reads "Last verified 23 October 2026", twelve groups "All n verified" (Pensions 13, ISAs 1), the six new values shown with their date and GOV.UK link; axe (WCAG 2.0/2.1 A and AA, best practice) found no violations; no horizontal page scroll; no external requests; no console errors; no visible link, button or summary under 44 px. No fixes were needed. Lighthouse not re-run (no page or bundle change beyond the config).

## Next pound composer (C1, 0.29.0)

`nextPound()` timed in Node 22 under Vitest on this machine (warm, 20 runs each, median and slowest), not in a browser:

| Case | Median | Slowest |
|---|---|---|
| Default test case: pay £60,000, X £10,000, 20 years, a 25-year mortgage, no charge | 22 ms | 31 ms |
| The same with an early repayment charge (the overpayment is found by bisection, about 30 `overpay()` runs) | 42 ms | 71 ms |
| Pay £300,000 (a longer optimiser sweep) | 27 ms | 31 ms |
| A 40-year mortgage with a charge, a 40-year horizon | 65 ms | 94 ms |

Most of the time is the optimiser's sweep (at the default £500 step) and the mortgage bisection. The pension search adds about 50 single points (the £10 scan) and about 10 for the whole-pence bisection. A phone may be several times slower. That is acceptable for an internal engine; C2 should measure it on the page after the inputs settle, and consider a worker if one run passes a frame budget there, as with the car flip search (3c-2).

## Next pound page (C2, 0.30.0), 23 October 2026

Scratch Playwright (1.56) and axe-core 4.10 against `vite preview`, Chromium 1243, on `#/c/next-pound` at 360, 768 and 1280 px in light and dark (system colour scheme), in three states each: empty (the date the results need named); filled (a lump sum, pay with a net pay contribution, a 25-year mortgage with a fixed rate and an early repayment charge over its penalty-free limit, a fee, inflation, ISA payments past the annual limit; every section and the chart's table open); the pension not accessible (a scheme age past the horizon) with the mortgage cleared (not set up). 118 checks, none failing: axe (WCAG 2.0/2.1 A and AA, best practice) found no violations; no horizontal page scroll; every visible button, link, box, select and summary at least 44 px tall; the chart takes the theme; no "best", "better", "recommend" or "should" on the page (assumptions open); no external requests; no console errors. Plus at 360 px on a touch, mobile viewport: 20 seconds of Tab (about 3,200 presses, with scrolling back up every 25) found no focused element under the sticky bar. Fixes that came out of it: paragraphs inside the cards' definition lists (the break-even card, a leg with no number) moved to the card's footer; the chart's categories use short names, as "Mortgage overpayment" was dropped under its bar at 360 px.

Lighthouse 12.8.2, mobile form factor, headless Chromium 1243, `#/c/next-pound` as it loads (empty: Lighthouse can't fill the boxes):

| Page | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| `#/c/next-pound` | 93 | 100 | 100 | 91 | 2.3 s | 2.7 s | 70 ms | 0 |

SEO's one failure is the `vite preview` robots.txt answer, as before. CLS of a filled page (results appearing after the inputs settle) not measured by Lighthouse; the results column keeps the last results while a change is worked out, so it does not empty and refill. Bundle (gzip): the page about 9 KB; the composer and its definition are in the main bundle with the registry, as every calculator's.

Compute: `nextPound()` runs once the inputs have stopped changing for `SETTLE_MS` (the first run at once), as the car page's flip search. At 4x CPU slowdown (CDP `Emulation.setCPUThrottlingRate`), six runs each (two sessions of three), the longest task after one change to the lump sum:

| Case | Longest task |
|---|---|
| Default: pay £60,000, X £10,000, 20 years, a 25-year mortgage, no charge | 106 to 189 ms |
| The same with an early repayment charge (the overpayment found by bisection) | 230 to 339 ms |
| A 40-year mortgage with a charge, a 40-year horizon | 322 to 505 ms |

**Past the brief's 200 ms limit with a charge.** Reported, not changed: the proposal is a worker for the composer (`docs/backlog.md`), for the owner to decide. A real phone not measured.
