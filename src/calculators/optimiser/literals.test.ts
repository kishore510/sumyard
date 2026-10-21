import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALLOWED, engineFiles, FIGURE, numbersIn, split } from '../fixtures/literalGuard'

/*
 * Literal guard: the engine holds no tax figure of its own. Every rate,
 * threshold and allowance comes from the config through requireVerified, so
 * the engine's code may use only the numbers 0, 1, 2 and 100. Comments and
 * strings are checked separately for anything that looks like a money amount,
 * a percentage or a large number. The scanner is shared
 * (../fixtures/literalGuard.ts).
 */

const HERE = import.meta.dirname
const ENGINE_FILES = engineFiles(HERE)

describe('literal guard: the engine source', () => {
  it('finds the engine files', () => {
    expect(ENGINE_FILES).toEqual(expect.arrayContaining(['calc.ts', 'types.ts']))
  })

  it.each(ENGINE_FILES)('%s uses no numeric literal other than 0, 1, 2 and 100', (name) => {
    const { code } = split(readFileSync(join(HERE, name), 'utf8'))
    expect(numbersIn(code).filter((n) => !ALLOWED.has(n))).toEqual([])
  })

  it.each(ENGINE_FILES)('%s has no figure in its comments or strings', (name) => {
    const { prose } = split(readFileSync(join(HERE, name), 'utf8'))
    expect(prose.filter((text) => FIGURE.test(text))).toEqual([])
  })
})

describe('literal guard: the scanner itself', () => {
  it('finds literals in code, including inside template expressions', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the sample source holds a template literal on purpose
    const { code } = split('const a = 3 + 0.5 * 1_000 + 12n + 0x10 + .25 + 1e3; const t = `x ${a * 7} y`; x.y2(z[4])')
    expect(numbersIn(code)).toEqual(['3', '0.5', '1000', '12', '0x10', '.25', '1e3', '7', '4'])
  })

  it('ignores identifiers and the allowed numbers, and keeps comments and strings out of code', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the sample source holds a template literal on purpose
    const { code, prose } = split("const plan2 = f(0, 1, 2, 100) // 37 here\n/* 42 */ const s = '12,570' + \"9%\" + `£5 ${'x'}`")
    expect(numbersIn(code)).toEqual(['0', '1', '2', '100'])
    expect(prose).toEqual([' 37 here', ' 42 ', '12,570', '9%', '£5 ', 'x', ''])
  })

  it('flags figures in prose but not ordinary words or small labels', () => {
    for (const text of ['£12', '20%', '45 per cent', '12,570', '1000', '3.141']) expect(FIGURE.test(text)).toBe(true)
    for (const text of ['slice 1a, session F', 'plan 2', 'between 100 and', 'a twelfth', 'O5']) expect(FIGURE.test(text)).toBe(false)
  })
})
