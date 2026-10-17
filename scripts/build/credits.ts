/*
 * Build-time information for About, gathered by vite.config.ts and injected
 * with `define` (as Chalkline's src/build/buildInfo.ts). Node-only: nothing in
 * the app imports this file.
 *
 * Differs from Chalkline: credits carry name, version and licence only. No
 * homepage or repository URLs, so the external-URL scan of the build stays
 * strict (scripts/checks/externalUrls.ts).
 */

/** Short commit SHA, or "dev" when git or the history isn't available. */
export function readCommit(run: (command: string) => string): string {
  try {
    const sha = run('git rev-parse --short HEAD').trim()
    return /^[0-9a-f]{4,40}$/.test(sha) ? sha : 'dev'
  } catch {
    return 'dev'
  }
}

/** One bundled open-source package, for the credits list in About. */
export interface Credit {
  name: string
  version: string
  license: string
}

interface PackageJson {
  version?: unknown
  license?: unknown
  dependencies?: Record<string, string>
}

/** An SPDX-style licence name; anything else (missing, an object, a "SEE LICENSE IN <url>" note) is "See package". */
function licenseOf(pkg: PackageJson): string {
  const license = pkg.license
  return typeof license === 'string' && /^[\w.+\-() ]{1,80}$/.test(license) && !/^SEE /i.test(license) ? license : 'See package'
}

/**
 * The app's runtime dependencies and everything they depend on, with their
 * licences. `read` returns a package's parsed package.json (or undefined if it
 * isn't installed). Dev dependencies aren't bundled, so they aren't listed.
 */
export function collectCredits(root: PackageJson, read: (name: string) => PackageJson | undefined): Credit[] {
  const seen = new Map<string, Credit>()
  const queue = Object.keys(root.dependencies ?? {})
  while (queue.length > 0) {
    const name = queue.shift()!
    if (seen.has(name)) continue
    const pkg = read(name)
    if (!pkg) continue
    seen.set(name, { name, version: typeof pkg.version === 'string' ? pkg.version : '', license: licenseOf(pkg) })
    queue.push(...Object.keys(pkg.dependencies ?? {}))
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}
