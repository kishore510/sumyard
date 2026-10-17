/*
 * Which build this is (as Chalkline's src/version.ts, without the diagram
 * schema line). Values are injected at build time (vite.config.ts); nothing
 * here makes a network request.
 */

const injected = (value: unknown, fallback: string) => (typeof value === 'string' && value ? value : fallback)

export interface VersionInfo {
  /** Semver from package.json, e.g. "0.2.0". */
  version: string
  /** Short git commit SHA, or "dev" when git wasn't available at build time. */
  commit: string
  /** ISO date and time of the build. */
  buildDate: string
}

export const VERSION_INFO: VersionInfo = {
  version: injected(typeof __APP_VERSION__ === 'undefined' ? undefined : __APP_VERSION__, '0.0.0'),
  commit: injected(typeof __APP_COMMIT__ === 'undefined' ? undefined : __APP_COMMIT__, 'dev'),
  buildDate: injected(typeof __APP_BUILD_DATE__ === 'undefined' ? undefined : __APP_BUILD_DATE__, ''),
}

export const APP_VERSION = VERSION_INFO.version

/** Plain-text details for bug reports ("Copy details" in About). */
export function formatVersionDetails(info: VersionInfo, userAgent: string): string {
  return [
    `Sumyard ${info.version}`,
    `Build: ${info.commit}`,
    `Built: ${info.buildDate || 'unknown'}`,
    `Browser: ${userAgent || 'unknown'}`,
  ].join('\n')
}
