# Money, rounding and formatting

Code: `src/lib/money.ts` (arithmetic) and `src/lib/format.ts` (display). Both are tested in `money.test.ts` and `format.test.ts`, including boundary and negative cases.

## Decision (slice 0.5, session C)

**Money is integer pence**, a JavaScript `number` branded as `Money`, always a safe integer (up to about £90 trillion either way). No decimal library: every amount Sumyard handles fits, rates are exact `Ratio`s of integers, and no dependency is added.

- Make amounts with `fromPence(n)` or `fromPounds(x)`. `fromPounds` takes a safe whole number of pounds, or a string of digits with at most two decimal places (`"12"`, `"12.3"`, `"-0.05"`). It rejects anything else (commas, a `£`, more decimals) instead of rounding: parsing what a person types belongs to the input components (session D).
- `add`, `subtract`, `compare`, `min`, `max`, `mulRound`, `roundToPounds`. Every operation checks that its inputs are safe integers (a cast can forge a `Money`) and that its result is, and throws `MoneyError` otherwise. Nothing silently loses precision.
- **Rates are `Ratio`s** (`{ numerator, denominator }`, safe integers, denominator above zero), made with `ratio(n, d)` or `percent("7.5")` (75 / 1000). There is no float factor anywhere.
- `mulRound(amount, factor, mode)` multiplies in `BigInt` and rounds once, to whole pence, by an explicit mode.
- `toPence(amount)` gives the plain integer, for storage or display code.

**Rule:** no float arithmetic on amounts outside `money.ts` (and `format.ts`, which uses the same integer helpers). Calculators add, compare and multiply only through these functions.

## Rounding modes

| Mode | Meaning | Negative amounts |
|---|---|---|
| `nearest` | The nearer penny. An exact half goes **away from zero**. | Symmetric: `nearest(-x) = -nearest(x)`. |
| `down` | Towards minus infinity (floor). | -2.5p rounds to -3p. |
| `up` | Towards plus infinity (ceiling). | -2.5p rounds to -2p. |

`roundToPounds(amount, mode)` rounds to a multiple of 100 pence with the same modes.

## Rounding per calculation: to be verified in slice 1a

**The mode each tax step needs is not assumed here.** Slice 1a checks each against GOV.UK or HMRC guidance, records the source in `docs/verification-log.md`, and fills in this table. Until then, no calculator rounds a tax figure.

| Step | Mode | Unit | Source |
|---|---|---|---|
| Income before tax is worked out | To verify in 1a | To verify | — |
| Income tax due | To verify in 1a | To verify | — |
| National Insurance (per pay period or annual) | To verify in 1a | To verify | — |
| Student loan repayments | To verify in 1a | To verify | — |
| Personal allowance taper | To verify in 1a | To verify | — |
| High Income Child Benefit Charge | To verify in 1a | To verify | — |
| Pension tax relief and annual allowance taper | To verify in 1a | To verify | — |

If a step's guidance rounds negative amounts differently (for example towards zero rather than towards minus infinity), 1a adds a mode rather than reuse one that does not match.

## Display (`format.ts`)

Locale en-GB. Formatting works from integer pence in `BigInt`, never by dividing a float, so the digits are exact at any size. **Display rounding is nearest, halves away from zero**; it is for showing results and is not a tax rule.

| Function | Example | Notes |
|---|---|---|
| `formatGBP(amount, 'pence')` | `£1,234.56`, `-£0.05` | The Settings choice “Pounds and pence”. |
| `formatGBP(amount, 'pounds')` | `£1,235` | “Whole pounds”. Never `-£0`. |
| `formatGBPCompact(amount)` | `£950`, `£1.2k`, `£12k`, `£1.5m`, `£3bn` | For chart axes later. One decimal below ten of a unit, none from ten up; moves up a unit when rounding reaches a thousand. |
| `formatPercent(ratio, maxDecimals = 2)` | `7%`, `7.5%`, `33.33%` | Trailing zeros dropped; never `-0%`. |
| `formatIsoDate('2098-01-02')` | `2 January 2098` | The same in every time zone. |

Callers pass the amount style from Settings (`settingsStore`); `format.ts` reads no store.
