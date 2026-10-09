import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../../src/main/db/migrate'
import { createRepositories } from '../../src/main/repositories'
import { createApplicationsService } from '../../src/main/services/applications.service'
import { createInterviewFlowService } from '../../src/main/services/interview-flow.service'
import { createInterviewsService } from '../../src/main/services/interviews.service'
import { createJobsService } from '../../src/main/services/jobs.service'

let database: Database.Database
let repositories: ReturnType<typeof createRepositories>

beforeEach(() => {
  database = new Database(':memory:')
  migrateDatabase(database)
  repositories = createRepositories(database)
})

afterEach(() => database.close())

describe('job application and interview lifecycle', () => {
  it('keeps the submitted job, interview round, timeline, review and trash recovery consistent', () => {
    const jobs = createJobsService(database, repositories)
    const interviewFlow = createInterviewFlowService(database)
    const applications = createApplicationsService(repositories, interviewFlow)
    const interviews = createInterviewsService(repositories, interviewFlow)
    const company = repositories.companies.create({ name: '流程集成公司' })
    const job = jobs.create({
      companyId: company.id,
      title: '嵌入式软件工程师',
      url: 'https://careers.example.test/embedded',
    })

    applications.submit(job.applicationId, {
      appliedAt: '2026-09-20T08:00:00.000Z',
      resumeVersionId: null,
      channel: '公司官网',
    })
    applications.transition(job.applicationId, {
      stage: 'ASSESSMENT_PENDING',
      title: '收到在线测评',
      at: '2026-09-21T08:00:00.000Z',
    })
    applications.completeStageAction(job.applicationId)
    const scheduled = interviewFlow.schedule({
      applicationId: job.applicationId,
      roundNumber: 1,
      interviewAt: '2026-10-02T09:00:00.000Z',
      type: 'TECHNICAL',
    })

    expect(repositories.applications.get(job.applicationId)).toMatchObject({
      currentStage: 'INTERVIEW_PENDING',
    })
    expect(
      (jobs.list({ page: { page: 1, pageSize: 7 } }).items[0] as { currentInterview: unknown })
        .currentInterview,
    ).toMatchObject({
      roundNumber: 1,
      type: 'TECHNICAL',
    })

    interviewFlow.complete(scheduled.id, '2026-10-02T10:00:00.000Z')
    interviews.saveReview({ id: scheduled.id, result: '通过', strengths: '调试思路清晰' })
    applications.setNextAction(job.applicationId, '准备二面', '2026-10-05T08:00:00.000Z')

    expect(repositories.applications.get(job.applicationId)).toMatchObject({ currentStage: 'INTERVIEW_DONE' })
    expect(repositories.interviews.get(scheduled.id)).toMatchObject({
      completedAt: '2026-10-02T10:00:00.000Z',
      result: '通过',
      strengths: '调试思路清晰',
    })
    expect(jobs.get(job.id)?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: '收到在线测评' }),
        expect.objectContaining({
          title: '第 1 面',
          stage: 'INTERVIEW_DONE',
          interviewRoundNumber: 1,
          interviewId: scheduled.id,
        }),
      ]),
    )

    jobs.softDelete(job.id)
    expect(jobs.list({ filters: { stage: 'DELETED' } }).items).toHaveLength(1)
    jobs.restore(job.id)

    expect(jobs.get(job.id)).toMatchObject({ title: '嵌入式软件工程师' })
    expect(repositories.interviews.get(scheduled.id)).toMatchObject({ result: '通过' })
    expect(repositories.events.listByApplication(job.applicationId)).toHaveLength(5)
  })
})
