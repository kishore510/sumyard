import { taxYear as taxYear2026_27 } from './2026-27'
import { isTaxYearId } from './audit'
import type { TaxYearConfig, TaxYearId } from './schema'

/*
 * The tax-year registry. Every real year file is listed here (configs.test.ts
 * fails if one is not). "Latest" comes from the ids, never from today's date,
 * so results don't change by themselves when a new tax year starts.
 */

export function createRegistry(configs: readonly TaxYearConfig[]) {
  if (configs.length === 0) throw new Error('A tax-year registry needs at least one year')
  const byId = new Map<string, TaxYearConfig>()
  for (const config of configs) {
    if (!isTaxYearId(config.id)) throw new Error(`Tax year id ${JSON.stringify(config.id)} is not like "2026-27"`)
    if (byId.has(config.id)) throw new Error(`Tax year ${config.id} is listed twice`)
    byId.set(config.id, config)
  }
  const newestFirst = [...configs].sort((a, b) => (a.id < b.id ? 1 : -1))
  return {
    listTaxYears: (): readonly TaxYearConfig[] => newestFirst,
    getTaxYear: (id: string): TaxYearConfig | undefined => byId.get(id),
    latestTaxYear: (): TaxYearConfig => newestFirst[0]!,
  }
}

const registry = createRegistry([taxYear2026_27])

export const { listTaxYears, getTaxYear, latestTaxYear } = registry

/** "2026-27" as GOV.UK writes it: "2026 to 2027". */
export function taxYearLabel(id: TaxYearId | string): string {
  const start = Number(id.slice(0, 4))
  return `${start} to ${start + 1}`
}
