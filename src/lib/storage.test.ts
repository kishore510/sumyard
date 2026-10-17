import { describe, expect, it } from 'vitest'
import { formatBytes, readKey, readRecord, sumyardStorageBytes, upgradeRecord, writeKey } from './storage'

function memory(entries: Record<string, string>) {
  const data = new Map(Object.entries(entries))
  return {
    get length() {
      return data.size
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
  }
}

describe('storage helpers', () => {
  it('reads and writes, and copes with blocked storage', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('full')
      },
    }
    expect(readKey('k', throwing)).toBeNull()
    expect(writeKey('k', 'v', throwing)).toBe(false)
    expect(writeKey('k', 'v', undefined)).toBe(false)
  })

  it('reads a versioned record and refuses anything else', () => {
    expect(readRecord('{"schemaVersion":1,"a":2}', 1)).toEqual({ schemaVersion: 1, a: 2 })
    for (const text of [null, '{oops', '[]', 'null', '1', '{"schemaVersion":2}', '{"a":1}'])
      expect(readRecord(text, 1), String(text)).toBeNull()
  })

  it('counts only sumyard: keys, at two bytes a character', () => {
    expect(sumyardStorageBytes(memory({ 'sumyard:v1:a': 'xx', other: 'y'.repeat(1000) }))).toBe((12 + 2) * 2)
    expect(sumyardStorageBytes(memory({}))).toBe(0)
    expect(sumyardStorageBytes(undefined)).toBeNull()
  })

  it('formats sizes', () => {
    expect(formatBytes(740)).toBe('740 bytes')
    expect(formatBytes(12_600)).toBe('12 KB')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(-1)).toBe('unknown')
  })
})

describe('upgradeRecord (migration hook)', () => {
  const migrations = {
    1: (r: Record<string, unknown>) => ({ ...r, added: 'by 1 to 2' }),
    2: (r: Record<string, unknown>) => ({ ...r, renamed: r.added, added: undefined }),
  }

  it('returns a record already at the current version as is', () => {
    expect(upgradeRecord('{"schemaVersion":3,"a":1}', 3, migrations)).toEqual({ schemaVersion: 3, a: 1 })
  })

  it('runs each step from the stored version up, and stamps the new version', () => {
    expect(upgradeRecord('{"schemaVersion":2,"added":"x"}', 3, migrations)).toEqual({ schemaVersion: 3, renamed: 'x', added: undefined })
    expect(upgradeRecord('{"schemaVersion":1,"a":1}', 2, migrations)).toEqual({ schemaVersion: 2, a: 1, added: 'by 1 to 2' })
    expect(upgradeRecord('{"schemaVersion":1}', 3, migrations)).toEqual({ schemaVersion: 3, renamed: 'by 1 to 2', added: undefined })
  })

  it('gives null for a newer version, a missing step, or an unreadable record', () => {
    for (const text of [
      null,
      '',
      '{oops',
      '[]',
      'null',
      '{"a":1}',
      '{"schemaVersion":"1"}',
      '{"schemaVersion":0}',
      '{"schemaVersion":1.5}',
      '{"schemaVersion":4}',
    ]) {
      expect(upgradeRecord(text, 3, migrations), String(text)).toBeNull()
    }
    expect(upgradeRecord('{"schemaVersion":1}', 3, { 2: migrations[2] })).toBeNull()
  })

  it('gives null when a step throws (an old record it cannot read)', () => {
    const throwing = {
      1: () => {
        throw new Error('bad')
      },
    }
    expect(upgradeRecord('{"schemaVersion":1}', 2, throwing)).toBeNull()
  })
})
