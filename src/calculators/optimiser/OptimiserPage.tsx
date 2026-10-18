import { AssumptionsPanel } from '@/components/AssumptionsPanel'
import { CurrencyInput } from '@/components/inputs/CurrencyInput'
import { NumberInput } from '@/components/inputs/NumberInput'
import { Segmented } from '@/components/inputs/Segmented'
import { Select } from '@/components/inputs/Select'
import { Toggle } from '@/components/inputs/Toggle'
import { RefusalNotice } from '@/components/RefusalNotice'
import { ResultCard, StatRow } from '@/components/ResultCard'
import { ScenarioBar } from '@/components/ScenarioBar'
import { InlineNotice } from '@/components/states'
import { VerifiedBadge } from '@/components/VerifiedBadge'
import { listTaxYears, taxYearLabel } from '@/config/tax/index'
import { formatGBP } from '@/lib/format'
import { add, compare, type Money, ZERO } from '@/lib/money'
import { useStore } from '@/lib/store'
import { settingsStore } from '@/settings/settings'
import { DISCLAIMER } from '@/sheets/parts'
import { configFor, sessionFor } from '../session'
import {
  calculateTakeHome,
  INPUT_LIMITS,
  isInputProblem,
  METHOD_LABELS,
  MONEY_LABELS,
  type OptimiserPageInputs,
  optimiserCalculator,
  PAYMENT_LABELS,
  PLAN_LABELS,
  REGION_LABELS,
} from './definition'
import { CHILD_BENEFIT_PAYMENTS, DEFAULT_POLICY, PENSION_METHODS, REGIONS, STUDENT_LOAN_PLANS, type TakeHomeResult } from './types'

/*
 * The take-home page (slice 1b, session 1b-i) at #/c/optimiser: inputs,
 * take-home for the year, month and week, the breakdown, engine warnings,
 * assumptions and scenarios, all from shared components and the engine's
 * takeHome. No figure is written here. The pension sweep, chart and
 * threshold points (optimise()) come in 1b-ii.
 */

const session = sessionFor(optimiserCalculator)

const TAX_YEARS = listTaxYears().map((y) => ({ value: y.id as string, label: taxYearLabel(y.id) }))
const REGION_OPTIONS = REGIONS.map((value) => ({ value, label: value === 'rUK' ? 'England, Wales, NI' : REGION_LABELS[value] }))
const METHOD_OPTIONS = PENSION_METHODS.map((value) => ({ value, label: METHOD_LABELS[value] }))
const PAYMENT_OPTIONS = CHILD_BENEFIT_PAYMENTS.map((value) => ({ value, label: value === 'claimed' ? 'Claimed' : 'Opted out' }))

const METHOD_HINTS: Record<OptimiserPageInputs['pensionMethod'], string> = {
  salarySacrifice: 'Salary you give up for an employer contribution: less tax, National Insurance and student loan.',
  netPay: 'Taken from your pay before tax: less tax, but not less National Insurance.',
  reliefAtSource: 'Paid from your take-home pay; your provider adds basic rate relief. Enter what you pay.',
}

/** Assumptions the page adds to the engine's: what this page does and doesn't model. No figures except the policy's week count. */
const PAGE_ASSUMPTIONS = [
  `Child Benefit is counted for ${DEFAULT_POLICY.childBenefitWeeks} weeks of the year (the modelling policy), for every child entered.`,
  'Personal allowance taper: the reduction is worked out exactly, with nothing rounded until the result.',
  'Pension is counted as contributions only: what goes in this year. Growth, the annual allowance and tax on withdrawals are not shown here yet.',
  'Taxable benefits in kind are taken as entered: they are not checked against your employer’s annual statement of benefits or your tax code.',
  'No tax code: tax is worked out on the year’s figures. PAYE through your tax code can take slightly different amounts each payday.',
  'Take-home leaves out costs the employer pays: Class 1A National Insurance on benefits, employer National Insurance and the employer’s pension contribution.',
  'Flexible-benefit cash is entered as salary.',
]

const sameAmount = (a: Money, b: Money) => compare(a, b) === 0

export default function OptimiserPage() {
  const state = useStore(session)
  const amounts = useStore(settingsStore, (s) => s.amounts)
  const inputs = state.inputs
  const config = configFor(state.taxYear)
  const set = (patch: Partial<OptimiserPageInputs>) => session.setInputs(patch)
  const valid = (field: string) => (ok: boolean) => session.setFieldValid(field, ok)
  const invalid = state.invalid.length > 0
  const result = invalid ? null : calculateTakeHome(inputs, config)
  const gbp = (amount: Money) => formatGBP(amount, amounts)
  const togglePlan = (plan: (typeof STUDENT_LOAN_PLANS)[number], on: boolean) =>
    set({ studentLoans: STUDENT_LOAN_PLANS.filter((p) => (p === plan ? on : inputs.studentLoans.includes(p))) })
  const amountInput = (id: string, field: keyof typeof MONEY_LABELS, hint?: string) => (
    <CurrencyInput
      id={id}
      label={MONEY_LABELS[field]}
      hint={hint}
      value={inputs[field]}
      min={ZERO}
      max={INPUT_LIMITS.maxAmount}
      onChange={(value) => set({ [field]: value })}
      onValidityChange={valid(field)}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 id="main-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          {optimiserCalculator.name}
        </h1>
        <p className="text-text-muted">{optimiserCalculator.summary}</p>
        <div className="flex">
          <VerifiedBadge config={config} />
        </div>
      </div>

      <ScenarioBar calculator={optimiserCalculator} session={session} />

      <div className="grid gap-6 lg:grid-cols-5">
        <section
          aria-labelledby="opt-inputs"
          className="flex min-w-0 flex-col gap-4 self-start rounded-lg border border-border bg-surface p-5 shadow-sm lg:col-span-2"
        >
          <h2 id="opt-inputs" className="text-base font-semibold">
            Inputs
          </h2>
          {/* Keyed by revision: a loaded scenario or a fresh start resets every box. */}
          <div key={state.revision} className="flex flex-col gap-4">
            <Select
              id="opt-tax-year"
              label="Tax year"
              value={state.taxYear}
              options={TAX_YEARS}
              onChange={(taxYear) => session.setTaxYear(taxYear)}
            />
            <Segmented
              id="opt-region"
              label="Where you live"
              value={inputs.region}
              options={REGION_OPTIONS}
              onChange={(region) => set({ region })}
            />
            {amountInput('opt-salary', 'salary', 'Your annual salary before tax. Include any flexible-benefit cash.')}
            {amountInput('opt-bonus', 'bonus', 'Any bonus for the year, added to salary.')}

            <Select
              id="opt-method"
              label="Pension method"
              hint={METHOD_HINTS[inputs.pensionMethod]}
              value={inputs.pensionMethod}
              options={METHOD_OPTIONS}
              onChange={(pensionMethod) => set({ pensionMethod })}
            />
            {amountInput('opt-employee', 'employeeContribution', 'What you put in for the year by this method. Zero for none.')}
            {amountInput('opt-employer', 'employerContribution', 'Your employer’s own contribution. It doesn’t change your take-home.')}

            {amountInput(
              'opt-benefits',
              'taxableBenefits',
              'The taxable value of benefits from your job, such as employer-paid medical cover, after anything you pay towards them.',
            )}
            {amountInput(
              'opt-deductions',
              'postTaxDeductions',
              'Amounts taken from your pay after tax with no tax effect, such as medical or dental cover you pay for.',
            )}

            <fieldset className="flex min-w-0 flex-col gap-1">
              <legend className="pb-1.5 text-sm font-medium text-text">Student loans</legend>
              {STUDENT_LOAN_PLANS.map((plan) => (
                <Toggle
                  key={plan}
                  id={`opt-loan-${plan}`}
                  label={PLAN_LABELS[plan]}
                  checked={inputs.studentLoans.includes(plan)}
                  onChange={(on) => togglePlan(plan, on)}
                />
              ))}
            </fieldset>

            <NumberInput
              id="opt-children"
              label="Children you get Child Benefit for"
              value={inputs.children}
              min={0}
              max={INPUT_LIMITS.maxChildren}
              onChange={(children) => set({ children })}
              onValidityChange={valid('children')}
            />
            {inputs.children > 0 && (
              <Segmented
                id="opt-child-benefit"
                label="Child Benefit payments"
                hint={inputs.childBenefit === 'optedOut' ? PAYMENT_LABELS.optedOut : 'Paid to you; a charge applies on higher incomes.'}
                value={inputs.childBenefit}
                options={PAYMENT_OPTIONS}
                onChange={(childBenefit) => set({ childBenefit })}
              />
            )}
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-3">
          {invalid || !result ? (
            <InlineNotice tone="warning" title="No results until the inputs are fixed">
              <p>Fix the highlighted inputs to see results.</p>
            </InlineNotice>
          ) : isInputProblem(result) ? (
            <div data-input-problem>
              <InlineNotice tone="warning" title="These inputs can’t be worked out">
                <p>{result.problem}</p>
              </InlineNotice>
            </div>
          ) : !result.ok ? (
            <RefusalNotice refusal={result} />
          ) : (
            <Results result={result} inputs={inputs} gbp={gbp} />
          )}

          <AssumptionsPanel items={[...(result?.ok ? result.assumptions : []), ...PAGE_ASSUMPTIONS]}>
            <p className="text-text-muted">Illustrative only, not financial advice. {DISCLAIMER}</p>
          </AssumptionsPanel>
        </div>
      </div>
    </div>
  )
}

function Results({ result, inputs, gbp }: { result: TakeHomeResult; inputs: OptimiserPageInputs; gbp: (amount: Money) => string }) {
  const { annual, monthly, weekly } = result
  const intoPension = add(result.pension?.grossContribution ?? ZERO, inputs.employerContribution)
  const hasChildren = inputs.children > 0
  return (
    <>
      {result.warnings.map((warning) => (
        <div key={warning.code} data-warning={warning.code}>
          <InlineNotice tone="warning">
            <p>{warning.message}</p>
          </InlineNotice>
        </div>
      ))}

      <ResultCard title="Take-home pay" headlineLabel="Take-home for the year" headline={gbp(annual.net)}>
        <StatRow label="Year" value={gbp(annual.net)} detail={annual.label} />
        <StatRow label="Month" value={gbp(monthly.net)} detail={monthly.label} />
        <StatRow label="Week" value={gbp(weekly.net)} detail={weekly.label} />
      </ResultCard>
      <InlineNotice>
        <p>
          Worked out for the whole tax year. Monthly and weekly are the annual figures divided evenly, so your payslips may differ,
          especially in a month with a bonus.
        </p>
      </InlineNotice>

      <ResultCard title="Breakdown">
        <StatRow label="Gross pay" value={gbp(annual.gross)} detail="Salary plus bonus" />
        <StatRow label="Income tax" value={gbp(annual.incomeTax)} />
        <StatRow label="National Insurance" value={gbp(annual.nationalInsurance)} />
        <StatRow label="Student loan" value={gbp(annual.studentLoan)} />
        <StatRow
          label="Employee pension"
          value={gbp(annual.pension)}
          detail={result.pension ? METHOD_LABELS[result.pension.method] : undefined}
        />
        <StatRow label="High Income Child Benefit Charge" value={gbp(annual.hicbc)} />
        <StatRow label="Post-tax deductions" value={gbp(annual.postTaxDeductions)} />
        <StatRow label="Take-home" value={gbp(annual.net)} detail="Gross pay less every row above" />
      </ResultCard>

      <ResultCard title="Alongside your pay">
        {hasChildren && <StatRow label="Child Benefit received" value={gbp(annual.childBenefit)} />}
        {hasChildren && <StatRow label="Take-home with Child Benefit" value={gbp(annual.netIncludingChildBenefit)} />}
        <StatRow
          label="Into your pension"
          value={gbp(intoPension)}
          detail={
            sameAmount(intoPension, ZERO)
              ? undefined
              : 'Your contribution (with any relief your provider adds) plus your employer’s own contribution'
          }
        />
        <StatRow label="Taxable benefits in kind" value={gbp(inputs.taxableBenefits)} detail="Taxed as pay, but not paid in cash" />
        <StatRow label="Adjusted net income" value={gbp(result.adjustedNetIncome.adjustedNetIncome)} />
      </ResultCard>
    </>
  )
}
