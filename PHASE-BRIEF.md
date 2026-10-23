# PHASE-BRIEF: Where does the next £X go?

Status: **C0 (brief and decisions, docs only)** in review. Mortgage overpayment M0 to M2 are Done (0.26.0 to 0.27.2, PRs #36 to #41, deployed); the slice waits on the owner's checks (below) before `PLAN.md` marks it Done. Slices 1 to 3 and the budget are Done. Finished briefs, the mortgage slice's included, are in `docs/history/phase-brief-archive.md`.

## Docs rule

Close out every session with the tiered checklist in `CLAUDE.md` ("Session close-out checklist").

## Next pound decision

### Goal

`#/c/next-pound`, "Where does the next £X go?": one lump sum X of take-home, now, into a pension, a mortgage overpayment or an ISA, each shown as what it adds to net worth at a horizon, in today's money first and nominal beside it, after tax on withdrawal; with the ISA return that would break even against each alternative. Nothing is called best (G13). It composes verified engines and adds no tax rule of its own, but it reads tax config, so it shows `VerifiedBadge` and refuses with the unverified values named (not "Uses no tax rules"). Decisions CP1 to CP10 (owner-confirmed 23 October 2026) and this session's readings (proposed): `docs/modelling-decisions.md`, "Next pound decision (session C0)". Sources NP-1 to NP-12: `docs/verification-log.md`. Rounding: `docs/money.md`.

### Parts

- **C0, brief and decisions (this PR):** docs only. No code, config or UI.
- **C1, composer (internal, no UI), tests first: red then green.** Before the engine, and in its **own PR** (`CLAUDE.md`: each change to tax values is its own PR): config leaves for the tax-free share (NP-2), the lump sum allowance (NP-6), the access age now and its rise (NP-3, NP-5) and the ISA limit (NP-12), each a red then green pair with a Values row; NP-2 and NP-3 need the owner's call on their tax year first. Then `src/calculators/next-pound/` (`types.ts`, `calc.ts`, `README.md`, `fixtures/reference.ts`, `calc.test.ts`, `properties.test.ts`, `reference.test.ts`, `crossChecks.test.ts` on `docs/next-pound-cross-checks.json`, `literals.test.ts`), and `src/calculators/engineImports.test.ts` (CP9's spec). Starting rates for low, mid and high growth as named starting values in `src/lib/inputLimits.ts`, for the owner. Mutation spot-checks on the composer.
- **C2, page:** `definition.ts` (inputs version 1, `validateInputs`, `migrateInputs`, `summarise`, `applySettings` for the region), `NextPoundPage.tsx` from shared components (`StickyResult`, `Section`, inputs, `ResultCard`/`StatRow`, `AssumptionsPanel`, `VerifiedBadge`, `RefusalNotice`), registry and route, scenarios and compare, Help topic `next-pound`, README. Browser matrix once. No new storage key.

### Reuse (audited in C0)

- **Optimiser** (`optimiser/calc.ts`): `optimise(inputs: OptimiserInputs, config: TaxYearConfig, policy: ModellingPolicy, options?: OptimiseOptions): OptimiseResult | Refusal`. `OptimiserInputs` extends `TaxInputs` with `pension: PensionInput` (method and current contribution), `savings: PensionSavingsInput` (`employerContribution`, `carryForward`, `moneyPurchaseAnnualAllowance`) and `checkChildcare`. `OptimiseResult.points: OptimiserPoint[]`, each with `contribution`, `extra`, `spendable`, `pension.total`, `netCostPerPound: Ratio | null` (**against no contribution**, CP3), `marginalRate: Ratio | null` (since the previous point), `annualAllowance`, `warnings: EngineWarning[]`; also `maximumContribution`, `thresholds`, `cliffs`. `pointAt` in `compare.ts` runs a full sweep per contribution.
- **Mortgage** (`mortgage/calc.ts`): one entry point, `overpay(inputs: MortgageInputs): MortgageOutcome`. Its `MortgageResult` holds both schedules (`baseline`, `overpaying`: `Schedule` with `rows: MonthRow[]`, each month's `payment`, `overpayment`, `unused`, `erc`, `closing`), `balances: BalancePoint[]` (the balance at each month, both schedules), `charge: ChargeOutcome | null` (ERC paid, `netSaving`, `breakEvenMonth`), `allowances`, `returns: PeriodReturn[]` (one per rate period), `interestSaved`, `warnings`. The effect is `MortgageInputs.effect` (`'reduce-term'`); the ERC is `erc: EarlyRepaymentCharge | null` with its `allowance`.
- **Compound interest** (`compound-interest/calc.ts`): `project(inputs: CompoundInputs): CompoundOutcome`, with `lumpSum`, `years`, `growthRate`, `compounding`, `feeRate`, `inflationRate` (contributions nothing); `withFee.nominal.closing` and `withFee.real.closing`. `futureValue` throws where `project` refuses.
- **`src/lib/money.ts`**: `ExactPence` (`exact`, `exactMul`, `roundExact`), `mulRound`, `FinePence`/`Factor` (`factorPow` for the deflator), `roundRatio`, `compareRatio`. **`src/lib/inputLimits.ts`**: `MAX_INPUT_AMOUNT`, `MAX_PROJECTION_YEARS`, `GROWTH_RATE_BOUND`, `INFLATION_RATE_BOUND`, `MAX_FEE_RATE`, `MAX_MORTGAGE_TERM_MONTHS`, `MAX_CARRY_FORWARD_YEARS`.
- **Registry**: `taxRules?: 'none'` (`registry.ts`) and `NoTaxRulesBadge` are the no-tax-rules path; **not used here** (the composer reads config). The optimiser's tax-year path is the model.
- **Import rule** (CP9): `CLAUDE.md` had no "engines import only `src/lib/`" line (that was MO15, for the mortgage engine), and `car-ownership` already imports `car-finance`. `CLAUDE.md` now states the rule with both exceptions.

### Out of scope

CP10: the Lifetime ISA, the State Pension, a partner, offset mortgages, cash savings, inheritance tax, monthly contributions (`docs/backlog.md`). Also: employer NI savings (CP3), a protected pension age or benefits already taken (NP-1), the 2027 ISA reform (NP-4, an assumption only), changes to other calculators beyond a no-behaviour-change export if CP3's engine note needs one.

### Edge cases to test (C1)

| Case | Expect |
|---|---|
| Horizon before the access age | Pension column "not accessible at horizon", no number, no break-even against it; the other two shown. Exactly at the age: accessible. A horizon across 6 April 2028 uses the later age (NP-5) |
| X above the pay headroom | The pension leg stops at `maximumContribution`; the rest of X is cash in that column (CP2); a warning (CP8) |
| X above the annual allowance | The optimiser's charge lowers spendable income, so X buys less pension; its `overAllowance` (and `tapered`, carry forward) warnings pass through |
| X above the mortgage balance | Only what clears the balance is overpaid (MO8); the rest is cash; payments freed after the payoff count (CP5) |
| ERC above the allowance | Overpayment plus ERC equal X at most (CP5); the mortgage engine's `over-allowance` warning passes through; the leg less X equals `charge.netSaving` at a horizon at or past the term |
| Zero growth | ISA = X less fees; pension = its ratio to the ISA times that; break-even against the mortgage at its own rate |
| Zero-rate mortgage | Leg = the overpayment plus any cash; break-even ISA return is the one whose growth after the fee is nothing |
| Interest-only mortgage | Effect ignored (MO5); the lower interest payments up to the horizon count as freed payments |
| X of nothing | Every column nothing, no break-even, no warnings; not a refusal |
| Break-even with no solution within `GROWTH_RATE_BOUND` | "Above the highest rate modelled" or "below the lowest", no number (CP7) |
| Taper zone start and end | Pay a penny either side of where the personal allowance taper starts and ends: the cost of the pension leg moves as the optimiser's points say |
| HICBC step | X whose contribution lands either side of a HICBC step: the composer takes the most pension within X (CP3); the cost is not monotone and the test says so |
| Also | Reproduce each leg from its own engine (the pension's cost from two optimiser points, the mortgage leg from `overpay()` rows, the ISA from `project()`); with no ERC, monthly interest, the horizon inside the fixed period and no payoff, the break-even against the mortgage equals its fixed-period `PeriodReturn.effective` within rounding; today's money never above nominal with positive inflation; a refusal from any engine refuses that leg by field |

### Cross-check plan

- **Independent reference (C1):** `next-pound/fixtures/reference.ts` in exact rational arithmetic (BigInt fractions): a lump sum grown at a rate less a fee by its own closed form, the tax split, the deflator, and the break-even by its own bisection; the pension cost from two calls of the optimiser's own reference (`optimiser/fixtures/reference.ts`), the mortgage leg from a closed-form balance after k months (as `mortgage/fixtures/reference.ts`). Seeded cases, as the other engines.
- **Documents (owner to supply):** `docs/next-pound-cross-checks.json` holds eight todo cases, each naming the engine cross-check it reproduces (`docs/hmrc-cross-checks.json`, `docs/mortgage-cross-checks.json`, `docs/compound-cross-checks.json`). The repository is public: figures only, no identifiers.

## Still with the owner (follow-ups; slices 1 to 3 and the budget are Done)

Next pound decision (C0): confirm the readings proposed under CP1 to CP9 (`docs/open-questions.md`, "Next pound decision"), in particular CP3's correction (net cost per £1 is measured from no contribution), CP5's ERC and freed payments, CP4's pension growth, lump sum allowance and default rate, CP7's break-even against the pension, and CP9's second exception (car ownership on car finance); decide whether a current GOV.UK guide is enough for the tax-free share and the access age as config leaves (NP-2, NP-3, no tax year named); confirm that the new leaves go in their own PR before C1's engine.

Mortgage overpayment (M2): confirm MO16 and the M2 page readings (`docs/open-questions.md`); fill `docs/mortgage-cross-checks.json` from a statement or illustration (settles MR-1, MR-2 and MR-4); check the page on a real phone, in Safari and with a screen reader; then the slice is marked Done in `PLAN.md`.


Household budget (0.25.0): confirm BD8 (savings rate excludes what is left over), BD9 (`MAX_BUDGET_LINES` = 40 per list), the template lines' periods (Fixed saver monthly), the shared `Field` label now wrapping anywhere.

Confirm the benefit value from an annual statement (B1) and run the payslip check (B15: PAYE estimate, salary sacrifice benefits, the monthly breakdown); the 72 HMRC cross-checks; Tables A and B to D for the PAYE estimate (O10, O11); confirm `paye.codeUnit` as a standing rule; whether a benefit that attracts Class 1 needs its own input. Slice 2: fill `docs/compound-cross-checks.json` (eight cases, with source and date); confirm the C8 rate bounds and the starting years (`DEFAULT_PROJECTION_YEARS`).

Slice 3a: confirm decisions F5 to F14 and the bounds (`src/calculators/car-finance/README.md`); confirm F15 (one decimal place, the drawdown, an added fee as a charge) and settle CR-10 (a PCP's optional final payment, purchase and option fees in the APR) from a source before any page shows an APR for PCP or HP with an option fee; decide whether the hand-back path should also take condition charges. Slice 3b: confirm F24 to F31 (`src/calculators/car-ownership/README.md`); F18's two readings and the bounds were confirmed at the start of 3c-1; confirm litres per gallon from legislation.gov.uk (CO-1). Slice 3c-1: fill `docs/car-cross-checks.json` (six cases: a spreadsheet, or a real dealer quote for the payment; source and date) and `docs/compound-cross-checks.json`; spot-check the litres per gallon line in a fuel cost per mile; confirm the page decisions F32 to F37 (`DEFAULT_HORIZON_MONTHS` = 48 accepted at the start of 3c-2); check the page on a real phone. Slice 3c-2: confirm the page decisions F38 to F42 (optional boxes read as nothing, the chart, the selected month, the sensitivity's shifts, any pair); whether to move the flip search and the sensitivity to a worker (one flip search is a 250 to 430 ms task after the inputs settle, `docs/performance.md`); check the chart and its selection on a real phone and with a screen reader.

Car results redesign (3d-1): confirm U29 to U33, the verdict's wording and the per-month gap (the total difference over the horizon, rounded once); confirm U34 to U36 (OQ-flip-tie was closed in 3d-2, F53; the monthly penny drift was accepted as it is in 3e, F52); check the page on a real phone and with a screen reader.

Finance on a kept car (3e): confirm F43 to F52 as built (the refusal of a final payment above the settlement and of no payments left even with no monthly payment, F50; the implied rate through `hirePurchase`, F45); check the page against a real lender statement and settlement quote; on a real phone and with a screen reader.

Thresholds and the cost bridge (3d-2): confirm F53 to F56 as built (the band said as "about", level or pennies apart; equity handed back as a bridge part; "Most of the difference" only past half and on the total's side; the bridge in pence whatever Settings shows; the bridge's own Selects sharing the pair); check the bridge on a real phone and with a screen reader.

Compare redesign (1b-iii): confirm U24's maximum (the engine's, pay-bounded) and U25's chart measure (net cost per pound, an average from no contribution); check the page on a real phone, with Safari and with a screen reader.

## Last session

- 23 October 2026, C0 (docs only): pre-check (PR #41 merged, Pages deploy green; mortgage M0 to M2 Done, slice row In progress). Reuse audit of `optimise()`, `overpay()`, `project()`, `money.ts`, `inputLimits.ts`, the registry.
- GOV.UK: NP-1 to NP-12 (access age and its rise, tax-free share and lump sum allowance, tax on the rest, ISA limit and tax-free growth, the 2027 ISA reform); OPEN: NP-1 to NP-4.
- CP1 to CP10 recorded with proposed readings; rounding per step; `CLAUDE.md` import rule (CP9); cross-check placeholder; `PLAN.md` rows, the rest Parked (`docs/backlog.md`).
- Not verified: any figure against a real statement or illustration; the NMPA legislation itself (legislation.gov.uk not read); whether GOV.UK search missed a page naming the tax-free share's tax year.

## Next

- Owner: confirm the C0 readings and NP-2/NP-3's tax-year question (above); fill `docs/next-pound-cross-checks.json` when documents are to hand.
- C1 pre-check: confirm C0 merged and mark C0 Done in `PLAN.md` with its PR number; then the config PR (leaves, verification rows), then the composer.
- Mortgage slice: the owner's checks above, then Done in `PLAN.md`. CR-10 (car finance) stays open.

Full history (progress logs, finished part scopes, slice archives): `docs/history/` (grep it, don't read it whole).
