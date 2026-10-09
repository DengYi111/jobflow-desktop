import { describe, expect, it } from 'vitest'
import { formatLocalDateTime, isBeforeLocalToday } from '../../src/renderer/features/dashboard/due-date'

describe('dashboard reminder local date handling', () => {
  it('formats UTC instants using the local wall clock across UTC midnight', () => {
    const instant = new Date('2026-09-23T17:00:00.000Z')
    const expected = `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, '0')}-${String(instant.getDate()).padStart(2, '0')} ${String(instant.getHours()).padStart(2, '0')}:${String(instant.getMinutes()).padStart(2, '0')}`
    expect(formatLocalDateTime(instant.toISOString())).toBe(expected)
    if (instant.getTimezoneOffset() !== 0)
      expect(expected).not.toBe(instant.toISOString().slice(0, 16).replace('T', ' '))
  })

  it('classifies against local midnight, so an earlier time today is not overdue', () => {
    const now = new Date(2026, 8, 24, 13, 0, 0)
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)
    const justBeforeToday = new Date(startOfToday.getTime() - 1)
    const earlierToday = new Date(now)
    earlierToday.setHours(1, 0, 0, 0)
    expect(isBeforeLocalToday(justBeforeToday.toISOString(), now)).toBe(true)
    expect(isBeforeLocalToday(earlierToday.toISOString(), now)).toBe(false)
  })
})
