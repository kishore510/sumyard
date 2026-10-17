import { CALCULATORS } from '@/calculators/index'
import { latestTaxYear, listTaxYears } from '@/config/tax/index'
import { clearSeen } from '@/help/whatsNew'
import { themeStore } from '@/hooks/useTheme'
import { downloadText, readFileText } from '@/lib/download'
import { appStorage } from '@/lib/storage'
import { createStore } from '@/lib/store'
import { acknowledgedStore } from '@/settings/acknowledged'
import { settingsStore } from '@/settings/settings'
import { openSheet, sheets } from '@/sheets/navigation'
import { toasts } from '@/toast/toasts'
import { APP_VERSION } from '@/version'
import { type Backup, buildBackup, clearAllData, type DataTargets, readBackupFile, restoreBackup } from './backup'
import { buildScenarioExport, exportFileName, type ImportMode, planImport, readScenarioFile, type ScenarioFile } from './exchange'
import { newScenarioId, nowIso, scenarioStore } from './index'
import { SCENARIO_LIMITS } from './scenario'
import { scenariosFor } from './store'

/*
 * What the scenario buttons do, tying the stores to downloads, the import
 * preview sheet and toasts. Every message that includes a scenario name
 * renders it as text (React), never as markup.
 */

const NOT_SAVED = 'Couldn’t save in this browser (storage is blocked or full). It is kept until you close Sumyard: export to keep a copy.'

export const quote = (name: string) => `“${name}”`

/** Shows a toast for a change that may not have reached storage. */
export function reportSaved(saved: boolean, message: string, undo?: { run: () => void; done: string }) {
  toasts.show(saved ? { message, ...(undo && { undo }) } : { message: `${message} ${NOT_SAVED}`, ...(undo && { undo }) })
}

const meta = () => ({ appVersion: APP_VERSION, exportedAt: nowIso() })

/** Downloads every scenario, or one calculator's. */
export function exportScenarios(calculatorId?: string) {
  const state = scenarioStore.get()
  const list = calculatorId ? scenariosFor(state, calculatorId) : state.scenarios
  if (list.length === 0) return toasts.show({ message: 'There are no scenarios to export yet.' })
  const ok = downloadText(exportFileName('scenarios', new Date()), buildScenarioExport(list, meta()))
  toasts.show({
    message: ok ? `Exported ${list.length} scenario${list.length === 1 ? '' : 's'} to a file.` : 'Couldn’t make the file in this browser.',
  })
}

const currentData = () => ({
  scenarios: scenarioStore.get().scenarios,
  settings: settingsStore.get(),
  theme: themeStore.get(),
  acknowledged: acknowledgedStore.get(),
})

/** Downloads everything (scenarios, settings, theme, acknowledgement) as one backup file. */
export function exportBackup() {
  const ok = downloadText(exportFileName('backup', new Date()), buildBackup(currentData(), meta()))
  toasts.show({ message: ok ? 'Backup saved to a file.' : 'Couldn’t make the file in this browser.' })
}

export type PendingImport =
  | { kind: 'scenarios'; fileName: string; file: ScenarioFile }
  | { kind: 'backup'; fileName: string; backup: Backup }
  | { kind: 'error'; for: 'scenarios' | 'backup'; fileName: string; error: string }

/** The file waiting in the import or restore preview. Nothing is written until it is confirmed. */
export const pendingImport = createStore<PendingImport | null>(null)

const YEARS = () => ({ ids: listTaxYears().map((y) => y.id), latest: latestTaxYear().id })

/** Reads a chosen file, checks it, and opens the preview (import for scenarios, restore for a backup). */
export async function startImport(file: File, kind: 'scenarios' | 'backup', opener?: HTMLElement | null) {
  const fileName = file.name.slice(0, 120)
  const read = await readFileText(file, SCENARIO_LIMITS.importChars)
  let pending: PendingImport
  if (!read.ok) pending = { kind: 'error', for: kind, fileName, error: read.error }
  else if (kind === 'scenarios') {
    const result = readScenarioFile(read.text, CALCULATORS)
    pending = result.ok ? { kind: 'scenarios', fileName, file: result.file } : { kind: 'error', for: kind, fileName, error: result.error }
  } else {
    const result = readBackupFile(read.text, CALCULATORS, YEARS())
    pending = result.ok ? { kind: 'backup', fileName, backup: result.backup } : { kind: 'error', for: kind, fileName, error: result.error }
  }
  pendingImport.set(pending)
  openSheet({ kind: kind === 'scenarios' ? 'import' : 'restore' }, opener)
}

export function cancelImport() {
  pendingImport.set(null)
  sheets().close()
}

/** What the import would do in each mode (for the preview). */
export function importPlan(file: ScenarioFile, mode: ImportMode) {
  return planImport(scenarioStore.get().scenarios, file.scenarios, mode, newScenarioId)
}

export function confirmImport(file: ScenarioFile, mode: ImportMode) {
  const plan = importPlan(file, mode)
  if (!plan.ok) return toasts.show({ message: plan.error })
  const result = scenarioStore.importAll(plan.result)
  if (!result.ok) return toasts.show({ message: result.error })
  pendingImport.set(null)
  sheets().close()
  const n = plan.added.length
  reportSaved(
    result.saved,
    mode === 'replace' ? `Replaced your scenarios with ${n} from the file.` : `Imported ${n} scenario${n === 1 ? '' : 's'}.`,
  )
}

const TARGETS: DataTargets = {
  scenarios: scenarioStore,
  settings: settingsStore,
  theme: themeStore,
  acknowledged: acknowledgedStore,
  lastSeen: { clear: clearSeen },
}

export function confirmRestore(backup: Backup) {
  const { saved } = restoreBackup(backup, TARGETS)
  pendingImport.set(null)
  sheets().close()
  reportSaved(saved, 'Backup restored.')
}

/** Removes every Sumyard key from this browser. Not undoable (the person was offered an export first). */
export function clearEverything() {
  const { saved } = clearAllData(TARGETS, appStorage())
  toasts.show({
    message: saved ? 'All Sumyard data was removed from this browser.' : 'Some data couldn’t be removed: the browser blocked it.',
  })
}

export function deleteScenario(id: string) {
  const scenario = scenarioStore.get().scenarios.find((s) => s.id === id)
  const removed = scenario && scenarioStore.remove(id)
  if (!scenario || !removed) return
  reportSaved(removed.saved, `Deleted ${quote(scenario.name)}.`, { run: removed.undo, done: `Restored ${quote(scenario.name)}.` })
}

export function duplicateScenario(id: string) {
  const result = scenarioStore.duplicate(id)
  if (!result.ok) return toasts.show({ message: result.error })
  reportSaved(result.saved, `Made a copy: ${quote(result.scenario.name)}.`)
}
