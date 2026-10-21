import { type CalculatorRegistry, isCalculatorId } from '@/calculators/registry'
import { canonicalJson, cleanText, isRecord } from '@/lib/validate'

/*
 * A scenario: a calculator's inputs saved under a name. Inputs only; results
 * are always worked out again. The same checks read scenarios back from
 * localStorage and from imported files, and each builds a fresh object from
 * the fields it knows, so nothing from parsed JSON is kept as is.
 */

export interface Scenario {
  readonly id: string
  readonly calculatorId: string
  /**
   * The tax year it was saved against ("2026-27"). May be one this version doesn't have: the page then warns.
   * Absent, and only absent, for a calculator that uses no tax rules (`taxRules: 'none'`).
   */
  readonly taxYear?: string
  readonly name: string
  /** Validated by the calculator (registry), at inputsVersion. */
  readonly inputs: unknown
  readonly inputsVersion: number
  /** UTC ISO date-times. */
  readonly createdAt: string
  readonly updatedAt: string
}

export const SCENARIO_LIMITS = {
  /** Characters in a name. */
  nameLength: 80,
  /** Scenarios kept in this browser, or in one file. */
  count: 200,
  /** Characters in the stored record (about 2 MB as browsers count it, well inside localStorage's usual quota). */
  storedChars: 1_000_000,
  /** Characters in an imported or restored file. */
  importChars: 2_000_000,
  /** Characters in one scenario's inputs, as JSON. */
  inputsChars: 20_000,
} as const

export type ScenarioLimits = { readonly [K in keyof typeof SCENARIO_LIMITS]: number }

const SCENARIO_ID = /^[A-Za-z0-9-]{1,64}$/
const TAX_YEAR = /^(\d{4})-(\d{2})$/
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/

export const isScenarioId = (value: unknown): value is string => typeof value === 'string' && SCENARIO_ID.test(value)

/** "2026-27": a four-digit year and the next year's last two digits. */
export function isTaxYearText(value: unknown): value is string {
  const match = typeof value === 'string' ? TAX_YEAR.exec(value) : null
  return !!match && (Number(match[1]) + 1) % 100 === Number(match[2])
}

export function isTimestamp(value: unknown): value is string {
  const match = typeof value === 'string' ? TIMESTAMP.exec(value) : null
  if (!match) return false
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [number, number, number, number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date.getUTCHours() === hour && date.getUTCMinutes() === minute
}

export function cleanName(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'Give the scenario a name.' }
  const value = cleanText(raw, Number.MAX_SAFE_INTEGER)
  if (!value) return { ok: false, error: 'Give the scenario a name.' }
  if (Array.from(value).length > SCENARIO_LIMITS.nameLength)
    return { ok: false, error: `Use at most ${SCENARIO_LIMITS.nameLength} characters.` }
  return { ok: true, value }
}

export type ReadScenario =
  | { readonly ok: true; readonly scenario: Scenario; readonly migrated: boolean }
  | { readonly ok: false; readonly message: string; readonly name: string | null }

/**
 * Checks an untrusted scenario (stored or imported). On failure, `message`
 * finishes the sentence "This scenario ..." and `name` is its cleaned name,
 * if it had a usable one, for showing as text.
 */
export function readScenario(raw: unknown, registry: CalculatorRegistry): ReadScenario {
  if (!isRecord(raw)) return { ok: false, message: 'isn’t a scenario', name: null }
  const nameCheck = cleanName(raw.name)
  const shownName = typeof raw.name === 'string' ? cleanText(raw.name, SCENARIO_LIMITS.nameLength) || null : null
  const failed = (message: string): ReadScenario => ({ ok: false, message, name: shownName })

  if (!isScenarioId(raw.id)) return failed('has no valid id')
  if (typeof raw.calculatorId !== 'string' || !raw.calculatorId) return failed('doesn’t say which calculator it is for')
  if (!isCalculatorId(raw.calculatorId) || !registry.get(raw.calculatorId)) return failed(unknownCalculator(raw.calculatorId))
  const noTaxRules = registry.get(raw.calculatorId)!.taxRules === 'none'
  if (noTaxRules ? raw.taxYear !== undefined : !isTaxYearText(raw.taxYear))
    return failed(noTaxRules ? 'has a tax year, but its calculator uses no tax rules' : 'has no valid tax year')
  if (!nameCheck.ok) return failed(`has no valid name (${nameCheck.error.replace(/\.$/, '').toLowerCase()})`)
  if (!isTimestamp(raw.createdAt) || !isTimestamp(raw.updatedAt)) return failed('has no valid saved date')
  let inputsText: string | undefined
  try {
    inputsText = JSON.stringify(raw.inputs)
  } catch {
    inputsText = undefined
  }
  if (inputsText === undefined || inputsText.length > SCENARIO_LIMITS.inputsChars) return failed('has inputs that are missing or too large')
  const inputs = registry.readInputs(raw.calculatorId, raw.inputsVersion as number, raw.inputs)
  if (!inputs.ok) return failed(inputs.message)
  const definition = registry.get(raw.calculatorId)!
  return {
    ok: true,
    migrated: inputs.migrated,
    scenario: {
      id: raw.id,
      calculatorId: raw.calculatorId,
      ...(noTaxRules ? {} : { taxYear: raw.taxYear as string }),
      name: nameCheck.value,
      inputs: inputs.inputs,
      inputsVersion: definition.inputsVersion,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    },
  }
}

const unknownCalculator = (id: string) => `is for a calculator this version of Sumyard doesn’t have (${JSON.stringify(cleanText(id, 40))})`

/** Same calculator, tax year, name and inputs (id and dates aside). Used to skip exact duplicates on import. */
export function sameContent(a: Scenario, b: Scenario): boolean {
  return (
    a.calculatorId === b.calculatorId &&
    a.taxYear === b.taxYear &&
    a.name === b.name &&
    a.inputsVersion === b.inputsVersion &&
    canonicalJson(a.inputs) === canonicalJson(b.inputs)
  )
}
