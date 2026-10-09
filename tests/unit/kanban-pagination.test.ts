import { describe, expect, it, vi } from 'vitest'
import { fetchAllJobPages } from '../../src/renderer/features/jobs/kanban-data'
import type { JobSummary } from '../../src/shared/contracts/api'

function row(id: number): JobSummary {
  return {
    id: `job-${id}`,
    applicationId: `app-${id}`,
    companyId: 'company-1',
    companyName: '示例公司',
    title: `岗位 ${id}`,
    city: null,
    stage: 'TO_APPLY',
    priority: 2,
    pinned: false,
    nextAction: null,
    nextActionAt: null,
    deadline: null,
    appliedAt: null,
    updatedAt: '2026-09-24T00:00:00.000Z',
  }
}

describe('Kanban pagination', () => {
  it('loads every page until the reported total is covered', async () => {
    const all = Array.from({ length: 105 }, (_, index) => row(index + 1))
    const listPage = vi.fn(async (page: number, pageSize: number) => ({
      ok: true as const,
      data: { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length },
    }))
    const result = await fetchAllJobPages(listPage)
    expect(result.items).toHaveLength(105)
    expect(result.items[104].id).toBe('job-105')
    expect(listPage.mock.calls.map(([page]) => page)).toEqual([1, 2])
  })

  it('loads all jobs beyond the first page for interview scheduling choices', async () => {
    const all = Array.from({ length: 205 }, (_, index) => row(index + 1))
    const listPage = vi.fn(async (page: number, pageSize: number) => ({
      ok: true as const,
      data: { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length },
    }))
    const result = await fetchAllJobPages(listPage)
    expect(result.items).toHaveLength(205)
    expect(result.items.map((item) => item.applicationId)).toContain('app-205')
    expect(listPage.mock.calls.map(([page]) => page)).toEqual([1, 2, 3])
  })
})
