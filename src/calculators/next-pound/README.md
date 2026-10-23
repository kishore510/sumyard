# Next pound composer

"Where does the next £X go?" The composer engine (**C1, 0.29.0, internal**): no page, registry entry or route yet (C2). Pure and client-side. Illustrative, not financial advice.

It puts one lump sum X of take-home pay, now, into a pension, a mortgage overpayment or an ISA, and shows each as what it adds to net worth at a horizon. Values are in today's money first, nominal beside it, after tax on withdrawal. It also gives the ISA return that would break even against each of the other two. Nothing is called best or recommended (G13).

The composer adds no tax rule of its own. It runs the verified engines and reads the next pound config leaves through `requireVerified`, so a page built on it shows `VerifiedBadge`, not "Uses no tax rules".

- Decisions: CP1 to CP11 in `docs/modelling-decisions.md`, "Next pound decision (session C0)". CP1 to CP10 are owner-confirmed. The readings under them are **proposed** (see below).
- Sources: NP-1 to NP-12, `docs/verification-log.md`.
- Rounding: `docs/money.md`, "Next pound decision (session C0)".

## Files

- `types.ts`: `NextPoundInputs` (X, horizon years, an "as of" date, inflation, the low, mid and high growth rates, the fee, `PensionLegInputs`, `MortgageLegInputs` or null, ISA paid this year). Also the legs (`PensionLeg`, `MortgageLeg`, `IsaLeg`), `BreakEven`, `NextPoundWarning`, `NextPoundResult`, and refusals by field (`NextPoundProblems`, `LegRefusal`).
- `calc.ts`:
  - `nextPound(inputs, config, policy)`: the result, `NextPoundProblems` (shared inputs refused by field: no legs), or the typed config `Refusal` (a leaf the composer reads is unverified).
  - Exported steps, for the cross-checks: `pensionAfterTax(pot, share, allowanceAvailable, rate)`, `accessAt(asOf, years, ageNow, schemeAge, ages)` and `breakEvenRate(X, fee, years, inflation, target)`.
- Imports (CP9, the second named exception in `CLAUDE.md`, enforced by `src/calculators/engineImports.test.ts`):
  - the public entry points of `optimiser` (`evaluateContribution`, `optimise`, `EngineInputError`; types), `mortgage` (`overpay`; types) and `compound-interest` (`project`; types);
  - `src/lib/`: `money.ts`, `calendar.ts`, `isoDate.ts`, `periods.ts`, `inputLimits.ts`, `sweep.ts`;
  - `src/config/tax/`.
- Config read (all 2026-27, verified in C0.5):
  - `pension.minimumAge.current`, `.announced` and `.announcedFrom`;
  - `pension.lumpSum.taxFreeShare` and `.allowance`;
  - `isa.annualLimit`;
  - and, only when the retirement tax rate is left to its default, the region's `incomeTax.bands`.
- Starting values in `src/lib/inputLimits.ts`: `NEXT_POUND_GROWTH_LOW`, `_MID`, `_HIGH` (2%, 5%, 8%). They are **illustrative, for the owner to set**, not market figures. Also `BREAK_EVEN_RATE_DENOMINATOR` (break-even steps of 0.01%) and `MAX_AGE_YEARS` (120). The finer scan step `NEXT_POUND_REFINE_STEP` (£10) is in `src/lib/sweep.ts`.

## How it works

- **Refusals.**
  - A shared input refused by field (X, horizon, as-of date, inflation, growth rates and their order, fee) gives no legs.
  - An unverified leaf the composer reads gives the config `Refusal`, naming it.
  - Otherwise each leg stands alone. A refusal from its engine refuses that leg only: the optimiser's unverified paths, the mortgage engine's or compound interest's problems by field, or the composer's own checks on the leg's inputs. Each comes back as a `LegRefusal` naming the engine. An optimiser `EngineInputError` is `pension.optimiser: not-accepted`; a figure past the safe range is `result: too-large`.
- **X of nothing:** every leg `nothing`, no break-even, no warnings. This is not a refusal.
- **Pension leg (CP3).** E is the largest extra contribution whose cost in spendable income stays within X. Cost is spendable at the current contribution less spendable at the current contribution plus E. Spendable is take-home with Child Benefit, less the annual allowance charge: the optimiser's own measure.
  - Cost is not monotone (HICBC steps, the childcare cliff, the allowance taper, penny effects), so the search runs in three stages:
    1. the last of `optimise()`'s sweep points within X;
    2. the last point of a finer scan, `NEXT_POUND_REFINE_STEP`, up to the next sweep point;
    3. bisection in whole pence between that point and the next scan point. Every point comes from `evaluateContribution()` (Part 1), the same evaluation `optimise()` runs.
  - The employer match is added to `savings.employerContribution` at every point above the current contribution.
  - Pension added is the difference in the optimiser's `pension.total`. The leftover cash is X less the cost.
  - At `maximumContribution` with X not used up, a `pensionAtMaximum` warning. The optimiser's warnings at the new point pass through (CP8).
- **Access (CP4, NP-3, NP-5).**
  - The horizon date is as-of plus 12 × years months.
  - The minimum age is `.announced` on and after `.announcedFrom`, else `.current`. A scheme's later age wins.
  - Accessible when the age now plus the years reaches it.
  - Not accessible gives `not-accessible`: the contribution is shown, with no value and no break-even.
  - NP-1 (transitional rules, not modelled) warns as `transitionalAgeRules` when all of these hold: the horizon is on or after the date the age rises; the normal minimum age is what blocks access; and the person could be from the age now to under the announced age on that date.
- **Pension at the horizon (CP4).**
  - `project()` grows the pension added at each growth rate with the fee, compounded once a year.
  - Tax-free part: `mulRound(pot × share, down)`, capped at the lump sum allowance (nothing when other pensions use it).
  - Tax: `mulRound((pot − tax-free) × rate, nearest)`. The rate is entered, or the rate of the band named "Basic rate" in the region's bands. If no band has that name, the leg refuses with `no-default`.
  - Value: after tax plus the leftover cash.
  - Today's money: the pot is `project()`'s real closing. After tax and the value are deflated once by (1 + inflation)^years, to the nearest penny.
- **Mortgage leg (CP5).** `overpay()` with `'reduce-term'` and one lump sum O with the first payment.
  - O is the most whose O plus its ERC stays within X, by bisection (O plus the charge rises with O).
  - Read at month k = min(12 × years + 1, term).
  - Value: the baseline balance less the overpaying balance, plus the payments freed (each month to k, the baseline payment less the overpaying one, at face value), plus the leftover cash (X − O − ERC + the part not needed).
  - The engine's warnings pass through. `guaranteed: true`: the only guaranteed leg.
- **ISA leg (CP6).** `project()` on X at each rate with the fee. A warning (`isaOverAllowance`) when paid this year plus X passes `isa.annualLimit`. It warns; it does not cap.
- **Break-even (CP7).** The highest rate on steps of 1/`BREAK_EVEN_RATE_DENOMINATOR` within ±`GROWTH_RATE_BOUND` whose ISA closing (nominal, with the fee) is at most the other leg's nominal value, by bisection.
  - `rate` and `upTo` bracket the answer.
  - Outside the bound: `above-highest` or `below-lowest`, never a number.
  - Against the pension: its value at the mid rate. None against a pension not accessible, and none with no mortgage.

## Proposed readings, built as written (owner follow-ups)

Each is named in the result's `assumptions`.

- **CP2:** every column spends X. What a leg cannot use is cash at face value, with no growth.
- **CP3:**
  - The cost search above, and the finer scan's limit: a dip in cost narrower than the scan step between two sweep points can be passed over.
  - The employer match as an input amount.
  - X under salary sacrifice or net pay.
- **CP4:**
  - Growth at the ISA's rates and fee.
  - The tax-free share rounded down and capped.
  - One retirement rate, defaulting to the "Basic rate" band.
  - The access test on whole-year ages.
- **CP5:**
  - The ERC paid in cash.
  - Freed payments at face value.
  - **Differs from the brief:** CP1's reading said the mortgage leg is read at month 12 × years from the mortgage's start. The overpayment goes in with the first payment, a month after the start, so that reading holds it one month less than the ISA. The brief's own check (break-even equal to the fixed period's `PeriodReturn.effective`) fails by about 0.2 points under it. Built as k = 12 × years + 1, so the overpayment is held whole years, as the ISA is. For the owner to confirm.
- **CP6:** an invested ISA; the starting growth rates; the allowance warning.
- **CP7:** break-even on 0.01% steps; against the pension at the mid rate.

## Tests

- `calc.test.ts`: the brief's C1 edge-case table row by row.
  - Access: the age exactly; across the date the age rises; the NP-1 warning; a scheme's age.
  - Pension: X above pay headroom; above the annual allowance (MPAA; taper, carry forward); the employer match.
  - The personal allowance taper start and end a penny either side. The HICBC step, where the test shows the cost is **not monotone** and the composer goes past the drop; no sweep point beyond it is within X.
  - The split, the cap, the default rate, and the default refusing without a "Basic rate" band.
  - Mortgage: X above the balance; ERC above the allowance; the leg less X equal to `charge.netSaving` or `interestSaved` at or past the term; zero rate; interest-only; break-even equal to `PeriodReturn.effective` within a step.
  - Zero growth; the ISA warning; break-even with no solution; X of nothing; today's money; refusals per leg by field; no clock; no "best" or "recommend"; assumptions with no figures.
  - Each leg is reproduced from its own engine: the pension from two optimiser points, the mortgage from `overpay()` rows, the ISA from `project()`.
- `fixtures/reference.ts`: an independent reference in exact BigInt fractions, sharing no code with `calc.ts` or `money.ts`.
  - Its own closed forms for growth, the deflator, the tax split, the access date and the break-even bisection.
  - The pension cost from the optimiser's own reference fixture.
  - The mortgage leg from the mortgage reference's monthly replay (single rate, monthly interest, an amount-allowance charge in year one), with its baseline checked against the closed-form balance within the rounding bound.
- `reference.test.ts`: targeted cases against the reference.
- `properties.test.ts`: 300 seeded cases against the reference, leg by leg. Also: legs never below nothing; more X never lowers the mortgage leg; today's money never above nominal with positive inflation. Growth and today's money from `project()` agree with the exact forms within a penny (fine fixed point against exact, near a half penny); the break-even within one step for the same reason.
- `crossChecks.test.ts`: `docs/next-pound-cross-checks.json`, eight cases, all `it.todo` until the owner fills them. Each names the engine cross-check it reproduces. A filled case is compared within the file's tolerance.
- `literals.test.ts`: only 0, 1, 2 and 100 in the code, and no figures in comments or strings.

## Performance

One `nextPound()` takes a median of about 22 ms in Node on the default test case (pay £60,000, X £10,000, 20 years, a 25-year mortgage), and about 65 ms with a 40-year mortgage, a charge and a 40-year horizon (`docs/performance.md`). Most of it is the optimiser's sweep and the mortgage bisection (about 30 `overpay()` runs when a charge applies). Not measured in a browser or on a phone; C2 should.

## Not modelled

The CP10 items: the Lifetime ISA, the State Pension, a partner, offset mortgages, cash savings, inheritance tax, monthly contributions. Also employer NI savings, a protected pension age or benefits already taken (NP-1), and the 2027 ISA reform (NP-4, an assumption only).
