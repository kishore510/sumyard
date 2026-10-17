import type { CalculatorRegistry } from '@/calculators/registry'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { THEME_PREFERENCES, type ThemePreference } from '@/lib/theme'
import { DEFAULT_SETTINGS, readSettingsValue, type Settings, type TaxYearChoices } from '@/settings/settings'
import { EXPORT_VERSION, type ExportMeta, type FileDetails, readEnvelope, readScenarioList, type Skipped } from './exchange'
import type { Scenario } from './scenario'

/*
 * Backup and restore (Settings): everything Sumyard keeps, in one JSON file,
 * `{ app: 'sumyard', kind: 'backup', exportVersion, appVersion, exportedAt,
 * scenarios, settings, theme, acknowledged }`. The What's new marker
 * (lastSeenVersion) is left out on purpose: it belongs to this browser.
 * Restoring checks the file like an import, shows a preview, and on
 * confirmation replaces the current data.
 */

export interface BackupData {
  readonly scenarios: readonly Scenario[]
  readonly settings: Settings
  readonly theme: ThemePreference
  /** The first-run "illustrative, not advice" notice has been read. */
  readonly acknowledged: boolean
}

export interface Backup extends BackupData, FileDetails {
  readonly skipped: readonly Skipped[]
  readonly duplicatesInFile: number
  /** Things restoring will change from what the file says (a tax year this version lacks). */
  readonly notes: readonly string[]
}

export function buildBackup(data: BackupData, meta: ExportMeta): string {
  return JSON.stringify(
    {
      app: 'sumyard',
      kind: 'backup',
      exportVersion: EXPORT_VERSION,
      ...meta,
      scenarios: data.scenarios,
      settings: { region: data.settings.region, amounts: data.settings.amounts, taxYear: data.settings.taxYear },
      theme: data.theme,
      acknowledged: data.acknowledged,
    },
    null,
    2,
  )
}

export function readBackupFile(
  text: string,
  registry: CalculatorRegistry,
  years: TaxYearChoices,
): { ok: true; backup: Backup } | { ok: false; error: string } {
  const envelope = readEnvelope(text, 'backup')
  if (!envelope.ok) return envelope
  const { record } = envelope
  const settings = readSettingsValue(record.settings, years)
  if (!settings.ok) return { ok: false, error: `This backup’s settings aren’t valid (${settings.error}).` }
  if (!THEME_PREFERENCES.includes(record.theme as ThemePreference)) return { ok: false, error: 'This backup has no valid theme.' }
  if (typeof record.acknowledged !== 'boolean')
    return { ok: false, error: 'This backup doesn’t say whether the “not advice” notice was read.' }
  return {
    ok: true,
    backup: {
      ...envelope.details,
      ...readScenarioList(record.scenarios as unknown[], registry),
      settings: settings.settings,
      theme: record.theme as ThemePreference,
      acknowledged: record.acknowledged,
      notes: settings.notes,
    },
  }
}

/** Where restore and clear write: the app's stores (tests pass fakes). */
export interface DataTargets {
  scenarios: { replaceAll: (list: readonly Scenario[]) => { saved: boolean }; clear: () => boolean }
  settings: { replace: (next: Settings) => boolean }
  theme: { set: (next: ThemePreference) => void }
  acknowledged: { set: (value: boolean) => boolean }
  lastSeen: { clear: () => void }
}

/** Replaces the current data with the backup's. `saved` is false if the browser refused any write. */
export function restoreBackup(backup: BackupData, targets: DataTargets): { saved: boolean } {
  const scenarios = targets.scenarios.replaceAll(backup.scenarios).saved
  const settings = targets.settings.replace({ ...backup.settings })
  targets.theme.set(backup.theme)
  const acknowledged = targets.acknowledged.set(backup.acknowledged)
  return { saved: scenarios && settings && acknowledged }
}

/** Removes every Sumyard key from this browser and resets what is in memory. Not undoable. */
export function clearAllData(targets: DataTargets, storage: Pick<Storage, 'removeItem'> | undefined): { saved: boolean } {
  let saved = targets.scenarios.clear()
  saved = targets.settings.replace({ ...DEFAULT_SETTINGS }) && saved
  targets.theme.set('system')
  saved = targets.acknowledged.set(false) && saved
  targets.lastSeen.clear()
  for (const { key } of Object.values(STORAGE_KEYS)) {
    try {
      storage?.removeItem(key)
    } catch {
      saved = false
    }
  }
  return { saved: saved && !!storage }
}
