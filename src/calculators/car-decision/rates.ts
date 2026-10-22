import { compare, type Ratio, ZERO } from '@/lib/money'
import { apr } from '../car-finance/calc'
import type { DatedPayment, FinanceResult } from '../car-finance/types'
import type { Acquisition } from '../car-ownership/types'

/*
 * Which rate an option's card shows, decided in one place (slice 3c-1,
 * decision F15 and docs/verification-log.md CR-10). The statutory APR is
 * verified for an agreement whose payments are all required: a loan, and HP
 * with no option to purchase fee (an HP balloon is a required payment). For
 * a PCP (its final payment is optional) and for HP with an option fee,
 * whether the APR counts them is still OPEN, so the card shows the finance
 * engine's effective rate with its label instead. Every rate is the
 * engine's: `apr` from car-finance on the agreement's own payments, or the
 * result's effective rate. Nothing is worked out here but which flows count.
 */

export const APR_LABEL = 'APR'
export const EFFECTIVE_LABEL = 'Effective interest rate, not the lender’s APR'

export type RateShown =
  | { readonly kind: 'apr'; readonly label: typeof APR_LABEL; readonly rate: Ratio }
  | {
      readonly kind: 'effective'
      readonly label: typeof EFFECTIVE_LABEL
      readonly rate: Ratio
      readonly why: string
      /** Which fees the rate includes, in words. */
      readonly fees: string
    }
  | { readonly kind: 'none'; readonly why: string }

const WHY_EFFECTIVE = {
  pcp: 'Whether a PCP’s APR assumes the optional final payment is paid is not yet verified, so this is the rate on the buy path, with every fee.',
  optionFee: 'Whether an option to purchase fee counts in the APR is not yet verified, so this is the rate with every fee.',
} as const

/** The fees the finance engine's effective rate counts: every payment of the buy path (car-finance calc, compute). */
const FEES_INCLUDED = {
  pcp: 'It includes any arrangement or documentation fee, the optional final payment and the purchase fee paid with it.',
  optionFee: 'It includes any arrangement or documentation fee, any balloon and the option to purchase fee.',
} as const

const NO_RATE = 'No rate of nothing or more fits these payments.'

/** True when the APR rules read so far settle every payment of this agreement (F15). */
export function aprVerified(acquisition: Acquisition): boolean {
  if (acquisition.kind === 'loan') return true
  if (acquisition.kind === 'hire-purchase') return compare(acquisition.finance.optionFee, ZERO) === 0
  return false
}

/** The agreement's payments for the APR (F15): an arrangement fee paid at the start at month nothing, each monthly payment, an HP balloon at the end. */
function aprPayments(acquisition: Acquisition, finance: FinanceResult): DatedPayment[] {
  const payments: DatedPayment[] = finance.schedule.rows.map((row) => ({ month: row.month, amount: row.payment }))
  if (acquisition.kind !== 'keep' && acquisition.kind !== 'cash' && acquisition.finance.arrangementFeeTiming === 'start')
    payments.unshift({ month: 0, amount: finance.arrangementFee })
  if (acquisition.kind === 'hire-purchase') payments.push({ month: finance.schedule.rows.length, amount: finance.own.finalPayment })
  return payments
}

/** The rate a finance option's card shows, and its label; null for keep and cash. */
export function rateShown(acquisition: Acquisition, finance: FinanceResult | null): RateShown | null {
  if (!finance || acquisition.kind === 'keep' || acquisition.kind === 'cash') return null
  if (aprVerified(acquisition)) {
    const outcome = apr({ drawdown: finance.amountFinanced, payments: aprPayments(acquisition, finance) })
    return outcome.ok ? { kind: 'apr', label: APR_LABEL, rate: outcome.display } : { kind: 'none', why: NO_RATE }
  }
  if (!finance.effectiveRate.ok) return { kind: 'none', why: NO_RATE }
  const which = acquisition.kind === 'pcp' ? 'pcp' : 'optionFee'
  return {
    kind: 'effective',
    label: EFFECTIVE_LABEL,
    rate: finance.effectiveRate.annual,
    why: WHY_EFFECTIVE[which],
    fees: FEES_INCLUDED[which],
  }
}
