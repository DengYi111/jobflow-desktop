import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { ApplicationStage } from '../../shared/constants/stages'
import { createEventsRepository, type EventInput } from './events.repository'
import { createSearchIndexSync, type SearchIndexSync } from './search-index.repository'

export function createApplicationsRepository(
  db: Database.Database,
  syncSearchIndex: SearchIndexSync = createSearchIndexSync(db),
) {
  const events = createEventsRepository(db)
  return {
    create(input: {
      jobId: string
      currentStage?: ApplicationStage
      priority?: 1 | 2 | 3
      pinned?: boolean
      resumeVersionId?: string | null
    }) {
      const now = new Date().toISOString()
      const item = {
        id: randomUUID(),
        jobId: input.jobId,
        currentStage: input.currentStage ?? 'TO_APPLY',
        priority: input.priority ?? 2,
        pinned: input.pinned ? 1 : 0,
        resumeVersionId: input.resumeVersionId ?? null,
        createdAt: now,
        updatedAt: now,
      }
      db.prepare(
        'INSERT INTO applications(id,job_id,current_stage,priority,pinned,resume_version_id,created_at,updated_at) VALUES (@id,@jobId,@currentStage,@priority,@pinned,@resumeVersionId,@createdAt,@updatedAt)',
      ).run(item)
      return { ...item, pinned: Boolean(item.pinned) }
    },
    get(id: string) {
      return db
        .prepare(
          'SELECT id,job_id AS jobId,current_stage AS currentStage,priority,pinned,resume_version_id AS resumeVersionId,applied_at AS appliedAt,next_action AS nextAction,next_action_at AS nextActionAt,stage_notification_enabled=1 AS stageNotificationEnabled,stage_notification_at AS stageNotificationAt,stage_notification_sent_at AS stageNotificationSentAt,next_action_notification_enabled=1 AS nextActionNotificationEnabled,next_action_notification_at AS nextActionNotificationAt,next_action_notification_sent_at AS nextActionNotificationSentAt,close_reason AS closeReason,created_at AS createdAt,updated_at AS updatedAt FROM applications WHERE id=?',
        )
        .get(id) as { id: string; jobId: string; currentStage: ApplicationStage } | undefined
    },
    updateDetails(
      id: string,
      input: {
        priority?: 1 | 2 | 3
        pinned?: boolean
        nextAction?: string | null
        nextActionAt?: string | null
        appliedAt?: string | null
      },
    ) {
      const columns = {
        priority: 'priority',
        pinned: 'pinned',
        nextAction: 'next_action',
        nextActionAt: 'next_action_at',
        appliedAt: 'applied_at',
      } as const
      const params: Record<string, unknown> = { id, updatedAt: new Date().toISOString() }
      const assignments = ['updated_at=@updatedAt']
      for (const key of Object.keys(columns) as (keyof typeof columns)[])
        if (key in input && input[key] !== undefined) {
          assignments.push(`${columns[key]}=@${key}`)
          params[key] = key === 'pinned' ? (input.pinned ? 1 : 0) : input[key]
        }
      db.prepare(`UPDATE applications SET ${assignments.join(',')} WHERE id=@id`).run(params)
      return this.get(id)
    },
    setResumeVersion(id: string, resumeVersionId: string | null) {
      return db.transaction(() => {
        const updatedAt = new Date().toISOString()
        const result = db
          .prepare('UPDATE applications SET resume_version_id=?,updated_at=? WHERE id=?')
          .run(resumeVersionId, updatedAt, id)
        if (result.changes === 0) return false
        db.prepare('UPDATE jobs SET updated_at=? WHERE id=(SELECT job_id FROM applications WHERE id=?)').run(
          updatedAt,
          id,
        )
        return true
      })()
    },
    transition(
      id: string,
      input: {
        stage: ApplicationStage
        title: string
        type?: EventInput['type']
        at?: string
        channel?: string
        notes?: string
        closeReason?: 'REJECTED' | 'VOLUNTARY' | 'HC_CLOSED' | 'NO_RESPONSE' | 'OFFER_DECLINED' | 'OTHER'
      },
    ) {
      return db.transaction(() => {
        const now = new Date().toISOString()
        const app = db.prepare('SELECT job_id AS jobId FROM applications WHERE id=?').get(id) as
          { jobId: string } | undefined
        if (!app) throw new Error('Application not found')
        db.prepare(
          'UPDATE applications SET current_stage=?,close_reason=?,stage_notification_enabled=0,stage_notification_at=NULL,stage_notification_sent_at=NULL,updated_at=? WHERE id=?',
        ).run(input.stage, input.stage === 'CLOSED' ? (input.closeReason ?? null) : null, now, id)
        db.prepare('UPDATE jobs SET updated_at=? WHERE id=?').run(now, app.jobId)
        syncSearchIndex(app.jobId)
        return events.insert({
          applicationId: id,
          type: input.type ?? (input.stage === 'CLOSED' ? 'CLOSED' : 'STAGE_CHANGED'),
          title: input.title,
          stage: input.stage,
          channel: input.channel,
          eventAt: input.at,
          notes: input.notes,
        })
      })()
    },
    submit(
      id: string,
      input: { appliedAt: string; resumeVersionId: string | null; channel: string; notes?: string },
    ) {
      return db.transaction(() => {
        const app = db.prepare('SELECT id FROM applications WHERE id=?').get(id)
        if (!app) throw new Error('Application not found')
        db.prepare(
          "UPDATE applications SET current_stage='APPLIED',applied_at=?,resume_version_id=?,close_reason=NULL,stage_notification_enabled=0,stage_notification_at=NULL,stage_notification_sent_at=NULL,updated_at=? WHERE id=?",
        ).run(input.appliedAt, input.resumeVersionId, new Date().toISOString(), id)
        return events.insert({
          applicationId: id,
          type: 'APPLICATION_SUBMITTED',
          title: '已投递',
          stage: 'APPLIED',
          eventAt: input.appliedAt,
          channel: input.channel,
          notes: input.notes,
        })
      })()
    },
    setNextAction(id: string, nextAction: string | null, nextActionAt: string | null) {
      db.prepare(
        `UPDATE applications SET next_action_notification_enabled=CASE WHEN next_action IS NOT @nextAction THEN 0 ELSE next_action_notification_enabled END,
        next_action_notification_at=CASE WHEN next_action IS NOT @nextAction THEN NULL ELSE next_action_notification_at END,
        next_action_notification_sent_at=CASE WHEN next_action IS NOT @nextAction THEN NULL ELSE next_action_notification_sent_at END,
        next_action=@nextAction,next_action_at=@nextActionAt,updated_at=@updatedAt WHERE id=@id`,
      ).run({ id, nextAction, nextActionAt, updatedAt: new Date().toISOString() })
    },
    completeNextAction(id: string, completedAt: string) {
      return db.transaction(() => {
        const application = db
          .prepare('SELECT current_stage AS stage,next_action AS nextAction FROM applications WHERE id=?')
          .get(id) as { stage: ApplicationStage; nextAction: string | null } | undefined
        if (!application || !application.nextAction?.trim()) throw new Error('没有待完成的自定义行动')
        const event = events.insert({
          applicationId: id,
          type: 'OTHER',
          title: application.nextAction,
          stage: application.stage,
          eventAt: completedAt,
          notes: '自定义行动已完成',
        })
        db.prepare(
          `UPDATE applications SET next_action=NULL,next_action_at=NULL,next_action_notification_enabled=0,
          next_action_notification_at=NULL,next_action_notification_sent_at=NULL,updated_at=? WHERE id=?`,
        ).run(completedAt, id)
        return event
      })()
    },
    setStageNotification(input: { id: string; enabled: boolean; notificationAt: string | null }) {
      return (
        db
          .prepare(
            `UPDATE applications SET stage_notification_sent_at=CASE WHEN stage_notification_enabled<>@enabled OR stage_notification_at IS NOT @notificationAt THEN NULL ELSE stage_notification_sent_at END,
        stage_notification_enabled=@enabled,stage_notification_at=@notificationAt,updated_at=@updatedAt WHERE id=@id`,
          )
          .run({ ...input, enabled: input.enabled ? 1 : 0, updatedAt: new Date().toISOString() }).changes > 0
      )
    },
    setNextActionNotification(input: { id: string; enabled: boolean; notificationAt: string | null }) {
      return (
        db
          .prepare(
            `UPDATE applications SET next_action_notification_sent_at=CASE WHEN next_action_notification_enabled<>@enabled OR next_action_notification_at IS NOT @notificationAt THEN NULL ELSE next_action_notification_sent_at END,
        next_action_notification_enabled=@enabled,next_action_notification_at=@notificationAt,updated_at=@updatedAt WHERE id=@id AND next_action IS NOT NULL`,
          )
          .run({ ...input, enabled: input.enabled ? 1 : 0, updatedAt: new Date().toISOString() }).changes > 0
      )
    },
    listDueNotifications(now: string) {
      return db
        .prepare(
          `SELECT 'STAGE' AS kind,a.id,a.stage_notification_at AS notificationAt,
          CASE a.current_stage WHEN 'ASSESSMENT_PENDING' THEN '待测评提醒' ELSE '待笔试提醒' END AS title,
          c.name AS companyName,j.title AS jobTitle,c.name || ' · ' || j.title AS body,j.id AS jobId
        FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
        WHERE a.stage_notification_enabled=1 AND a.stage_notification_at IS NOT NULL AND a.stage_notification_at<=? AND a.stage_notification_sent_at IS NULL
          AND a.current_stage IN ('ASSESSMENT_PENDING','WRITTEN_TEST_PENDING') AND j.deleted_at IS NULL
        UNION ALL
        SELECT 'CUSTOM' AS kind,a.id,a.next_action_notification_at AS notificationAt,'自定义行动提醒' AS title,
          c.name AS companyName,j.title AS jobTitle,a.next_action || ' · ' || c.name || ' · ' || j.title AS body,j.id AS jobId
        FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
        WHERE a.next_action_notification_enabled=1 AND a.next_action_notification_at IS NOT NULL AND a.next_action_notification_at<=? AND a.next_action_notification_sent_at IS NULL
          AND a.next_action IS NOT NULL AND j.deleted_at IS NULL
        ORDER BY notificationAt`,
        )
        .all(now, now)
    },
    markNotificationSent(kind: 'STAGE' | 'CUSTOM', id: string, sentAt: string) {
      const column = kind === 'STAGE' ? 'stage_notification_sent_at' : 'next_action_notification_sent_at'
      return (
        db
          .prepare(`UPDATE applications SET ${column}=?,updated_at=? WHERE id=? AND ${column} IS NULL`)
          .run(sentAt, sentAt, id).changes > 0
      )
    },
  }
}
