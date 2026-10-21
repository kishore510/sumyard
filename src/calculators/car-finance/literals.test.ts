import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALLOWED, engineFiles, FIGURE, numbersIn, split } from '../fixtures/literalGuard'

/*
 * Literal guard, as the optimiser's and the compound engine's: the car finance
 * engine holds no figure of its own. Calendar divisors come from
 * src/lib/periods.ts, input bounds from src/lib/inputLimits.ts and the
 * solver's precision from src/lib/money.ts, so its code may use only the
 * numbers 0, 1, 2 and 100, and its comments and strings hold nothing that
 * looks like a money amount, a percentage or a large number.
 */

const HERE = import.meta.dirname
const FILES = engineFiles(HERE)

describe('literal guard: the car finance engine', () => {
  it('finds the engine files', () => {
    expect(FILES).toEqual(['calc.ts', 'types.ts'])
  })

  it.each(FILES)('%s uses no numeric literal other than 0, 1, 2 and 100', (name) => {
    const { code } = split(readFileSync(join(HERE, name), 'utf8'))
    expect(numbersIn(code).filter((n) => !ALLOWED.has(n))).toEqual([])
  })

  it.each(FILES)('%s has no figure in its comments or strings', (name) => {
    const { prose } = split(readFileSync(join(HERE, name), 'utf8'))
    expect(prose.filter((text) => FIGURE.test(text))).toEqual([])
  })
})
