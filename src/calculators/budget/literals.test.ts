import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALLOWED, engineFiles, FIGURE, numbersIn, split } from '../fixtures/literalGuard'

/*
 * Literal guard, as the other engines': the household budget holds no figure
 * of its own. Calendar divisors come from src/lib/periods.ts and bounds from
 * src/lib/inputLimits.ts, so its code may use only 0, 1, 2 and 100.
 */

const HERE = import.meta.dirname
const ENGINE_FILES = engineFiles(HERE)

describe('literal guard: the household budget', () => {
  it.each(ENGINE_FILES)('%s uses no numeric literal other than 0, 1, 2 and 100', (name) => {
    const { code } = split(readFileSync(join(HERE, name), 'utf8'))
    expect(numbersIn(code).filter((n) => !ALLOWED.has(n))).toEqual([])
  })

  it.each(ENGINE_FILES)('%s has no figure in its comments or strings', (name) => {
    const { prose } = split(readFileSync(join(HERE, name), 'utf8'))
    expect(prose.filter((text) => FIGURE.test(text))).toEqual([])
  })
})
