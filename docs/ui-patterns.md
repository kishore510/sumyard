# UI patterns

Page-layout decisions for calculator pages. They are about how a page shows its inputs and results, not tax rules (those are in `docs/modelling-decisions.md`). The take-home page (`#/c/optimiser`) adopted them in 0.12.0; new calculator pages follow them (`CLAUDE.md`).

## 0.12.0: the take-home page redesign (owner decisions, UI only)

No engine, config, input shape, `inputsVersion`, saved scenario or compare change. Every input and result from 0.11.1 stays.

### U1. Essentials visible, the rest in sections

- "Your pay" is always visible: Salary, Bonus, Where you live and Tax year.
- Everything else is a section card (`src/components/Section.tsx`), in this order: Pension, Benefits and deductions, Student loans, Child Benefit, Tax code.
- A section's header is a native button inside a heading, with `aria-expanded` and `aria-controls`, at least the touch target tall, whose accessible name is its visible text (the title, then the summary), so it matches what voice control users see. No motion of its own (so nothing for reduced motion to stop).
- A closed section keeps its inputs mounted (hidden), so typed text and the page's "fix this input" state survive closing it.

### U2. Live one-line summaries

Each section header shows a one-line summary of its inputs, or "Not set" when they are all at their defaults. The summary is built from the same resolved amounts the engine receives (`resolveInputs`), formatted with `src/lib/format.ts`; page code writes no tax figure (`src/calculators/optimiser/sections.ts`). A section holding an input that isn't valid yet says so in its summary instead.

### U3. Which sections are open

A section opens on load when any of its inputs differs from the calculator's defaults; the others start closed. The open and closed state is held by the page only: no new storage key, and it resets on every visit. Loading a scenario (or starting new) recomputes it, so a scenario opens with its own sections open.

### U4. Results first, always in view

- Phone (below `md`): a compact sticky bar under the page title shows take-home for the chosen period (a Year / Month choice) and the tax-year badge. Once scrolled past its own height it collapses to one line, a button that expands it on tap; back at the top it is full again. The collapse uses hysteresis (it stays collapsed until the bar's resting place is back in view), so the layout shift of collapsing cannot make it flicker.
- Width `md` and up: two columns. Inputs on the left (scenario bar at the top), results on the right, sticky, scrolling on their own when taller than the screen. The phone bar is not shown.
- One period for the page: the bar's Year / Month and the breakdown's are the same choice.
- The page sets `scroll-padding-top` from the bar's measured height (`--sy-sticky-offset`, a runtime value, not a design token), so a focused field is never hidden behind the bar.

### U5. Announcements

The sticky figure is not a live region. One polite status region announces take-home once the inputs have settled (no change for `SETTLE_MS`, in `src/components/StickyResult.tsx`), never on each keystroke. The per-keystroke live regions beside inputs (resolved contributions, list totals) are removed for the same reason; their text stays on the page.

### U6. Results, top to bottom

Warnings; take-home headline (for the chosen period, with the year, month and week rows); a split bar of where gross pay goes; the breakdown (Year / Month); the PAYE card; "Alongside your pay". The assumptions panel follows the two columns.

### U7. The split bar

One horizontal bar of gross pay for the chosen period, split into income tax, National Insurance, student loan, employee pension, the Child Benefit charge, benefits given up (salary given up plus payments after tax), post-tax deductions and take-home, which add up to gross pay (the breakdown's rows). The shared `Chart` draws bars and lines over categories and has no stacked bar, so a small `SplitBar` (`src/components/SplitBar.tsx`) is built the same way: hand-rolled SVG, token colour classes only (solid fills and token-stroked hatching, with gaps between parts), a text summary, a legend, a data table, re-rendered on theme change. A part below nothing (take-home below nothing) cannot be drawn: the bar says so and keeps the summary and table.

### U8. Two net pay lines with a tax code

With a supported tax code, the take-home card shows "Estimated payslip net pay" (take-home with the PAYE estimate in place of the year's income tax; for a month, the first month's PAYE) and "Take-home after the year-end adjustment" (the year's liability, the existing take-home), with one sentence of explanation and no figures. Without a code, or with one not modelled, one take-home line as before. Both are sums of existing engine outputs (`src/calculators/optimiser/results.ts`). Only income tax is swapped: the Child Benefit charge and a relief at source contribution stay in both lines (see `docs/open-questions.md`).

### U9. Item cards

Benefit and deduction items keep their fields, in a compact card: a header line with the name and its resolved amounts, Edit (in place, `aria-expanded`) and Remove. A new item opens for editing with its name box focused; items in a loaded scenario start folded; an item with an input to fix stays open. Remove shows a toast with Undo, which puts the item back where it was, unless the list has since changed from outside (a scenario loaded or started new) or is full, when Undo says so and does nothing. Monthly, yearly and percentage entry are unchanged.

## 1b-ii-b: reading the optimiser chart

Patterns from part 1b-ii-b, for any later chart of candidates. Not owner decisions; change them with a note here.

### U10. One period for the page

The page's Year / Month choice drives every figure below it, the chart and its table included. A month is the year's figure divided by `MONTHS_PER_YEAR` to the nearest penny (`perPeriod`), and the page says it assumes level pay. Year-only measures (adjusted net income, the limits it is checked against) stay for the year and say so.

### U11. A range that shows what matters, and the whole on request

A chart of candidates opens on the range around the current value and the thresholds ahead of it, with a margin; a **Full range** switch shows everything, and the page says which is shown. Warnings are never limited to the range shown.

### U12. One chosen point

A select of the points shown picks one point (the current value until another is chosen; never stored). It is read out above the chart, highlighted on the line and in the table, and is what the cards below measure; the table's "Change vs now" column compares every point with now. No point is called the best.
