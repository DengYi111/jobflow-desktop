import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { ApplicationStage } from '../../shared/constants/stages'

export interface InterviewFlowApplication {
  id: string
  jobId: string
  currentStage: ApplicationStage
  interviewReturnStage: ApplicationStage | null
}
export interface InterviewRoundRecord {
  id: string
  roundNumber: number | null
  round: string
  interviewAt: string
  completedAt: string | null
  cancelledAt: string | null
  endedAt: string | null
}
export interface ScheduleRecordInput {
  applicationId: string
  round: string
  roundNumber: number | null
  interviewAt: string
  type: string
  durationMinutes?: number | null
  mode?: string | null
  location?: string | null
}

export function createInterviewFlowRepository(db: Database.Database) {
  return {
    transaction<T>(work: (store: InterviewFlowStore) => T): T {
      const store = createStore(db)
      return db.transaction(() => work(store))()
    },
  }
}

export interface InterviewFlowStore {
  getApplication(id: string): InterviewFlowApplication | undefined
  listRounds(applicationId: string): InterviewRoundRecord[]
  getInterview(id: string): (InterviewRoundRecord & { applicationId: string }) | undefined
  createSchedule(input: ScheduleRecordInput): string
  submit(
    applicationId: string,
    input: { appliedAt: string; resumeVersionId: string | null; channel: string; notes?: string },
  ): void
  updateSchedule(id: string, input: ScheduleRecordInput): void
  setCompleted(id: string, completedAt: string | null): void
  cancelInterview(id: string, cancelledAt: string): void
  deleteInterview(id: string): void
  cancelOpen(applicationId: string, cancelledAt: string): void
  endOpen(applicationId: string, endedAt: string): void
  setStage(
    applicationId: string,
    stage: ApplicationStage,
    returnStage: ApplicationStage | null,
    closeReason?: string | null,
  ): void
  addStageEvent(applicationId: string, stage: ApplicationStage, title: string, at: string): void
  addRoundEvent(applicationId: string, interviewId: string, roundNumber: number, at: string): void
  removeRoundEventsFrom(applicationId: string, roundNumber: number): void
  roundState(applicationId: string): { open: number; completed: number }
}

function createStore(db: Database.Database): InterviewFlowStore {
  const now = () => new Date().toISOString()
  return {
    getApplication(id) {
      return db
        .prepare(
          'SELECT id,job_id AS jobId,current_stage AS currentStage,interview_return_stage AS interviewReturnStage FROM applications WHERE id=?',
        )
        .get(id) as InterviewFlowApplication | undefined
    },
    listRounds(applicationId) {
      return db
        .prepare(
          `SELECT id,round_number AS roundNumber,round,interview_at AS interviewAt,completed_at AS completedAt,cancelled_at AS cancelledAt,ended_at AS endedAt
        FROM interviews WHERE application_id=? ORDER BY round_number,interview_at,created_at`,
        )
        .all(applicationId) as InterviewRoundRecord[]
    },
    getInterview(id) {
      return db
        .prepare(
          `SELECT id,application_id AS applicationId,round_number AS roundNumber,round,interview_at AS interviewAt,completed_at AS completedAt,cancelled_at AS cancelledAt,ended_at AS endedAt
        FROM interviews WHERE id=?`,
        )
        .get(id) as (InterviewRoundRecord & { applicationId: string }) | undefined
    },
    createSchedule(input) {
      const id = randomUUID()
      const timestamp = now()
      db.prepare(
        `INSERT INTO interviews(id,application_id,type,round,round_number,interview_at,duration_minutes,mode,location,created_at,updated_at)
        VALUES (@id,@applicationId,@type,@round,@roundNumber,@interviewAt,@durationMinutes,@mode,@location,@timestamp,@timestamp)`,
      ).run({
        id,
        ...input,
        durationMinutes: input.durationMinutes ?? null,
        mode: input.mode ?? null,
        location: input.location ?? null,
        timestamp,
      })
      return id
    },
    submit(applicationId, input) {
      const application = this.getApplication(applicationId)
      if (!application) throw new Error('没有找到投递记录')
      const timestamp = now()
      db.prepare(
        `UPDATE applications SET current_stage='APPLIED',applied_at=?,resume_version_id=?,interview_return_stage=NULL,close_reason=NULL,
        stage_notification_enabled=0,stage_notification_at=NULL,stage_notification_sent_at=NULL,updated_at=? WHERE id=?`,
      ).run(input.appliedAt, input.resumeVersionId, timestamp, applicationId)
      db.prepare('UPDATE jobs SET updated_at=? WHERE id=?').run(timestamp, application.jobId)
      db.prepare(
        `INSERT INTO application_events(id,application_id,type,title,stage,channel,event_at,notes,created_at)
        VALUES (?,?, 'APPLICATION_SUBMITTED','已投递','APPLIED',?,?,?,?)`,
      ).run(randomUUID(), applicationId, input.channel, input.appliedAt, input.notes ?? null, timestamp)
    },
    updateSchedule(id, input) {
      db.prepare(
        `UPDATE interviews SET round=@round,round_number=@roundNumber,interview_at=@interviewAt,type=@type,duration_minutes=@durationMinutes,
        mode=@mode,location=@location,completed_at=NULL,notification_enabled=0,notification_at=NULL,notification_sent_at=NULL,updated_at=@updatedAt
        WHERE id=@id AND cancelled_at IS NULL`,
      ).run({
        ...input,
        durationMinutes: input.durationMinutes ?? null,
        mode: input.mode ?? null,
        location: input.location ?? null,
        updatedAt: now(),
        id,
      })
    },
    setCompleted(id, completedAt) {
      db.prepare(
        'UPDATE interviews SET completed_at=?,updated_at=? WHERE id=? AND cancelled_at IS NULL AND ended_at IS NULL',
      ).run(completedAt, now(), id)
    },
    cancelInterview(id, cancelledAt) {
      db.prepare(
        `UPDATE interviews SET cancelled_at=?,notification_enabled=0,notification_at=NULL,notification_sent_at=NULL,updated_at=?
        WHERE id=? AND completed_at IS NULL AND cancelled_at IS NULL AND ended_at IS NULL`,
      ).run(cancelledAt, now(), id)
    },
    deleteInterview(id) {
      db.prepare('DELETE FROM interviews WHERE id=?').run(id)
    },
    cancelOpen(applicationId, cancelledAt) {
      db.prepare(
        `UPDATE interviews SET cancelled_at=?,notification_enabled=0,notification_at=NULL,notification_sent_at=NULL,updated_at=?
        WHERE application_id=? AND completed_at IS NULL AND cancelled_at IS NULL AND ended_at IS NULL`,
      ).run(cancelledAt, now(), applicationId)
    },
    endOpen(applicationId, endedAt) {
      db.prepare(
        `UPDATE interviews SET ended_at=?,notification_enabled=0,notification_at=NULL,notification_sent_at=NULL,updated_at=?
        WHERE application_id=? AND completed_at IS NULL AND cancelled_at IS NULL AND ended_at IS NULL`,
      ).run(endedAt, now(), applicationId)
    },
    setStage(applicationId, stage, returnStage, closeReason = null) {
      const application = this.getApplication(applicationId)
      if (!application) throw new Error('没有找到投递记录')
      db.prepare(
        'UPDATE applications SET current_stage=?,interview_return_stage=?,close_reason=?,stage_notification_enabled=0,stage_notification_at=NULL,stage_notification_sent_at=NULL,updated_at=? WHERE id=?',
      ).run(stage, returnStage, closeReason, now(), applicationId)
      db.prepare('UPDATE jobs SET updated_at=? WHERE id=?').run(now(), application.jobId)
    },
    addStageEvent(applicationId, stage, title, at) {
      const type =
        stage === 'CLOSED'
          ? 'CLOSED'
          : stage === 'INTERVIEW_PENDING'
            ? 'INTERVIEW_SCHEDULED'
            : 'STAGE_CHANGED'
      db.prepare(
        'INSERT INTO application_events(id,application_id,type,title,stage,event_at,created_at) VALUES (?,?,?,?,?,?,?)',
      ).run(randomUUID(), applicationId, type, title, stage, at, now())
    },
    addRoundEvent(applicationId, interviewId, roundNumber, at) {
      db.prepare(
        'DELETE FROM application_events WHERE application_id=? AND interview_id=? AND interview_round_number=?',
      ).run(applicationId, interviewId, roundNumber)
      db.prepare(
        `INSERT INTO application_events(id,application_id,type,title,stage,event_at,notes,interview_id,interview_round_number,created_at)
        VALUES (?,?, 'OTHER',?,'INTERVIEW_DONE',?,?,?, ?,?)`,
      ).run(
        randomUUID(),
        applicationId,
        `第 ${roundNumber} 面`,
        at,
        `面试时间：${at}`,
        interviewId,
        roundNumber,
        now(),
      )
    },
    removeRoundEventsFrom(applicationId, roundNumber) {
      db.prepare(
        'DELETE FROM application_events WHERE application_id=? AND interview_id IS NOT NULL AND interview_round_number>=?',
      ).run(applicationId, roundNumber)
    },
    roundState(applicationId) {
      return db
        .prepare(
          `SELECT sum(CASE WHEN cancelled_at IS NULL AND ended_at IS NULL AND completed_at IS NULL THEN 1 ELSE 0 END) AS open,
        sum(CASE WHEN cancelled_at IS NULL AND ended_at IS NULL AND completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed FROM interviews WHERE application_id=?`,
        )
        .get(applicationId) as { open: number; completed: number }
    },
  }
}
