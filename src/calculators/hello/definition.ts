import { formatGBP, formatPercent } from '@/lib/format'
import { fromPence, type Money } from '@/lib/money'
import { isCanonicalPercent, percentRatio } from '@/lib/parse'
import { isRecord } from '@/lib/validate'
import { type CalculatorDefinition, defineCalculator, type SummaryRow } from '../registry'
import { CHART_STYLES, calculateHello, HELLO_LIMITS, type HelloInputs, ROUNDING_MODES } from './calc'

/* The Hello placeholder's registry entry: defaults, validation and the compare summary. */

export const ROUNDING_LABELS: Record<HelloInputs['rounding'], string> = { nearest: 'Nearest penny', down: 'Down', up: 'Up' }

const PERCENT_LIMITS = { min: HELLO_LIMITS.minPercent, max: HELLO_LIMITS.maxPercent, maxDecimals: 2 }

function validate(raw: unknown): { ok: true; inputs: HelloInputs } | { ok: false; errors: string[] } {
  if (!isRecord(raw)) return { ok: false, errors: ['Inputs are not an object.'] }
  const errors: string[] = []
  const { amount, percent, rounding, steps, chart, referenceLine, useTaxYearDates } = raw
  const amountOk =
    typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= HELLO_LIMITS.minAmount && amount <= HELLO_LIMITS.maxAmount
  if (!amountOk)
    errors.push(
      `The amount must be whole pence from ${formatGBP(HELLO_LIMITS.minAmount, 'pence')} to ${formatGBP(HELLO_LIMITS.maxAmount, 'pence')}.`,
    )
  if (!isCanonicalPercent(percent, PERCENT_LIMITS))
    errors.push(
      `The percentage must be from ${formatPercent(HELLO_LIMITS.minPercent)} to ${formatPercent(HELLO_LIMITS.maxPercent)}, with at most two decimals.`,
    )
  if (!ROUNDING_MODES.includes(rounding as HelloInputs['rounding'])) errors.push('The rounding must be nearest, down or up.')
  if (typeof steps !== 'number' || !Number.isSafeInteger(steps) || steps < HELLO_LIMITS.minSteps || steps > HELLO_LIMITS.maxSteps)
    errors.push(`The steps must be a whole number from ${HELLO_LIMITS.minSteps} to ${HELLO_LIMITS.maxSteps}.`)
  if (!CHART_STYLES.includes(chart as HelloInputs['chart'])) errors.push('The chart must be line or bar.')
  if (typeof referenceLine !== 'boolean') errors.push('The reference line setting must be true or false.')
  if (typeof useTaxYearDates !== 'boolean') errors.push('The tax-year dates setting must be true or false.')
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    inputs: {
      amount: fromPence(amount as number),
      percent: percent as string,
      rounding: rounding as HelloInputs['rounding'],
      steps: steps as number,
      chart: chart as HelloInputs['chart'],
      referenceLine: referenceLine as boolean,
      useTaxYearDates: useTaxYearDates as boolean,
    },
  }
}

const money = (label: string, amount: Money): SummaryRow => ({ label, value: { kind: 'money', amount } })

export const helloCalculator: CalculatorDefinition<HelloInputs> = defineCalculator<HelloInputs>({
  id: 'hello',
  name: 'Hello calculator',
  summary: 'A demonstration: an amount times a percentage, with a chart. No tax figures.',
  placeholder: 'Placeholder: removed when the first real calculator ships',
  inputsVersion: 1,
  // Arbitrary demonstration values, not tax figures.
  defaultInputs: () => ({
    amount: fromPence(100_000),
    percent: '3',
    rounding: 'nearest',
    steps: HELLO_LIMITS.maxSteps,
    chart: 'line',
    referenceLine: true,
    useTaxYearDates: false,
  }),
  validateInputs: validate,
  migrateInputs(from) {
    throw new Error(`The Hello calculator has no inputs version ${from} to migrate from`)
  },
  summarise(inputs, config) {
    const result = calculateHello(inputs, config)
    return {
      inputs: [
        money('Amount', inputs.amount),
        { label: 'Percentage', value: { kind: 'ratio', ratio: percentRatio(inputs.percent) } },
        { label: 'Rounding', value: { kind: 'text', text: ROUNDING_LABELS[inputs.rounding] } },
        { label: 'Steps', value: { kind: 'count', count: inputs.steps } },
        { label: 'Tax-year dates', value: { kind: 'text', text: inputs.useTaxYearDates ? 'Shown' : 'Not used' } },
      ],
      results: result.ok
        ? {
            ok: true,
            rows: [
              money('Amount × percentage', result.product),
              money('Amount plus that', result.total),
              money(`After ${inputs.steps} steps`, result.series.at(-1) ?? inputs.amount),
            ],
          }
        : result,
    }
  },
})
