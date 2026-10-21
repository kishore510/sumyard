import type { Money, Ratio } from '@/lib/money'
import type { ContributionFrequency, Frequency } from '@/lib/periods'
import type { CompoundInputs, CompoundOutcome, CompoundProblem, FeeDrag, Views } from './types'

/*
 * The compound interest engine (slice 2a). Stubs for the red commit.
 */

export class EngineInputError extends RangeError {
  override name = 'EngineInputError'
}

const NOT_YET = (): never => {
  throw new Error('not implemented')
}

export function checkInputs(_inputs: CompoundInputs): readonly CompoundProblem[] {
  return NOT_YET()
}

export function effectiveAnnualRate(_growthRate: Ratio, _compounding: Frequency): Ratio {
  return NOT_YET()
}

export function periodRate(_growthRate: Ratio, _compounding: Frequency, _contributionFrequency: ContributionFrequency): Ratio {
  return NOT_YET()
}

export function realRate(_nominalEffective: Ratio, _inflationRate: Ratio): Ratio {
  return NOT_YET()
}

export function project(_inputs: CompoundInputs): CompoundOutcome {
  return NOT_YET()
}

export function futureValue(_inputs: CompoundInputs): Money {
  return NOT_YET()
}

export function feeDrag(_withFee: Views, _noFee: Views): FeeDrag {
  return NOT_YET()
}
