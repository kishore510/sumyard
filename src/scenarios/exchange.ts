import type { CalculatorRegistry } from '@/calculators/registry'
import { checkUntrustedJson, isRecord, parseJsonText } from '@/lib/validate'
import { isTimestamp, readScenario, SCENARIO_LIMITS, type Scenario, type ScenarioLimits, sameContent } from './scenario'

/*
 * Export and import of scenarios as JSON files. An export is
 * `{ app: 'sumyard', kind: 'scenarios', exportVersion, appVersion,
 * exportedAt, scenarios }`; a backup (./backup.ts) shares the envelope with
 * kind 'backup'. Imported files are untrusted: size-checked before parsing,
 * refused outright for hostile keys or a wrong kind or version, then each
 * scenario is checked on its own (readScenario), so one bad scenario is
 * skipped with a reason and the rest still import. Nothing is written until
 * the person confirms the preview (planImport).
 */

export const EXPORT_VERSION = 1

export type ExportKind = 'scenarios' | 'backup'

export interface ExportMeta {
  appVersion: string
  /** UTC ISO date-time. */
  exportedAt: string
}

export function buildScenarioExport(scenarios: readonly Scenario[], meta: ExportMeta): string {
  return JSON.stringify({ app: 'sumyard', kind: 'scenarios', exportVersion: EXPORT_VERSION, ...meta, scenarios }, null, 2)
}

/** "sumyard-scenarios-2026-10-07.json", from the local date. */
export function exportFileName(kind: ExportKind, date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `sumyard-${kind}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`
}

export interface Skipped {
  /** The scenario's cleaned name, if it had one. Show as text only. */
  readonly name: string | null
  /** Finishes "This scenario ...". */
  readonly message: string
}

export interface FileDetails {
  /** The Sumyard version that made the file, if it says. */
  readonly appVersion: string | null
  readonly exportedAt: string | null
}

export interface ScenarioFile extends FileDetails {
  readonly scenarios: readonly Scenario[]
  readonly skipped: readonly Skipped[]
  /** Exact duplicates inside the file, dropped. */
  readonly duplicatesInFile: number
}

type Failure = { readonly ok: false; readonly error: string }

const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/

/** Reads and checks the shared envelope. On success, the parsed record (checked for hostile keys and size). */
export function readEnvelope(
  text: string,
  kind: ExportKind,
  limits: ScenarioLimits = SCENARIO_LIMITS,
): { ok: true; record: Record<string, unknown>; details: FileDetails } | Failure {
  const fail = (error: string): Failure => ({ ok: false, error })
  if (text.length > limits.importChars) return fail('This file is too large to import (the limit is about 2 MB).')
  const parsed = parseJsonText(text)
  if (!parsed.ok) return parsed
  const problem = checkUntrustedJson(parsed.value)
  if (problem) return fail(`This file ${problem}.`)
  const record = parsed.value
  if (!isRecord(record) || record.app !== 'sumyard') return fail('This file isn’t a Sumyard export.')
  if (record.kind !== kind) {
    if (record.kind === 'backup')
      return fail('This is a full backup, not a scenarios export. Restore it from Settings, under Backup and restore.')
    if (record.kind === 'scenarios') return fail('This is a scenarios export, not a backup. Import it from Scenarios, with Import.')
    return fail('This file isn’t a Sumyard export.')
  }
  const version = record.exportVersion
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) return fail('This file has no valid export version.')
  if (version > EXPORT_VERSION) {
    return fail(`This file was made by a newer version of Sumyard (export version ${version}). Update Sumyard, then try again.`)
  }
  if (!Array.isArray(record.scenarios)) return fail('This file has no list of scenarios.')
  if (record.scenarios.length > limits.count) return fail(`This file has more than ${limits.count} scenarios, more than Sumyard can keep.`)
  return {
    ok: true,
    record,
    details: {
      appVersion: typeof record.appVersion === 'string' && SEMVER.test(record.appVersion) ? record.appVersion : null,
      exportedAt: isTimestamp(record.exportedAt) ? record.exportedAt : null,
    },
  }
}

/** Each scenario in a file checked on its own; exact duplicates inside the file dropped. */
export function readScenarioList(list: readonly unknown[], registry: CalculatorRegistry) {
  const scenarios: Scenario[] = []
  const skipped: Skipped[] = []
  let duplicatesInFile = 0
  for (const raw of list) {
    const read = readScenario(raw, registry)
    if (!read.ok) skipped.push({ name: read.name, message: read.message })
    else if (scenarios.some((s) => sameContent(s, read.scenario))) duplicatesInFile++
    else scenarios.push(read.scenario)
  }
  return { scenarios, skipped, duplicatesInFile }
}

export function readScenarioFile(
  text: string,
  registry: CalculatorRegistry,
  limits: ScenarioLimits = SCENARIO_LIMITS,
): { ok: true; file: ScenarioFile } | Failure {
  const envelope = readEnvelope(text, 'scenarios', limits)
  if (!envelope.ok) return envelope
  return { ok: true, file: { ...envelope.details, ...readScenarioList(envelope.record.scenarios as unknown[], registry) } }
}

export type ImportMode = 'add' | 'replace'

export interface Conflict {
  readonly name: string
  readonly reason: 'same-id' | 'same-name'
  readonly existingName: string
}

export interface ImportPlan {
  readonly ok: true
  /** The full list of scenarios after the import. */
  readonly result: readonly Scenario[]
  readonly added: readonly Scenario[]
  /** Exact duplicates of scenarios already here (Add skips them). */
  readonly duplicates: readonly Scenario[]
  /** Scenarios here that the import removes (Replace). */
  readonly removed: number
  /** Scenarios in the file with the same id or name as one already here (they are added alongside, not merged). */
  readonly conflicts: readonly Conflict[]
}

/**
 * What an import would do, without doing it.
 * - Add: every imported scenario gets a new id; exact duplicates of
 *   scenarios already here are skipped.
 * - Replace: the file's scenarios replace every scenario here, keeping their
 *   ids (a repeated id gets a new one).
 */
export function planImport(
  existing: readonly Scenario[],
  incoming: readonly Scenario[],
  mode: ImportMode,
  newId: () => string,
  limits: ScenarioLimits = SCENARIO_LIMITS,
): ImportPlan | Failure {
  const conflicts: Conflict[] = []
  const duplicates: Scenario[] = []
  const fresh: Scenario[] = []
  for (const scenario of incoming) {
    if (existing.some((s) => sameContent(s, scenario))) {
      duplicates.push(scenario)
      continue
    }
    fresh.push(scenario)
    const sameId = existing.find((s) => s.id === scenario.id)
    const sameName = existing.find((s) => s.name === scenario.name && s.calculatorId === scenario.calculatorId)
    if (sameId) conflicts.push({ name: scenario.name, reason: 'same-id', existingName: sameId.name })
    else if (sameName) conflicts.push({ name: scenario.name, reason: 'same-name', existingName: sameName.name })
  }

  if (mode === 'replace') {
    const ids = new Set<string>()
    const result = incoming.map((s) => {
      const id = ids.has(s.id) ? newId() : s.id
      ids.add(id)
      return id === s.id ? s : { ...s, id }
    })
    return { ok: true, result, added: result, duplicates: [], removed: existing.length, conflicts: [] }
  }

  if (existing.length + fresh.length > limits.count) {
    return { ok: false, error: `That would make more than ${limits.count} scenarios. Delete some first, or choose Replace.` }
  }
  const added = fresh.map((s) => ({ ...s, id: newId() }))
  return { ok: true, result: [...existing, ...added], added, duplicates, removed: 0, conflicts }
}
