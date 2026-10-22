# Changelog

All notable changes to Sumyard are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are 0.x: a minor bump for each merged part, a patch bump for each follow-up fix. Entries are written for the person using the app, because they also feed the in-app What's new.

## [Unreleased]

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
