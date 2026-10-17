import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isIsoDate } from '@/lib/isoDate'
import { listTaxYears } from './index'
import { TAX_FIELDS, TAX_GROUPS, type TaxYearConfig } from './schema'
import { groupStatus, isVerified, leafAt, type Sourced } from './sourced'

/*
 * Every real tax year against docs/verification-log.md, and every verified
 * leaf against the source rules (CLAUDE.md > Architecture and Accuracy). The
 * log is the human record; these tests keep it and the config in step: one
 * row per value, the same status, URL and date, and the same verified count
 * per group as the Tax data screen shows. No figure is written here.
 */

const LOG = readFileSync(join(import.meta.dirname, '..', '..', '..', 'docs', 'verification-log.md'), 'utf8')
const today = new Date().toISOString().slice(0, 10)
const STATUSES = new Set(['verified', 'todo', 'OPEN'])
const GROUP_OF = new Map<string, string>(TAX_GROUPS.flatMap((g) => g.fields.map((f) => [f.path, g.id] as const)))

interface LogRow {
  readonly group: string
  readonly path: string
  readonly url: string
  readonly readOn: string
  readonly status: string
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim().replace(/^`|`$/g, ''))

/** The rows of the "### Values" table in the year's "## <id>" section. */
function logRows(id: string): LogRow[] | undefined {
  const section = LOG.match(new RegExp(`^## ${id}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'))?.[1]
  const table = section?.match(/^### Values\s*$([\s\S]*?)(?=^#{2,3} |(?![\s\S]))/m)?.[1]
  if (!table) return undefined
  const lines = table.split('\n').filter((line) => line.trim().startsWith('|'))
  const header = cells(lines[0] ?? '')
  const col = (name: string) => header.indexOf(name)
  const columns = { group: col('Group'), path: col('Path'), url: col('URL'), readOn: col('Read on'), status: col('Status') }
  if (Object.values(columns).some((i) => i < 0))
    throw new Error(`verification log ${id}: the Values table lacks a column (${header.join(', ')})`)
  return lines.slice(2).map((line) => {
    const row = cells(line)
    return {
      group: row[columns.group] ?? '',
      path: row[columns.path] ?? '',
      url: row[columns.url] ?? '',
      readOn: row[columns.readOn] ?? '',
      status: row[columns.status] ?? '',
    }
  })
}

const leaf = (year: TaxYearConfig, path: string) => leafAt(year, path) as Sourced<unknown> | undefined

describe.each(listTaxYears().map((y) => [y.id, y] as const))('tax year %s', (id, year) => {
  it('every verified leaf cites a www.gov.uk page over https and a real date that is not in the future', () => {
    for (const { path } of TAX_FIELDS) {
      const l = leaf(year, path)
      if (l?.status !== 'verified') continue
      expect(isVerified(l), path).toBe(true)
      expect(l.sourceUrl.startsWith('https://www.gov.uk/'), path).toBe(true)
      expect(new URL(l.sourceUrl).host, path).toBe('www.gov.uk')
      expect(isIsoDate(l.verifiedOn), path).toBe(true)
      expect(l.verifiedOn <= today, `${path} verified on ${l.verifiedOn}, after today`).toBe(true)
    }
  })

  it('has a Values table in docs/verification-log.md with one row per value, in its group', () => {
    const rows = logRows(id)
    expect(rows, `docs/verification-log.md has no "## ${id}" section with a "### Values" table`).toBeDefined()
    expect([...rows!.map((r) => r.path)].sort()).toEqual(TAX_FIELDS.map((f) => f.path).sort())
    for (const row of rows!) {
      expect(row.group, row.path).toBe(GROUP_OF.get(row.path))
      expect(STATUSES.has(row.status), `${row.path}: status "${row.status}"`).toBe(true)
    }
  })

  it('logs the same status, source URL and date as the config holds', () => {
    for (const row of logRows(id) ?? []) {
      const l = leaf(year, row.path)
      const verified = !!l && isVerified(l)
      expect(row.status === 'verified', `${row.path}: log says ${row.status}, config ${verified ? 'verified' : 'unverified'}`).toBe(
        verified,
      )
      if (verified && l.status === 'verified') {
        expect(row.url, row.path).toBe(l.sourceUrl)
        expect(row.readOn, row.path).toBe(l.verifiedOn)
      }
    }
  })

  it("matches each group's verified count to the log", () => {
    const rows = logRows(id) ?? []
    for (const group of TAX_GROUPS) {
      const logged = rows.filter((r) => r.group === group.id && r.status === 'verified').length
      expect(logged, group.id).toBe(groupStatus(year, group).verified)
    }
  })
})
