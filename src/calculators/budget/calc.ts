import { MAX_BUDGET_LINES, MAX_INPUT_AMOUNT } from '@/lib/inputLimits'
import { add, compare, type Money, MoneyError, mulRound, type Ratio, ratio, subtract, toPence, ZERO } from '@/lib/money'
import { MONTHS_PER_YEAR, PERIODS_PER_YEAR } from '@/lib/periods'
import {
  BUDGET_KINDS,
  type BudgetInputs,
  type BudgetKind,
  type BudgetOutcome,
  type BudgetPeriod,
  type BudgetProblem,
  type BudgetResult,
  type BudgetWarning,
  type IncomeLine,
  type KindTotal,
  type OutgoingLine,
  type ResolvedLine,
  type YearAndMonth,
} from './types'

/*
 * The household budget engine. Pure: inputs in, results out; no UI, storage,
 * clock or network, and no tax rule. The decisions it carries out are BD1 to
 * BD9 in docs/modelling-decisions.md:
 *
 * - BD2: a line's year is its amount times its periods a year (whole
 *   numbers, so exact); every month figure is its own year divided by the
 *   months, to the nearest penny; totals come from the years.
 * - BD3, BD5: shares are of total income for the year, exact Ratios, and
 *   null with no income; what is left may be below nothing.
 * - BD9: amounts and list lengths outside the input limits are refused by
 *   line, never thrown, and so is a result past the safe range.
 */

const PERIODS: readonly BudgetPeriod[] = ['weekly', 'monthly', 'quarterly', 'annual']

const MONTH = ratio(1, MONTHS_PER_YEAR)

/** Plain-language assumptions (no figures). */
const ASSUMPTIONS: readonly string[] = [
  'Amounts are what you enter, after tax: no tax, National Insurance, ISA or pension rule is applied.',
  'A weekly amount counts as the weeks in a year, a quarterly one as the quarters, so a year is exact; a month is the year divided by the months, to the nearest penny.',
  'Every share is of your total income for the year: your pay and any extra income.',
  'A blank amount counts as nothing.',
  'A card or loan payment is an outgoing in its own right: enter the payment or the spending on that card, not both.',
  'A transfer to a joint account counts as an outgoing from this account; what is spent from the joint account is not entered again.',
  'The savings rate is what goes to savings and investing as a share of your income; what is left over is not counted as saved.',
  'No interest, growth, inflation or change over time is modelled.',
]

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => list.includes(value as T)

/** The problem with one line's amount, period or kind; undefined when it is fine. */
function lineProblem(line: unknown, outgoing: boolean): BudgetProblem['reason'] | undefined {
  const { amount, period, kind } = (line ?? {}) as Partial<OutgoingLine>
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) return 'not-money'
  if (compare(amount, ZERO) < 0) return 'below-minimum'
  if (compare(amount, MAX_INPUT_AMOUNT) > 0) return 'above-maximum'
  if (!isOneOf(PERIODS, period)) return 'not-a-choice'
  if (outgoing && !isOneOf(BUDGET_KINDS, kind)) return 'not-a-choice'
  return undefined
}

function listProblems(field: 'income' | 'outgoings', lines: unknown): BudgetProblem[] {
  if (!Array.isArray(lines)) return [{ field, reason: 'not-a-list' }]
  if (lines.length > MAX_BUDGET_LINES) return [{ field, reason: 'too-many-lines' }]
  return lines.flatMap((line, index) => {
    const reason = lineProblem(line, field === 'outgoings')
    return reason ? [{ field, index, reason }] : []
  })
}

const monthOf = (year: Money): Money => mulRound(year, MONTH, 'nearest')

const both = (year: Money): YearAndMonth => ({ year, month: monthOf(year) })

const resolve = <L extends IncomeLine>(line: L): ResolvedLine<L> => ({
  line,
  ...both(mulRound(line.amount, ratio(PERIODS_PER_YEAR[line.period], 1), 'nearest')),
})

const sum = (amounts: readonly Money[]): Money => amounts.reduce(add, ZERO)

/** part over income, exactly; null with no income (BD5). */
const shareOf = (part: Money, income: Money): Ratio | null => (toPence(income) === 0 ? null : ratio(toPence(part), toPence(income)))

function calculate(inputs: BudgetInputs): BudgetResult {
  const incomeLines = inputs.income.map(resolve)
  const outgoingLines = inputs.outgoings.map(resolve)
  const income = both(sum(incomeLines.map((l) => l.year)))
  const ofKind = (kind: BudgetKind) => outgoingLines.filter((l) => l.line.kind === kind)
  const perKind: KindTotal[] = BUDGET_KINDS.map((kind) => {
    const total = both(sum(ofKind(kind).map((l) => l.year)))
    return { kind, ...total, share: shareOf(total.year, income.year) }
  })
  const outgoingsYear = sum(perKind.map((t) => t.year))
  const outgoings = { ...both(outgoingsYear), share: shareOf(outgoingsYear, income.year) }
  const leftoverYear = subtract(income.year, outgoingsYear)
  const leftover = { ...both(leftoverYear), share: shareOf(leftoverYear, income.year) }
  const savings = perKind.find((t) => t.kind === 'savings')!

  const lines = Object.fromEntries(perKind.map((t) => [t.kind, subtract(sum(ofKind(t.kind).map((l) => l.month)), t.month)])) as Record<
    BudgetKind,
    Money
  >
  const warnings: BudgetWarning[] = []
  if (compare(leftoverYear, ZERO) < 0) warnings.push('negative-leftover')
  if (toPence(income.year) === 0) warnings.push('no-income')

  return {
    income,
    outgoings,
    leftover,
    perKind,
    savingsRate: savings.share,
    incomeLines,
    outgoingLines,
    pennyDrift: {
      income: subtract(sum(incomeLines.map((l) => l.month)), income.month),
      kinds: subtract(sum(perKind.map((t) => t.month)), outgoings.month),
      lines,
      leftover: subtract(subtract(income.month, outgoings.month), leftover.month),
    },
    warnings,
    assumptions: ASSUMPTIONS,
  }
}

/** The budget for these inputs, or a typed refusal naming each problem (BD9). Never throws on bad inputs. */
export function budget(inputs: BudgetInputs): BudgetOutcome {
  const problems = [...listProblems('income', inputs?.income), ...listProblems('outgoings', inputs?.outgoings)]
  if (problems.length > 0) return { ok: false, problems }
  try {
    return { ok: true, result: calculate(inputs) }
  } catch (error) {
    if (error instanceof MoneyError) return { ok: false, problems: [{ field: 'result', reason: 'too-large' }] }
    throw error
  }
}
