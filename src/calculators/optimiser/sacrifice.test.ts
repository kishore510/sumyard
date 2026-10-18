import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import type { Refusal } from '@/config/tax/sourced'
import { add, fromPence, fromPounds, type Money, subtract, ZERO } from '@/lib/money'
import { annualAllowanceCheck, benefitTaxable, benefitTotals, EngineInputError, optimise, takeHome } from './calc'
import { configValues, referenceAnnualAllowance, referenceBenefitItems, referenceTakeHome } from './fixtures/reference'
import {
  BENEFIT_PAYMENTS,
  type BenefitInput,
  type BenefitPayment,
  DEFAULT_POLICY,
  PENSION_METHODS,
  type PensionInput,
  REGIONS,
  type StudentLoanPlanId,
  type TakeHomeResult,
  type TaxInputs,
} from './types'

/*
 * 0.11.0: benefit items with what is taken from pay for them (decision B10).
 * Before tax and NI (salary sacrifice, an optional remuneration arrangement):
 * taxed on the greater of the value and the salary given up (480 Appendix 12,
 * EIM44120), and the salary given up is not Class 1 earnings (NIM02330), so it
 * comes off NI-able pay and the student loan base. After tax (making good):
 * taxed on the value less the contribution, never below nothing (EIM21119),
 * and the contribution comes off take-home only. Expected values come from
 * the verified 2026-27 config through fixtures/reference.ts, written a second
 * way; no tax figure is written here. Published examples are in
 * published.test.ts (BEN-1 to BEN-4).
 */

const config = taxYear
const v = configValues(config)
const policy = DEFAULT_POLICY
const penny = fromPence(1)

const ok = <T extends { ok: true }>(result: T | Refusal): T => {
  if (!result.ok) throw new Error(`refused: ${result.unverified.join(', ')}`)
  return result
}

const home = (inputs: TaxInputs): TakeHomeResult => ok(takeHome(inputs, config, policy))
const base = (patch: Partial<TaxInputs> = {}): TaxInputs => ({ grossPay: fromPounds(45_000), region: 'rUK', studentLoans: [], ...patch })
const item = (value: Money, taken: Money, payment: BenefitPayment): BenefitInput => ({ value, taken, payment })

/** Mulberry32: a small seeded generator for repeatable samples. */
function generator(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = generator(110)
const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!
const pence = (max: number) => fromPence(Math.floor(random() * max))

/** Up to three random items whose salary given up stays within the pay given. */
function randomItems(pay: Money): BenefitInput[] {
  const count = Math.floor(random() * 4)
  const items: BenefitInput[] = []
  let left = pay as number
  for (let i = 0; i < count; i++) {
    const payment = pick(BENEFIT_PAYMENTS)
    const taken = pence(Math.max(1, Math.floor(left / 4)))
    if (payment === 'beforeTax') left -= taken
    items.push(item(pence(v.taperStart / 8), taken, payment))
  }
  return items
}

function randomInputs(): TaxInputs {
  const grossPay = pence(v.taperStart * 2)
  const benefits = randomItems(grossPay)
  const sacrificed = referenceBenefitItems(benefits).sacrificed
  const room = grossPay - sacrificed
  const method = pick(PENSION_METHODS)
  // Relief at source grosses up, so keep its payment well inside the room left.
  const contribution = pence(Math.floor(room / 3))
  const pension: PensionInput | undefined = random() < 0.6 ? { method, contribution } : undefined
  const plans: StudentLoanPlanId[] = random() < 0.5 ? [pick(['plan1', 'plan2', 'plan4', 'plan5'] as const)] : []
  return {
    grossPay,
    region: pick(REGIONS),
    studentLoans: random() < 0.3 ? [...plans, 'postgraduate'] : plans,
    ...(pension ? { pension } : {}),
    ...(random() < 0.4 ? { childBenefit: { children: 1 + Math.floor(random() * 3), payments: 'claimed' as const } } : {}),
    ...(random() < 0.3 ? { taxableBenefits: pence(v.personalAllowance) } : {}),
    ...(random() < 0.3 ? { postTaxDeductions: pence(v.personalAllowance) } : {}),
    benefits,
  }
}

const CASES = Array.from({ length: 300 }, randomInputs)

describe('benefitTaxable and benefitTotals (B10)', () => {
  const value = fromPounds(900)
  const less = subtract(value, penny)
  const more = add(value, penny)

  it('nothing taken: the value, either way', () => {
    for (const payment of BENEFIT_PAYMENTS) expect(benefitTaxable(item(value, ZERO, payment))).toBe(value)
  })

  it('before tax: the greater of the value and the salary given up, a penny either side', () => {
    expect(benefitTaxable(item(value, less, 'beforeTax'))).toBe(value)
    expect(benefitTaxable(item(value, value, 'beforeTax'))).toBe(value)
    expect(benefitTaxable(item(value, more, 'beforeTax'))).toBe(more)
    // An otherwise exempt benefit is compared at nothing (480 Appendix 12, section 11): the salary given up.
    expect(benefitTaxable(item(ZERO, value, 'beforeTax'))).toBe(value)
  })

  it('after tax: the value less the contribution, never below nothing, a penny either side', () => {
    expect(benefitTaxable(item(value, less, 'afterTax'))).toBe(penny)
    expect(benefitTaxable(item(value, value, 'afterTax'))).toBe(ZERO)
    expect(benefitTaxable(item(value, more, 'afterTax'))).toBe(ZERO)
  })

  it('totals add each item up, and split what is taken by how', () => {
    const items = [item(value, more, 'beforeTax'), item(value, less, 'afterTax'), item(value, ZERO, 'beforeTax')]
    expect(benefitTotals(items)).toEqual({ taxable: add(add(more, penny), value), salaryGivenUp: more, paidAfterTax: less })
    expect(benefitTotals([])).toEqual({ taxable: ZERO, salaryGivenUp: ZERO, paidAfterTax: ZERO })
  })

  it('matches the reference on random items', () => {
    for (const inputs of CASES) {
      const ref = referenceBenefitItems(inputs.benefits)
      expect(benefitTotals(inputs.benefits ?? [])).toEqual({ taxable: ref.taxable, salaryGivenUp: ref.sacrificed, paidAfterTax: ref.after })
    }
  })
})

describe('takeHome with benefit items', () => {
  it('matches the reference on 300 random cases (every method, region, loan and Child Benefit mix)', () => {
    for (const inputs of CASES) {
      const r = home(inputs)
      const ref = referenceTakeHome(inputs, config, policy)
      const label = JSON.stringify(inputs)
      expect(r.annual.incomeTax, label).toBe(ref.tax)
      expect(r.annual.nationalInsurance, label).toBe(ref.ni)
      expect(r.annual.studentLoan, label).toBe(ref.loan)
      expect(r.annual.hicbc, label).toBe(ref.charge)
      expect(r.annual.benefitSacrifice, label).toBe(ref.sacrificed)
      expect(r.annual.benefitPayments, label).toBe(ref.after)
      expect(r.annual.net, label).toBe(ref.net)
      expect(r.nationalInsurance.niablePay, label).toBe(ref.niablePay)
      expect(r.adjustedNetIncome.adjustedNetIncome, label).toBe(ref.ani)
      expect(r.payrollPay, label).toBe(ref.payrollPay)
    }
  })

  it('the breakdown adds up: gross less every row is take-home', () => {
    for (const inputs of CASES) {
      const { annual } = home(inputs)
      const rows = [
        annual.benefitSacrifice,
        annual.incomeTax,
        annual.nationalInsurance,
        annual.studentLoan,
        annual.pension,
        annual.hicbc,
        annual.benefitPayments,
        annual.postTaxDeductions,
      ]
      expect(rows.reduce((left, r) => left - r, annual.gross as number)).toBe(annual.net)
    }
  })

  it('reports the totals and echoes the items', () => {
    const benefits = [item(fromPounds(500), fromPounds(600), 'beforeTax'), item(fromPounds(300), fromPounds(100), 'afterTax')]
    const r = home(base({ benefits }))
    expect(r.benefits).toEqual(benefitTotals(benefits))
    expect(r.inputs.benefits).toEqual(benefits)
    expect(r.inputs.benefits).not.toBe(benefits)
  })

  it('salary given up comes off NI-able pay and the student loan base; the benefit is taxed on the greater amount, in PAYE’s pay too', () => {
    const value = fromPounds(400)
    const taken = fromPounds(1_000)
    const without = home(base({ studentLoans: ['plan2'] }))
    const r = home(base({ studentLoans: ['plan2'], benefits: [item(value, taken, 'beforeTax')] }))
    expect(r.nationalInsurance.niablePay).toBe(subtract(without.nationalInsurance.niablePay, taken))
    expect(r.studentLoan.pay).toBe(r.nationalInsurance.niablePay)
    // PAYE's pay is taxable pay (B17): the salary given up out, the greater amount back in.
    expect(r.payrollPay).toBe(without.payrollPay)
    // Taxed on the salary given up (the greater), which it also took out of taxable pay: tax unchanged.
    expect(r.incomeTax.taxablePay).toBe(without.incomeTax.taxablePay)
    expect(r.annual.incomeTax).toBe(without.annual.incomeTax)
    expect(r.annual.net).toBe(
      without.annual.net -
        taken +
        (without.annual.nationalInsurance - r.annual.nationalInsurance) +
        (without.annual.studentLoan - r.annual.studentLoan),
    )
  })

  it('a value above the salary given up adds the difference to taxable pay and adjusted net income', () => {
    const value = fromPounds(1_500)
    const taken = fromPounds(600)
    const without = home(base())
    const r = home(base({ benefits: [item(value, taken, 'beforeTax')] }))
    expect(r.incomeTax.taxablePay).toBe(add(without.incomeTax.taxablePay, subtract(value, taken)))
    expect(r.adjustedNetIncome.adjustedNetIncome).toBe(add(without.adjustedNetIncome.adjustedNetIncome, subtract(value, taken)))
  })

  it('after tax: NI and the student loan unchanged; taxable pay and PAYE’s pay fall by the contribution; take-home falls by the contribution less the tax saved', () => {
    const value = fromPounds(1_200)
    const taken = fromPounds(300)
    const employerPaid = home(base({ studentLoans: ['plan1'], benefits: [item(value, ZERO, 'afterTax')] }))
    const r = home(base({ studentLoans: ['plan1'], benefits: [item(value, taken, 'afterTax')] }))
    expect(r.annual.nationalInsurance).toBe(employerPaid.annual.nationalInsurance)
    expect(r.annual.studentLoan).toBe(employerPaid.annual.studentLoan)
    expect(r.payrollPay).toBe(subtract(employerPaid.payrollPay, taken))
    expect(r.incomeTax.taxablePay).toBe(subtract(employerPaid.incomeTax.taxablePay, taken))
    expect(r.annual.net).toBe(employerPaid.annual.net - taken + (employerPaid.annual.incomeTax - r.annual.incomeTax))
  })

  it('an employer-paid item is the same as the single taxable benefits figure', () => {
    for (const inputs of CASES.slice(0, 60)) {
      const value = fromPounds(2_000)
      const single = home({ ...inputs, benefits: [], taxableBenefits: add(inputs.taxableBenefits ?? ZERO, value) })
      for (const payment of BENEFIT_PAYMENTS) {
        const items = home({ ...inputs, benefits: [item(value, ZERO, payment)] })
        expect(items.annual.net).toBe(single.annual.net)
        expect(items.annual.incomeTax).toBe(single.annual.incomeTax)
      }
    }
  })

  it('warns that some salary sacrifice benefits are treated differently, only when salary is given up', () => {
    const code = (inputs: TaxInputs) => home(inputs).warnings.map((w) => w.code)
    expect(code(base({ benefits: [item(fromPounds(10), fromPounds(10), 'beforeTax')] }))).toContain('benefitSalarySacrifice')
    expect(code(base({ benefits: [item(fromPounds(10), ZERO, 'beforeTax')] }))).not.toContain('benefitSalarySacrifice')
    expect(code(base({ benefits: [item(fromPounds(10), fromPounds(10), 'afterTax')] }))).not.toContain('benefitSalarySacrifice')
    const message = home(base({ benefits: [item(fromPounds(10), fromPounds(10), 'beforeTax')] })).warnings.find(
      (w) => w.code === 'benefitSalarySacrifice',
    )!.message
    expect(message).toMatch(/general rule/)
    expect(message).not.toMatch(/\d/)
  })

  it('assumptions name salary sacrifice and making good for benefits, with no figures', () => {
    const r = home(base({ benefits: [item(fromPounds(10), fromPounds(20), 'beforeTax'), item(fromPounds(10), fromPounds(5), 'afterTax')] }))
    const text = r.assumptions.join('\n')
    expect(text).toMatch(/salary given up/i)
    expect(text).toMatch(/higher of/i)
    expect(text).toMatch(/exemption/i)
    expect(text).toMatch(/after tax/i)
    for (const line of r.assumptions) expect(line).not.toMatch(/£|\d\s*%/)
  })
})

describe('properties (B10)', () => {
  const add1 = (inputs: TaxInputs, extra: BenefitInput): TaxInputs => ({ ...inputs, benefits: [...(inputs.benefits ?? []), extra] })
  /** Cash pay left after salary given up and the gross pension contribution: the most another item can take. */
  const room = (r: TakeHomeResult): Money =>
    subtract(subtract(r.annual.gross, r.benefits.salaryGivenUp), r.pension?.grossContribution ?? ZERO)

  it('salary sacrifice never raises NI or the student loan', () => {
    for (const inputs of CASES) {
      const before = home(inputs)
      const taken = fromPence(Math.floor((room(before) as number) * random()))
      const after = home(add1(inputs, item(pence(v.personalAllowance), taken, 'beforeTax')))
      expect(after.annual.nationalInsurance).toBeLessThanOrEqual(before.annual.nationalInsurance)
      expect(after.annual.studentLoan).toBeLessThanOrEqual(before.annual.studentLoan)
    }
  })

  it('a benefit never lowers income tax, however it is taken', () => {
    for (const inputs of CASES) {
      const before = home(inputs)
      for (const payment of BENEFIT_PAYMENTS) {
        const taken =
          payment === 'beforeTax' ? fromPence(Math.floor((room(before) as number) * random() * 0.2)) : pence(v.personalAllowance)
        const after = home(add1(inputs, item(pence(v.personalAllowance), taken, payment)))
        expect(after.annual.incomeTax, payment).toBeGreaterThanOrEqual(before.annual.incomeTax)
      }
    }
  })

  it('post-tax deductions never change tax, NI or loan; take-home falls by exactly the deduction', () => {
    for (const inputs of CASES) {
      const before = home(inputs)
      const deduction = pence(v.personalAllowance)
      const after = home({ ...inputs, postTaxDeductions: add(inputs.postTaxDeductions ?? ZERO, deduction) })
      expect(after.annual.incomeTax).toBe(before.annual.incomeTax)
      expect(after.annual.nationalInsurance).toBe(before.annual.nationalInsurance)
      expect(after.annual.studentLoan).toBe(before.annual.studentLoan)
      expect(after.annual.net).toBe(subtract(before.annual.net, deduction))
    }
  })

  it('a contribution after tax never changes NI or loan, and never raises tax', () => {
    for (const inputs of CASES) {
      const value = pence(v.personalAllowance)
      const employerPaid = home(add1(inputs, item(value, ZERO, 'afterTax')))
      const paid = home(add1(inputs, item(value, pence(v.personalAllowance), 'afterTax')))
      expect(paid.annual.nationalInsurance).toBe(employerPaid.annual.nationalInsurance)
      expect(paid.annual.studentLoan).toBe(employerPaid.annual.studentLoan)
      expect(paid.annual.incomeTax).toBeLessThanOrEqual(employerPaid.annual.incomeTax)
    }
  })
})

describe('edge cases (B10)', () => {
  it('zero: no items, and items of nothing, change nothing', () => {
    const plain = home(base())
    for (const benefits of [[], [item(ZERO, ZERO, 'beforeTax')], [item(ZERO, ZERO, 'afterTax')]]) {
      const r = home(base({ benefits }))
      expect(r.annual).toEqual({ ...plain.annual })
      expect(r.benefits).toEqual({ taxable: ZERO, salaryGivenUp: ZERO, paidAfterTax: ZERO })
    }
  })

  it('a benefit given for salary moves adjusted net income across the taper start, a penny either side', () => {
    const taken = fromPounds(800)
    const value = fromPounds(2_000)
    // Adjusted net income = gross − taken + value; place it a penny either side of the taper start.
    for (const offset of [-1, 0, 1, 2]) {
      const grossPay = fromPence(v.taperStart - (value - taken) + offset)
      const inputs = base({ grossPay, benefits: [item(value, taken, 'beforeTax')] })
      const r = home(inputs)
      expect(r.adjustedNetIncome.adjustedNetIncome).toBe(v.taperStart + offset)
      expect(r.annual.incomeTax, String(offset)).toBe(referenceTakeHome(inputs, config, policy).tax)
      // A penny over loses half a penny of allowance (exact), which rounds away on output; two pennies show it.
      expect(r.incomeTax.personalAllowance.reduction > 0, String(offset)).toBe(offset >= 2)
    }
  })

  it('a contribution after tax moves adjusted net income across the HICBC start, a penny either side', () => {
    // The charge starts at one whole step over the threshold (G1).
    const start = v.childBenefit.threshold + v.childBenefit.incomePerPercent
    const value = fromPounds(3_000)
    const taken = fromPounds(1_000)
    for (const [offset, percent] of [
      [-1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const grossPay = fromPence(start - (value - taken) + offset)
      const r = home(base({ grossPay, childBenefit: { children: 1, payments: 'claimed' }, benefits: [item(value, taken, 'afterTax')] }))
      expect(r.adjustedNetIncome.adjustedNetIncome).toBe(start + offset)
      expect(r.hicbc!.percentCharged, String(offset)).toBe(percent)
    }
  })

  it('salary given up above pay, or with a pension above what is left, is refused; up to pay is allowed', () => {
    const grossPay = fromPounds(30_000)
    expect(() => takeHome(base({ grossPay, benefits: [item(ZERO, add(grossPay, penny), 'beforeTax')] }), config, policy)).toThrow(
      EngineInputError,
    )
    expect(home(base({ grossPay, benefits: [item(ZERO, grossPay, 'beforeTax')] })).annual.incomeTax).toBeGreaterThan(0)
    const half = fromPounds(15_000)
    for (const method of PENSION_METHODS) {
      const pension = { method, contribution: add(half, penny) }
      expect(() => takeHome(base({ grossPay, pension, benefits: [item(ZERO, half, 'beforeTax')] }), config, policy), method).toThrow(
        EngineInputError,
      )
    }
    expect(
      home(base({ grossPay, pension: { method: 'netPay', contribution: half }, benefits: [item(ZERO, half, 'beforeTax')] })).payrollPay,
    ).toBe(half)
  })

  it('negative, fractional and unknown inputs are rejected', () => {
    expect(() => takeHome(base({ benefits: [item(fromPence(-1), ZERO, 'beforeTax')] }), config, policy)).toThrow(EngineInputError)
    expect(() => takeHome(base({ benefits: [item(ZERO, fromPence(-1), 'afterTax')] }), config, policy)).toThrow(EngineInputError)
    expect(() => takeHome(base({ benefits: [item(fromPence(0.5), ZERO, 'afterTax')] }), config, policy)).toThrow()
    expect(() => takeHome(base({ benefits: [{ value: ZERO, taken: ZERO, payment: 'later' as BenefitPayment }] }), config, policy)).toThrow(
      EngineInputError,
    )
  })

  it('the annual allowance: salary given up for benefits is not added back to threshold income, and is not pension savings', () => {
    const savings = { employerContribution: fromPounds(5_000), carryForward: [], moneyPurchaseAnnualAllowance: false }
    const inputs = base({
      grossPay: fromPounds(260_000),
      pension: { method: 'salarySacrifice', contribution: fromPounds(20_000) },
      benefits: [item(fromPounds(1_000), fromPounds(4_000), 'beforeTax'), item(fromPounds(9_000), fromPounds(2_000), 'afterTax')],
    })
    const r = ok(annualAllowanceCheck(inputs, savings, config, policy))
    const ref = referenceAnnualAllowance(inputs, savings, config)
    expect(r.thresholdIncome).toBe(Number(ref.thresholdIncome[0] / ref.thresholdIncome[1]))
    expect(r.adjustedIncome).toBe(ref.adjustedIncome)
    expect(r.counted.total).toBe(ref.counted)
  })

  it('optimise() sweeps up to the pay left after salary given up for benefits', () => {
    const grossPay = fromPounds(40_000)
    const taken = fromPounds(10_000)
    const result = optimise(
      {
        ...base({ grossPay, benefits: [item(ZERO, taken, 'beforeTax')] }),
        pension: { method: 'netPay', contribution: ZERO },
        savings: { employerContribution: ZERO, carryForward: [], moneyPurchaseAnnualAllowance: false },
        checkChildcare: false,
      },
      config,
      policy,
      { step: fromPounds(5_000), maxPoints: 100 },
    )
    expect(ok(result).maximumContribution).toBe(subtract(grossPay, taken))
  })
})
