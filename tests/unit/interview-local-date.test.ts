import { describe, expect, it } from 'vitest'
import { formatInterviewDate } from '../../src/renderer/features/interviews/interview-local-date'

describe('formatInterviewDate', () => {
  it('formats an ISO timestamp using the local date and time', () => {
    const value = '2026-09-28T08:15:00.000Z'
    const local = new Date(value)
    const expected = `${local.getFullYear()}/${local.getMonth() + 1}/${local.getDate()} ${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`

    expect(formatInterviewDate(value)).toBe(expected)
  })

  it('returns an empty string for missing or invalid dates', () => {
    expect(formatInterviewDate(undefined)).toBe('')
    expect(formatInterviewDate('not-a-date')).toBe('')
  })
})
