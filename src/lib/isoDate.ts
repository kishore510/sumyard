/*
 * Calendar dates as ISO strings (YYYY-MM-DD), as tax config stores them. The
 * type catches prose dates at compile time; isIsoDate checks the exact form
 * and that the day exists.
 */

export type IsoDate = `${number}-${number}-${number}`

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [, year, month, day] = match.map(Number) as [number, number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
