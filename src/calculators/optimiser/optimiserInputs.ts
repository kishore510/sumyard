import type { TaxYearConfig } from '@/config/tax/schema'
import { type Refusal, requireVerified } from '@/config/tax/sourced'
import { add } from '@/lib/money'
import { MAX_SWEEP_POINTS, pageSweepStep } from '@/lib/sweep'
import type { BreakdownPeriod } from './breakdown'
import { EngineInputError, optimise } from './calc'
import { type InputProblem, type OptimiserPageInputs, resolveInputs, toTaxInputs } from './definition'
import { DEFAULT_POLICY, type OptimiseResult, type OptimiserInputs } from './types'

/*
 * The take-home page's inputs mapped to optimise()'s (part 1b-ii-a): the
 * take-home inputs (toTaxInputs) with the pension always passed, by the
 * method and at the resolved current contribution (nothing for none, since
 * the sweep needs the method either way), the savings for the annual
 * allowance (the resolved employer contribution, carry forward and the money
 * purchase flag) and the childcare check. Pure, and no tax figure: the
 * sweep step is a display choice from src/lib/sweep.ts.
 */

export function toOptimiserInputs(inputs: OptimiserPageInputs): OptimiserInputs {
  const resolved = resolveInputs(inputs)
  return {
    ...toTaxInputs(inputs),
    pension: { method: inputs.pensionMethod, contribution: resolved.employeeContribution },
    savings: {
      employerContribution: resolved.employerContribution,
      carryForward: inputs.carryForward.map((year) => ({ yearsAgo: year.yearsAgo, amount: year.amount })),
      moneyPurchaseAnnualAllowance: inputs.moneyPurchaseAnnualAllowance,
    },
    checkChildcare: inputs.checkChildcare,
  }
}

export type OptimiserPageResult = OptimiseResult | Refusal | InputProblem

/**
 * The sweep for the page: optimise() at the page's step (gross pay bounds the
 * range), its refusal, or the take-home page's input problem when the
 * contribution is above pay. Never throws on valid inputs. In the month view
 * the step is a round amount a month (1b-ii-b).
 */
export function calculateOptimise(
  inputs: OptimiserPageInputs,
  config: TaxYearConfig,
  period: BreakdownPeriod = 'year',
): OptimiserPageResult {
  const step = pageSweepStep(add(inputs.salary, inputs.bonus), period)
  try {
    return optimise(toOptimiserInputs(inputs), config, DEFAULT_POLICY, { step, maxPoints: MAX_SWEEP_POINTS })
  } catch (error) {
    if (error instanceof EngineInputError)
      return { ok: false, problem: 'The pension contribution, with any salary given up for benefits, is more than your pay.' }
    throw error
  }
}

/** How many earlier tax years carry forward looks back, from the year's config; null when that value is not verified. */
export function carryForwardYears(config: TaxYearConfig): number | null {
  const granted = requireVerified(config, ['pension.carryForward.yearsBack'])
  return granted.ok ? granted.values['pension.carryForward.yearsBack'] : null
}
