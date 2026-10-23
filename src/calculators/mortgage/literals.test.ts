import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALLOWED, engineFiles, FIGURE, numbersIn, split } from '../fixtures/literalGuard'

/*
 * Literal guard, as the car finance engine's: the mortgage engine holds no
 * figure of its own. Calendar figures come from src/lib/periods.ts and
 * src/lib/calendar.ts, input bounds from src/lib/inputLimits.ts, so its code
 * may use only the numbers 0, 1, 2 and 100, and its comments and strings
 * hold nothing that looks like a money amount, a percentage or a large
 * number. Its assumptions carry no digit at all (calc.test.ts).
 */

/** The day-count names MO3 fixes ('actual/365' is a convention's name, not a figure); exempt as exact strings only. */
const NAMES = new Set(['actual/365', 'actual/actual'])

const HERE = import.meta.dirname
const FILES = engineFiles(HERE)

describe('literal guard: the mortgage overpayment engine', () => {
  it('finds the engine files', () => {
    expect(FILES).toEqual(['calc.ts', 'definition.ts', 'results.ts', 'types.ts'])
  })

  it.each(FILES)('%s uses no numeric literal other than 0, 1, 2 and 100', (name) => {
    const { code } = split(readFileSync(join(HERE, name), 'utf8'))
    expect(numbersIn(code).filter((n) => !ALLOWED.has(n))).toEqual([])
  })

  it.each(FILES)('%s has no figure in its comments or strings', (name) => {
    const { prose } = split(readFileSync(join(HERE, name), 'utf8'))
    expect(prose.filter((text) => !NAMES.has(text) && FIGURE.test(text))).toEqual([])
  })
})
