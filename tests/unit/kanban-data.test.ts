import { describe, expect, it } from 'vitest'
import type { JobSummary } from '../../src/shared/contracts/api'
import { applicationStages, kanbanStages, type ApplicationStage } from '../../src/shared/constants/stages'
import { buildKanbanColumns } from '../../src/renderer/features/jobs/kanban-data'

function row(
  id: string,
  companyId: string,
  companyName: string,
  stage: ApplicationStage,
  title = id,
  updatedAt = '2026-09-24T00:00:00.000Z',
): JobSummary {
  return {
    id,
    applicationId: `app-${id}`,
    companyId,
    companyName,
    title,
    city: null,
    stage,
    priority: 2,
    pinned: false,
    nextAction: null,
    nextActionAt: null,
    deadline: null,
    appliedAt: null,
    updatedAt,
  }
}

describe('kanban company grouping', () => {
  it('groups jobs and counts them within each stage, with stable company and job sorting', () => {
    const columns = buildKanbanColumns([
      row('b2', 'company-b', '贝塔', 'APPLIED', '嵌入式工程师'),
      row('a2', 'company-a', '阿尔法', 'APPLIED', '软件工程师'),
      row('a3', 'company-a', '阿尔法', 'INTERVIEW_PENDING', '驱动工程师'),
      row('b1', 'company-b', '贝塔', 'APPLIED', '固件工程师'),
      row('a1', 'company-a', '阿尔法', 'APPLIED', '测试工程师'),
    ])

    expect(columns.map((column) => column.stage)).toEqual(kanbanStages)
    expect(columns.map((column) => column.stage)).not.toContain('TO_APPLY')
    expect(applicationStages).toContain('TO_APPLY')
    const applied = columns.find((column) => column.stage === 'APPLIED')!
    expect(applied.count).toBe(4)
    expect(applied.companies.map((company) => company.companyName)).toEqual(['阿尔法', '贝塔'])
    expect(applied.companies[0].jobs.map((job) => job.id)).toEqual(['a1', 'a2'])
    expect(columns.find((column) => column.stage === 'INTERVIEW_PENDING')?.count).toBe(1)
    expect(columns.find((column) => column.stage === 'INTERVIEW_PENDING')?.companies[0].jobs[0].id).toBe('a3')
  })

  it('keeps adjacent company colors distinct for more companies than the palette', () => {
    const jobs = Array.from({ length: 25 }, (_, index) =>
      row(`job-${index}`, `company-${index}`, `公司${String(index).padStart(2, '0')}`, 'APPLIED'),
    )
    const applied = buildKanbanColumns(jobs).find((column) => column.stage === 'APPLIED')!
    const colors = applied.companies.map((company) => company.color)

    expect(colors).toHaveLength(25)
    expect(colors.every((color, index) => index === 0 || color !== colors[index - 1])).toBe(true)
    expect(
      buildKanbanColumns([...jobs].reverse()).find((column) => column.stage === 'APPLIED')?.companies,
    ).toEqual(applied.companies)
  })

  it('places the most recently updated company and job first in their destination column', () => {
    const applied = buildKanbanColumns([
      row('job-old', 'company-a', '阿尔法', 'APPLIED', '旧岗位', '2026-09-24T09:00:00.000Z'),
      row('job-new', 'company-a', '阿尔法', 'APPLIED', '新岗位', '2026-09-26T09:00:00.000Z'),
      row('job-other', 'company-b', '贝塔', 'APPLIED', '另一岗位', '2026-09-25T09:00:00.000Z'),
    ]).find((column) => column.stage === 'APPLIED')!

    expect(applied.companies.map((company) => company.companyId)).toEqual(['company-a', 'company-b'])
    expect(applied.companies[0].jobs.map((job) => job.id)).toEqual(['job-new', 'job-old'])
  })

  it('keeps pinned jobs and their company groups above newer unpinned jobs', () => {
    const pinnedOld = {
      ...row('job-pinned', 'company-a', '阿尔法', 'APPLIED', '置顶岗位', '2026-09-20T09:00:00.000Z'),
      pinned: true,
      priority: 3,
    }
    const normalNew = {
      ...row('job-new', 'company-b', '贝塔', 'APPLIED', '新岗位', '2026-09-26T09:00:00.000Z'),
      priority: 1,
    }
    const applied = buildKanbanColumns([normalNew, pinnedOld]).find((column) => column.stage === 'APPLIED')!

    expect(applied.companies.map((company) => company.companyId)).toEqual(['company-a', 'company-b'])
    expect(applied.companies[0].jobs.map((job) => job.id)).toEqual(['job-pinned'])
  })
})
