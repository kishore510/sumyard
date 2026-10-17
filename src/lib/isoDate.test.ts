import { describe, expect, it } from 'vitest'
import { isIsoDate } from './isoDate'

describe('isIsoDate', () => {
  it.each(['2099-01-01', '2098-12-31', '2096-02-29', '2000-02-29'])('accepts %s', (text) => {
    expect(isIsoDate(text)).toBe(true)
  })

  it.each([
    '',
    '2099-1-01',
    '2099-01-1',
    '99-01-01',
    '2099/01/01',
    '2099-13-01',
    '2099-00-10',
    '2099-02-29',
    '2100-02-29',
    '2099-04-31',
    '2099-01-01T00:00:00Z',
    ' 2099-01-01',
    '01-01-2099',
  ])('rejects %j', (text) => {
    expect(isIsoDate(text)).toBe(false)
  })

  it('rejects values that are not strings (untrusted input)', () => {
    for (const value of [null, undefined, 20990101, {}, []]) expect(isIsoDate(value)).toBe(false)
  })
})
