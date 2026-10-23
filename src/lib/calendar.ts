import type { IsoDate } from './isoDate'
import { MONTHS_PER_YEAR } from './periods'

/*
 * Calendar arithmetic for the mortgage engine's payment dates and daily
 * interest (decisions MO1 and MO3 in docs/modelling-decisions.md). Pure: no
 * clock. Dates are ISO strings in the proleptic Gregorian calendar; day
 * numbers come from Date.UTC, which is fixed and needs no time zone.
 */

/** Days in a year that is not a leap year: the 'actual/365' day basis (MO3, MR-10). */
export const DAYS_IN_COMMON_YEAR = 365

/** Days in a leap year: the 'actual/actual' basis for a leap year's days. */
export const DAYS_IN_LEAP_YEAR = 366

const MS_PER_DAY = 86_400_000

const parts = (date: IsoDate): [number, number, number] => date.split('-').map(Number) as [number, number, number]
const pad = (n: number, width: number) => String(n).padStart(width, '0')
const iso = (year: number, month: number, day: number) => `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as IsoDate

/** The Gregorian rule: every fourth year, except centuries not divisible by four hundred. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? DAYS_IN_LEAP_YEAR : DAYS_IN_COMMON_YEAR
}

/** Days in a month (one to twelve). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** The date `months` whole months after `start`: the same day, or the month's last day when it is shorter (MO1). */
export function addMonths(start: IsoDate, months: number): IsoDate {
  const [year, month, day] = parts(start)
  const index = year * MONTHS_PER_YEAR + (month - 1) + months
  const y = Math.floor(index / MONTHS_PER_YEAR)
  const m = (index % MONTHS_PER_YEAR) + 1
  return iso(y, m, Math.min(day, daysInMonth(y, m)))
}

const dayNumber = (date: IsoDate): number => {
  const [year, month, day] = parts(date)
  const utc = new Date(0)
  utc.setUTCFullYear(year, month - 1, day)
  return Math.round(utc.getTime() / MS_PER_DAY)
}

/** Whole days from one date to another: the later minus the earlier (negative if `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return dayNumber(to) - dayNumber(from)
}

/** The days from `from` (counted) to `to` (not counted), split by calendar year; empty when `to` is not later. */
export function daysByYear(from: IsoDate, to: IsoDate): readonly { readonly year: number; readonly days: number }[] {
  const out: { year: number; days: number }[] = []
  let cursor = from
  while (daysBetween(cursor, to) > 0) {
    const year = parts(cursor)[0]
    const nextYear = iso(year + 1, 1, 1)
    const end = daysBetween(nextYear, to) > 0 ? nextYear : to
    out.push({ year, days: daysBetween(cursor, end) })
    cursor = end
  }
  return out
}

/** The last year an IsoDate can carry. */
export const LAST_ISO_YEAR = 9999
