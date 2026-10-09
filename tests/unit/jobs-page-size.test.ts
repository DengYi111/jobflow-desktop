// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { getJobsPageSize, setJobsPageSize } from '../../src/renderer/features/jobs/jobs-page-size'

describe('jobs page size preference', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to six when the stored value is missing or invalid', () => {
    expect(getJobsPageSize()).toBe(6)
    localStorage.setItem('jobflow.jobs.pageSize', '7')
    expect(getJobsPageSize()).toBe(6)
    localStorage.setItem('jobflow.jobs.pageSize', 'bad')
    expect(getJobsPageSize()).toBe(6)
  })

  it.each([6, 15, 30, 50] as const)('restores the saved page size %i', (size) => {
    setJobsPageSize(size)
    expect(getJobsPageSize()).toBe(size)
    expect(localStorage.getItem('jobflow.jobs.pageSize')).toBe(String(size))
  })

  it('ignores unsupported values', () => {
    setJobsPageSize(7 as never)
    expect(localStorage.getItem('jobflow.jobs.pageSize')).toBeNull()
  })
})
