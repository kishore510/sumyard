/* Values injected at build time by vite.config.ts (`define`). See src/version.ts. */

/** package.json version. */
declare const __APP_VERSION__: string
/** Short git commit SHA, or "dev". */
declare const __APP_COMMIT__: string
/** ISO date and time of the build. */
declare const __APP_BUILD_DATE__: string
/** Bundled open-source packages: name, version and licence (scripts/build/credits.ts). */
declare const __APP_CREDITS__: { name: string; version: string; license: string }[]
/** Released versions from CHANGELOG.md, parsed at build time (src/help/changelog.ts). */
declare const __APP_CHANGELOG__: import('./help/changelog').ChangelogRelease[]
