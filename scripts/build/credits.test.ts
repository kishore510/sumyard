import { describe, expect, it } from 'vitest'
import { collectCredits, readCommit } from './credits'

describe('readCommit', () => {
  it('returns the short SHA, or "dev" without git', () => {
    expect(readCommit(() => 'abc1234\n')).toBe('abc1234')
    expect(readCommit(() => 'fatal: not a git repository')).toBe('dev')
    expect(
      readCommit(() => {
        throw new Error('git not found')
      }),
    ).toBe('dev')
  })
})

describe('collectCredits', () => {
  const packages: Record<string, object> = {
    react: { name: 'react', version: '19.3.0', license: 'MIT', homepage: 'https://react.dev/', dependencies: { scheduler: '^1' } },
    scheduler: { name: 'scheduler', version: '0.27.0', license: 'MIT', repository: { url: 'git+https://github.com/facebook/react.git' } },
    odd: { name: 'odd', version: '1.0.0', license: 'SEE LICENSE IN https://example.com/licence' },
    none: { name: 'none', version: '2.0.0' },
  }
  const read = (name: string) => packages[name]
  const credits = collectCredits({ dependencies: { react: '^19', odd: '1', none: '2', missing: '1' } }, read)

  it('lists runtime dependencies and theirs, sorted, skipping what is not installed', () => {
    expect(credits.map((c) => c.name)).toEqual(['none', 'odd', 'react', 'scheduler'])
  })

  it('keeps only name, version and licence', () => {
    for (const credit of credits) expect(Object.keys(credit).sort()).toEqual(['license', 'name', 'version'])
    expect(credits.find((c) => c.name === 'react')).toEqual({ name: 'react', version: '19.3.0', license: 'MIT' })
  })

  it('never carries a URL, so the external-URL scan stays strict', () => {
    expect(JSON.stringify(credits)).not.toMatch(/:\/\//)
    expect(credits.find((c) => c.name === 'odd')!.license).toBe('See package')
    expect(credits.find((c) => c.name === 'none')!.license).toBe('See package')
  })
})
