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

## 2b: the compound interest page

Patterns from part 2b. Not owner decisions; change them with a note here.

### U13. One view for the page

A page with nominal and real figures has one Nominal / Today's money choice (in the phone bar and above the headline, the same state). It drives the headline, the rows, the chart and the table. It is never stored. Figures that have no view (rates) say what they are.

### U14. A long table below the columns

A table with a row per year goes below the two columns at full width, not in the sticky results column. It scrolls sideways in its own focusable region named by its heading, with the first column sticky, and a totals row that is the engine's totals. The shared Chart's data table also scrolls in a focusable region (0.16.0).

### U15. A calculator that uses no tax rules

It sets `taxRules: 'none'` in the registry. Its page shows `NoTaxRulesBadge` ("Uses no tax rules") where the VerifiedBadge would be, and nowhere mentions a tax year. Its scenarios carry no tax year, and the scenario list, the import preview and compare say "Uses no tax rules" instead.


## 3c-1: the car decision page

Patterns from part 3c-1. Not owner decisions; change them with a note here.

### U16. Option cards: columns from md, a snapping row on a phone

A result per option (up to four) is a card (`ResultCard` with an `h3` title, `tabIndex` 0 and a `footer` for notices and the split bar), in the order the engine gives. From `md` the cards sit in a grid (two columns; three or four from `lg`/`xl`); below `md` they are a row that scrolls sideways and snaps to each card, in a focusable region named by its heading, with a visible hint ("Scroll sideways, or move with Tab") and every card focusable, so nothing needs a swipe. The row and each card are `relative`, so screen-reader-only text in a card off to the side stays inside the row instead of widening the page. The cards go below the two columns at full width (as U14's table); the results column holds the order in words, with a "Go to the cards" button that moves focus to the row.

### U17. A table beside the cards

The same figures as the cards, a column per option in the cards' order and a row per measure, in a focusable region that scrolls sideways with the row labels sticky. It is the accessible equivalent of the cards and the quickest way to compare them on a laptop.

### U18. Inputs that start empty; one option held back at a time

(From 3c-2, an optional cost or fee reads empty as nothing: U22.) Amount, rate, decimal and whole-number inputs can be left empty (`allowEmpty`: an empty box is null, not an error), so a page can start with no made-up figures. An item that needs inputs says which on its card and its section summaries ("needs …"); a box being typed that isn't valid yet holds back only its own item (the session tracks it as `o<key>.<field>`), and boxes a choice hides (another kind, fuel type or pricing) are cleared from that list so they can't hold an item back unseen. Shared inputs hold back everything, as before. `DecimalInput` takes a plain decimal with its unit beside the box.

### U19. Slow results after the inputs settle

A result that takes long enough to stall typing (the flip-point search, about 300 ms) is worked out once the inputs have stopped changing for `SETTLE_MS`, the same wait as the sticky announcement, and says "Working out … once the inputs settle" until then. Everything else stays live. (3c-2 adds memoising by inputs and splitting work into steps: U21.)

## 3c-2: the car decision chart, readout and sensitivity

Patterns from part 3c-2. Not owner decisions; change them with a note here.

### U20. Picking a position on a chart

A chart a page reads at one x (the car decision's month) passes `onSelectX`: the plot becomes a slider (focusable, `aria-valuenow` and a value text naming the position and each line's value there, described by the summary), a tap or click picks the nearest x, the arrow keys step, Page Up and Page Down jump a tenth, Home and End go to the ends; each table row's x is a button (`aria-pressed`, 44 px). The selected x is marked across the plot and on every line, its row highlighted, and the summary ends with it. The page holds one selected x (the end of the range until one is picked), never stored; a readout below the chart shows that x's figures and says what is held fixed. Up to five line styles (colour token, dash, marker); the default order uses the four that are not the danger colour, which a series takes only by name for a genuine warning (`dangerStyle.test.ts`). Lines are named at their ends; a line may stop early (null values), with a marker saying why.

### U21. Heavy work on demand, in steps

Work that reruns an engine many times (the sensitivity view) runs only while its Section is open (`onOpenChange`), once the inputs settle, one small step at a time with a break between steps, and says "Updating" until done; its Section summary says what opening it does. Results are memoised by the engine inputs they came from, so going back to inputs already seen shows them at once. Work that can't be split without an engine change (one flip-point search) still runs as one task after the inputs settle (`docs/performance.md`).

### U22. Optional amounts read empty as nothing

An optional amount (a fee, a running cost) passes `emptyValue` (0) and a "0" placeholder to its input: an empty box is valid and is that value, the value shows as an empty box, and the hint ends "An empty box counts as nothing." Required boxes keep `allowEmpty` (null: not entered) and hold their item back, named one per line on its card.


## Compare redesign: the take-home page's pension compare (0.21.0)

Patterns from the compare redesign, from the owner's use on a phone. They replace U10 (for the optimiser: the Year / Month choice now drives only the sticky take-home figure and the breakdown) and U11 and U12 (no zoomed range, no select of points). Not owner decisions unless marked; change them with a note here.

### U23. One answer near the top: now against a target

A page that compares two values of one input (now and a target) leads with one plain sentence and three cards (your contribution, total paid into your pension, take-home), each with Now, New and Change columns and Per month, Per year and % change rows (`compareContributions`, `compare.ts`). Month and year are always shown together. "% change" (a change on the figure now) and "pts" (a change in a share of pay, percentage points) are separate rows and never share a label. Signs are written (true minus, plus), never colour only; colours stay neutral; nothing is called better or worse. The sentence is also the sticky bar's text on a phone.

### U24. A picker, not a list

The target is picked with a typed amount (or percentage, in the page's contribution mode) kept in step with a native range slider from nothing to the engine's maximum, and pills for Now, each threshold still ahead (from the engine's thresholds) and Maximum. A typed value past the maximum is clamped with a message that says so, never silently. The amount a month and a year and the share of pay are shown under it. The target is the page's state only, never stored; it opens on the nearest threshold still ahead, or on Now (saying there is nothing to compare). No dropdown of amounts. Owner decision (this session): the slider's top is the engine's `maximumContribution` (pay-bounded), not the allowance headroom; over-allowance contributions stay reachable and are warned about.

### U25. A chart of cost, over the whole range

The chart plots the engine's net cost per pound (`netCostPerPound`: spendable given up for each £1 into the pension, on average from no contribution) against the contribution, over the full sweep from nothing to the maximum, the y axis from zero (or below, if the data go there). Now and the target are marked; cliffs are lettered shaded ranges with the line dashed across them (the existing Chart spans: a jump lies somewhere inside, so it is not smoothed and not placed). The title says it is an average from no contribution, not the cost of the next pound. Owner decision (this session): the engine's measure, labelled honestly, rather than the marginal rate per step. The table is in a Section.

### U26. Milestones in words, always visible

Each threshold is one line: "Already under", "Contribute £X a year (£Y a month) more", or "Out of reach" with the reason, plus the full-charge wording for the Child Benefit charge. Measured from now. The words adjusted net income and threshold income appear here and in the detail sections, not in the main answer.

### U27. Warnings: the target's in full, the rest counted

A line always visible gives the count of warnings at the target and the count further along the range. Warnings at the target are shown in full, never collapsed (G13). Those that apply only at other contributions sit in a Section whose summary carries their count; each says the contributions it applies to by what is measured ("if your own contribution is between £X and £Y a year").

### U28. Detail behind sections

The cost-of-£1 detail, the chart's table, the milestone audit and the assumptions sit in `Section`s with live one-line summaries; no new accordion. Spendable is shown only where it differs from take-home (Child Benefit or an annual allowance charge).


## 3d-1: the car decision results, answer first (0.22.0)

Patterns from the owner's use of the car page: the results answer "which has the lowest net cost, by how much, and why" before any detail. Not owner decisions unless marked; change them with a note here.

### U29. A verdict sentence first, generated from the ranking

The results column (sticky from md) opens with one sentence from the engine's full-coverage ranking (`verdict`, `narrative.ts`): the lowest option, the gap a month and over the horizon to the next option not tied with it, and the savings return used (at nothing: "tying up cash costs nothing in this comparison"). The gap is the difference of the engine's whole-penny net costs, and a month is that difference over the horizon, rounded once to the nearest penny, as the engine rounds its own per-month figure. No verdict, with the reason, for one option, fewer than two covering the horizon, or a partial-coverage option lower per month owned: partial coverage is never compared by total. The phone bar carries a short form; the full sentence is the one polite announcement after the inputs settle. Words: never best, recommended, cheapest, cheaper, guaranteed or should; tested over every generated sentence.

### U30. Switch cost against keeping

When an option is Keep current car, each other full-coverage option gets one line: switching to it costs £X a month more or less than keeping, and the total over the horizon. Nothing without a Keep option.

### U31. A bottom line with definitions

Four rows, full coverage only, ties stated: lowest net cost, lowest running cost (fuel or energy, insurance, maintenance, VED, other), lowest depreciation, each per month owned, and the cost a month of choosing the next option. Each row carries its definition in words under it.

### U32. Low, expected and high side by side

A small table, one row per option, the average cost per month owned in each case (the case the cards show in bold), and a sentence saying whether the lowest changes between cases. It reads the one comparison's three rankings (one `compareOptions` call ranks all three cases), so it costs nothing extra and updates as you type; only the announcement waits for the inputs to settle.

### U33. Cost apart from cash; plain labels

The headline is "Average cost per month owned" (the engine's net cost per month of coverage; engine names unchanged); each card adds its largest breakdown part in neutral words. Money that changes hands (upfront cash, a monthly payment, a final payment due at the end) sits in its own block at the foot of the card, apart from the economic cost; a kept car's forgone sale is never shown as cash. Input labels are questions or plain phrases ("What is the car worth today?", "Expected value at the end", with Low and High kept); hints carry no figures. An effective rate says which fees it includes.

## 3d-1.1: car page fixes (0.22.1)

Fixes from the owner's use of the 3d-1 page. Not owner decisions unless marked.

### U34. Empty running costs said, never hidden

An optional running-cost box left empty counts as nothing (F38, U22). Each costed option's card lists any of insurance, maintenance, VED and other costs left empty ("Left empty, counted as nothing: …"). When the options differ in which boxes are empty, one line under the verdict names each option and its empty boxes. Both come from the inputs (`emptyRunningCosts`, `narrative.ts`), never from figures.

### U35. A threshold names the lower option on each side, or says it can't

"What changes the answer" names the option lower on each side of a threshold. When the engine's search stops on a tie (OQ-flip-tie), the sentence says the two are level at that threshold and that the search doesn't say which is lower above it. It never says "above it, the two are level". Since 3d-2 (F53) the search carries on past a tie, so it always names the option lower on each side, with any band between in words (U38's section, the same pair).

### U36. A side-by-side table that can be read on a phone

The sticky first column is opaque, 8rem wide, and its labels wrap. Each option's column keeps a minimum width, with its figures on one line, so every figure can be scrolled fully into view beside the first column at 360 px. Each cell shows the text its card shows for the same measure, from one function (`measures`, `CarResults.tsx`). Cards align to the top and keep their own heights. Table headers that are single words don't wrap. The bottom line leaves out "Cost of choosing the alternative" when a switch line in the verdict already gives the same pair. A chart legend names a series' kind ("bars", "line") only when bars and lines share the chart.

## 3e: finance still owed on a kept car (0.23.0)

### U37. A switch that reveals its boxes

A Keep option's Finance section holds one switch ("Still owe finance on it?", the shared `Toggle`, off by default). Its boxes appear only while it is on, directly after it, so the keyboard path is the switch, then each box in order; Space turns it on and off. The boxes are asked as plain questions with short hints that hold no figure. The section summary says "No finance owed" while the switch is off. On the card, the rate is labelled "Implied rate from your figures, not the lender’s APR" with one line saying what it is; the money in and out says how many payments are left; a settlement above today's value is a warning notice, "Negative equity now", beside the one for the horizon.

## 3d-2: thresholds and where the difference comes from (0.24.0)

### U38. Where the difference comes from: bars either way from nothing

A section in the results, under the verdict's panels (the verdict, the bottom line, the three cases) and above the order: "Where the difference comes from". It has its own two Selects ("First option", "Second option") on the same pair as "What changes the answer" (F56), and says so; choosing in either place changes both. Two generated sentences first (the difference, then its largest part, F55), then `BridgeBar` (`src/components/BridgeBar.tsx`), a small shared component built as `SplitBar` is, not a new Chart type: a row per part that differs, its label and signed figure in text with a bar under it from a centre line of nothing (right for more for the first option, left for less), the total last; token colours only (the accent above nothing, the muted text below, the text colour for the total), never the danger colour; a key in words says which side is which, so sides differ by position, sign and words as well as colour. The drawing is one image named by its title and described by a text summary of every part (those the same for both named too); **Show as a table** lists every part and the total in a focusable scroll region. Parts and the total are always shown to the penny, whatever Settings > amounts says: rounded to whole pounds one by one they would not always add up (F55); the sentences follow Settings. Bars scale with their container (a 0 to 100 viewBox), so four options with 80-character names fit at 360 px: names wrap in the sentences and the key, never in the bars. With fewer than two options covering the horizon with results, the section stays, saying which cover less and which have no results yet.

### U39. The sensitivity table on a phone

As the side-by-side table (U36): the sticky first column is opaque, 8rem wide, above the figures scrolling under it, and its labels wrap; each change keeps a minimum width on one line, so every figure can be scrolled fully into view beside it at 360 px. Each cell shows the engine's change for that input and shift, as before.

## Household budget (0.25.0)

### U40. An amount with a slider (`SliderInput`)

`src/components/inputs/SliderInput.tsx`: a `CurrencyInput` (`<id>-amount`, the source of truth: label, hint, validation) with a native range (`<id>`) under it, named "<label>, slider", saying its amount in words (`aria-valuetext`, "250 pounds per month"). The range runs from nothing to about twice the amount it was scaled from (`SLIDER_RANGE_FACTOR`), at least `SLIDER_MIN_MAX`, in about `SLIDER_STEPS` round steps (one, two or five times a power of ten, from `SLIDER_MIN_STEP`), never past the box's own limit; all exact in pence. Typing or a change from outside (a reset) rescales it; sliding does not, so the range never moves under a finger. An amount past its end shows at its end while the box keeps it; an invalid box leaves the slider at the last valid amount. At least 44 px tall, no motion. Built for the budget's what-ifs; the take-home picker and the car horizon keep their own ranges.

### U41. What-ifs over the inputs

A "What if" section holds a `SliderInput` for each amount, its hint giving the input's own amount. What-ifs are page state, keyed to each line (so adding or removing other lines keeps them), dropped on a load or a fresh start, never in a scenario. While any differs from the inputs, the sticky figure and the results show the what-if (labelled "with your what-ifs") and a table puts your inputs, the what-if and the change side by side. **Reset what-ifs** drops them; **Apply to my inputs** writes them into the inputs with Undo. Both are disabled with nothing to reset or apply; Apply also while a what-if box is invalid.

## Mortgage overpayment (0.27.0)

Patterns from M2. Not owner decisions; change them with a note here.

### U42. Sections that open when the results need them

Every input is in a section (the brief's list: your mortgage, fixed rate, overpaying, what if, early repayment charge, advanced). A section opens on load when its inputs differ from the defaults (U3) **or** when it holds a box the results still need (`sectionNeeded`), so a fresh page opens on the boxes to fill. Its summary then says "Needs …" with those boxes' names. The results column lists the boxes still needed in place of results; the sticky bar says "Enter your mortgage to see results".

### U43. Dates typed, not picked

`src/components/inputs/DateInput.tsx`: a `TextValueInput` holding an ISO date, typed as day/month/year or year-month-day (`parseDateText`, through `isIsoDate`), shown as day/month/year once the box is left, with the date in words under it. A text box, not the native date picker, so it reads the same in every browser and matches the other inputs' validation and 44 px height. Where a date becomes a payment month, the page says which payment ("Paid with the payment on 15 June 2026").

### U44. Answer first, one return per period

The sticky figure is interest saved with the term cut ("£X, 10 years 2 months sooner"; interest-only: what is owed at the end). The answer card follows the warnings: interest saved, term cut, new payoff date, total paid, the charge paid, and with a charge the net saving and break-even (a date, with its payment number). The returns card has one row per rate period, each with its dates and what it is measured against; nothing blends them. The what-if (U40, U41) is a single slider for the monthly overpayment.
