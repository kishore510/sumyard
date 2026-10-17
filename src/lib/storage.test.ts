import { describe, expect, it } from 'vitest'
import { formatBytes, readKey, readRecord, sumyardStorageBytes, writeKey } from './storage'

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
