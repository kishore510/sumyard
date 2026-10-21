# Modelling decisions: compound interest (slice 2)

How the compound interest engine models growth, contributions, fees and inflation where there is a choice. The decisions are the owner's, given at the start of slice 2a (21 October 2026); C9 was settled in the same session, when C2 and C6 turned out to conflict. Format as `docs/modelling-decisions.md`: each decision names the code that carries it out. Tax decisions (D, G and B series) stay in that file; this one holds the C series.

No tax figure is involved. The only constants are calendar divisors (C7) and input bounds (C8), which live outside the engine so its literal guard holds.

Code: `src/calculators/compound-interest/calc.ts` and `types.ts`. Tests: the same folder. User-facing summary: `src/calculators/compound-interest/README.md`.

## Slice 2a (engine)

### C1. Inputs

A lump sum; a regular contribution and its frequency (weekly, monthly, quarterly or annual); its timing (start or end of each period); the number of whole years; an annual contribution increase (a percentage); a nominal annual growth rate; the compounding frequency (daily, weekly, monthly, quarterly or annual); an annual fee as a percentage of the balance; and an inflation rate. Amounts are `Money`; rates are exact `Ratio`s. Type: `CompoundInputs` in `types.ts`.

The lump sum is paid at the start of year 1. The contribution increase applies once a year: every contribution in year k is the first year's contribution times (1 + increase)^(k − 1).

### C2. Rate convention

The growth rate is a **nominal annual rate r** compounded **m** times a year (`PERIODS_PER_YEAR` in `src/lib/periods.ts`, C7).

- Rate per compounding period: j = r / m.
- **Effective annual rate** (reported): EAR = (1 + j)^m − 1.
- Contributions are made **p** times a year. When p differs from m, growth runs on the contribution-period grid at the **equivalent effective rate per contribution period**: i = (1 + EAR)^(1/p) − 1 = (1 + r/m)^(m/p) − 1. Over a whole year this compounds to exactly the EAR, whatever p is.

Worked derivation, r = 6% nominal, compounded monthly (m = 12):

| Step | Formula | Value |
|---|---|---|
| Rate per month | 0.06 / 12 | 0.005 (0.5%) |
| Effective annual rate | 1.005^12 − 1 | 0.0616778118644995… (about 6.1678%) |
| Quarterly contributions (p = 4) | 1.005^(12/4) − 1 = 1.005^3 − 1 | 0.015075125 exactly (1.5075125%) |
| Weekly contributions (p = 52) | 1.005^(12/52) − 1 | 0.0011516337393842… (about 0.11516%) |
| Annual compounding (m = 1), monthly contributions (p = 12), r = 6% | 1.06^(1/12) − 1 | 0.0048675505653430… (about 0.48676%) |

When p equals m, i = j: nothing changes from the usual "rate over periods". When m is a whole multiple of p, i is a whole power of (1 + j) and exactly rational; otherwise it is a root and irrational (C9).

Functions: `effectiveAnnualRate`, `periodRate` (both return a `Ratio` within a unit in the fifteenth decimal place, for display; the projection uses the full-precision factor).

### C3. Timing

A contribution at the **start** of a period is added before that period's growth and earns it. A contribution at the **end** is added after that period's growth and fee, and earns nothing until the next period.

### C4. Fees

An annual fee **f** as a percentage of the balance, charged each compounding period at f / m **on the balance after that period's growth**. Per compounding period the balance is multiplied by (1 + r/m), then by (1 − f/m). On the contribution-period grid (C2) the equivalent factors are G = (1 + r/m)^(m/p) and F = (1 − f/m)^(m/p); for a period that opens at balance B (after any start-of-period contribution):

- growth = B × (G − 1);
- fee = B × G × (1 − F);
- the period closes at B × G × F, before any end-of-period contribution.

When p = m this is exactly the per-compounding-period rule above. When they differ, growth and fee are spread over the contribution periods at the equivalent rates, so the year's closing balance is the same as on the compounding grid; only the split between "growth" and "fees" inside a year can differ by a little. An end-of-period contribution pays no fee for that period.

Every projection is computed twice, with the fee and without it. **Fee drag** = closing balance without the fee − closing balance with it, in nominal and in real terms (`feeDrag`). Fee drag is larger than the fees paid: it includes the growth the fees would have earned.

The fee is a percentage of the balance only. Flat fees, charges on contributions and tax wrappers are out of scope.

### C5. Inflation

Real values are in **today's money** (the start of year 1). An amount at time t years (t = k / p for the k-th contribution period) is divided by (1 + π)^t, with π the inflation rate. Consequences:

- A year's real closing balance is the nominal one divided by (1 + π)^year.
- Real contributions and real fees are each payment divided by inflation to the moment it is made (a start-of-period contribution at the period's start, an end-of-period one and every fee at its end).
- Real growth is the remainder: real closing − real opening − real contributions + real fees. It includes the loss to inflation and can be negative.
- The **real rate** reported is the Fisher relation on the after-fee effective rate: (1 + EAR after fees) / (1 + π) − 1. Deflating by (1 + π)^t is the same relation applied to amounts. Subtracting the inflation rate from the growth rate is not used: the Green Book warns that adding or subtracting the two "will produce a mathematically incorrect result" (`docs/worked-examples.md`, GB-1).

The contribution increase (C1) applies to nominal contributions; the real view deflates them like every other amount.

### C6. Rounding

No intermediate rounding to the penny (C9 gives the precision). At each year end the engine holds exact cumulative figures: closing balance, contributions, fees. Output rounding, each to the nearest penny (`nearest`, halves away from zero):

- Closing balance per year, cumulative contributions per year and cumulative fees per year are rounded once each.
- A year's **contributions** and **fees** are the rounded cumulative figure less the previous year's rounded cumulative figure. So the yearly rows add up exactly to the totals, and each row is within a penny of its exact value.
- A year's **opening** balance is the previous year's rounded closing (year 1: the lump sum).
- A year's **growth** takes the penny: growth = closing − opening − contributions + fees. So every row satisfies opening + contributions + growth − fees = closing exactly, and cumulative growth = closing − lump sum − cumulative contributions + cumulative fees.
- The real view follows the same rule with its own rounded figures.
- Rates for display (`effectiveAnnualRate`, `periodRate`, the real rate) are rounded to fifteen decimal places as a `Ratio`.

The rounding steps are also listed in `docs/money.md`, "Compound interest (slice 2a)".

### C7. Calendar constants

Periods per year (weekly 52, monthly 12, quarterly 4, annual 1; daily compounding 365) live in `src/lib/periods.ts` as calendar divisors (`PERIODS_PER_YEAR`), outside the engine. They are not tax figures. A year is taken as exactly that many periods, so a "weekly" year is 364 days. There is no tax figure anywhere in the engine, and no tax-wrapper number.

### C8. Refusals and limits

`project` never returns a wrong number. It returns a typed refusal (`{ ok: false, problems }`, each problem naming the field and the reason) when:

- the years are not a whole number, are zero or negative, or are over the horizon cap (`MAX_PROJECTION_YEARS`, 100);
- an amount is negative, not a safe whole number of pence or over `MAX_INPUT_AMOUNT`;
- a rate is not a valid `Ratio`, or is beyond its bound: growth and inflation within plus or minus `GROWTH_RATE_BOUND` and `INFLATION_RATE_BOUND` (50% each), the fee from nothing to `MAX_FEE_RATE` (10%), the contribution increase from nothing to `MAX_CONTRIBUTION_INCREASE` (50%);
- a frequency or timing is not one of the choices;
- a result would pass the safe-integer range of `Money` (`'result'`, `'too-large'`).

The bounds are in `src/lib/inputLimits.ts` (input bounds, not tax figures). They are wider than any long-run average a person would type and keep every per-period factor above nothing. **Negative growth rates are allowed.** The pure helpers (`effectiveAnnualRate`, `periodRate`, `realRate`, `futureValue`) throw `EngineInputError` on the same conditions.

### C9. Arithmetic: fine fixed point (owner, slice 2a)

C2's equivalent rate is a root when m is not a whole multiple of p (weekly contributions with monthly compounding), so it is irrational and `ExactPence` cannot hold it; exact fractions over a hundred years of weekly steps would also run to tens of thousands of digits. The owner chose fixed point over a hybrid of exact and approximate paths:

- Amounts are `FinePence` and factors `Factor` (`src/lib/money.ts`): BigInt integers in units of 10^-40 of a penny (of one, for a factor). Each product or quotient is rounded to the nearest unit at that scale; powers by repeated squaring; roots by integer Newton iteration, to the nearest unit. No float anywhere.
- Error bound: a factor is within a few units of 10^-40 of its true value, so a projection of at most 5,200 periods on a balance within the safe range is within about 10^-18 of a penny of the exact result, far below the half penny that decides the one rounding at output. `docs/money.md` gives the bound and the test tolerance it justifies.
- `ExactPence` stays the type for exact rational work elsewhere (the tax engine).
