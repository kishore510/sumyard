# Backlog (no slot yet)

Moved verbatim from `PLAN.md` on 21 October 2026. New ideas go here.

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
- VerifiedBadge's link has an `aria-label` that doesn't start with its visible text (Lighthouse label-in-name, best practice); name it by its text instead.
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
