import type { ApiResult, JobSummary } from '../../../shared/contracts/api'
import { kanbanStages, stageLabels, type ApplicationStage } from '../../../shared/constants/stages'

export interface CompanyJobGroup {
  companyId: string
  companyName: string
  jobs: JobSummary[]
  color: string
}

export interface KanbanColumn {
  stage: ApplicationStage
  label: string
  count: number
  companies: CompanyJobGroup[]
}

const companyColors = [
  '#e7efff',
  '#e5f5ef',
  '#fff0df',
  '#f0eaff',
  '#e3f4f6',
  '#ffe9ec',
  '#edf3df',
  '#fce9db',
  '#e8eafa',
  '#e2f2e8',
  '#f8e8f4',
  '#e5eef2',
]

function stableHash(value: string): number {
  let hash = 2166136261
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return hash >>> 0
}

function colorForCompany(companyId: string, previousColor?: string): string {
  const start = stableHash(companyId) % companyColors.length
  for (let offset = 0; offset < companyColors.length; offset += 1) {
    const color = companyColors[(start + offset) % companyColors.length]
    if (color !== previousColor) return color
  }
  return companyColors[start]
}

function compareJobs(left: JobSummary, right: JobSummary): number {
  return (
    Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) ||
    left.priority - right.priority ||
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
    left.id.localeCompare(right.id)
  )
}

export function buildKanbanColumns(items: JobSummary[]): KanbanColumn[] {
  return kanbanStages.map((stage) => {
    const groups = new Map<string, JobSummary[]>()
    for (const job of items) {
      if (job.stage !== stage) continue
      const group = groups.get(job.companyId) ?? []
      group.push(job)
      groups.set(job.companyId, group)
    }

    const sortedGroups = [...groups.entries()]
      .map(([companyId, jobs]) => ({
        companyId,
        companyName: jobs[0].companyName,
        jobs: jobs.sort(compareJobs),
      }))
      .sort(
        (left, right) =>
          compareJobs(left.jobs[0], right.jobs[0]) || left.companyId.localeCompare(right.companyId),
      )

    let previousColor: string | undefined
    const companies = sortedGroups.map((group) => {
      const color = colorForCompany(group.companyId, previousColor)
      previousColor = color
      return { ...group, color }
    })

    return {
      stage,
      label: stageLabels['zh-CN'][stage],
      count: companies.reduce((total, company) => total + company.jobs.length, 0),
      companies,
    }
  })
}

export async function fetchAllJobPages(
  listPage: (page: number, pageSize: number) => Promise<ApiResult<{ items: JobSummary[]; total: number }>>,
  pageSize = 100,
): Promise<{ items: JobSummary[]; total: number }> {
  const items: JobSummary[] = []
  let total = Number.POSITIVE_INFINITY
  let page = 1
  while (items.length < total) {
    const result = await listPage(page, pageSize)
    if (!result.ok) throw new Error(result.messageZh)
    if (result.data.items.length === 0 && items.length < result.data.total)
      throw new Error('岗位分页读取不完整，请重试')
    items.push(...result.data.items)
    total = result.data.total
    page += 1
  }
  return { items, total }
}
