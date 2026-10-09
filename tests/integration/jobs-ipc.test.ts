import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../../src/main/db/migrate'
import { createRepositories } from '../../src/main/repositories'
import { createJobIpcServices } from '../../src/main/services/job-ipc-services'
import { createHandlerRegistry } from '../../src/main/ipc/register-handlers'

let db: Database.Database
let registry: ReturnType<typeof createHandlerRegistry>
const senderFrame = { url: 'app://jobflow/', isMainFrame: true }
const call = (channel: string, input: unknown) => registry.dispatch(channel, { senderFrame, args: [input] })
beforeEach(async () => {
  db = new Database(':memory:')
  await migrateDatabase(db)
  registry = createHandlerRegistry('app://jobflow', createJobIpcServices(db, createRepositories(db)))
})
afterEach(() => db.close())

describe('validated company and job IPC services', () => {
  it('publishes change notices only after successful validated mutations', async () => {
    const changes: Array<{ domain: string; entityId?: string }> = []
    const changesRegistry = createHandlerRegistry(
      'app://jobflow',
      createJobIpcServices(db, createRepositories(db)),
      (change) => changes.push(change),
    )
    const dispatch = (channel: string, input: unknown) =>
      changesRegistry.dispatch(channel, { senderFrame, args: [input] })
    const company = (await dispatch('jobflow:companies.create', { name: '变更广播公司' })) as {
      data: { id: string }
    }
    const created = (await dispatch('jobflow:jobs.create', {
      companyId: company.data.id,
      title: '广播岗位',
    })) as { data: { id: string } }
    expect(changes).toContainEqual({ domain: 'jobs', entityId: created.data.id })
    await expect(dispatch('jobflow:jobs.update', { id: created.data.id, priority: null })).rejects.toThrow()
    expect(changes).toHaveLength(2)
  })

  it('requires explicit confirmation to permanently delete a past interview and supports type-only updates', async () => {
    const company = (await call('jobflow:companies.create', { name: '面试记录 IPC 公司' })) as {
      ok: true
      data: { id: string }
    }
    const job = (await call('jobflow:jobs.create', { companyId: company.data.id, title: '面试岗位' })) as {
      ok: true
      data: { applicationId: string }
    }
    const created = (await call('jobflow:interviews.create', {
      applicationId: job.data.applicationId,
      roundNumber: 1,
      interviewAt: '2026-09-20T09:00:00.000Z',
    })) as { ok: true; data: { id: string } }
    await call('jobflow:interviews.complete', { id: created.data.id })
    await expect(call('jobflow:interviews.deletePast', { id: created.data.id })).rejects.toThrow()
    await call('jobflow:interviews.setType', { id: created.data.id, type: 'MANAGER' })
    const updated = (await call('jobflow:interviews.get', { id: created.data.id })) as {
      ok: true
      data: { type: string; completedAt: string }
    }
    expect(updated.data).toMatchObject({ type: 'MANAGER', completedAt: expect.any(String) })
    await call('jobflow:interviews.deletePast', { id: created.data.id, confirm: true })
    await expect(call('jobflow:interviews.get', { id: created.data.id })).resolves.toMatchObject({
      ok: true,
      data: undefined,
    })
  })

  it('moves a scheduled interview through the shared IPC flow into the pending interview lane', async () => {
    const company = (await call('jobflow:companies.create', { name: '面试联动公司' })) as {
      ok: true
      data: { id: string }
    }
    const job = (await call('jobflow:jobs.create', {
      companyId: company.data.id,
      title: '嵌入式工程师',
    })) as { ok: true; data: { applicationId: string } }

    await expect(
      call('jobflow:interviews.create', {
        applicationId: job.data.applicationId,
        roundNumber: 1,
        interviewAt: '2026-10-01T09:00:00.000Z',
        type: 'TECHNICAL',
      }),
    ).resolves.toMatchObject({ ok: true })

    const application = (await call('jobflow:jobs.list', {
      filters: {},
      page: { page: 1, pageSize: 20 },
    })) as { ok: true; data: { items: Array<{ applicationId: string; stage: string }> } }
    expect(application.data.items).toContainEqual(
      expect.objectContaining({ applicationId: job.data.applicationId, stage: 'INTERVIEW_PENDING' }),
    )
  })

  it('updates priority and pinned while nullable job fields remain empty', async () => {
    const company = (await call('jobflow:companies.create', { name: '空值公司' })) as {
      ok: true
      data: { id: string }
    }
    const job = (await call('jobflow:jobs.create', { companyId: company.data.id, title: '测试岗位' })) as {
      ok: true
      data: { id: string }
    }
    await expect(call('jobflow:jobs.archive', { id: job.data.id })).rejects.toThrow('Unknown IPC method')

    await expect(
      call('jobflow:jobs.update', {
        id: job.data.id,
        city: null,
        department: null,
        jobCode: null,
        salary: null,
        deadline: null,
        requirements: null,
        notes: null,
        priority: 1,
        pinned: true,
      }),
    ).resolves.toMatchObject({ ok: true })

    const detail = (await call('jobflow:jobs.get', { id: job.data.id })) as {
      ok: true
      data: { application: { priority: number; pinned: number } }
    }
    expect(detail.data.application).toMatchObject({ priority: 1, pinned: 1 })
  })

  it('reports malformed IPC input in Chinese without exposing an English schema dump', async () => {
    const company = (await call('jobflow:companies.create', { name: '校验公司' })) as {
      ok: true
      data: { id: string }
    }
    const job = (await call('jobflow:jobs.create', { companyId: company.data.id, title: '校验岗位' })) as {
      ok: true
      data: { id: string }
    }
    await expect(call('jobflow:jobs.update', { id: job.data.id, priority: null })).rejects.toThrow(
      '输入内容有误，请检查必填项和格式后重试',
    )
  })

  it('validates action completion and per-item notification settings over IPC', async () => {
    const company = (await call('jobflow:companies.create', { name: '行动 IPC 公司' })) as {
      ok: true
      data: { id: string }
    }
    const job = (await call('jobflow:jobs.create', { companyId: company.data.id, title: '待投递岗位' })) as {
      ok: true
      data: { id: string; applicationId: string }
    }

    await expect(
      call('jobflow:applications.completeStageAction', { id: job.data.applicationId }),
    ).rejects.toThrow(/投递时间和投递渠道/)
    await expect(
      call('jobflow:applications.setStageNotification', {
        id: job.data.applicationId,
        enabled: true,
        notificationAt: null,
      }),
    ).rejects.toThrow(/请选择桌面通知时间/)
    await expect(
      call('jobflow:applications.setStageNotification', {
        id: job.data.applicationId,
        enabled: true,
        notificationAt: 'not-a-date',
      }),
    ).rejects.toThrow(/输入内容有误/)

    await call('jobflow:applications.completeStageAction', {
      id: job.data.applicationId,
      appliedAt: '2026-09-26T09:00:00.000Z',
      channel: '官网',
      resumeVersionId: null,
    })
    const summary = (await call('jobflow:dashboard.getSummary', {})) as {
      ok: true
      data: { actionLanes: Array<{ key: string; count: number }> }
    }
    expect(summary.data.actionLanes.find(({ key }) => key === 'TO_APPLY')?.count).toBe(0)
  })

  it('runs company/job create, duplicate confirmation, update, details and listing snapshots through IPC schemas', async () => {
    const companyResult = (await call('jobflow:companies.create', {
      name: '星河科技',
      careersUrl: 'https://careers.example.com',
    })) as { ok: true; data: { id: string } }
    const companyId = companyResult.data.id
    await call('jobflow:companies.update', { id: companyId, name: '星河微电子' })
    const created = (await call('jobflow:jobs.create', {
      companyId,
      title: '嵌入式工程师',
      city: '上海',
      url: 'https://jobs.example.com/one?utm_source=campaign',
      source: '官网',
      jdText: '保留 JD 原文',
      tags: ['嵌入式'],
      priority: 1,
    })) as { ok: true; data: { id: string; applicationId: string } }
    expect(created.data.applicationId).toBeTruthy()
    const duplicate = (await call('jobflow:jobs.findDuplicates', {
      companyId,
      title: '嵌入式工程师',
      url: 'https://JOBS.example.com/one/',
    })) as { ok: true; data: Array<{ id: string }> }
    expect(duplicate.data.map((item) => item.id)).toContain(created.data.id)
    const forced = (await call('jobflow:jobs.create', {
      companyId,
      title: '嵌入式工程师',
      allowDuplicate: true,
    })) as { ok: true; data: { id: string; duplicateAccepted: boolean } }
    expect(forced.data.duplicateAccepted).toBe(true)
    const added = (await call('jobflow:jobs.addListing', {
      jobId: created.data.id,
      url: 'https://jobs.example.com/two',
      source: '平台',
      pageTitle: '职位页面',
      capturedAt: '2026-09-20T08:00:00.000Z',
      jdText: '第二份快照',
    })) as { ok: true; data: { id: string } }
    await call('jobflow:jobs.updateListing', {
      id: added.data.id,
      url: 'https://jobs.example.com/updated',
      source: '公司官网',
      pageTitle: '职位页面新版',
      capturedAt: '2026-09-21T08:00:00.000Z',
      deadlineSnapshot: '2026-10-01',
    })
    await call('jobflow:jobs.updateListing', { id: added.data.id, source: '仅更新来源' })
    await expect(
      call('jobflow:jobs.updateListing', { id: added.data.id, jdText: '覆盖原文' }),
    ).rejects.toThrow()
    await call('jobflow:jobs.update', {
      id: created.data.id,
      title: '高级嵌入式工程师',
      pinned: true,
      tags: ['重点'],
      notes: 'IPC 更新',
    })
    const detail = (await call('jobflow:jobs.get', { id: created.data.id })) as {
      ok: true
      data: {
        title: string
        listings: Array<{ jdText: string }>
        application: { currentStage: string; priority: number; pinned: number }
        tags: Array<{ name: string }>
      }
    }
    expect(detail.data.title).toBe('高级嵌入式工程师')
    expect(detail.data.application).toMatchObject({ currentStage: 'TO_APPLY', priority: 1, pinned: 1 })
    expect(detail.data.listings.map((item) => item.jdText)).toEqual(
      expect.arrayContaining(['保留 JD 原文', '第二份快照']),
    )
    expect(detail.data.listings.find((item) => item.jdText === '第二份快照')).toMatchObject({
      url: 'https://jobs.example.com/updated',
      source: '仅更新来源',
      pageTitle: '职位页面新版',
      capturedAt: '2026-09-21T08:00:00.000Z',
      deadlineSnapshot: '2026-10-01',
    })
    await call('jobflow:jobs.updateListing', { id: added.data.id, url: null })
    const clearedUrl = (await call('jobflow:jobs.get', { id: created.data.id })) as {
      ok: true
      data: {
        listings: Array<{
          jdText: string
          url: string | null
          source: string
          pageTitle: string
          capturedAt: string
          deadlineSnapshot: string
        }>
      }
    }
    expect(clearedUrl.data.listings.find((item) => item.jdText === '第二份快照')).toMatchObject({
      url: null,
      source: '仅更新来源',
      pageTitle: '职位页面新版',
      capturedAt: '2026-09-21T08:00:00.000Z',
      deadlineSnapshot: '2026-10-01',
    })
    expect(detail.data.tags.map((item) => item.name)).toContain('重点')
    const filtered = (await call('jobflow:jobs.list', {
      filters: { query: '高级嵌入式', city: '上海', priority: 1 },
    })) as { ok: true; data: { total: number } }
    expect(filtered.data.total).toBe(1)
    const afterArchive = (await call('jobflow:jobs.list', {})) as { ok: true; data: { total: number } }
    expect(afterArchive.data.total).toBe(2)
    const company = (await call('jobflow:companies.get', { id: companyId })) as {
      ok: true
      data: { name: string; jobs: Array<{ id: string }> }
    }
    expect(company.data.name).toBe('星河微电子')
    expect(company.data.jobs.map((job) => job.id)).toEqual(
      expect.arrayContaining([created.data.id, forced.data.id]),
    )
    await call('jobflow:companies.archive', { id: companyId })
    const companies = (await call('jobflow:companies.list', {})) as { ok: true; data: Array<{ id: string }> }
    expect(companies.data.map((item) => item.id)).not.toContain(companyId)
  })

  it('moves jobs into trash and requires explicit confirmation to permanently remove them', async () => {
    const company = (await call('jobflow:companies.create', { name: '回收站公司' })) as {
      ok: true
      data: { id: string }
    }
    const job = (await call('jobflow:jobs.create', { companyId: company.data.id, title: '回收站岗位' })) as {
      ok: true
      data: { id: string }
    }
    await call('jobflow:jobs.softDelete', { id: job.data.id })
    const visible = (await call('jobflow:jobs.list', {})) as {
      ok: true
      data: { items: Array<{ id: string }>; total: number }
    }
    const trash = (await call('jobflow:jobs.list', { filters: { stage: 'DELETED' } })) as {
      ok: true
      data: { items: Array<{ id: string }>; total: number }
    }
    expect(visible.data.items.map((item) => item.id)).not.toContain(job.data.id)
    expect(trash.data.items.map((item) => item.id)).toContain(job.data.id)
    await expect(call('jobflow:jobs.permanentlyDelete', { id: job.data.id })).rejects.toThrow('输入内容有误')
    await call('jobflow:jobs.restore', { id: job.data.id })
    await call('jobflow:jobs.softDelete', { id: job.data.id })
    await call('jobflow:jobs.permanentlyDelete', { id: job.data.id, confirm: true })
    const afterDelete = (await call('jobflow:jobs.list', { filters: { stage: 'DELETED' } })) as {
      ok: true
      data: { total: number }
    }
    expect(afterDelete.data.total).toBe(0)
  })
})
