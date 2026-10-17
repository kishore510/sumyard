import { type IsoDate, isIsoDate } from '@/lib/isoDate'
import { type LeafPath, type LeafValue, TAX_FIELDS, type TaxGroup, type TaxYearConfig, type TaxYearId } from './schema'

/*
 * Sourced values: every leaf of a tax config is either unverified or carries
 * its value with the GOV.UK page it came from and the date it was checked. A
 * malformed verified leaf is a type error here and a failing test in
 * configs.test.ts (auditTaxYear). At run time a malformed leaf is treated as
 * unverified, so a calculator refuses rather than use it.
 */

/** A GOV.UK page over https. The build's URL scan allows these as plain links (docs/privacy.md). */
export type SourceUrl = `https://www.gov.uk/${string}`

export interface Todo {
  readonly status: 'todo'
}

export interface Verified<T> {
  readonly status: 'verified'
  readonly value: T
  readonly sourceUrl: SourceUrl
  readonly verifiedOn: IsoDate
}

export type Sourced<T> = Todo | Verified<T>

/** A slot kept for a later version; holds no values. */
export interface Reserved {
  readonly reserved: true
}

/** The unverified leaf. */
export const TODO: Todo = Object.freeze({ status: 'todo' })

/**
 * True for an https link to a page on www.gov.uk with nothing a browser would
 * read as anything else: no credentials, port, spaces, quotes, angle brackets
 * or backslashes. Narrower than the build scan's rule (which also allows bare
 * gov.uk), so every accepted source passes the scan.
 */
export function isSourceUrl(value: unknown): value is SourceUrl {
  if (typeof value !== 'string' || !value.startsWith('https://www.gov.uk/') || /[\s"'<>\\`]/.test(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.host === 'www.gov.uk' && !url.username && !url.password && url.pathname.length > 1
  } catch {
    return false
  }
}

export function isVerified<T>(leaf: Sourced<T>): leaf is Verified<T> {
  if (typeof leaf !== 'object' || leaf === null || leaf.status !== 'verified') return false
  return 'value' in leaf && leaf.value !== undefined && isSourceUrl(leaf.sourceUrl) && isIsoDate(leaf.verifiedOn)
}

const isLeaf = (node: unknown): node is Sourced<unknown> => typeof node === 'object' && node !== null && 'status' in node
const isReserved = (node: unknown): node is Reserved => typeof node === 'object' && node !== null && (node as Reserved).reserved === true

/** The node at a dotted path (a leaf for a leaf path), or undefined. */
export function leafAt(config: TaxYearConfig, path: string): unknown {
  let node: unknown = config
  for (const key of path.split('.')) {
    if (typeof node !== 'object' || node === null || !Object.hasOwn(node, key)) return undefined
    node = (node as Record<string, unknown>)[key]
  }
  return node
}

/** Every leaf path in a config, in order. */
export function leafPaths(config: TaxYearConfig): string[] {
  const out: string[] = []
  const walk = (node: unknown, prefix: string) => {
    if (isLeaf(node)) return void out.push(prefix)
    if (typeof node !== 'object' || node === null || Array.isArray(node) || isReserved(node)) return
    for (const [key, child] of Object.entries(node)) if (key !== 'id' || prefix) walk(child, prefix ? `${prefix}.${key}` : key)
  }
  walk(config, '')
  return out
}

/** A copy of the config with each leaf replaced by `leaf(path, current)`. Used to build fixtures. */
export function mapLeaves(config: TaxYearConfig, leaf: (path: string, current: Sourced<unknown>) => Sourced<unknown>): TaxYearConfig {
  const walk = (node: unknown, prefix: string): unknown => {
    if (isLeaf(node)) return leaf(prefix, node)
    if (typeof node !== 'object' || node === null || Array.isArray(node) || isReserved(node)) return node
    return Object.fromEntries(
      Object.entries(node).map(([key, child]) => [key, key === 'id' && !prefix ? child : walk(child, prefix ? `${prefix}.${key}` : key)]),
    )
  }
  return walk(config, '') as TaxYearConfig
}

export type Granted<P extends LeafPath> = {
  readonly ok: true
  readonly taxYear: TaxYearId
  readonly values: { readonly [K in P]: LeafValue<K> }
}

/** Why a calculator shows no results: the year, and every leaf it needs that is not verified. */
export type Refusal = {
  readonly ok: false
  readonly taxYear: TaxYearId
  readonly unverified: readonly LeafPath[]
}

/**
 * The plain values at `paths` if every one is verified; otherwise a refusal
 * listing the unverified ones in the order asked. Calculators call this and
 * show no results on a refusal.
 */
export function requireVerified<const P extends readonly LeafPath[]>(config: TaxYearConfig, paths: P): Granted<P[number]> | Refusal {
  const values: Record<string, unknown> = {}
  const unverified: LeafPath[] = []
  for (const path of paths) {
    const leaf = leafAt(config, path) as Sourced<unknown> | undefined
    if (leaf && isVerified(leaf)) values[path] = leaf.value
    else if (!unverified.includes(path)) unverified.push(path)
  }
  if (unverified.length > 0) return { ok: false, taxYear: config.id, unverified }
  return { ok: true, taxYear: config.id, values: values as Granted<P[number]>['values'] }
}

export interface LeafStatus {
  readonly path: string
  readonly label: string
  readonly leaf: Sourced<unknown> | undefined
  readonly verified: boolean
}

export interface CountStatus {
  readonly total: number
  readonly verified: number
  /** Every value is verified. */
  readonly complete: boolean
  /** The most recent verified date, once every value is verified. */
  readonly lastVerified?: IsoDate
}

function count(config: TaxYearConfig, fields: readonly { path: string; label: string }[]): CountStatus & { leaves: LeafStatus[] } {
  const leaves = fields.map(({ path, label }) => {
    const leaf = leafAt(config, path) as Sourced<unknown> | undefined
    return { path, label, leaf, verified: !!leaf && isVerified(leaf) }
  })
  const verified = leaves.filter((l) => l.verified).length
  const complete = leaves.length > 0 && verified === leaves.length
  const dates = leaves.map((l) => (l.leaf as Verified<unknown>).verifiedOn).sort()
  return { total: leaves.length, verified, complete, leaves, ...(complete && { lastVerified: dates.at(-1) }) }
}

export function groupStatus(config: TaxYearConfig, group: TaxGroup) {
  return count(config, group.fields)
}

export function yearStatus(config: TaxYearConfig): CountStatus {
  const { leaves: _leaves, ...status } = count(config, TAX_FIELDS)
  return status
}
