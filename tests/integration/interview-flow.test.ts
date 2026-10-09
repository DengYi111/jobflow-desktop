import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadMigrations, migrateDatabase } from '../../src/main/db/migrate'
import { createRepositories } from '../../src/main/repositories'
import { createInterviewFlowService } from '../../src/main/services/interview-flow.service'
import { createInterviewsService } from '../../src/main/services/interviews.service'

let db: Database.Database
let flow: ReturnType<typeof createInterviewFlowService>
let repositories: ReturnType<typeof createRepositories>
let applicationId: string

beforeEach(() => {
  db = new Database(':memory:')
  migrateDatabase(db)
  repositories = createRepositories(db)
  flow = createInterviewFlowService(db)
  const company = repositories.companies.create({ name: '面试流程公司' })
  const job = repositories.jobs.create({ companyId: company.id, title: '软件工程师' })
  applicationId = repositories.applications.create({ jobId: job.id, currentStage: 'ASSESSMENT_DONE' }).id
})

afterEach(() => db.close())

describe('interview flow', () => {
  it('migrates cancelled rounds on rejected applications to ended rounds without round-index conflicts', async () => {
    const legacyDb = new Database(':memory:')
    try {
      await migrateDatabase(legacyDb, {
        migrations: loadMigrations().filter((migration) => migration.version <= 12),
      })
      const legacyRepositories = createRepositories(legacyDb)
      const company = legacyRepositories.companies.create({ name: '历史拒绝公司' })
      const job = legacyRepositories.jobs.create({ companyId: company.id, title: '研发工程师' })
      const application = legacyRepositories.applications.create({ jobId: job.id, currentStage: 'APPLIED' })
      const first = legacyRepositories.interviews.create({
        applicationId: application.id,
        type: 'TECHNICAL',
        round: '第 1 面',
        interviewAt: '2026-10-01T09:00:00.000Z',
      })
      const second = legacyRepositories.interviews.create({
        applicationId: application.id,
        type: 'TECHNICAL',
        round: '第 1 面',
        interviewAt: '2026-10-02T09:00:00.000Z',
      })
      legacyDb
        .prepare("UPDATE applications SET current_stage='CLOSED',close_reason='REJECTED' WHERE id=?")
        .run(application.id)
      legacyDb
        .prepare('UPDATE interviews SET round_number=1,cancelled_at=? WHERE id IN (?,?)')
        .run('2026-09-30T10:00:00.000Z', first.id, second.id)

      await migrateDatabase(legacyDb)

      expect(legacyRepositories.interviews.get(first.id)).toMatchObject({
        endedAt: '2026-09-30T10:00:00.000Z',
        cancelledAt: null,
      })
      expect(legacyRepositories.interviews.get(second.id)).toMatchObject({
        endedAt: '2026-09-30T10:00:00.000Z',
        cancelledAt: null,
      })
    } finally {
      legacyDb.close()
    }
  })

  it('deletes only a past round and cascades its owned data while preserving other rounds and manual events', () => {
    const past = flow.schedule({ applicationId, roundNumber: 1, interviewAt: '2026-09-20T09:00:00.000Z' })
    const future = flow.schedule({ applicationId, roundNumber: 2, interviewAt: '2026-10-02T09:00:00.000Z' })
    repositories.interviews.addQuestion({ interviewId: past.id, question: '删除的问题', category: '算法' })
    repositories.events.insert({
      applicationId,
      type: 'NOTE',
      title: '手动记录',
      eventAt: '2026-09-21T09:00:00.000Z',
    })
    repositories.events.insert({
      applicationId,
      type: 'OTHER',
      title: '第 1 面',
      stage: 'INTERVIEW_DONE',
      eventAt: '2026-09-20T09:00:00.000Z',
      interviewId: past.id,
      interviewRoundNumber: 1,
    })

    createInterviewsService(repositories, flow).deletePast(past.id)
    expect(repositories.interviews.get(past.id)).toBeUndefined()
    expect(repositories.interviews.get(future.id)).toBeTruthy()
    expect(repositories.events.listByApplication(applicationId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: '手动记录' })]),
    )
    expect(
      (repositories.events.listByApplication(applicationId) as Array<{ interviewId?: string | null }>).some(
        (event) => event.interviewId === past.id,
      ),
    ).toBe(false)
  })

  it('rejects deleting a future interview', () => {
    const future = flow.schedule({ applicationId, roundNumber: 1, interviewAt: '2026-10-02T09:00:00.000Z' })
    expect(() =>
      createInterviewsService(repositories, flow).deletePast(future.id, '2026-10-01T09:00:00.000Z'),
    ).toThrow('尚未结束')
    expect(repositories.interviews.get(future.id)).toBeTruthy()
  })
  it('requires all missing earlier round dates before scheduling a later round', () => {
    expect(() =>
      flow.schedule({ applicationId, roundNumber: 3, interviewAt: '2026-10-03T09:00:00.000Z' }),
    ).toThrow('第 1 面')
    expect(repositories.applications.get(applicationId)?.currentStage).toBe('ASSESSMENT_DONE')
  })

  it('rejects a custom round when its scheduled time precedes an earlier round', () => {
    flow.schedule({ applicationId, roundNumber: 1, interviewAt: '2026-10-02T09:00:00.000Z' })

    expect(() =>
      flow.schedule({ applicationId, roundNumber: 4, interviewAt: '2026-10-01T09:00:00.000Z' }),
    ).toThrow('第 1 面时间必须早于第 4 面')
    expect(repositories.interviews.list()).toHaveLength(1)
  })

  it('supports custom rounds after all numbered earlier rounds are saved', () => {
    flow.schedule({ applicationId, roundNumber: 1, interviewAt: '2026-10-01T09:00:00.000Z' })
    flow.schedule({ applicationId, roundNumber: 2, interviewAt: '2026-10-02T09:00:00.000Z' })
    flow.schedule({ applicationId, roundNumber: 3, interviewAt: '2026-10-03T09:00:00.000Z' })
    const fourth = flow.schedule({ applicationId, roundNumber: 4, interviewAt: '2026-10-04T09:00:00.000Z' })

    expect(repositories.interviews.get(fourth.id)).toMatchObject({ roundNumber: 4, round: '第 4 面' })
    expect(repositories.interviews.list().filter((item) => item.completedAt)).toHaveLength(3)
  })

  it('completes preceding rounds from their saved schedule times and records linked timeline markers', () => {
    flow.schedule({ applicationId, roundNumber: 1, interviewAt: '2026-10-01T09:00:00.000Z' })
    flow.schedule({ applicationId, roundNumber: 2, interviewAt: '2026-10-02T09:00:00.000Z' })
    const interviews = repositories.interviews.list()
    const first = interviews.find((item) => item.roundNumber === 1)
    expect(repositories.applications.get(applicationId)?.currentStage).toBe('INTERVIEW_PENDING')
    expect(first?.completedAt).toBe('2026-10-01T09:00:00.000Z')
    expect(repositories.events.listByApplication(applicationId)).toContainEqual(
      expect.objectContaining({
        title: '第 1 面',
        stage: 'INTERVIEW_DONE',
        eventAt: '2026-10-01T09:00:00.000Z',
        interviewId: first?.id,
        interviewRoundNumber: 1,
        interviewType: 'TECHNICAL',
      }),
    )
    flow.schedule({ applicationId, roundNumber: 2, interviewAt: '2026-10-02T10:00:00.000Z' })
    expect(
      repositories.events.listByApplication(applicationId).filter((event) => event.interviewId === first?.id),
    ).toHaveLength(1)
  })

  it('rolls a round back without removing its schedule, questions, or manual timeline records', () => {
    flow.schedule({ applicationId, roundNumber: 1, interviewAt: '2026-10-01T09:00:00.000Z' })
    flow.schedule({ applicationId, roundNumber: 2, interviewAt: '2026-10-02T09:00:00.000Z' })
    const second = repositories.interviews.list().find((item) => item.roundNumber === 2) as { id: string }
    repositories.interviews.addQuestion({ interviewId: second.id, question: '保留的题目', category: '算法' })
    repositories.events.insert({
      applicationId,
      type: 'NOTE',
      title: '手动记录',
      eventAt: '2026-10-02T10:00:00.000Z',
    })

    flow.schedule({ applicationId, roundNumber: 1, interviewAt: '2026-10-01T09:30:00.000Z' })

    expect(repositories.interviews.get(second.id)).toMatchObject({ completedAt: null, cancelledAt: null })
    expect(repositories.interviews.listQuestions(second.id)).toMatchObject([{ question: '保留的题目' }])
    expect(repositories.events.listByApplication(applicationId).map((event) => event.title)).toContain(
      '手动记录',
    )
    expect(
      repositories.events.listByApplication(applicationId).some((event) => event.interviewId === second.id),
    ).toBe(false)
  })

  it('requires explicit confirmation before cancelling pending schedules on an external stage move', () => {
    const interview = flow.schedule({
      applicationId,
      roundNumber: 1,
      interviewAt: '2026-10-01T09:00:00.000Z',
    })
    expect(() => flow.transition(applicationId, { stage: 'OFFER', title: '阶段更新为已获录用' })).toThrow(
      '确认取消',
    )
    expect(repositories.applications.get(applicationId)?.currentStage).toBe('INTERVIEW_PENDING')

    flow.transition(applicationId, {
      stage: 'OFFER',
      title: '阶段更新为已获录用',
      cancelOpenInterviews: true,
    })

    expect(repositories.interviews.get(interview.id)).toMatchObject({ cancelledAt: expect.any(String) })
    expect(repositories.applications.get(applicationId)?.currentStage).toBe('OFFER')
  })

  it('ends pending interviews when a candidate is rejected without marking them cancelled', () => {
    const interview = flow.schedule({
      applicationId,
      roundNumber: 1,
      interviewAt: '2026-10-01T09:00:00.000Z',
    })

    flow.transition(applicationId, {
      stage: 'CLOSED',
      title: '岗位已结束',
      closeReason: 'REJECTED',
      endOpenInterviews: true,
    })

    expect(repositories.interviews.get(interview.id)).toMatchObject({
      endedAt: expect.any(String),
      cancelledAt: null,
      completedAt: null,
    })
    expect(repositories.applications.get(applicationId)?.currentStage).toBe('CLOSED')
  })

  it('edits an ended interview without reopening the rejected application', () => {
    const interview = flow.schedule({
      applicationId,
      roundNumber: 1,
      interviewAt: '2026-10-01T09:00:00.000Z',
    })
    flow.transition(applicationId, {
      stage: 'CLOSED',
      title: '岗位已结束',
      closeReason: 'REJECTED',
      endOpenInterviews: true,
    })
    const endedAt = repositories.interviews.get(interview.id)?.endedAt

    createInterviewsService(repositories, flow).update({
      id: interview.id,
      roundNumber: 1,
      interviewAt: '2026-10-01T10:00:00.000Z',
      type: 'HR',
    })

    expect(repositories.interviews.get(interview.id)).toMatchObject({
      interviewAt: '2026-10-01T10:00:00.000Z',
      type: 'HR',
      endedAt,
    })
    expect(repositories.applications.get(applicationId)?.currentStage).toBe('CLOSED')
  })

  it('restores the pre-interview stage when the last open interview is cancelled', () => {
    const interview = flow.schedule({
      applicationId,
      roundNumber: 1,
      interviewAt: '2026-10-01T09:00:00.000Z',
    })
    flow.cancel(interview.id, '2026-09-30T12:00:00.000Z')

    expect(repositories.applications.get(applicationId)?.currentStage).toBe('ASSESSMENT_DONE')
    expect(repositories.interviews.get(interview.id)).toMatchObject({
      cancelledAt: '2026-09-30T12:00:00.000Z',
    })
  })

  it('marks the application as interviewed after its final active schedule is completed', () => {
    const interview = flow.schedule({
      applicationId,
      roundNumber: 1,
      interviewAt: '2026-10-01T09:00:00.000Z',
    })
    flow.complete(interview.id, '2026-10-01T10:00:00.000Z')

    expect(repositories.applications.get(applicationId)?.currentStage).toBe('INTERVIEW_DONE')
    expect(repositories.events.listByApplication(applicationId)).toContainEqual(
      expect.objectContaining({ interviewId: interview.id, title: '第 1 面' }),
    )
  })

  it('preserves a cancelled schedule and creates a new active entry when re-scheduling its round', () => {
    const cancelled = flow.schedule({
      applicationId,
      roundNumber: 1,
      interviewAt: '2026-10-01T09:00:00.000Z',
    })
    flow.cancel(cancelled.id)
    const replacement = flow.schedule({
      applicationId,
      roundNumber: 1,
      interviewAt: '2026-10-02T09:00:00.000Z',
    })

    expect(replacement.id).not.toBe(cancelled.id)
    expect(repositories.interviews.get(cancelled.id)).toMatchObject({ cancelledAt: expect.any(String) })
    expect(repositories.interviews.get(replacement.id)).toMatchObject({
      cancelledAt: null,
      interviewAt: '2026-10-02T09:00:00.000Z',
    })
  })

  it('excludes cancelled schedules from due desktop notifications', () => {
    const interview = flow.schedule({
      applicationId,
      roundNumber: 1,
      interviewAt: '2026-10-01T09:00:00.000Z',
    })
    repositories.interviews.setNotification({
      id: interview.id,
      enabled: true,
      notificationAt: '2026-09-26T10:00:00.000Z',
    })
    expect(repositories.interviews.listDueNotifications('2026-09-26T11:00:00.000Z')).toHaveLength(1)

    flow.cancel(interview.id, '2026-09-26T11:01:00.000Z')

    expect(repositories.interviews.listDueNotifications('2026-09-26T11:02:00.000Z')).toHaveLength(0)
  })

  it('rolls back stage, completion, and timeline writes together after an event insert failure', () => {
    const interview = flow.schedule({
      applicationId,
      roundNumber: 1,
      interviewAt: '2026-10-01T09:00:00.000Z',
    })
    db.exec(
      "CREATE TRIGGER fail_interview_event BEFORE INSERT ON application_events WHEN NEW.interview_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'event failure'); END",
    )

    expect(() => flow.complete(interview.id, '2026-10-01T10:00:00.000Z')).toThrow('event failure')

    expect(repositories.interviews.get(interview.id)?.completedAt).toBeNull()
    expect(repositories.applications.get(applicationId)?.currentStage).toBe('INTERVIEW_PENDING')
    expect(
      repositories.events.listByApplication(applicationId).filter((event) => event.interviewId),
    ).toHaveLength(0)
  })
})
