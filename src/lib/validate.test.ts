import { describe, expect, it } from 'vitest'
import { canonicalJson, checkUntrustedJson, cleanText, isRecord, parseJsonText } from './validate'

describe('parseJsonText', () => {
  it('parses JSON', () => {
    expect(parseJsonText('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
  })

  it.each(['', 'not json', '{"a":', "{'a':1}"])('says plainly when %j is not JSON', (text) => {
    expect(parseJsonText(text)).toEqual({ ok: false, error: 'This file isn’t valid JSON.' })
  })
})

describe('checkUntrustedJson', () => {
  it('accepts plain JSON values', () => {
    expect(checkUntrustedJson({ a: [1, 'b', true, null, { c: 2 }] })).toBeNull()
  })

  it.each(['__proto__', 'constructor', 'prototype'])('rejects a %s key at any depth', (key) => {
    const hostile = JSON.parse(`{"a":[{"b":{"${key}":{"polluted":true}}}]}`)
    expect(checkUntrustedJson(hostile)).toMatch(new RegExp(key))
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })

  it('rejects deep nesting and too many values', () => {
    const deep = JSON.parse(`${'['.repeat(40)}${']'.repeat(40)}`)
    expect(checkUntrustedJson(deep, { maxDepth: 20, maxNodes: 1000 })).toMatch(/nested too deeply/)
    expect(
      checkUntrustedJson(
        Array.from({ length: 50 }, () => 1),
        { maxDepth: 20, maxNodes: 10 },
      ),
    ).toMatch(/too many values/)
  })

  it('rejects values JSON cannot hold', () => {
    expect(checkUntrustedJson({ a: Number.NaN })).not.toBeNull()
    expect(checkUntrustedJson({ a: () => 1 })).not.toBeNull()
    expect(checkUntrustedJson({ a: undefined })).not.toBeNull()
  })
})

describe('isRecord', () => {
  it('is true for plain objects only', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord(JSON.parse('{"a":1}'))).toBe(true)
    expect(isRecord([])).toBe(false)
    expect(isRecord(null)).toBe(false)
    expect(isRecord('x')).toBe(false)
    expect(isRecord(new Date())).toBe(false)
  })
})

describe('cleanText', () => {
  it('trims, collapses whitespace and removes control and direction characters', () => {
    expect(cleanText('  My\tplan\n 2  ', 80)).toBe('My plan 2')
    expect(cleanText('a\u0000b\u007fc‮d⁦e', 80)).toBe('abcde')
  })

  it('cuts to a length in characters, not code units', () => {
    expect(cleanText('😀😀😀', 2)).toBe('😀😀')
  })
})

describe('canonicalJson', () => {
  it('sorts keys so equal content gives equal text', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { f: 1, e: 0 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"e":0,"f":1}]},"b":1}')
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }))
  })
})
