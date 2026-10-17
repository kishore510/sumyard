import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkDocs } from './docs'

const ROOT = join(import.meta.dirname, '..', '..')
const read = (name: string) => readFileSync(join(ROOT, name), 'utf8')

const plan = (lastUpdated: string, statuses: string[]) => `# Phase plan

Last updated: ${lastUpdated} (note)

## Status at a glance

| Slice | Scope | Status |
|---|---|---|
${statuses.map((s, i) => `| ${i} Slice | Scope with a | pipe-free cell | ${s} |`).join('\n')}

### Later calculators (no slot yet)

| Calculator | Notes | Status |
|---|---|---|
| Take-home pay | Reuses the engine | Not started |

## Order and principles

| Not | a | status table |
|---|---|---|
| x | y | Whatever |
`

const changelog = (...releases: string[]) => `# Changelog

## [Unreleased]

${releases
  .map((r) => {
    const [version, date] = r.split(' - ')
    return `## [${version}]${date ? ` - ${date}` : ''}\n\n### Added\n- Something.\n`
  })
  .join('\n')}`

const pkg = (version: string) => JSON.stringify({ name: 'sumyard', version })
const lock = (version: string) => JSON.stringify({ name: 'sumyard', version, packages: { '': { version } } })

const good = {
  plan: plan('17 October 2026', ['In progress', 'Not started', 'Parked']),
  changelog: changelog('0.1.0 - 2026-10-17'),
  packageJson: pkg('0.1.0'),
  packageLock: lock('0.1.0'),
}

describe('checkDocs', () => {
  it('passes when PLAN.md, CHANGELOG.md and package.json agree', () => {
    expect(checkDocs(good)).toEqual([])
  })

  it('fails when the top CHANGELOG version differs from package.json', () => {
    expect(checkDocs({ ...good, packageJson: pkg('0.2.0') }).join('\n')).toMatch(/0\.2\.0.*0\.1\.0|0\.1\.0.*0\.2\.0/)
  })

  it('fails when package-lock.json disagrees with package.json', () => {
    expect(checkDocs({ ...good, packageLock: lock('0.0.9') })).not.toEqual([])
  })

  it('fails without an [Unreleased] section', () => {
    expect(checkDocs({ ...good, changelog: good.changelog.replace('## [Unreleased]\n', '') }).join('\n')).toMatch(/Unreleased/)
  })

  it('fails when CHANGELOG has no released version or a release has no date', () => {
    expect(checkDocs({ ...good, changelog: changelog() })).not.toEqual([])
    expect(checkDocs({ ...good, changelog: changelog('0.1.0') })).not.toEqual([])
  })

  it('fails when released versions are not newest first', () => {
    expect(checkDocs({ ...good, packageJson: pkg('0.1.0'), changelog: changelog('0.1.0 - 2026-10-17', '0.2.0 - 2026-10-18') })).not.toEqual(
      [],
    )
  })

  it('fails when PLAN.md has no readable "Last updated" date', () => {
    expect(checkDocs({ ...good, plan: good.plan.replace('Last updated: 17 October 2026', 'Last updated: recently') })).not.toEqual([])
    expect(checkDocs({ ...good, plan: good.plan.replace(/Last updated:[^\n]*\n/, '') })).not.toEqual([])
  })

  it('fails when PLAN.md "Last updated" is older than the latest release', () => {
    const problems = checkDocs({ ...good, plan: plan('16 October 2026', ['In progress']) })
    expect(problems.join('\n')).toMatch(/Last updated/)
  })

  it('fails on a status that is not one of the agreed values', () => {
    expect(checkDocs({ ...good, plan: plan('17 October 2026', ['In progress', 'Started']) }).join('\n')).toMatch(/Started/)
    expect(checkDocs({ ...good, plan: plan('17 October 2026', ['Done']) })).not.toEqual([])
  })

  it('accepts Done with version, PR and date when the version is released', () => {
    const input = {
      ...good,
      plan: plan('20 October 2026', ['Done (0.2.0, PR #3, 19 October 2026)', 'In progress']),
      changelog: changelog('0.2.0 - 2026-10-19', '0.1.0 - 2026-10-17'),
      packageJson: pkg('0.2.0'),
      packageLock: lock('0.2.0'),
    }
    expect(checkDocs(input)).toEqual([])
  })

  it('fails when a Done slice names a version not in CHANGELOG or newer than package.json', () => {
    expect(checkDocs({ ...good, plan: plan('17 October 2026', ['Done (0.3.0, PR #3, 17 October 2026)']) }).join('\n')).toMatch(/0\.3\.0/)
  })

  it('fails when a Done date is after "Last updated"', () => {
    const input = {
      ...good,
      plan: plan('17 October 2026', ['Done (0.1.0, PR #1, 18 October 2026)']),
    }
    expect(checkDocs(input)).not.toEqual([])
  })

  it('fails when a version is released but no slice is In progress or Done', () => {
    expect(checkDocs({ ...good, plan: plan('17 October 2026', ['Not started', 'Parked']) })).not.toEqual([])
  })

  it('fails when the status table is missing', () => {
    expect(checkDocs({ ...good, plan: 'Last updated: 17 October 2026\n' })).not.toEqual([])
  })
})

describe('this repo', () => {
  it('has PLAN.md, CHANGELOG.md, package.json and package-lock.json in step', () => {
    expect(
      checkDocs({
        plan: read('PLAN.md'),
        changelog: read('CHANGELOG.md'),
        packageJson: read('package.json'),
        packageLock: read('package-lock.json'),
      }),
    ).toEqual([])
  })
})
