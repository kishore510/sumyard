/*
 * Docs drift check (CI guard 8a). Pure: takes the file contents, returns a
 * list of problems (empty when PLAN.md, CHANGELOG.md and package.json agree).
 *
 * Rules:
 * - CHANGELOG.md has an [Unreleased] section, and its released versions
 *   (`## [x.y.z] - YYYY-MM-DD`) are dated and newest first.
 * - The newest released version equals package.json (and package-lock.json).
 * - PLAN.md has a "Last updated: D Month YYYY" line no older than that release.
 * - Every status in PLAN.md's "Status at a glance" tables is Not started,
 *   In progress, Parked, or Done (x.y.z, PR #n, D Month YYYY), where x.y.z is
 *   a released version no newer than package.json and the date is no later
 *   than "Last updated".
 * - Once a version is released, at least one slice is In progress or Done.
 */

export interface DocsInput {
  plan: string
  changelog: string
  packageJson: string
  packageLock?: string
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SEMVER = /^\d+\.\d+\.\d+$/
const DONE = /^Done \((\d+\.\d+\.\d+), PR #\d+, (\d{1,2} [A-Z][a-z]+ \d{4})\)$/
const PLAIN_STATUSES = ['Not started', 'In progress', 'Parked']

/** "17 October 2026" as YYYY-MM-DD, or undefined if it isn't a real date in that form. */
export function parsePlanDate(text: string): string | undefined {
  const match = text.match(/^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/)
  if (!match) return undefined
  const month = MONTHS.indexOf(match[2]!) + 1
  const day = Number(match[1])
  if (month === 0) return undefined
  const iso = `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return new Date(`${iso}T00:00:00Z`).toISOString().startsWith(iso) ? iso : undefined
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!
  return 0
}

interface Release {
  version: string
  date?: string
}

function readReleases(changelog: string, problems: string[]): Release[] {
  const releases: Release[] = []
  for (const [, version, rest] of changelog.matchAll(/^## \[([^\]]+)\](.*)$/gm)) {
    if (version === 'Unreleased') continue
    if (!SEMVER.test(version!)) {
      problems.push(`CHANGELOG.md: "${version}" is not a x.y.z version`)
      continue
    }
    const date = rest!.match(/^ - (\d{4}-\d{2}-\d{2})\s*$/)?.[1]
    if (!date) problems.push(`CHANGELOG.md: [${version}] needs a date: "## [${version}] - YYYY-MM-DD"`)
    releases.push({ version: version!, ...(date && { date }) })
  }
  return releases
}

function readVersion(json: string, file: string, problems: string[]): string | undefined {
  try {
    const version = (JSON.parse(json) as { version?: unknown }).version
    if (typeof version === 'string' && SEMVER.test(version)) return version
    problems.push(`${file}: no x.y.z version`)
  } catch {
    problems.push(`${file}: not valid JSON`)
  }
  return undefined
}

/** The last cell of each data row in the tables under "## Status at a glance" (until the next ## heading). */
function readStatuses(plan: string): string[] | undefined {
  const section = plan.match(/^## Status at a glance\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1]
  if (section === undefined) return undefined
  return section
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|'),
    )
    .filter((cells) => !cells.every((cell) => /^\s*:?-+:?\s*$/.test(cell)))
    .map((cells) => cells.at(-1)!.trim())
    .filter((status) => status !== 'Status')
}

export function checkDocs({ plan, changelog, packageJson, packageLock }: DocsInput): string[] {
  const problems: string[] = []

  const pkgVersion = readVersion(packageJson, 'package.json', problems)
  if (packageLock !== undefined) {
    const lockVersion = readVersion(packageLock, 'package-lock.json', problems)
    if (pkgVersion && lockVersion && lockVersion !== pkgVersion) {
      problems.push(`package-lock.json is ${lockVersion} but package.json is ${pkgVersion} (use npm version <x.y.z> --no-git-tag-version)`)
    }
  }

  if (!/^## \[Unreleased\]\s*$/m.test(changelog)) problems.push('CHANGELOG.md: no "## [Unreleased]" section')
  const releases = readReleases(changelog, problems)
  const top = releases[0]
  if (!top) problems.push('CHANGELOG.md: no released version')
  for (let i = 1; i < releases.length; i++) {
    if (compareVersions(releases[i - 1]!.version, releases[i]!.version) <= 0) {
      problems.push(`CHANGELOG.md: [${releases[i - 1]!.version}] is listed above [${releases[i]!.version}]; newest first`)
    }
  }
  if (top && pkgVersion && top.version !== pkgVersion) {
    problems.push(`CHANGELOG.md's newest version is ${top.version} but package.json is ${pkgVersion}`)
  }

  const lastUpdatedText = plan.match(/^Last updated: (\d{1,2} [A-Z][a-z]+ \d{4})\b/m)?.[1]
  const lastUpdated = lastUpdatedText ? parsePlanDate(lastUpdatedText) : undefined
  if (!lastUpdated) problems.push('PLAN.md: no "Last updated: D Month YYYY" line')
  if (lastUpdated && top?.date && lastUpdated < top.date) {
    problems.push(`PLAN.md "Last updated" (${lastUpdatedText}) is older than CHANGELOG.md's newest release (${top.version}, ${top.date})`)
  }

  const statuses = readStatuses(plan)
  if (!statuses || statuses.length === 0) {
    problems.push('PLAN.md: no "## Status at a glance" table')
    return problems
  }
  const released = new Set(releases.map((r) => r.version))
  for (const status of statuses) {
    if (PLAIN_STATUSES.includes(status)) continue
    const done = status.match(DONE)
    if (!done) {
      problems.push(`PLAN.md: status "${status}" is not Not started, In progress, Parked or Done (x.y.z, PR #n, D Month YYYY)`)
      continue
    }
    const [, version, dateText] = done
    if (!released.has(version!) || (pkgVersion && compareVersions(version!, pkgVersion) > 0)) {
      problems.push(`PLAN.md: "${status}" names ${version}, which is not a released version in CHANGELOG.md up to package.json`)
    }
    const date = parsePlanDate(dateText!)
    if (!date) problems.push(`PLAN.md: "${status}" has an unreadable date`)
    else if (lastUpdated && date > lastUpdated) problems.push(`PLAN.md: "${status}" is dated after "Last updated" (${lastUpdatedText})`)
  }
  if (top && !statuses.some((s) => s === 'In progress' || DONE.test(s))) {
    problems.push(`PLAN.md: ${top.version} is released but no slice is In progress or Done`)
  }

  return problems
}
