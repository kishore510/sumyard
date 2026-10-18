---
title: Take-home pay
order: 2
summary: What the take-home calculator works out, what it doesn't yet, and how to enter pension percentages, benefits, deductions and your tax code.
---
The **Take-home pay** calculator works out your pay after tax for one tax year, from your salary, bonus, pension, student loans, benefits from your job and Child Benefit. It is the first part of the pension optimiser.

## What it does

- Works out income tax (with the personal allowance taper), employee National Insurance, student loan repayments, your pension contribution, the High Income Child Benefit Charge and any post-tax deductions, and shows what is left.
- Shows take-home for the year, a month and a week, with a breakdown that adds up to the take-home figure. Switch the breakdown between **Year** and **Month**: each monthly row is the yearly one divided by the months, to the nearest penny, and monthly take-home is those rows added up, so it can be a penny or two from the year's take-home divided evenly (the page says when).
- With your tax code, shows a **PAYE estimate**: what payroll would take over the year on that code, beside the year's tax and the difference.
- Handles the three pension methods: **salary sacrifice**, the **net pay arrangement** and **relief at source**. Each changes tax, National Insurance and student loan differently.
- Takes your pension contribution, and your employer's, as an amount for the year or as a percentage of your pensionable pay.
- Takes benefits in kind and post-tax deductions as lists of named items, each per month or per year.
- Uses the rates for England, Wales and Northern Ireland, or for Scotland. Your default region and tax year come from [Settings](sheet:settings).
- Saves your inputs as scenarios, so you can compare two or three. See [Scenarios and saving](help:scenarios-and-saving).

## What it doesn't do yet

- **The pension optimiser is coming in the next release**: a chart of take-home against pension contribution, the contributions that bring you under each threshold, and the annual allowance. This version works out one contribution at a time.
- It doesn't work out each payslip: the PAYE estimate assumes the same pay every month. See below.
- Employment income only: no savings, dividends, property or self-employment income.

## Annual figures, not payslips

Everything is worked out for the whole tax year. The monthly and weekly figures are the annual ones divided evenly. The year's tax is the headline figure, however it is collected. Payroll works per pay period with your tax code, so your payslips can differ, especially in a month with a bonus, or when student loan or National Insurance thresholds fall differently in one month.

## Pension as a percentage

Choose **Percentage** under a contribution to enter it as a percentage of your **pensionable pay**. Pensionable pay is your salary unless you switch on **Enter my own pensionable pay** and type the figure your scheme uses. The bonus counts only if you switch on **Include the bonus**. The page shows what the percentage comes to for the year, rounded to the nearest penny; your scheme may round differently, so a payslip can differ by a penny. A percentage over all of your pensionable pay gives a warning.

## Entering flex cash, benefits and deductions

- **Flexible-benefit cash** (money your employer pays you in place of benefits you don't take): add it to **Salary**. It is taxed as pay.
- **Benefits in kind**: add one item for each benefit, with a name, its **value**, what is **taken from your pay** for it, **how** it is taken, and whether the amounts are per month or per year. A monthly amount counts for every month of the year, assumed level. The value is the benefit's value as your employer works it out, such as the cost of medical cover, before anything you pay towards it. Each item shows its taxable amount for the year, and the list shows the totals.
  - **Nothing taken**: your employer pays for it. The value is added to your taxable income for tax, the personal allowance taper and the Child Benefit charge, but not for National Insurance or student loan, and it is not paid to you in cash.
  - **Before tax (salary sacrifice)**: the salary you give up comes off your pay before income tax, National Insurance and student loan, and the benefit is taxed on whichever is higher, its value or the salary given up. This is HMRC's general rule. Some benefits keep a tax exemption or a different value through salary sacrifice (pension contributions and advice, some childcare, cycle to work, low-emission cars); Sumyard doesn't model those and shows a note. Enter pension contributions under pension, not here.
  - **After tax**: what you pay comes off your take-home and lowers the benefit's taxable value, but not below nothing. It is assumed paid in time to count for the tax year.
  - If your employer reimburses you, or pays a contract that is in your own name, that counts as pay: add it to **Salary** instead.
- **Post-tax deductions**: one item each, in the same way: amounts taken from your pay after tax that have no tax effect, such as medical or dental cover you pay for yourself through payroll. They lower your take-home and nothing else.

- Each list holds a limited number of items, and each name a limited length; the page says when you reach either. An item with no amount gives a warning, as it adds nothing.
- Scenarios saved before benefits had a value and an amount taken open with each benefit's amount as its value and nothing taken, and give the same take-home. Older ones still open with each figure as one yearly item.

## Tax code and the PAYE estimate

The tax code is optional; it is on your payslip or in the HMRC app. Type it as shown, for example a number then a letter, with S or C in front if yours has one. Sumyard models codes made of a number and the letter L, M, N or T, with or without S (Scottish rates) or C (Welsh rates). K codes, BR, the D codes, NT, the no-allowance code and emergency codes (ending W1, M1, X or NONCUM) show a note and no estimate.

The estimate assumes the same pay every month for the whole year from this job, on the usual cumulative basis: each month gets its share of your tax-free pay and of each tax band. Benefits in kind count only through your code. It doesn't use HMRC's payroll tables, so payroll can differ by pennies or more. If the code's S or C doesn't match where you live, the page says so.

A difference between the estimate and the year's tax may be refunded or collected later: HMRC can change your tax code, or settle it after the year ends, by letter or through Self Assessment if you send a return.

> If the take-home figure doesn't match your payslips over the year, check the benefits value against your employer's annual statement of benefits.
