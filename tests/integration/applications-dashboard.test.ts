import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../../src/main/db/migrate'
import { createRepositories } from '../../src/main/repositories'
import { createJobsService } from '../../src/main/services/jobs.service'
import { createApplicationsService } from '../../src/main/services/applications.service'
import { createRemindersService } from '../../src/main/services/reminders.service'
import { createDashboardService } from '../../src/main/services/dashboard.service'
import { createHandlerRegistry } from '../../src/main/ipc/register-handlers'
import { createJobIpcServices } from '../../src/main/services/job-ipc-services'
import { createInterviewFlowService } from '../../src/main/services/interview-flow.service'

let db: Database.Database
let repos: ReturnType<typeof createRepositories>
let jobs: ReturnType<typeof createJobsService>
let applications: ReturnType<typeof createApplicationsService>
let reminders: ReturnType<typeof createRemindersService>
let dashboard: ReturnType<typeof createDashboardService>
let activeId: string
let interviewFlow: ReturnType<typeof createInterviewFlowService>

beforeEach(async () => {
  db = new Database(':memory:')
  await migrateDatabase(db)
  repos = createRepositories(db)
  interviewFlow = createInterviewFlowService(db)
  jobs = createJobsService(db, repos)
  applications = createApplicationsService(repos)
  reminders = createRemindersService(repos)
  dashboard = createDashboardService(db, repos)
  const companyId = repos.companies.create({ name: '星河科技' }).id
  activeId = jobs.create({ companyId, title: '嵌入式工程师' }).applicationId
})
afterEach(() => db.close())

describe('application transition and timeline', () => {
  it('changes the selected resume without changing application stage or submission date', async () => {
    const resumeId = 'c40421d0-a22a-414c-8f8f-0a79cb52c415'
    db.prepare(
      'INSERT INTO resume_versions(id,name,relative_path,original_name,created_at) VALUES (?,?,?,?,?)',
    ).run(resumeId, '校招简历', 'files/resumes/resume.pdf', 'resume.pdf', '2026-09-20T00:00:00.000Z')
    db.prepare("UPDATE applications SET current_stage='APPLIED',applied_at=? WHERE id=?").run(
      '2026-09-24T10:00:00.000Z',
      activeId,
    )

    const registry = createHandlerRegistry('app://jobflow', createJobIpcServices(db, repos))
    const senderFrame = { url: 'app://jobflow/', isMainFrame: true }
    const saveResult = await registry.dispatch('jobflow:applications.setResumeVersion', {
      senderFrame,
      args: [{ id: activeId, resumeVersionId: resumeId }],
    })
    expect(saveResult).toMatchObject({ ok: true })

    expect(
      db
        .prepare(
          'SELECT resume_version_id AS resumeVersionId,current_stage AS currentStage,applied_at AS appliedAt FROM applications WHERE id=?',
        )
        .get(activeId),
    ).toEqual({
      resumeVersionId: resumeId,
      currentStage: 'APPLIED',
      appliedAt: '2026-09-24T10:00:00.000Z',
    })
    await registry.dispatch('jobflow:applications.setResumeVersion', {
      senderFrame,
      args: [{ id: activeId, resumeVersionId: null }],
    })
    expect(repos.applications.get(activeId)).toMatchObject({ currentStage: 'APPLIED' })
    expect(
      db.prepare('SELECT resume_version_id AS resumeVersionId FROM applications WHERE id=?').get(activeId),
    ).toEqual({ resumeVersionId: null })
  })

  it('changes stage and appends an event atomically', () => {
    applications.transition(activeId, {
      stage: 'ASSESSMENT_PENDING',
      title: '收到测评',
      at: '2026-09-24T09:00:00.000Z',
      channel: '官网',
      notes: '校招批次',
    })
    expect(repos.applications.get(activeId)?.currentStage).toBe('ASSESSMENT_PENDING')
    expect(repos.events.listByApplication(activeId)).toMatchObject([
      { type: 'STAGE_CHANGED', stage: 'ASSESSMENT_PENDING', channel: '官网', title: '收到测评' },
    ])
  })

  it('lists timeline chronologically and allows every timeline record to be edited or deleted through IPC', async () => {
    const registry = createHandlerRegistry('app://jobflow', createJobIpcServices(db, repos))
    const senderFrame = { url: 'app://jobflow/', isMainFrame: true }
    const call = (channel: string, input: unknown) =>
      registry.dispatch(channel, { senderFrame, args: [input] })
    applications.addEvent(activeId, { title: '較新的记录', at: '2026-09-25T10:00:00.000Z' })
    applications.addEvent(activeId, { title: '較早的记录', at: '2026-09-24T10:00:00.000Z' })
    applications.transition(activeId, {
      stage: 'ASSESSMENT_PENDING',
      title: '收到测评',
      at: '2026-09-24T12:00:00.000Z',
    })
    const ordered = repos.events.listByApplication(activeId) as Array<{
      id: string
      title: string
      eventAt: string
    }>
    expect(ordered.map((event) => event.title)).toEqual(['較早的记录', '收到测评', '較新的记录'])

    await call('jobflow:applications.updateEvent', {
      id: ordered[0].id,
      title: '补充后的记录',
      at: '2026-09-24T11:00:00.000Z',
      notes: '已编辑',
    })
    expect(repos.events.listByApplication(activeId)[0]).toMatchObject({
      title: '补充后的记录',
      notes: '已编辑',
    })
    await call('jobflow:applications.updateEvent', {
      id: ordered[1].id,
      title: '测评阶段时间已更正',
      at: '2026-09-24T12:30:00.000Z',
    })
    expect(repos.events.listByApplication(activeId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '测评阶段时间已更正',
          stage: 'ASSESSMENT_PENDING',
          eventAt: '2026-09-24T12:30:00.000Z',
        }),
      ]),
    )
    await call('jobflow:applications.deleteEvent', { id: ordered[1].id })
    await call('jobflow:applications.deleteEvent', { id: ordered[0].id })
    expect(repos.events.listByApplication(activeId).map((event) => event.title)).toEqual(['較新的记录'])
  })

  it('edits and removes an interview timeline marker without losing the interview schedule', async () => {
    applications.transition(activeId, { stage: 'ASSESSMENT_PENDING', title: '收到测评' })
    interviewFlow.schedule({
      applicationId: activeId,
      roundNumber: 1,
      interviewAt: '2026-09-25T09:00:00.000Z',
    })
    const nextInterview = interviewFlow.schedule({
      applicationId: activeId,
      roundNumber: 2,
      interviewAt: '2026-09-26T09:00:00.000Z',
    })
    const marker = (
      repos.events.listByApplication(activeId) as Array<{
        id: string
        interviewId: string | null
      }>
    ).find((event) => event.interviewId)
    expect(marker).toBeTruthy()

    const registry = createHandlerRegistry('app://jobflow', createJobIpcServices(db, repos))
    const senderFrame = { url: 'app://jobflow/', isMainFrame: true }
    const call = (channel: string, input: unknown) =>
      registry.dispatch(channel, { senderFrame, args: [input] })
    const correctedAt = '2026-09-25T09:30:00.000Z'
    await call('jobflow:applications.updateEvent', {
      id: marker!.id,
      title: '第一面时间已更正',
      at: correctedAt,
      notes: '补充的时间线说明',
    })
    expect(repos.interviews.get(marker!.interviewId!)).toMatchObject({
      interviewAt: correctedAt,
      completedAt: correctedAt,
    })
    expect(repos.events.listByApplication(activeId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: marker!.id,
          title: '第一面时间已更正',
          stage: 'INTERVIEW_DONE',
          eventAt: correctedAt,
          notes: '补充的时间线说明',
        }),
      ]),
    )

    await call('jobflow:applications.deleteEvent', { id: marker!.id })
    expect(repos.interviews.get(marker!.interviewId!)).toBeTruthy()
    expect(repos.interviews.get(nextInterview.id)).toBeTruthy()
    expect(repos.events.listByApplication(activeId).some((event) => event.id === marker!.id)).toBe(false)
  })

  it('requires submission details before moving from TO_APPLY to APPLIED', () => {
    expect(() => applications.transition(activeId, { stage: 'APPLIED', title: '已投递' })).toThrow(
      /标记已投递/,
    )
    expect(repos.applications.get(activeId)?.currentStage).toBe('TO_APPLY')
    expect(repos.events.listByApplication(activeId)).toHaveLength(0)
  })

  it('rejects a direct APPLIED transition at the IPC boundary', async () => {
    const registry = createHandlerRegistry('app://jobflow', createJobIpcServices(db, repos))
    await expect(
      registry.dispatch('jobflow:applications.transition', {
        senderFrame: { url: 'app://jobflow/', isMainFrame: true },
        args: [{ id: activeId, stage: 'APPLIED' }],
      }),
    ).rejects.toThrow(/标记已投递/)
    expect(repos.applications.get(activeId)?.currentStage).toBe('TO_APPLY')
  })

  it('stores submission time, selected resume, channel and notes with the submitted event', () => {
    const resume = repos.resumes.create({
      name: '嵌入式开发版',
      relativePath: 'resumes/embedded.pdf',
      originalName: 'embedded.pdf',
    })
    applications.submit(activeId, {
      appliedAt: '2026-09-24T10:00:00.000Z',
      resumeVersionId: resume.id,
      channel: '公司官网',
      notes: '秋招提前批',
    })
    expect(repos.applications.get(activeId)).toMatchObject({
      currentStage: 'APPLIED',
      appliedAt: '2026-09-24T10:00:00.000Z',
      resumeVersionId: resume.id,
    })
    expect(repos.events.listByApplication(activeId)[0]).toMatchObject({
      type: 'APPLICATION_SUBMITTED',
      channel: '公司官网',
      notes: '秋招提前批',
    })
  })

  it('rolls back the stage when event insertion fails', () => {
    db.exec(
      "CREATE TRIGGER reject_event BEFORE INSERT ON application_events BEGIN SELECT RAISE(ABORT, 'forced event failure'); END",
    )
    expect(() =>
      applications.transition(activeId, { stage: 'ASSESSMENT_PENDING', title: '收到测评' }),
    ).toThrow()
    expect(repos.applications.get(activeId)?.currentStage).toBe('TO_APPLY')
    expect(
      jobs
        .list({ filters: { stage: 'TO_APPLY' }, page: { page: 1, pageSize: 20 } })
        .items.find((item) => item.applicationId === activeId)?.stage,
    ).toBe('TO_APPLY')
    expect(repos.events.listByApplication(activeId)).toHaveLength(0)
  })

  it('requires a valid close reason when moving to CLOSED', () => {
    expect(() => applications.transition(activeId, { stage: 'CLOSED', title: '结束' })).toThrow(/原因/)
    applications.transition(activeId, { stage: 'CLOSED', title: '结束', closeReason: 'REJECTED' })
    expect(repos.applications.get(activeId)).toMatchObject({
      currentStage: 'CLOSED',
      closeReason: 'REJECTED',
    })
  })

  it('runs a job from saved through applied, assessment, interview and closed with durable events', () => {
    applications.submit(activeId, {
      appliedAt: '2026-09-24T10:00:00.000Z',
      channel: '官网',
      notes: '网投',
      resumeVersionId: null,
    })
    applications.transition(activeId, { stage: 'ASSESSMENT_PENDING', title: '收到测评' })
    interviewFlow.schedule({
      applicationId: activeId,
      roundNumber: 1,
      interviewAt: '2026-09-25T08:00:00.000Z',
    })
    applications.transition(activeId, { stage: 'CLOSED', title: '流程结束', closeReason: 'VOLUNTARY' })
    expect(repos.applications.get(activeId)?.currentStage).toBe('CLOSED')
    expect(repos.events.listByApplication(activeId)).toHaveLength(4)
  })

  it('requires confirmation and atomically cancels open interviews before recording a submission', () => {
    const interview = interviewFlow.schedule({
      applicationId: activeId,
      roundNumber: 1,
      interviewAt: '2026-10-01T09:00:00.000Z',
    })
    const coordinatedApplications = createApplicationsService(repos, interviewFlow)
    const submission = { appliedAt: '2026-09-26T12:00:00.000Z', resumeVersionId: null, channel: '公司官网' }

    expect(() => coordinatedApplications.submit(activeId, submission)).toThrow('确认取消')
    expect(repos.applications.get(activeId)?.currentStage).toBe('INTERVIEW_PENDING')

    coordinatedApplications.submit(activeId, { ...submission, cancelOpenInterviews: true })

    expect(repos.applications.get(activeId)).toMatchObject({
      currentStage: 'APPLIED',
      appliedAt: submission.appliedAt,
    })
    expect(repos.interviews.get(interview.id)).toMatchObject({ cancelledAt: expect.any(String) })
    expect(repos.events.listByApplication(activeId)).toContainEqual(
      expect.objectContaining({
        type: 'APPLICATION_SUBMITTED',
        stage: 'APPLIED',
        channel: submission.channel,
      }),
    )
  })

  it('rolls back interview cancellation when the submission event cannot be written', () => {
    const interview = interviewFlow.schedule({
      applicationId: activeId,
      roundNumber: 1,
      interviewAt: '2026-10-01T09:00:00.000Z',
    })
    const coordinatedApplications = createApplicationsService(repos, interviewFlow)
    db.exec(
      "CREATE TRIGGER reject_submission BEFORE INSERT ON application_events WHEN NEW.type='APPLICATION_SUBMITTED' BEGIN SELECT RAISE(ABORT, 'submission event failure'); END",
    )

    expect(() =>
      coordinatedApplications.submit(activeId, {
        appliedAt: '2026-09-26T12:00:00.000Z',
        resumeVersionId: null,
        channel: '公司官网',
        cancelOpenInterviews: true,
      }),
    ).toThrow('submission event failure')

    expect(repos.applications.get(activeId)?.currentStage).toBe('INTERVIEW_PENDING')
    expect(repos.interviews.get(interview.id)?.cancelledAt).toBeNull()
  })
})

describe('reminders and dashboard', () => {
  it('orders overdue and due-today items, and omits completed and trashed applications', () => {
    const companyId = repos.companies.create({ name: '云端系统' }).id
    const second = jobs.create({ companyId, title: '系统工程师' })
    const archived = jobs.create({ companyId, title: '归档工程师' })
    reminders.create({ applicationId: activeId, title: '逾期跟进', remindAt: '2026-09-23T08:00:00.000Z' })
    const today = reminders.create({
      applicationId: activeId,
      title: '今日准备',
      remindAt: '2026-09-24T08:00:00.000Z',
    })
    reminders.create({
      applicationId: second.applicationId,
      title: '已完成',
      remindAt: '2026-09-24T09:00:00.000Z',
    })
    reminders.complete(
      reminders
        .listDue({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T23:59:59.999Z' })
        .find((item) => item.title === '已完成')!.id,
    )
    reminders.create({
      applicationId: archived.applicationId,
      title: '归档项',
      remindAt: '2026-09-24T07:00:00.000Z',
    })
    jobs.softDelete(archived.id)
    const due = reminders.listDue({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T23:59:59.999Z' })
    expect(due.map((item) => item.title)).toEqual(['逾期跟进', '今日准备'])
    expect(due[1].id).toBe(today.id)
  })

  it('summarizes due reminders, interviews, stage counts, next actions, and recent events', () => {
    expect(dashboard.getNotificationsEnabled()).toBe(true)
    dashboard.setNotificationsEnabled(true)
    expect(dashboard.getNotificationsEnabled()).toBe(true)
    reminders.create({ applicationId: activeId, title: '完善作品集', remindAt: '2026-09-24T12:00:00.000Z' })
    repos.applications.updateDetails(activeId, {
      nextAction: '准备自我介绍',
      nextActionAt: '2026-09-24T13:00:00.000Z',
    })
    repos.interviews.create({
      applicationId: activeId,
      type: 'TECHNICAL',
      round: '一面',
      interviewAt: '2026-09-25T08:00:00.000Z',
    })
    applications.submit(activeId, {
      appliedAt: '2026-09-24T09:30:00.000Z',
      resumeVersionId: null,
      channel: '官网',
      notes: '完成投递',
    })
    const summary = dashboard.getSummary(new Date('2026-09-24T00:00:00.000Z'))
    expect(summary.dueItems.map((item) => item.title)).toContain('完善作品集')
    expect(summary.upcomingInterviews).toHaveLength(1)
    expect(summary.stageCounts.APPLIED).toBe(1)
    expect(summary.nextActions[0].nextAction).toBe('准备自我介绍')
    expect(summary.recentEvents[0].title).toBe('已投递')
  })

  it('returns five complete action lanes including custom actions without a planned date', () => {
    const companyId = repos.companies.create({ name: '行动栏科技' }).id
    const pending = jobs.create({ companyId, title: '待投递岗位' })
    repos.jobs.addListing({
      jobId: pending.id,
      url: 'https://careers.example.com/pending',
      source: 'BROWSER',
      isPrimary: true,
    })
    applications.transition(activeId, { stage: 'ASSESSMENT_PENDING', title: '收到测评' })
    const written = jobs.create({ companyId, title: '待笔试岗位' })
    applications.transition(written.applicationId, { stage: 'WRITTEN_TEST_PENDING', title: '收到笔试' })
    const interviewApp = jobs.create({ companyId, title: '面试岗位' })
    applications.submit(interviewApp.applicationId, {
      appliedAt: '2026-09-26T07:00:00.000Z',
      resumeVersionId: null,
      channel: '官网',
    })
    repos.interviews.create({
      applicationId: interviewApp.applicationId,
      type: 'TECHNICAL',
      round: '一面',
      interviewAt: '2026-09-27T09:00:00.000Z',
    })

    for (let index = 0; index < 9; index += 1) {
      const item = jobs.create({ companyId, title: `自定义行动岗位${index + 1}` })
      applications.submit(item.applicationId, {
        appliedAt: '2026-09-26T07:00:00.000Z',
        resumeVersionId: null,
        channel: '官网',
      })
      repos.applications.updateDetails(item.applicationId, {
        nextAction: `跟进${index + 1}`,
        nextActionAt: null,
      })
    }

    const summary = dashboard.getSummary(new Date('2026-09-26T08:00:00.000Z')) as {
      actionLanes: Array<{ key: string; count: number; items: Array<Record<string, unknown>> }>
    }
    expect(summary.actionLanes.map(({ key }) => key)).toEqual([
      'TO_APPLY',
      'ASSESSMENT_PENDING',
      'WRITTEN_TEST_PENDING',
      'INTERVIEW',
      'CUSTOM',
    ])
    expect(summary.actionLanes.map(({ count }) => count)).toEqual([1, 1, 1, 1, 9])
    expect(summary.actionLanes[0].items[0]).toMatchObject({
      postingUrl: 'https://careers.example.com/pending',
    })
    expect(summary.actionLanes[4].items[0]).toMatchObject({ nextAction: '跟进1', nextActionAt: null })
  })

  it('completes assessment and written-test actions into their completed stages', () => {
    const companyId = repos.companies.create({ name: '阶段行动科技' }).id
    applications.transition(activeId, { stage: 'ASSESSMENT_PENDING', title: '收到测评' })
    const written = jobs.create({ companyId, title: '笔试待完成' })
    applications.transition(written.applicationId, { stage: 'WRITTEN_TEST_PENDING', title: '收到笔试' })

    applications.completeStageAction(activeId)
    applications.completeStageAction(written.applicationId)

    expect(repos.applications.get(activeId)?.currentStage).toBe('ASSESSMENT_DONE')
    expect(
      repos.events.listByApplication(activeId).find((event) => event.type === 'ASSESSMENT_COMPLETED'),
    ).toMatchObject({ type: 'ASSESSMENT_COMPLETED', stage: 'ASSESSMENT_DONE' })
    expect(repos.applications.get(written.applicationId)?.currentStage).toBe('WRITTEN_TEST_DONE')
    expect(
      repos.events
        .listByApplication(written.applicationId)
        .find((event) => event.type === 'WRITTEN_TEST_COMPLETED'),
    ).toMatchObject({ type: 'WRITTEN_TEST_COMPLETED', stage: 'WRITTEN_TEST_DONE' })
  })

  it('requires date and channel when completing a pending application', () => {
    expect(() => applications.completeStageAction(activeId)).toThrow(/投递时间和投递渠道/)
    expect(repos.applications.get(activeId)?.currentStage).toBe('TO_APPLY')

    applications.completeStageAction(activeId, {
      appliedAt: '2026-09-26T09:00:00.000Z',
      channel: '官网',
      resumeVersionId: null,
    })
    expect(repos.applications.get(activeId)).toMatchObject({
      currentStage: 'APPLIED',
      appliedAt: '2026-09-26T09:00:00.000Z',
    })
    expect(repos.events.listByApplication(activeId)[0]).toMatchObject({
      type: 'APPLICATION_SUBMITTED',
      channel: '官网',
    })
  })

  it('keeps completed custom actions in the timeline and frees the current action slot', () => {
    repos.applications.updateDetails(activeId, {
      nextAction: '给招聘经理回邮件',
      nextActionAt: '2026-09-27T10:00:00.000Z',
    })

    applications.completeNextAction(activeId, '2026-09-26T10:00:00.000Z')

    expect(repos.applications.get(activeId)).toMatchObject({ nextAction: null, nextActionAt: null })
    expect(repos.events.listByApplication(activeId)[0]).toMatchObject({
      type: 'OTHER',
      title: '给招聘经理回邮件',
      eventAt: '2026-09-26T10:00:00.000Z',
      notes: '自定义行动已完成',
    })
    expect(() => applications.completeNextAction(activeId)).toThrow(/没有待完成的自定义行动/)
  })

  it('marks an interview complete without changing the application stage', () => {
    const interview = repos.interviews.create({
      applicationId: activeId,
      type: 'TECHNICAL',
      round: '一面',
      interviewAt: '2026-09-27T09:00:00.000Z',
    })

    repos.interviews.complete(interview.id, '2026-09-26T10:00:00.000Z')

    expect(repos.applications.get(activeId)?.currentStage).toBe('TO_APPLY')
    expect(repos.interviews.get(interview.id)).toMatchObject({ completedAt: '2026-09-26T10:00:00.000Z' })
  })

  it('schedules stage and custom-action notifications independently for one application', () => {
    repos.applications.setStageNotification({
      id: activeId,
      enabled: true,
      notificationAt: '2026-09-26T10:00:00.000Z',
    })
    repos.applications.updateDetails(activeId, { nextAction: '整理项目介绍', nextActionAt: null })
    repos.applications.setNextActionNotification({
      id: activeId,
      enabled: true,
      notificationAt: '2026-09-26T10:00:00.000Z',
    })

    expect(
      repos.applications.listDueNotifications('2026-09-26T10:01:00.000Z').map(({ kind }) => kind),
    ).toEqual(['CUSTOM'])

    applications.transition(activeId, { stage: 'ASSESSMENT_PENDING', title: '收到测评' })
    repos.applications.setStageNotification({
      id: activeId,
      enabled: true,
      notificationAt: '2026-09-26T10:00:00.000Z',
    })
    expect(
      repos.applications
        .listDueNotifications('2026-09-26T10:01:00.000Z')
        .map(({ kind }) => kind)
        .sort(),
    ).toEqual(['CUSTOM', 'STAGE'])

    applications.submit(activeId, {
      appliedAt: '2026-09-26T10:02:00.000Z',
      resumeVersionId: null,
      channel: '官网',
    })
    expect(
      repos.applications.listDueNotifications('2026-09-26T10:03:00.000Z').map(({ kind }) => kind),
    ).toEqual(['CUSTOM'])
  })
})
