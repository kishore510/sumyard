import { appStorage, type KeyValueStore, readKey, readRecord, writeKey } from '@/lib/storage'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { createStore } from '@/lib/store'
import type { ThemePreference } from '@/lib/theme'

/*
 * App-wide defaults, saved under `sumyard:v1:settings` as
 * `{ schemaVersion: 1, region, amounts }`. The theme keeps its own key
 * (`sumyard:v1:theme`, read before first paint) and its own store, which the
 * Settings sheet and the header toggle share.
 *
 * Slice 0.5: add the tax-year default here once the config registry
 * (src/config/tax/index.ts) exists. Until then nothing may imply that a tax
 * year is loaded or verified.
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
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ region: 'ruk', amounts: 'pounds' })

const { key: SETTINGS_KEY, schemaVersion: SCHEMA_VERSION } = STORAGE_KEYS.settings

const pick = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback

/** Reads a stored record. Untrusted: each field is checked, and an invalid one falls back to its default. */
export function parseSettings(text: string | null): Settings {
  const record = readRecord(text, SCHEMA_VERSION)
  if (!record) return { ...DEFAULT_SETTINGS }
  return {
    region: pick(REGIONS, record.region, DEFAULT_SETTINGS.region),
    amounts: pick(AMOUNT_STYLES, record.amounts, DEFAULT_SETTINGS.amounts),
  }
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, region: settings.region, amounts: settings.amounts })
}

const same = (a: Settings, b: Settings) => a.region === b.region && a.amounts === b.amounts

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
