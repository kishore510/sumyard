import type { LeafPath, TaxYearConfig } from '@/config/tax/schema'
import { type Refusal, requireVerified } from '@/config/tax/sourced'
import { MAX_TAX_CODE_LENGTH, MAX_TAX_CODE_NUMBER } from '@/lib/inputLimits'
import {
  compare,
  compareExact,
  type ExactPence,
  exact,
  exactAdd,
  exactMul,
  exactSubtract,
  type Money,
  mulRound,
  ratio,
  roundExact,
  subtract,
  toPence,
  ZERO,
} from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { EngineInputError } from './calc'
import type {
  ParsedTaxCode,
  PayeEstimate,
  PayeMonth,
  PayeNotModelled,
  PayeResult,
  Region,
  TakeHomeResult,
  TaxCode,
  TaxCodeRegime,
  TaxCodeSuffix,
  UnsupportedTaxCode,
} from './types'

/*
 * Tax codes and the PAYE estimate (decisions B11 to B13 in
 * docs/modelling-decisions.md). Pure, like calc.ts: a code's text, a year's
 * pay through payroll and a tax-year config in, the estimate out. The code's
 * allowance is its number times the config's code unit; the bands come from
 * the config (S: Scotland; C and no prefix: England, Wales and Northern
 * Ireland, which GOV.UK gives the same Welsh rates as for this tax year).
 * Level monthly pay on the cumulative basis (PAYE11090, PAYE70025): month n
 * has n twelfths of the pay, of the allowance and of each band's start; tax
 * to date is exact and rounded once to the nearest penny (D3; HMRC's tables
 * are not read). literals.test.ts holds this file to the same few numbers as
 * the rest of the engine.
 */

const SUFFIXES = ['L', 'M', 'N', 'T'] as const satisfies readonly TaxCodeSuffix[]
const PREFIXES: Record<string, TaxCodeRegime> = { '': 'rUK', S: 'scotland', C: 'wales' }

/** Markers that make a code non-cumulative (an emergency code): week 1, month 1, X, or NONCUM on a payslip. */
const EMERGENCY = /^(.+?)(W1|M1|X|NONCUM)$/

const INVALID: ParsedTaxCode = { ok: false, reason: 'invalid' }
const unsupported = (kind: UnsupportedTaxCode, text: string): ParsedTaxCode => ({ ok: false, reason: 'unsupported', kind, text })

/** A whole number written without a leading zero, within the input limit; null otherwise. */
function codeNumber(digits: string): number | null {
  if (!/^\d+$/.test(digits) || digits.startsWith('0')) return null
  const number = Number(digits)
  return Number.isSafeInteger(number) && number <= MAX_TAX_CODE_NUMBER ? number : null
}

/** A code without an emergency marker. */
function parseBase(compact: string): ParsedTaxCode {
  const prefix = /^[SC]/.test(compact) ? compact.slice(0, 1) : ''
  const rest = compact.slice(prefix.length)
  const regime = PREFIXES[prefix]!
  const suffix = rest.slice(-1) as TaxCodeSuffix
  if (rest === '0T') return unsupported('0T', compact)
  // NT has no S or C prefix (PAYE11090).
  if (rest === 'NT') return prefix === '' ? unsupported('NT', compact) : INVALID
  if (SUFFIXES.includes(suffix)) {
    const number = codeNumber(rest.slice(0, -1))
    return number === null ? INVALID : { ok: true, code: { text: compact, regime, number, suffix } }
  }
  if (rest === 'BR') return unsupported('BR', compact)
  // D0 and D1 for anyone; D2 onwards only with S, for the Scottish rates (PAYE11015). There is no D code past the eighth.
  const d = /^D(\d)$/.exec(rest)
  if (d) return d[1] === '0' || d[1] === '1' || (prefix === 'S' && d[1] !== '9') ? unsupported('D', compact) : INVALID
  if (rest.startsWith('K') && codeNumber(rest.slice(1)) !== null) return unsupported('K', compact)
  return INVALID
}

/**
 * Reads a tax code as GOV.UK defines it (What your tax code means; PAYE11015),
 * ignoring case and spaces. Supported: a number with a suffix letter L, M, N or
 * T, with an optional S or C prefix. Codes GOV.UK defines that the estimate
 * does not model (K, BR, D codes, 0T, NT and emergency codes) come back as
 * `unsupported` with their canonical text; anything else is `invalid`.
 */
export function parseTaxCode(text: string): ParsedTaxCode {
  const compact = String(text).toUpperCase().replace(/\s+/g, '')
  if (compact === '' || Array.from(compact).length > MAX_TAX_CODE_LENGTH) return INVALID
  const emergency = EMERGENCY.exec(compact)
  if (emergency) {
    const base = parseBase(emergency[1]!)
    if (base.ok) return unsupported('emergency', `${base.code.text} ${emergency[2]}`)
    if (base.reason === 'unsupported') return unsupported('emergency', `${base.text} ${emergency[2]}`)
  }
  return parseBase(compact)
}

const NOT_MODELLED: Record<UnsupportedTaxCode | 'invalid', string> = {
  K: 'K codes are not modelled: they add to taxable pay instead of giving tax-free pay, and limit the tax on each payday. No PAYE estimate is shown.',
  BR: 'BR taxes all the pay from this job at the basic rate, usually for a second job. It is not modelled, so no PAYE estimate is shown.',
  D: 'D codes tax all the pay from this job at one higher rate, usually for a second job. They are not modelled, so no PAYE estimate is shown.',
  '0T': 'This code gives no tax-free pay (the allowance is used up, or a new job is missing details). It is not modelled, so no PAYE estimate is shown.',
  NT: 'NT means no tax is taken from this pay. It is not modelled, so no PAYE estimate is shown.',
  emergency:
    'This is an emergency code: each payday is taxed on its own, not on the year so far. It is not modelled, so no PAYE estimate is shown.',
  invalid: 'This is not a tax code Sumyard recognises: a number then a letter, with S or C in front if your code has one.',
}

function notModelled(parsed: Exclude<ParsedTaxCode, { ok: true }>): PayeNotModelled {
  return parsed.reason === 'invalid'
    ? { ok: false, reason: 'invalid', kind: null, message: NOT_MODELLED.invalid }
    : { ok: false, reason: 'unsupported', kind: parsed.kind, message: NOT_MODELLED[parsed.kind] }
}

const CODE_UNIT_PATH = 'paye.codeUnit' as const
const BAND_PATHS = { rUK: 'incomeTax.bands.rUK', scotland: 'incomeTax.bands.scotland' } as const satisfies Record<Region, LeafPath>

/** The configured bands a regime uses: Wales has the England, Wales and Northern Ireland bands for this tax year (B12). */
const bandsFor = (regime: TaxCodeRegime): Region => (regime === 'scotland' ? 'scotland' : 'rUK')

const NOTHING = exact(ZERO)
const atLeastNothing = (amount: ExactPence) => (compareExact(amount, NOTHING) < 0 ? NOTHING : amount)

function assumptions(code: TaxCode): string[] {
  return [
    'PAYE estimate: level monthly pay for the whole tax year from this one job, on the cumulative basis: each month gets its share of the tax-free pay and of each band, set against pay so far.',
    'Tax-free pay is the code’s number times the amount per unit in the tax data, as GOV.UK’s guidance states. Payroll uses HMRC’s tables, which Sumyard has not read, so payslips can differ by pennies or more.',
    'Rounding: tax so far is rounded to the nearest penny each month, and each month’s tax is the change. Payroll rounding is not modelled.',
    'PAYE taxes the year’s taxable pay: pay after any salary sacrifice and net pay pension contributions, plus the taxable value of benefits in kind, spread evenly as if the employer payrolls them. If your benefits are not payrolled, your code takes them off your tax-free pay instead and this estimate counts them twice. Relief at source above the basic rate and the High Income Child Benefit Charge count only through the code.',
    'Only codes made of a number and a letter, with S or C in front, are modelled; K, BR, D, NT, emergency and no-allowance codes are not.',
    ...(code.regime === 'wales'
      ? ['A code with C in front uses the England, Wales and Northern Ireland bands: GOV.UK gives the same Welsh rates for this tax year.']
      : []),
  ]
}

/**
 * The PAYE estimate for a year's pay through payroll under a tax code, for
 * level monthly pay on the cumulative basis: each month's pay, free pay,
 * taxable pay and tax to date, and the month's tax. A code that is not
 * modelled (or not a code) gives a typed "not modelled" result; unverified
 * config values give the refusal. Throws on negative or fractional pay.
 */
export function paye(text: string, pay: Money, config: TaxYearConfig): PayeResult | PayeNotModelled | Refusal {
  toPence(pay)
  if (compare(pay, ZERO) < 0) throw new EngineInputError('pay must be zero or more')
  const parsed = parseTaxCode(text)
  if (!parsed.ok) return notModelled(parsed)
  const { code } = parsed
  const region = bandsFor(code.regime)
  const granted = requireVerified(config, [CODE_UNIT_PATH, BAND_PATHS[region]])
  if (!granted.ok) return granted
  const bands = granted.values[BAND_PATHS[region]]
  const codeAllowance = mulRound(granted.values[CODE_UNIT_PATH], ratio(code.number, 1), 'nearest')
  const months: PayeMonth[] = []
  let paidBefore = ZERO
  let taxBefore = ZERO
  for (let month = 1; month <= MONTHS_PER_YEAR; month++) {
    const share = ratio(month, MONTHS_PER_YEAR)
    const payToDate = exactMul(exact(pay), share)
    const freePayToDate = exactMul(exact(codeAllowance), share)
    const taxable = atLeastNothing(exactSubtract(payToDate, freePayToDate))
    let tax = NOTHING
    bands.forEach((band, i) => {
      const start = exactMul(exact(band.from), share)
      const next = bands[i + 1]
      let inBand = atLeastNothing(exactSubtract(taxable, start))
      if (next) {
        const width = exactMul(exact(subtract(next.from, band.from)), share)
        if (compareExact(inBand, width) > 0) inBand = width
      }
      tax = exactAdd(tax, exactMul(inBand, band.rate))
    })
    const paid = roundExact(payToDate, 'nearest')
    const taxToDate = roundExact(tax, 'nearest')
    months.push({
      month,
      pay: subtract(paid, paidBefore),
      payToDate: paid,
      freePayToDate: roundExact(freePayToDate, 'nearest'),
      taxablePayToDate: roundExact(taxable, 'nearest'),
      taxToDate,
      tax: subtract(taxToDate, taxBefore),
    })
    paidBefore = paid
    taxBefore = taxToDate
  }
  return {
    ok: true,
    taxYear: config.id,
    estimate: true,
    code,
    bands: region,
    codeAllowance,
    pay,
    months,
    total: taxBefore,
    assumptions: assumptions(code),
  }
}

/**
 * The PAYE estimate for a take-home result's taxable pay, beside the year's
 * liability (its income tax, the headline figure) and the difference: the
 * estimate less the liability.
 */
export function payeEstimate(text: string, result: TakeHomeResult, config: TaxYearConfig): PayeEstimate | PayeNotModelled | Refusal {
  if (result.taxYear !== config.id) throw new EngineInputError('the take-home result is for another tax year')
  const estimate = paye(text, result.payrollPay, config)
  if (!estimate.ok) return estimate
  const liability = result.annual.incomeTax
  return { ok: true, paye: estimate, liability, difference: subtract(estimate.total, liability) }
}
