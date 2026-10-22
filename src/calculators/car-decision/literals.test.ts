import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALLOWED, engineFiles, FIGURE, numbersIn, split } from '../fixtures/literalGuard'

/*
 * Literal guard, as the other calculators': the car decision page (slices
 * 3c-1 and 3c-2) holds no figure of its own. Bounds come from src/lib/inputLimits.ts,
 * calendar divisors from src/lib/periods.ts and every result from the
 * engines (car-ownership, car-finance), so its code may use only the numbers
 * 0, 1, 2 and 100, and its comments and strings hold nothing that looks like
 * a money amount, a percentage or a large number.
 */

const HERE = import.meta.dirname
const ENGINE_FILES = engineFiles(HERE)
const PAGE_FILES = ['CarDecisionPage.tsx', 'OptionEditor.tsx', 'CarResults.tsx', 'CarViews.tsx']

describe('literal guard: the car decision page', () => {
  it('finds the page’s logic files', () => {
    expect(ENGINE_FILES).toEqual(['chart.ts', 'definition.ts', 'rates.ts', 'results.ts', 'sensitivity.ts'])
  })

  it.each([...ENGINE_FILES, ...PAGE_FILES])('%s uses no numeric literal other than 0, 1, 2 and 100', (name) => {
    const { code } = split(readFileSync(join(HERE, name), 'utf8'))
    expect(numbersIn(code).filter((n) => !ALLOWED.has(n))).toEqual([])
  })

  it.each([...ENGINE_FILES, ...PAGE_FILES])('%s has no figure in its comments or strings', (name) => {
    const { prose } = split(readFileSync(join(HERE, name), 'utf8'))
    expect(prose.filter((text) => FIGURE.test(text))).toEqual([])
  })
})
