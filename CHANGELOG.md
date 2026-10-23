# Changelog

All notable changes to Sumyard are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are 0.x: a minor bump for each merged part, a patch bump for each follow-up fix. Entries are written for the person using the app, because they also feed the in-app What's new.

## [Unreleased]

## [0.27.0] - 2026-10-23

### Added
- **Mortgage overpayment**, a new calculator. Enter your mortgage (start date, balance, term left, repayment or interest-only), a fixed rate with its end date and the rate you expect after it (or switch the fixed rate off), then a **monthly overpayment** and up to ten **lump sums** by date, each shortening the term or lowering the payment. The contract boxes start empty: no made-up figures.
- Results first: **interest saved**, the **term cut**, the **new payoff date**, **total paid** and any **early repayment charge**. With a charge, the **net saving** in pounds and the **break-even** date. One **guaranteed return** of a pound overpaid for each rate period, each saying what it is measured against. A balance chart without and with overpaying, with a table, and a year-by-year table.
- An **early repayment charge** as a percentage above a penalty-free limit (a percentage of the balance or an amount), with the **allowance already used** this year and the **payments until it resets**, for a mortgage already part-way through its allowance year.
- Warnings, never hidden: over the penalty-free limit with the charge, an overpayment capped at the balance, a fixed rate past the term or already ended, and daily-interest drift.
- **What if**: a slider for the monthly overpayment, beside your inputs; **Reset what-if** and **Apply to my inputs** (with Undo). Never saved.
- Interest worked out monthly (the default) or daily, under Advanced. Scenarios, compare and a Help topic. It uses no tax rules.

## [0.26.0] - 2026-10-23

### Added
- **Internal only: the mortgage overpayment engine.** Nothing you can see in the app has changed. The behind-the-scenes calculations for the coming mortgage overpayment calculator now work out a repayment or interest-only mortgage month by month, with a fixed rate that ends and a reversion rate after it, with and without overpayments: a regular amount each month and lump sums, each either shortening the term or lowering the payment. Interest can be worked out monthly (the default) or daily. They take an early repayment charge and a penalty-free allowance from your contract, and give the interest saved, the time saved, the balance when the fixed rate ends, what a pound overpaid earns for each rate period, and with a charge the saving left after it and the month it is earned back. They are tested against exact calculations of the standard formulas; a check against a real mortgage statement is still to come. The page comes in a later release.

## [0.25.1] - 2026-10-23

### Fixed
- The tax year badge on a calculator page is read out by screen readers as it appears on screen, then "(see tax data)", instead of a different wording.
- The **Take-home pay** page's description says what its chart shows: what each pound into your pension costs in take-home, beside the comparison of your contribution now with one you choose.

## [0.25.0] - 2026-10-23

### Added
- **Household budget**, a new calculator. Enter **your pay** after tax (a month or a year) and any extra income, then what goes out in four kinds: **spending**, transfers to a **joint account**, **debt** payments and **savings and investing**. Each line is weekly, monthly, quarterly or yearly. The page starts with named blank lines (Groceries, Car insurance, Mobile and the rest) you can rename, add to and remove, with Undo. A blank amount counts as nothing.
- It shows what is **left over** and its share **of your income**, your outgoings, the **savings rate**, a bar of where your income goes and a table by kind, a **month** or a **year**. When more goes out than comes in, it says so and shows the shortfall as it is.
- **What if**: a slider for your pay and each line. The results show your inputs and the what-ifs side by side with the change. What-ifs are never saved: **Reset what-ifs** drops them, **Apply to my inputs** puts them into your inputs, with Undo.
- Scenarios, compare and a Help topic for it. It uses no tax rules.

### Fixed
- A long unbroken name no longer widens the page through an input's label.

## [0.24.0] - 2026-10-22

### Added
- **Car decision: where the difference comes from.** Under the verdict, for two options that cover the whole horizon, the difference in average cost per month owned is split into the parts each card shows (interest and fees, depreciation, fuel or energy, insurance, maintenance, VED, other costs, the opportunity cost), with a sentence naming the largest part, bars either side of a centre line, and a table. The parts add up to the difference to the penny. It uses the same two options as **What changes the answer**; choosing in either place changes both.
- **What changes the answer** now also gives the first option's **fuel or energy price** at which the order would swap, in pence per mile, and for petrol or diesel as a price per litre too.

### Fixed
- **What changes the answer** no longer stops at a point where the two options are level: past it, it names the option that is lower. Where the two are level, or pennies apart, over a narrow band, it says so.
- The **sensitivity** table can be read on a phone: figures are no longer hidden under its first column.

## [0.23.0] - 2026-10-22

### Added
- **Car decision:** a car you keep can have finance still owed on it. Turn on **Still owe finance on it?** in its Finance section and enter what the lender says you owe to clear it today, the monthly payment, how many payments are left and any final payment. Keeping then counts what a sale today would leave after clearing the finance as a sale given up, and only the interest in the payments counts as a cost.
- The card shows the **implied rate from your figures, not the lender’s APR**, the payments left and the final payment in **Money in and out**, and flags **negative equity now** when you owe more than the car is worth today. Saved scenarios and compare include the new boxes.

## [0.22.1] - 2026-10-22

### Fixed
- **Car decision:** each card lists any running costs you left empty (insurance, maintenance, VED, other costs), which count as nothing. When the options differ in which are empty, a line under the verdict says so.
- **What changes the answer** no longer says "above it, the two are level" for the savings return. It names the option that is lower below the threshold, says the two are level there, and says it can't yet tell which is lower above it.
- **The options side by side** can be read on a phone. Figures are no longer hidden under the first column, and each one reads exactly as on its card.
- Cards keep their own height instead of stretching to the tallest. The **Option** header in the low, expected and high table stays on one line.
- The bottom line leaves out **Cost of choosing the alternative** when the switch line above already gives it.
- The chart's legend no longer adds "(line)" after each option's name.
- On a phone, a long option name in the bar at the top wraps instead of widening the page.

## [0.22.0] - 2026-10-22

### Changed
- **Car decision: the answer first.** The results now open with one sentence: which option has the lowest net cost under your assumptions, how much less a month than the next, and how much over the horizon, with the savings return it uses (at nothing, tying up cash costs nothing in the comparison). Ties are stated, and when there is no answer to give (one option, fewer than two covering the whole horizon, or a PCP handed back early that costs less a month) it says why. On a phone it is in the bar at the top.
- With a **Keep current car** option, a line for each other option says what switching to it costs a month more or less than keeping, and over the horizon.
- The headline on each card is now **Average cost per month owned** (the same figure as before). Each card also names the **largest part of the cost**, and a **Money in and out** block shows the upfront cash, the monthly payment and any final payment due at the end, apart from the cost.
- Clearer labels: **What is the car worth today?** for a car you keep, and **Low, Expected and High value at the end**. An effective interest rate now says which fees it includes.

### Added
- **Bottom line**: the lowest net cost, running cost and depreciation per month owned, and what choosing the next option costs a month, each with what it measures.
- **Low, expected and high end values** side by side: each option's average cost per month owned in all three cases, and whether the lowest changes between them.

## [0.21.0] - 2026-10-22

### Changed
- **Take-home pay: compare a pension contribution.** Near the top of the results, choose a contribution to compare with yours now: type it (as an amount a year, or as a percentage if you enter your contribution that way), drag the slider, or tap **Now**, a threshold ahead of you or **Maximum**. It opens on the nearest threshold ahead. Under it you see the amount a month and a year and its share of your pensionable pay. An amount above the most Sumyard models is brought down to it, and the page says so.
- One sentence says what changes, for example how much your take-home falls and the total paid into your pension rises, a month and a year; on a phone it also sits in the bar at the top. Three cards (**Your pension contribution**, **Total paid into your pension** and **Your take-home pay**) show Now, New and Change, per month and per year, with the **% change**; your contribution also shows its **share of pay** and the change in **pts** (percentage points).
- The chart now shows **what each £1 into your pension costs**, on average from no contribution, across the whole range from nothing to the most modelled, starting from zero. Your contribution now and your target are marked, and jumps are shown as lettered ranges.
- **Milestones** list each threshold in plain words: already under it, how much more a year and a month, or out of reach and why.
- **Warnings** at the contribution you're comparing are always shown in full, with a count of any that apply elsewhere in the range; those are in a section that says the own contribution they apply to (for example "if your own contribution is between £X and £Y a year").
- The cost detail, the thresholds in detail and spendable income (only when it differs from take-home) are in sections you can open. The chart no longer follows the Year / Month choice, which now sets only the take-home figure and the breakdown.

- Replaced: the list of contributions to choose from, the Spendable / Take-home switch, **Full range**, the "Change vs now" column and the "Your contribution now and the one you are looking at" card.

## [0.20.1] - 2026-10-22

### Fixed
- **Car decision chart:** with four options, the fourth line is now drawn in its own teal pattern with a triangle marker, instead of the red used for warnings. No line on a chart is red unless it is a warning.

## [0.20.0] - 2026-10-22

### Added
- **Car decision: month by month.** Below the cards, a chart shows each option's net cost so far at the end of every month up to the end of the horizon, in the end-value case you chose, so you can see where two options' running totals cross. Each line is named at its end and drawn in its own pattern, so they can be told apart without colour. A PCP handed back early stops at the month it goes back, and the horizon and each finance term are marked. Tap the chart, use the arrow keys on it (Home and End for the first and last month), or pick a month in its table: a card under the chart shows each option's net cost so far, equity and cash out at that month. The chart has a table of every value. The month you pick isn't saved.
- **Sensitivity: what moves the answer most.** A section shows, for each option, how its net cost per month would change if the end value, your savings return, your mileage or the fuel or energy price moved 10 or 20 percent either way, one at a time with everything else as entered, with the inputs that matter most first. It is worked out when you open the section, after you stop typing.
- **What changes the answer** now works for any two options that cover the whole horizon: choose them by name. It starts with the two lowest, says when there is no crossing in range, and says the thresholds are measured over the whole horizon.
- A one-line "how to read this page" under the title.

### Changed
- **Car decision: optional costs can be left empty.** Insurance, maintenance, VED, other costs, a deposit, fees, an HP balloon and a PCP's excess mileage charge show a 0 and an empty box counts as nothing, so you no longer have to type 0 for each. Boxes an option can't do without (the price, the end values, the mileage, fuel figures, and the term and rate or payment) still hold it back, and its card lists each one. Saved scenarios load with the same figures as before.
- In the compound interest chart, the "Paid in" line is drawn in a neutral style instead of the warning colour.

### Fixed
- A long name in a chart's legend now wraps instead of widening the page.

## [0.19.0] - 2026-10-22

### Added
- **Car decision calculator.** Compare up to four ways of having a car over the same number of months: keep your current car, buy with cash, a personal loan, hire purchase or a PCP (buying the car at the end or handing it back). For each car you enter its price or current value, what it could be worth at the end in a low, expected and high case, your mileage, insurance, maintenance, vehicle tax (VED, as an amount you enter: check it on GOV.UK), other costs, and fuel or charging (petrol or diesel by miles per gallon, electric by miles per kWh with home and public charging, or your own cost per mile). Every amount starts empty.
- Each option gets a card with its **net cost per month of coverage** and the total: what you pay out, less what the car is worth at the end after anything still owed, plus what that money could have earned at your own after-tax savings return. Cards show coverage, equity at the end (with negative equity flagged), cash out, the opportunity cost and where the net cost goes. A PCP handed back early covers fewer months: it is flagged and never put in order against options that cover the whole time. Options are ordered by the lowest net cost under your assumptions, with ties stated; the page never calls one the best.
- **What changes the answer**: for the two lowest options, the end value, savings return or yearly mileage (if both cars are driven the same distance) at which their order would swap, or "no crossing in range".
- A loan, and hire purchase with no option fee, show the **APR**. A PCP, and hire purchase with an option fee, show the **effective interest rate, not the lender's APR**, because the APR rules for those aren't settled yet.
- Add, duplicate and remove options (with Undo). On a phone the cards scroll sideways; a table below has the same figures. Scenarios, export, import and compare work for it, with each option's net cost per month, total, coverage and equity side by side. It uses no tax rules. A Help topic, **Car decision**.

### Fixed
- The table under a split bar can now be scrolled sideways with the keyboard when it is wider than its space.

## [0.18.0] - 2026-10-22

### Added
- **Internal only: the car ownership costs.** Nothing you can see in the app has changed. The behind-the-scenes calculations for the coming car decision calculator can now cost up to four options over the same number of months: keep your car, buy outright, a loan, hire purchase, or PCP (buying the car at the end or handing it back). Each option's cost counts what you pay, less what the car is worth at the end after anything still owed, plus what that money could have earned in savings. They cover depreciation in a low, expected and high case, insurance, maintenance, vehicle tax as an amount you enter, fuel or charging (petrol or diesel by miles per gallon, electric by miles per kWh with home and public charging, or a cost per mile), and yearly price rises. The headline is the cost per month you have a car, so a PCP handed back early is shown apart rather than compared unfairly. They also find the points where two options cost the same: the value at the end, the savings return or the yearly mileage. Results say which option has the lowest cost under your assumptions; they never call one the best. The page comes in a later release.

## [0.17.1] - 2026-10-22

### Added
- **Internal only: the official APR.** Nothing you can see in the app has changed. The car finance calculations can now work out the APR the way the consumer credit rules define it, shown to one decimal place as those rules require. The rules were read directly this time. The existing effective rate stays as it is and is still not called APR. Some PCP and hire purchase details (whether the optional final payment and the purchase or option fee count) are not settled by the rules read, so the coming page will not show an APR for those until they are.

## [0.17.0] - 2026-10-21

### Added
- **Internal only: the car finance engine.** Nothing you can see in the app has changed. The behind-the-scenes calculations for the coming car decision calculator now work out a personal loan, hire purchase or PCP month by month: the monthly payment from a rate (or the rate from a payment), a schedule of interest and balance that adds up to the penny, the cost of credit, what you still owe at any month, and what each end of a PCP costs (buy the car, or hand it back and pay any excess mileage). They give an effective rate with fees included, but it is not labelled APR: the official APR rules could not be checked from here, so the two may differ. They are tested against HMRC's published effective-interest and hire purchase examples and against exact calculations. The page comes in a later release.

## [0.16.0] - 2026-10-21

### Added
- **Compound interest calculator.** See how a lump sum and regular contributions (weekly, monthly, quarterly or yearly, at the start or end of each period) could grow at a steady rate. Choose how often growth is compounded, add an annual fee as a percentage of the balance, let your contributions rise each year, and set inflation. You get the final balance, what you paid in, the growth and the fees. **What the fee costs** shows the balance with and without the fee (fee drag). The rates show the effective annual rate before fees, after fees and after inflation. A chart by year has a table of every value, and a year-by-year table adds up to the final balance. A switch shows everything in pounds of the day or in today's money. It is an illustration, not a forecast: returns are assumed steady. It uses no tax rules, so it shows "Uses no tax rules" where other pages show a tax year.
- Scenarios, export, import and compare work for it, with the final balance (both ways), paid in, growth, fees, fee drag and the effective annual rate side by side.
- A Help topic, **Compound interest**.

### Fixed
- A chart's "Show the data as a table" can now be scrolled sideways with the keyboard when it is wider than the screen.

## [0.15.0] - 2026-10-21

### Added
- **Internal only: the compound interest engine.** Nothing you can see in the app has changed. The behind-the-scenes calculations for the coming compound interest calculator now project a lump sum and regular contributions (weekly, monthly, quarterly or yearly, at the start or end of each period, rising each year if you like) at a growth rate compounded daily to yearly, year by year, with an annual fee as a percentage of the balance and without it, so the cost of the fee shows, and in today's money after inflation. They are tested against the Green Book's published table of growth, inflation and discounting, and against the standard formulas. The calculator page comes in the next release.

## [0.14.0] - 2026-10-21

### Added
- **Reading the pension contributions chart.** Pick a contribution to look at and see, below the chart: what each pound more into your pension costs you (against no contribution, and since the previous point), each threshold in words (already under, how much more to contribute, or out of reach and why), every warning across the contributions (annual allowance, taper, carry forward, childcare) and where it applies, and your contribution now compared with the one you picked.
- **Childcare eligibility** at the contribution you pick, on income only, with what is not checked.
- **Change vs now** in the chart's table, and a readout above the chart.
- A Help topic, **Pension contributions and the optimiser**, and a "not modelled" list in the assumptions.
- Compare now shows carry forward, the money purchase annual allowance and the childcare check.

### Changed
- The chart follows the **Year / Month** choice: in Month, figures are a month (the year divided evenly, assuming level pay) and the points step by a round amount a month.
- The chart opens on the range around your contribution now and the thresholds ahead of it; **Full range** shows everything. Markers too close together share one number.

## [0.13.0] - 2026-10-21

### Added
- **Pension contributions chart** on the take-home page, below the split bar: what you would have to spend (or take home) at each candidate contribution by your pension method, from nothing up to all of your pay. Numbered lines mark your contribution now, the most modelled and each threshold point; lettered ranges show where the line jumps, such as the Child Benefit charge's steps. A percentage contribution also shows as a share of pensionable pay. No point is called the best. With a table of every point.
- **Pension allowances** section: unused allowance carried forward from earlier years, the money purchase annual allowance, and a check of the childcare support income limits. None of them changes your take-home. Saved scenarios move to the new inputs with the same results.

### Fixed
- The footer no longer jumps while a calculator page loads.

## [0.12.0] - 2026-10-18

### Changed
- **A quicker take-home page.** Salary, bonus, where you live and the tax year are always shown; pension, benefits and deductions, student loans, Child Benefit and the tax code are in sections that show a one-line summary and open by themselves when filled in. Your take-home stays in view as you scroll: a bar at the top on a phone, a column beside the inputs on a wider screen.
- Benefits and deductions are compact cards you edit in place, and Remove has Undo.

### Added
- **Where your pay goes.** A bar splits your gross pay into tax, National Insurance, student loan, pension, benefits, deductions and take-home, with the figures as text and as a table.
- **Payslip net pay.** With a tax code, the take-home card shows your estimated payslip net pay beside your take-home after the year-end adjustment.

## [0.11.1] - 2026-10-18

### Fixed
- **PAYE estimate with benefits in kind.** The estimate now taxes the same pay as the year's tax, benefits included (as if your employer payrolls them), so it no longer comes out too low.

## [0.11.0] - 2026-10-18

### Added
- **Benefits through salary sacrifice.** Each benefit now has its value, what is taken from your pay for it, and whether that is before tax (salary sacrifice) or after tax. Salary you give up lowers your tax, National Insurance and student loan, and the benefit is taxed on the higher of its value and the salary given up. A note says some benefits keep an exemption Sumyard doesn't model.
- **Tax code and PAYE estimate.** Optionally enter your tax code to see what PAYE would take over the year with level monthly pay, beside the year's tax and the difference. K, BR, D, NT, emergency and no-allowance codes show a note instead.
- **Monthly breakdown.** Switch the breakdown between the year and a month; the monthly rows add up to your monthly take-home.

### Changed
- Scenarios you saved before open with the same take-home: each benefit keeps its amount as its value, with nothing taken from pay.

## [0.10.0] - 2026-10-18

### Added
- **Pension as a percentage.** Enter your pension contribution, and your employer's, as an amount for the year or as a percentage of your pensionable pay: your salary, or your own figure, with the bonus only if you include it. The page shows what it comes to.
- **Benefits and deductions as items.** Add each benefit in kind and each post-tax deduction as its own named item, per month or per year, with a running total for the year. A warning shows if an item has no amount, or a percentage is more than all of your pay.

### Changed
- Scenarios you saved before open as before, with the same take-home: your benefits and deductions become one yearly item each.

## [0.9.0] - 2026-10-18

### Added
- **Take-home pay, the first real calculator.** Enter your salary, bonus, pension (salary sacrifice, net pay or relief at source), student loans and children to see your take-home pay for the 2026 to 2027 tax year, by year, month and week, with a breakdown of income tax, National Insurance, student loan, pension, the Child Benefit charge and deductions. Scenarios save, load and compare as before. The pension optimiser comes next.
- **Taxable benefits in kind and post-tax deductions.** Benefits such as employer-paid medical cover are taxed but not paid in cash; deductions such as medical cover you pay for come off take-home only. See Help, “Take-home pay”.

### Changed
- The Hello placeholder calculator is gone. Any scenarios saved for it are kept in this browser but not shown.

## [0.8.0] - 2026-10-17

### Added
- **Internal only: the pension annual allowance, childcare checks and the optimiser engine.** Nothing you can see in the app has changed. The behind-the-scenes calculations now check pension savings against the annual allowance: the reduced (tapered) allowance for very high incomes, unused allowance carried forward from earlier years, the lower allowance after flexibly accessing a pension, and the tax charge on any amount over the limit, worked out the way HMRC’s manuals set out. They check whether income is under the Tax-Free Childcare and 30 hours free childcare limits, where a penny over loses the support entirely. And they can try a range of pension contributions, showing for each take-home pay, the cost of each pound of pension, the marginal rate, the contribution that brings income back under each threshold, warnings, and the cliffs where pay jumps, without calling any one of them the best. All figures are the verified 2026 to 2027 ones, tested against examples GOV.UK publishes. The optimiser page comes in a later release.
- Child Benefit for the year now has a GOV.UK source: HMRC’s published yearly amounts for 2026 to 2027 match the 52 weeks the engine counts.
## [0.7.0] - 2026-10-17

### Added
- **Internal only: pensions and the Child Benefit charge in the tax engine.** Nothing you can see in the app has changed. The behind-the-scenes take-home calculations now handle a pension contribution by salary sacrifice, through a workplace scheme that takes it before tax (net pay), or paid from take-home pay with the provider adding tax relief (relief at source), each with its own effect on income tax, National Insurance and student loan repayments as GOV.UK describes. They also work out adjusted net income, which sets the Personal Allowance taper, and the High Income Child Benefit Charge, whether Child Benefit is claimed or opted out of. All figures are the verified 2026 to 2027 ones, tested against examples GOV.UK publishes. No calculator uses them yet; the annual allowance, childcare checks and the optimiser come later.
- **Still open:** how many weeks of Child Benefit to count for 2026 to 2027 (GOV.UK’s guidance can be read as 52 or 53); until it is settled the engine counts a 52-week year and says so.

## [0.6.0] - 2026-10-17

### Added
- **Internal only: the core tax engine.** Nothing you can see in the app has changed. This release adds the behind-the-scenes calculations a later release will use for take-home pay: income tax (with the Personal Allowance taper on higher incomes, for England, Wales and Northern Ireland or for Scotland), employee National Insurance and student loan repayments, all from the verified 2026 to 2027 figures. They are tested against examples GOV.UK publishes. No calculator uses them yet, and pensions, the Child Benefit charge and childcare checks come later.

## [0.5.0] - 2026-10-17

### Added
- **2026 to 2027 tax figures, checked against GOV.UK.** All 38 figures Sumyard holds for the year are now verified: the tax year’s dates; the Personal Allowance and its taper for higher incomes; income tax bands and rates for England, Wales and Northern Ireland and for Scotland; employee and employer National Insurance (standard employee, category A); student loan plans 1, 2, 4 and 5 and the postgraduate loan; pension limits (annual allowance, its taper, carry forward, the money purchase annual allowance) and the relief-at-source rate; Child Benefit and the High Income Child Benefit Charge; and the Tax-Free Childcare and 30 hours free childcare income limits. Each shows its value, a link to the GOV.UK page it came from and the date it was checked, on the **Tax data** page.
- Two figures new to Tax data: the rate a relief-at-source pension provider adds, and the income per percentage point of the High Income Child Benefit Charge.

### Changed
- The tax year label now reads **2026 to 2027 tax year · Last verified 17 October 2026**, and Settings no longer marks 2026 to 2027 as not verified.
- Tax data shows each income tax band as its rate above the amount where it starts, on income after allowances.
- The Hello calculator’s “Show the tax year’s dates” now shows the dates instead of a “not verified” notice.
- Help: the tax data topic and Troubleshooting describe verified figures.
- **Not yet verified:** every 2026 to 2027 figure Sumyard holds is verified, but some details of **how** figures are applied are still open, for example whether National Insurance is worked out per month or per year, and how the Child Benefit charge rounds. The calculators that need them will settle each one, against GOV.UK, before they show results.
- **Not covered:** other National Insurance categories, savings and dividend income, other years, and the change to salary sacrifice from April 2029 (noted, not modelled).
- There are still no real calculators; they come in later releases.

## [0.4.0] - 2026-10-17

### Added
- **Calculators on the home page**, each with its own page and address. The first is the **Hello calculator**, a placeholder that shows how calculators will work: inputs, results, a chart, assumptions and scenarios. It uses no tax figures and goes when the first real calculator arrives.
- **Scenarios:** save a calculator’s inputs under a name, then load, rename, duplicate or delete them (with **Undo**). A calculator page shows which scenario is open and whether it has **unsaved changes**. **Save as new** keeps the original. Only the inputs are kept; results are always worked out again.
- **Scenarios** in the menu lists every saved scenario, grouped by calculator.
- **Compare** two or three scenarios of one calculator side by side, with the change from the first for each input and result.
- **Export and import:** save scenarios to a file, and import them again with a preview first. The preview shows what the file holds, what can’t be used and why, and names that match yours. Choose **Add** or **Replace**.
- **Backup and restore** in Settings: one file with your scenarios, settings and theme. Restoring shows a preview, offers to export your current data first, and replaces it only when you confirm.
- **Clear all data** in Settings removes everything Sumyard keeps in this browser, after asking. It can’t be undone.
- **Charts** with a text summary and a **Show the data as a table** option, in both themes.
- When a result needs tax figures that aren’t verified yet, the page says which ones and shows no result, with a link to Tax data.

### Changed
- The menu says “Changes are saved in this browser. Export to keep a copy.” again.
- Closing Help, Settings or another panel opened over a calculator returns you to that calculator.
- Help: Scenarios and saving, Quick start, Troubleshooting and the tax data topic describe scenarios, compare, export, import, backup and restore.
- If the browser won’t save scenarios (storage blocked or full), Sumyard keeps them until you close it and suggests exporting.

## [0.3.0] - 2026-10-17

### Added
- **Tax data:** a new page listing each tax year Sumyard has, grouped by topic: income tax, National Insurance, student loans, pensions, Child Benefit and childcare. Each group shows how many of its figures are verified, and each verified figure will show its value, a link to its GOV.UK source and the date it was checked. Open it from **About Sumyard**, **Settings** or the Help topic on tax data.
- **No tax figures yet:** every figure for 2026 to 2027 is marked **Not yet verified**. Sumyard holds the structure only; the figures are checked against GOV.UK before any calculator uses them, and a calculator will show no results while a figure it needs is unchecked.
- **Settings:** a default **Tax year** (2026 to 2027), labelled “not yet verified” while its figures are unchecked. Your existing settings carry over.
- A **“last verified” label** shows a tax year and either **Not yet verified** or the date of its latest check. It appears on the Tax data page now, and next to calculator results later.

### Changed
- The menu now says only “Changes are saved in this browser.” Export arrives with scenarios.
- Help: the tax data topic describes the Tax data page and the “last verified” label, and Quick start and Troubleshooting mention them.

### Fixed
- Tips in Help are read by screen readers as notes inside the page, not as a separate region.

## [0.2.0] - 2026-10-17

### Added
- **Menu:** the menu button in the top bar opens **Settings**, **Help and what’s new** and **About Sumyard**. **Scenarios** is listed as coming soon.
- **Help:** a Quick start and topics on saving, tax data and troubleshooting. Pages open from the bottom on a phone and from the side on a larger screen. Use the back arrow, your browser’s Back button or `Esc` to step back, and each page has its own address you can bookmark.
- **What’s new:** this list, with a **New** marker on the menu until you open it.
- **About:** the version and build, how much Sumyard stores in this browser, a **Copy details** button for reporting problems, the privacy statement, the disclaimer and credits for the open-source packages Sumyard uses.
- **Settings:** theme (the same choice as the top-bar button), a default region (England, Wales or Northern Ireland, or Scotland) and whether amounts show whole pounds or pounds and pence. No calculator uses these yet. **Reset settings to defaults** can be undone.
- **Notifications** appear at the bottom with an **Undo** button where one applies, and stay while you hover over or focus them.
- A short **Before you start** notice explains that results are illustrative, not financial advice. **Got it** hides it on this device.

### Changed
- The illustrative-not-advice disclaimer is now at the foot of every page.

## [0.1.0] - 2026-10-17

### Added
- **Sumyard is live:** a first, empty page with light and dark themes. The theme button in the top bar cycles through **System**, **Light** and **Dark**, and Sumyard remembers your choice on this device.
- The home page says what Sumyard is for, that calculators are on the way, and that its results are illustrative, not financial advice.
