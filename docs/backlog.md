# Backlog (no slot yet)

Moved verbatim from `PLAN.md` on 21 October 2026. New ideas go here.

- Car finance: a flat-rate input, once a definition is verified (F14); early settlement and voluntary termination figures, once the statutory rules are read (CR-12, CR-13); personal contract hire (leasing) and dealer deposit contributions (not in v1, F1); an excess charge per mile in fractions of a penny.
- First-run tour (about four steps), skippable, replayable from Help.
- Keyboard shortcuts (desktop only) and a shortcuts reference.
- Help search (hand-rolled index vs a small library such as MiniSearch).
- Service worker for offline use (adds cache-invalidation risk when tax config changes; version the cache by app version if adopted).
- Print or PDF export of a results page.
- A sensitivity view (what if salary, bonus or contribution moves by 5 or 10 percent).
- Self-employed and dividend income in the optimiser.
- Multi-year projections across a tax-year change.
- Benefits in kind beyond a single net value: a benefit through salary sacrifice (the salary amount rule), benefits that attract Class 1, and the employer's Class 1A shown as an employer-side figure (needs a config leaf and the owner's decision).
- Welsh rate variations beyond what the config supports.
- Spreadsheet (CSV) export of a calculator's tables.
- Phone-specific polish if the first phone audit shows gaps.
- A Sumyard logo and favicon (the header uses a text wordmark; the favicon is empty).
- Remember the compare selection across visits (it lasts for the visit now).
- A "Discard changes" action on a loaded scenario (today: load it again).
- Chart tooltips on hover or tap (values are in the summary and the data table now).
- A per-pay-period payroll view (monthly thresholds, bonus months) beside the annual model, if payslip matching is wanted (D1).
- Add Zustand and Zod if a later slice's state or import validation outgrows the small store and hand-written checks.
- A later tax year that includes April 2029: model the salary sacrifice NICs cap (logged as informational in session E).
- HMRC cross-check cases with pension contributions, once the owner has HMRC calculator figures to fill them.
- Child Benefit for part of a year (a child born or turning the age limit mid-year), and which partner pays the charge.
- Employer pension contributions on top of a salary sacrifice, and the employer's NI saving (slice 1b shows it employer-side).
- Show the source page's title next to "Source: GOV.UK" on Tax data, so identical link texts are told apart by sight (they differ only in their accessible names today).
- Optimiser: choose the contribution to look at by tapping the chart or a table row (today a select of the points shown), and measure thresholds from the chosen contribution as well as from now.
- Compound interest: flat fees and charges on contributions; tax wrappers (ISA, pension) on the projection; sequence-of-returns or Monte Carlo ranges instead of a steady rate (all out of scope for slice 2).
- Compound interest: on a laptop the results column (headline, fee, rates, chart) is taller than the screen and scrolls on its own; consider moving the chart below the columns with the yearly table.
- Car decision: the flip-point search and the sensitivity off the main thread (a worker): one flip search is a single 250 to 430 ms task in Chromium after the inputs settle (about 1 s in Node), and the sensitivity about a second of steps (`docs/performance.md`). Needs the owner's go-ahead (no worker yet).
- Chart: render the data table's rows only once it is opened; the car decision's 241-row table with a button per row makes the DOM large (Lighthouse dom-size).
- Car decision: two option cards (or two refusal notices) with the same name are regions with the same name (axe landmark-unique); number them when names repeat.
- Car decision: open the "Shared assumptions" section from the "No results yet" notice, since both values are needed before anything shows.
- Pension compare: the chart's data table is the shared Chart's own disclosure, not a Section as the brief asked; move it if the owner wants all detail in Sections. The Chart draws cliffs as shaded lettered ranges; a step line (a vertical jump at a known x) would need the engine to say where inside the range the jump lies.
- Tests: happy-dom 20.14.5 keeps every unmounted tree that held a native `<select>` alive (about 28 MB per car decision page mount, even after a garbage collection; other components leak nothing measurable). The car page's test file had reached about 1.96 GB of a worker's heap on main and was split in two in 3d-2. Upgrade happy-dom or report it upstream; until then keep page test files small.
- Car decision: the fuel or energy price threshold is a second task of about 370 ms in Node at 240 months after the other flip points; a worker would take it off the main thread with them.
- Mortgage overpayment (MO6, MO14): an `'annual'` interest method, and lump sums off payment dates. Both need a source for how a lender applies them before they are defined or built (`docs/verification-log.md`, MR-1, MR-2).
