import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../../src/main/db/migrate'
import { createRepositories } from '../../src/main/repositories'
import { createJobsService } from '../../src/main/services/jobs.service'
import { createCompaniesService } from '../../src/main/services/companies.service'
import { createInterviewFlowService } from '../../src/main/services/interview-flow.service'

let db: Database.Database
let repositories: ReturnType<typeof createRepositories>
let service: ReturnType<typeof createJobsService>
let companyId: string

beforeEach(async () => {
  db = new Database(':memory:')
  await migrateDatabase(db)
  repositories = createRepositories(db)
  companyId = repositories.companies.create({ name: '星河科技' }).id
  service = createJobsService(db, repositories)
})
afterEach(() => db.close())

describe('jobs service', () => {
  it('projects the current interview round and listing URL from canonical related records', () => {
    const job = service.create({ companyId, title: '嵌入式工程师', url: 'https://jobs.example/embedded' })
    const interview = createInterviewFlowService(db, repositories).schedule({
      applicationId: job.applicationId,
      roundNumber: 1,
      interviewAt: '2026-10-02T09:00:00.000Z',
      type: 'MANAGER',
    })
    const listed = service.list({ filters: {} }).items.find((item) => item.id === job.id) as unknown as {
      primaryListingUrl: string
      currentInterview: unknown
    }
    expect(listed).toMatchObject({
      primaryListingUrl: 'https://jobs.example/embedded',
      currentInterview: {
        id: interview.id,
        roundNumber: 1,
        type: 'MANAGER',
        interviewAt: '2026-10-02T09:00:00.000Z',
      },
    })
  })
  it('keeps pinned jobs ahead of priority and recency while terminal jobs stay below active jobs', () => {
    const pinned = service.create({ companyId, title: '置顶跟进岗位', priority: 3, pinned: true })
    const recent = service.create({ companyId, title: '最近更新岗位', priority: 1 })
    const terminalPinned = service.create({ companyId, title: '终态置顶岗位', priority: 1, pinned: true })
    db.prepare('UPDATE jobs SET updated_at=? WHERE id=?').run('2026-09-01T00:00:00.000Z', pinned.id)
    db.prepare('UPDATE jobs SET updated_at=? WHERE id=?').run('2026-09-26T00:00:00.000Z', recent.id)
    db.prepare("UPDATE applications SET current_stage='OFFER' WHERE id=?").run(terminalPinned.applicationId)

    expect(service.list({ filters: {} }).items.map((job) => job.id)).toEqual([
      pinned.id,
      recent.id,
      terminalPinned.id,
    ])
  })
  it('rejects a stale edit instead of overwriting a newer job revision', () => {
    const job = service.create({ companyId, title: '最初标题' })
    const firstEdit = service.update({ id: job.id, title: '较新标题' }) as { updatedAt: string }

    expect(() =>
      service.update({ id: job.id, title: '过期覆盖', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' }),
    ).toThrow('岗位信息已被其他操作更新，请刷新后重试')
    expect(repositories.jobs.get(job.id)).toMatchObject({ title: '较新标题', updatedAt: firstEdit.updatedAt })
  })

  it('suggests duplicates by normalized URL or company and title without blocking explicit create', () => {
    const first = service.create({
      companyId,
      title: ' 嵌入式  软件工程师 ',
      url: 'https://jobs.example.com/role/1?utm_source=feed',
      source: '官网',
      jdText: '负责设备软件',
    })
    const byUrl = service.findDuplicates({
      companyId,
      title: '完全不同',
      url: 'https://JOBS.example.com/role/1/',
    })
    expect(byUrl.map((job) => job.id)).toContain(first.id)
    const byTitle = service.findDuplicates({ companyId, title: '嵌入式软件工程师' })
    expect(byTitle.map((job) => job.id)).toContain(first.id)
    const forced = service.create(
      { companyId, title: '嵌入式软件工程师', url: 'https://jobs.example.com/role/1/' },
      { allowDuplicate: true },
    )
    expect(forced.id).not.toBe(first.id)
    expect(repositories.jobs.get(forced.id)).toBeTruthy()
  })

  it('applies filters with AND and returns active stages before terminal and archived jobs', () => {
    const active = service.create({
      companyId,
      title: '驱动工程师',
      city: '上海',
      deadline: '2026-10-01',
      priority: 1,
      tags: ['嵌入式'],
    })
    const second = service.create({
      companyId,
      title: '测试工程师',
      city: '上海',
      priority: 2,
      tags: ['测试'],
    })
    const otherCity = service.create({
      companyId,
      title: '驱动工程师',
      city: '杭州',
      priority: 1,
      tags: ['嵌入式'],
    })
    db.prepare(
      "UPDATE applications SET current_stage='APPLIED', applied_at='2026-09-20T00:00:00.000Z' WHERE id=?",
    ).run(active.applicationId)
    db.prepare("UPDATE applications SET current_stage='OFFER' WHERE id=?").run(second.applicationId)
    const results = service.list({
      filters: {
        city: '上海',
        stage: 'APPLIED',
        priority: 1,
        tag: '嵌入式',
        appliedFrom: '2026-09-19',
        appliedTo: '2026-09-21',
        deadlineTo: '2026-10-02',
      },
    })
    expect(results.total).toBe(1)
    expect(results.items[0].id).toBe(active.id)
    expect(service.list({ filters: {} }).items.map((job) => job.id)).toEqual(
      expect.arrayContaining([active.id, second.id, otherCity.id]),
    )
    const unfiltered = service.list({ filters: {} }).items
    expect(unfiltered.findIndex((job) => job.id === second.id)).toBeGreaterThan(
      unfiltered.findIndex((job) => job.id === active.id),
    )
  })

  it('creates the default application with job data and preserves multiple listing snapshots', () => {
    const job = service.create({
      companyId,
      title: '平台研发',
      city: '杭州',
      nextAction: '准备简历',
      nextActionAt: '2026-09-25T09:00:00.000Z',
      url: 'https://jobs.example.com/1',
      jdText: '初始职责',
    })
    const secondListing = service.addListing(job.id, {
      url: 'https://jobs.example.com/2',
      source: '招聘平台',
      pageTitle: '平台研发岗位',
      capturedAt: '2026-09-20T08:00:00.000Z',
      jdText: '更新后的职责',
    })
    service.updateListing({
      id: secondListing.id,
      url: 'https://jobs.example.com/updated',
      source: '公司招聘官网',
      pageTitle: '平台研发（应届生）',
      deadlineSnapshot: '2026-10-01',
      capturedAt: '2026-09-21T08:00:00.000Z',
    })
    service.updateListing({
      id: secondListing.id,
      url: undefined,
      source: '只更新来源',
      pageTitle: undefined,
      deadlineSnapshot: undefined,
      capturedAt: undefined,
    })
    const detail = service.get(job.id)
    expect(detail?.application.currentStage).toBe('TO_APPLY')
    expect(detail?.application.nextAction).toBe('准备简历')
    expect(detail?.listings).toHaveLength(2)
    expect(detail?.listings.map((listing) => listing.jdText)).toEqual(
      expect.arrayContaining(['初始职责', '更新后的职责']),
    )
    expect(detail?.listings.find((listing) => listing.id === secondListing.id)).toMatchObject({
      url: 'https://jobs.example.com/updated',
      source: '只更新来源',
      pageTitle: '平台研发（应届生）',
      deadlineSnapshot: '2026-10-01',
      jdText: '更新后的职责',
      capturedAt: '2026-09-21T08:00:00.000Z',
    })
    const jdOnly = service.list({ filters: { query: '更新后的职责', city: '杭州' } })
    expect(jdOnly.total).toBe(1)
    expect(jdOnly.items.map((item) => item.id)).toEqual([job.id])
    const matchesMultipleListings = service.list({
      filters: { query: '职责', city: '杭州' },
      page: { page: 1, pageSize: 1 },
    })
    expect(matchesMultipleListings.total).toBe(1)
    expect(matchesMultipleListings.items.map((item) => item.id)).toEqual([job.id])
  })

  it('updates company and job fields, tags and primary listing, and exposes all jobs in one company list', () => {
    const company = repositories.companies.update(companyId, { name: '星河微电子' })
    expect(company?.name).toBe('星河微电子')
    const job = service.create({
      companyId,
      title: '固件开发',
      url: 'https://jobs.example.com/firmware',
      jdText: '原始招聘描述',
    })
    service.update({
      id: job.id,
      title: '高级固件开发',
      priority: 1,
      pinned: true,
      tags: ['重点', '嵌入式'],
      requirements: '整理后的要求',
    })
    expect(service.get(job.id)?.listings[0].jdText).toBe('原始招聘描述')
    expect(service.get(job.id)?.application.priority).toBe(1)
    expect(service.get(job.id)?.tags.map((tag: { name: string }) => tag.name)).toContain('重点')
    expect(service.list({ filters: { query: '高级固件', city: '上海' } }).total).toBe(0)
    const companyDetail = createCompaniesService(db, repositories).get(companyId) as {
      jobs: Array<{ id: string }>
    }
    expect(companyDetail.jobs.map((item) => item.id)).toContain(job.id)
  })

  it('supports both whitelist sort directions with a stable update-time tie break', () => {
    const alpha = service.create({ companyId, title: 'Alpha岗位', priority: 1 })
    const beta = service.create({ companyId, title: 'Zulu岗位', priority: 3 })
    db.prepare('UPDATE jobs SET updated_at=? WHERE id=?').run('2026-09-23T10:00:00.000Z', alpha.id)
    db.prepare('UPDATE jobs SET updated_at=? WHERE id=?').run('2026-09-23T10:00:00.000Z', beta.id)
    db.prepare("UPDATE applications SET applied_at='2026-09-21T10:00:00.000Z' WHERE id=?").run(
      alpha.applicationId,
    )
    db.prepare("UPDATE applications SET applied_at='2026-09-22T10:00:00.000Z' WHERE id=?").run(
      beta.applicationId,
    )
    expect(service.list({ sort: 'priority', direction: 'asc' }).items.map((job) => job.id)).toEqual([
      alpha.id,
      beta.id,
    ])
    expect(service.list({ sort: 'appliedAt', direction: 'desc' }).items.map((job) => job.id)).toEqual([
      beta.id,
      alpha.id,
    ])
    expect(service.list({ sort: 'updatedAt', direction: 'asc' }).items.map((job) => job.id)).toEqual(
      [alpha.id, beta.id].sort(),
    )
    expect(service.list({ sort: null }).items.map((job) => job.id)).toEqual([alpha.id, beta.id])
  })

  it('soft deletes, restores and permanently deletes only the selected job', () => {
    const shared = service.create({ companyId, title: '保留公司关系' })
    const deleted = service.create({ companyId, title: '回收站岗位', url: 'https://jobs.example.com/trash' })
    const appId = deleted.applicationId
    db.prepare(
      'INSERT INTO application_events(id,application_id,type,title,event_at,created_at) VALUES (?,?,?,?,?,?)',
    ).run(
      'trash-history',
      appId,
      'NOTE',
      '保留的历史',
      '2026-09-20T00:00:00.000Z',
      '2026-09-20T00:00:00.000Z',
    )
    service.softDelete(deleted.id)
    expect(service.list({ filters: {} }).items.map((job) => job.id)).not.toContain(deleted.id)
    expect(service.list({ filters: { stage: 'DELETED' } }).items.map((job) => job.id)).toContain(deleted.id)
    expect(repositories.events.listByApplication(appId)).toHaveLength(1)
    service.restore(deleted.id)
    expect(service.list({ filters: {} }).items.map((job) => job.id)).toContain(deleted.id)
    service.softDelete(deleted.id)
    service.permanentlyDelete(deleted.id)
    expect(repositories.jobs.get(deleted.id)).toBeUndefined()
    expect(repositories.companies.get(companyId)).toBeTruthy()
    expect(repositories.jobs.get(shared.id)).toBeTruthy()
  })
})
