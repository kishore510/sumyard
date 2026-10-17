import { latestTaxYear, listTaxYears, taxYearLabel } from '@/config/tax/index'
import type { TaxYearId } from '@/config/tax/schema'
import { appStorage, type KeyValueStore, type Migration, readKey, upgradeRecord, writeKey } from '@/lib/storage'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { createStore } from '@/lib/store'
import type { ThemePreference } from '@/lib/theme'

/*
 * App-wide defaults, saved under `sumyard:v1:settings` as
 * `{ schemaVersion: 2, region, amounts, taxYear }`. The theme keeps its own
 * key (`sumyard:v1:theme`, read before first paint) and its own store, which
 * the Settings sheet and the header toggle share.
 *
 * Schema 1 (0.2.0) had no tax year; it is migrated on read (the stored record
 * is rewritten on the next change). See docs/privacy.md.
 */

export const REGIONS = ['ruk', 'scotland'] as const
export type Region = (typeof REGIONS)[number]

export const AMOUNT_STYLES = ['pounds', 'pence'] as const
export type AmountStyle = (typeof AMOUNT_STYLES)[number]

export interface Settings {
  /** Which part of the UK a calculator starts with. */
  region: Region
  /** Whole pounds, or pounds and pence. */
  amounts: AmountStyle
  /** The tax year calculators start with: one in the registry (src/config/tax/index.ts). */
  taxYear: TaxYearId
}

/** The tax years Settings can offer. The app's registry by default; tests pass fake ones. */
export interface TaxYearChoices {
  ids: readonly string[]
  latest: string
}

const REGISTRY_YEARS: TaxYearChoices = { ids: listTaxYears().map((y) => y.id), latest: latestTaxYear().id }

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ region: 'ruk', amounts: 'pounds', taxYear: latestTaxYear().id })

const { key: SETTINGS_KEY, schemaVersion: SCHEMA_VERSION } = STORAGE_KEYS.settings

/** Schema 1 (0.2.0) to 2 (0.3.0): adds the tax year, which then takes its default. */
const MIGRATIONS: Record<number, Migration> = {
  1: (record) => ({ region: record.region, amounts: record.amounts }),
}

const pick = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback

/** Reads a stored record, migrating an older one. Untrusted: each field is checked, and an invalid one falls back to its default. */
export function parseSettings(text: string | null, years: TaxYearChoices = REGISTRY_YEARS): Settings {
  const defaults = { ...DEFAULT_SETTINGS, taxYear: years.latest as TaxYearId }
  const record = upgradeRecord(text, SCHEMA_VERSION, MIGRATIONS)
  if (!record) return defaults
  return {
    region: pick(REGIONS, record.region, defaults.region),
    amounts: pick(AMOUNT_STYLES, record.amounts, defaults.amounts),
    taxYear: pick(years.ids as readonly TaxYearId[], record.taxYear, defaults.taxYear),
  }
}

/**
 * Settings from a backup file (untrusted): a region and amount style it
 * knows, or a refusal; a tax year this version doesn't have becomes the
 * latest one, with a note saying so. Builds a fresh object.
 */
export function readSettingsValue(
  raw: unknown,
  years: TaxYearChoices = REGISTRY_YEARS,
): { ok: true; settings: Settings; notes: string[] } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'not a settings record' }
  const record = raw as Record<string, unknown>
  if (!REGIONS.includes(record.region as Region)) return { ok: false, error: 'region' }
  if (!AMOUNT_STYLES.includes(record.amounts as AmountStyle)) return { ok: false, error: 'amounts' }
  const notes: string[] = []
  let taxYear = record.taxYear as TaxYearId
  if (!years.ids.includes(taxYear)) {
    const shown = typeof record.taxYear === 'string' && /^\d{4}-\d{2}$/.test(record.taxYear) ? taxYearLabel(record.taxYear) : 'missing'
    taxYear = years.latest as TaxYearId
    notes.push(`The backup’s default tax year, ${shown}, isn’t in this version, so it is set to ${taxYearLabel(taxYear)}.`)
  }
  return { ok: true, settings: { region: record.region as Region, amounts: record.amounts as AmountStyle, taxYear }, notes }
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, region: settings.region, amounts: settings.amounts, taxYear: settings.taxYear })
}

const same = (a: Settings, b: Settings) => a.region === b.region && a.amounts === b.amounts && a.taxYear === b.taxYear

export function createSettingsStore(storage: () => KeyValueStore | undefined = appStorage) {
  const store = createStore<Settings>(parseSettings(readKey(SETTINGS_KEY, storage())))
  const save = (next: Settings) => {
    store.set(next)
    return writeKey(SETTINGS_KEY, serializeSettings(next), storage())
  }
  return {
    get: store.get,
    subscribe: store.subscribe,
    /** Changes some settings and saves them. False if storage refused (they then last for this visit). */
    update: (patch: Partial<Settings>) => save({ ...store.get(), ...patch }),
    replace: (next: Settings) => save({ ...next }),
    /** Re-reads storage (another tab changed it). */
    reload: () => {
      const next = parseSettings(readKey(SETTINGS_KEY, storage()))
      if (!same(next, store.get())) store.set(next)
    },
  }
}

export type SettingsStore = ReturnType<typeof createSettingsStore>

export const settingsStore = createSettingsStore()

interface ThemeAccess {
  get: () => ThemePreference
  set: (next: ThemePreference) => void
}

/**
 * Puts the theme and every setting back to its default. Returns an undo that
 * restores what was there, or null if everything was already at its default.
 */
export function resetToDefaults(settings: Pick<SettingsStore, 'get' | 'replace'>, theme: ThemeAccess): (() => void) | null {
  const before = { settings: settings.get(), theme: theme.get() }
  if (same(before.settings, DEFAULT_SETTINGS) && before.theme === 'system') return null
  settings.replace({ ...DEFAULT_SETTINGS })
  theme.set('system')
  return () => {
    settings.replace(before.settings)
    theme.set(before.theme)
  }
}
