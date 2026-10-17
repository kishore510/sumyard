import { describe, expect, it, vi } from 'vitest'
import { echo, sampleScenario as sample, tally } from '@/calculators/fixtures/fakeCalculators'
import { createCalculatorRegistry } from '@/calculators/registry'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { type BackupData, buildBackup, clearAllData, readBackupFile, restoreBackup } from './backup'
import { EXPORT_VERSION } from './exchange'

const registry = createCalculatorRegistry([tally, echo])
const years = { ids: ['2026-27'], latest: '2026-27' }
const meta = { appVersion: '0.4.0', exportedAt: '2026-10-17T12:00:00.000Z' }

const data: BackupData = {
  scenarios: [sample()],
  settings: { region: 'scotland', amounts: 'pence', taxYear: '2026-27' },
  theme: 'dark',
  acknowledged: true,
}

const file = (patch: Record<string, unknown> = {}) => JSON.stringify({ ...JSON.parse(buildBackup(data, meta)), ...patch })

const read = (text: string) => readBackupFile(text, registry, years)

describe('backup file', () => {
  it('holds scenarios, settings, theme and the acknowledgement, but not the What’s new marker', () => {
    const parsed = JSON.parse(buildBackup(data, meta))
    expect(parsed).toEqual({
      app: 'sumyard',
      kind: 'backup',
      exportVersion: EXPORT_VERSION,
      ...meta,
      scenarios: [sample()],
      settings: { region: 'scotland', amounts: 'pence', taxYear: '2026-27' },
      theme: 'dark',
      acknowledged: true,
    })
    expect(JSON.stringify(parsed)).not.toMatch(/lastSeen|last-seen/)
  })

  it('round-trips through restore validation', () => {
    expect(read(buildBackup(data, meta))).toEqual({
      ok: true,
      backup: { ...data, appVersion: '0.4.0', exportedAt: meta.exportedAt, skipped: [], duplicatesInFile: 0, notes: [] },
    })
  })
})

describe('restore validation', () => {
  it.each([
    ['not JSON', 'nope', /isn’t valid JSON/],
    ['a scenarios export', file({ kind: 'scenarios' }), /scenarios export.*Import/],
    ['a newer export', file({ exportVersion: 3 }), /newer version of Sumyard/],
    ['bad settings', file({ settings: { region: 'mars', amounts: 'pence', taxYear: '2026-27' } }), /settings/],
    ['missing settings', file({ settings: undefined }), /settings/],
    ['a bad theme', file({ theme: 'neon' }), /theme/],
    ['a bad acknowledgement', file({ acknowledged: 'yes' }), /notice/],
    ['hostile keys', file().replace('"theme":"dark"', '"theme":"dark","constructor":{"prototype":{"x":1}}'), /constructor/],
  ])('rejects %s', (_label, text, message) => {
    const result = read(text)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(message)
  })

  it('falls back to the default tax year if the backup’s isn’t in this version, and says so', () => {
    const result = read(file({ settings: { region: 'ruk', amounts: 'pounds', taxYear: '2031-32' } }))
    expect(result.ok && result.backup.settings.taxYear).toBe('2026-27')
    expect(result.ok && result.backup.notes).toEqual([expect.stringMatching(/2031 to 2032.*2026 to 2027/)])
  })

  it('skips unreadable scenarios with reasons, like import', () => {
    const result = read(file({ scenarios: [sample(), sample({ id: 'q', calculatorId: 'mortgage' })] }))
    expect(result.ok && result.backup.scenarios).toHaveLength(1)
    expect(result.ok && result.backup.skipped).toHaveLength(1)
  })
})

describe('restore and clear', () => {
  const targets = () => ({
    scenarios: { replaceAll: vi.fn(() => ({ saved: true })), clear: vi.fn(() => true) },
    settings: { replace: vi.fn(() => true) },
    theme: { set: vi.fn() },
    acknowledged: { set: vi.fn(() => true) },
    lastSeen: { clear: vi.fn() },
  })

  it('restore replaces scenarios, settings, theme and acknowledgement', () => {
    const t = targets()
    const result = read(buildBackup(data, meta))
    if (!result.ok) throw new Error(result.error)
    expect(restoreBackup(result.backup, t)).toEqual({ saved: true })
    expect(t.scenarios.replaceAll).toHaveBeenCalledWith(data.scenarios)
    expect(t.settings.replace).toHaveBeenCalledWith(data.settings)
    expect(t.theme.set).toHaveBeenCalledWith('dark')
    expect(t.acknowledged.set).toHaveBeenCalledWith(true)
    expect(t.lastSeen.clear).not.toHaveBeenCalled()
  })

  it('restore reports when the browser would not save', () => {
    const t = targets()
    t.settings.replace.mockReturnValue(false)
    const result = read(buildBackup(data, meta))
    if (!result.ok) throw new Error(result.error)
    expect(restoreBackup(result.backup, t)).toEqual({ saved: false })
  })

  it('clear all data removes every Sumyard key and nothing else, and resets what is in memory', () => {
    const storage = new Map<string, string>(Object.values(STORAGE_KEYS).map(({ key }) => [key, '{}']))
    storage.set('someone-else', 'keep me')
    const t = targets()
    clearAllData(t, { removeItem: (k: string) => void storage.delete(k) })
    expect([...storage.keys()]).toEqual(['someone-else'])
    expect(t.scenarios.clear).toHaveBeenCalled()
    expect(t.settings.replace).toHaveBeenCalled()
    expect(t.theme.set).toHaveBeenCalledWith('system')
    expect(t.acknowledged.set).toHaveBeenCalledWith(false)
    expect(t.lastSeen.clear).toHaveBeenCalled()
  })
})
