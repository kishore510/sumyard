# Changelog

All notable changes to Sumyard are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are 0.x: a minor bump for each merged part, a patch bump for each follow-up fix. Entries are written for the person using the app, because they also feed the in-app What's new.

## [Unreleased]

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
