import { type IsoDate, isIsoDate } from '@/lib/isoDate'
import { type FieldKind, TAX_FIELDS } from './schema'
import { isSourceUrl } from './sourced'

/*
 * The config audit behind the repo-level test (configs.test.ts). Takes any
 * value (a config file, or later an imported one) and lists every problem:
 * a value outside a Sourced leaf, an unverified leaf that carries a value, a
 * verified leaf without a valid GOV.UK source or a real, past date, a value of
 * the wrong kind, or a leaf missing from or added to the schema.
 */

const KIND_OF = new Map<string, FieldKind>(TAX_FIELDS.map((f) => [f.path, f.kind]))
const TAX_YEAR_ID = /^(\d{4})-(\d{2})$/

export function isTaxYearId(id: unknown): boolean {
  const match = typeof id === 'string' ? TAX_YEAR_ID.exec(id) : null
  return !!match && (Number(match[1]) + 1) % 100 === Number(match[2])
}

const isWhole = (value: unknown, minimum: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
const isMoney = (value: unknown) => isWhole(value, 0)
const isRatio = (value: unknown) => {
  const r = value as { numerator?: unknown; denominator?: unknown } | null
  return typeof r === 'object' && r !== null && Object.keys(r).length === 2 && isWhole(r.numerator, 0) && isWhole(r.denominator, 1)
}

function bandsProblem(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) return 'is not a non-empty list of bands'
  let previous = -1
  for (const [i, band] of value.entries()) {
    const b = band as { name?: unknown; from?: unknown; rate?: unknown } | null
    if (typeof b !== 'object' || b === null || Object.keys(b).length !== 3) return `band ${i} is not { name, from, rate }`
    if (typeof b.name !== 'string' || !b.name.trim()) return `band ${i} has no name`
    if (!isMoney(b.from)) return `band ${i}'s "from" is not money (whole, non-negative pence)`
    if (!isRatio(b.rate)) return `band ${i}'s rate is not a ratio`
    if ((b.from as number) <= previous) return `bands are not in ascending order of "from" at band ${i}`
    previous = b.from as number
  }
  return undefined
}

function valueProblem(kind: FieldKind | undefined, value: unknown): string | undefined {
  switch (kind) {
    case 'money':
      return isMoney(value) ? undefined : 'value is not money (whole, non-negative pence)'
    case 'ratio':
      return isRatio(value) ? undefined : 'value is not a ratio { numerator, denominator } of whole numbers'
    case 'count':
      return isWhole(value, 0) ? undefined : 'value is not a count (a whole, non-negative number)'
    case 'date':
      return isIsoDate(value) ? undefined : 'value is not a date (YYYY-MM-DD)'
    case 'bands': {
      const problem = bandsProblem(value)
      return problem && `value is not valid bands: ${problem}`
    }
    default:
      return undefined
  }
}

const VERIFIED_FIELDS = new Set(['status', 'value', 'sourceUrl', 'verifiedOn'])

function leafProblems(path: string, leaf: Record<string, unknown>, today: IsoDate | undefined): string[] {
  const problems: string[] = []
  const say = (message: string) => problems.push(`${path}: ${message}`)
  if (leaf.status === 'todo') {
    if (Object.keys(leaf).length !== 1) say('a todo leaf may hold only { status }; verify it with a source and date, or remove the value')
    return problems
  }
  if (leaf.status !== 'verified') {
    say(`unknown status ${JSON.stringify(leaf.status)} (use 'todo' or 'verified')`)
    return problems
  }
  for (const key of Object.keys(leaf)) if (!VERIFIED_FIELDS.has(key)) say(`unexpected field "${key}"`)
  if (!('value' in leaf) || leaf.value === undefined) say('verified leaf has no value')
  else {
    const problem = valueProblem(KIND_OF.get(path), leaf.value)
    if (problem) say(problem)
  }
  if (!isSourceUrl(leaf.sourceUrl)) say(`sourceUrl ${JSON.stringify(leaf.sourceUrl)} is not an https://www.gov.uk/ page`)
  if (!isIsoDate(leaf.verifiedOn)) say(`verifiedOn ${JSON.stringify(leaf.verifiedOn)} is not a real YYYY-MM-DD date`)
  else if (today && leaf.verifiedOn > today) say(`verifiedOn ${leaf.verifiedOn} is in the future`)
  return problems
}

/** Every problem with a tax-year config. Empty when it is sound. `today` (YYYY-MM-DD) also rejects future verified dates. */
export function auditTaxYear(config: unknown, options: { today?: IsoDate | string } = {}): string[] {
  const today = isIsoDate(options.today) ? options.today : undefined
  const problems: string[] = []
  const found = new Set<string>()
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return ['config: not an object']
  if (!isTaxYearId((config as { id?: unknown }).id))
    problems.push(`id: ${JSON.stringify((config as { id?: unknown }).id)} is not a tax year id like "2026-27"`)

  const walk = (node: unknown, path: string) => {
    if (typeof node === 'object' && node !== null && !Array.isArray(node)) {
      if ('status' in node) {
        found.add(path)
        if (!KIND_OF.has(path)) problems.push(`${path}: unknown leaf, not in the schema`)
        problems.push(...leafProblems(path, node as Record<string, unknown>, today))
        return
      }
      if ((node as { reserved?: unknown }).reserved === true) {
        if (Object.keys(node).length !== 1) problems.push(`${path}: a reserved slot holds no values`)
        return
      }
      for (const [key, child] of Object.entries(node)) {
        if (!path && key === 'id') continue
        walk(child, path ? `${path}.${key}` : key)
      }
      return
    }
    const what = Array.isArray(node) ? 'a list' : node === null ? 'null' : typeof node
    problems.push(`${path}: not a Sourced leaf (found ${what}); wrap it as { status: 'todo' } or a verified leaf`)
  }
  walk(config, '')

  for (const path of KIND_OF.keys()) if (!found.has(path)) problems.push(`${path}: missing`)
  return problems
}
