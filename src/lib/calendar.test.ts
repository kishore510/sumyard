import { describe, expect, it } from 'vitest'
import { addMonths, DAYS_IN_COMMON_YEAR, DAYS_IN_LEAP_YEAR, daysBetween, daysByYear, daysInMonth, daysInYear, isLeapYear } from './calendar'

/*
 * The calendar helper for the mortgage engine's daily interest (MO1, MO3):
 * pure, no clock. Payment dates fall on the start date's day each month, or
 * a shorter month's last day.
 */

describe('calendar', () => {
  it('knows leap years by the Gregorian rule', () => {
    expect([2024, 2028, 2000, 2400].map(isLeapYear)).toEqual([true, true, true, true])
    expect([2025, 2026, 1900, 2100].map(isLeapYear)).toEqual([false, false, false, false])
    expect(daysInYear(2024)).toBe(DAYS_IN_LEAP_YEAR)
    expect(daysInYear(2026)).toBe(DAYS_IN_COMMON_YEAR)
  })

  it('knows the days in each month', () => {
    expect(Array.from({ length: 12 }, (_, i) => daysInMonth(2026, i + 1))).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2100, 2)).toBe(28)
  })

  it('a payment date keeps the start day, or a shorter month’s last day', () => {
    expect(addMonths('2026-01-15', 0)).toBe('2026-01-15')
    expect(addMonths('2026-01-15', 1)).toBe('2026-02-15')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonths('2027-01-29', 1)).toBe('2027-02-28')
    expect(addMonths('2028-01-30', 1)).toBe('2028-02-29')
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonths('2026-06-01', 480)).toBe('2066-06-01')
  })

  it('counts days between dates, the later minus the earlier', () => {
    expect(daysBetween('2026-01-15', '2026-02-15')).toBe(31)
    expect(daysBetween('2028-02-01', '2028-03-01')).toBe(29)
    expect(daysBetween('2026-02-01', '2026-03-01')).toBe(28)
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365)
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366)
    expect(daysBetween('2026-03-01', '2026-02-01')).toBe(-28)
  })

  it('splits a stretch of days by calendar year, the first day counted and the last not', () => {
    expect(daysByYear('2026-03-10', '2026-04-10')).toEqual([{ year: 2026, days: 31 }])
    expect(daysByYear('2027-12-20', '2028-01-20')).toEqual([
      { year: 2027, days: 12 },
      { year: 2028, days: 19 },
    ])
    expect(daysByYear('2026-05-05', '2026-05-05')).toEqual([])
  })
})
